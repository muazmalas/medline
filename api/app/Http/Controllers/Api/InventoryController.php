<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class InventoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $partner = $this->partnerFor($request);
        if (! $partner) {
            return response()->json(['message' => 'Only approved pharmacy and warehouse users can manage inventory.'], 403);
        }

        $inventory = DB::table('inventories')
            ->join('medicines', 'medicines.id', '=', 'inventories.medicine_id')
            ->where('inventories.owner_type', $partner->type)
            ->where('inventories.owner_id', $partner->id)
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) {
                    $nested->where('medicines.name_en', 'like', $like)
                        ->orWhere('medicines.name_ar', 'like', $like)
                        ->orWhere('medicines.manufacturer', 'like', $like)
                        ->orWhere('inventories.batch_number', 'like', $like)
                        ->orWhere('inventories.storage_location', 'like', $like);
                    });
            })
            ->when($request->string('status')->toString() === 'inactive', fn ($query) => $query->where('inventories.is_active', false))
            ->when($request->string('status')->toString() === 'expired', fn ($query) => $query->where('inventories.is_active', true)->whereNotNull('inventories.expires_at')->whereDate('inventories.expires_at', '<=', today()))
            ->when(in_array($request->string('status')->toString(), ['low_stock', 'healthy'], true), fn ($query) => $query->where('inventories.is_active', true)->where(fn ($nested) => $nested->whereNull('inventories.expires_at')->orWhereDate('inventories.expires_at', '>', today())))
            ->when($request->string('status')->toString() === 'low_stock', fn ($query) => $query->whereRaw('(inventories.quantity - inventories.reserved_quantity) <= inventories.low_stock_threshold'))
            ->when($request->string('status')->toString() === 'healthy', fn ($query) => $query->whereRaw('(inventories.quantity - inventories.reserved_quantity) > inventories.low_stock_threshold'))
            ->select('inventories.*', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.prescription_required')
            ->when(true, function ($query) use ($request) {
                $sortable = [
                    'name_en' => 'medicines.name_en',
                    'owner_name' => 'inventories.owner_id',
                    'available_quantity' => DB::raw('(inventories.quantity - inventories.reserved_quantity)'),
                    'quantity' => 'inventories.quantity',
                    'reserved_quantity' => 'inventories.reserved_quantity',
                    'unit_price' => 'inventories.unit_price',
                    'batch_number' => 'inventories.batch_number',
                    'expires_at' => 'inventories.expires_at',
                    'stock_health' => DB::raw('(inventories.quantity - inventories.reserved_quantity - inventories.low_stock_threshold)'),
                    'created_at' => 'inventories.created_at',
                    'updated_at' => 'inventories.updated_at',
                ];
                $sortBy = $sortable[$request->string('sort_by')->toString()] ?? 'medicines.name_en';
                $direction = $request->string('sort_direction')->toString() === 'desc' ? 'desc' : 'asc';
                $query->orderBy($sortBy, $direction)->orderBy('inventories.id', $direction);
            })
            ->paginate(min($request->integer('per_page', 20), 100));

        $inventory->getCollection()->transform(function ($row) use ($partner) {
            $row->owner_name = $partner->business_name;
            return $row;
        });

        return response()->json($inventory);
    }

    public function upsert(Request $request): JsonResponse
    {
        $partner = $this->partnerFor($request);
        if (! $partner) {
            return response()->json(['message' => 'Only approved pharmacy and warehouse users can manage inventory.'], 403);
        }

        $data = $request->validate([
            'medicine_id' => ['required', 'integer', Rule::exists('medicines', 'id')->where('is_active', true)],
            'quantity' => ['required', 'integer', 'min:0'],
            'unit_price' => ['required', 'numeric', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'batch_number' => ['nullable', 'string', 'max:100'],
            'manufactured_at' => ['nullable', 'date', 'before_or_equal:today'],
            'expires_at' => ['nullable', 'date', 'after:today'],
            'received_at' => ['nullable', 'date', 'before_or_equal:today'],
            'storage_location' => ['nullable', 'string', 'max:150'],
        ]);
        abort_if($partner->type === 'warehouse' && (int) $data['quantity'] < 1, 422, 'A warehouse batch must contain at least one unit.');

        $inventory = DatabaseTransaction::run(function () use ($data, $partner, $request) {
            $partner = Partner::whereKey($partner->id)
                ->whereIn('type', ['pharmacy', 'warehouse'])
                ->where('approval_status', 'approved')
                ->where('subscription_status', 'active')
                ->lockForUpdate()
                ->first();
            abort_unless($partner, 403, 'This pharmacy or warehouse account is not currently eligible to manage inventory.');
            $existing = $partner->type === 'pharmacy'
                ? DB::table('inventories')
                    ->where('medicine_id', $data['medicine_id'])
                    ->where('owner_type', 'pharmacy')
                    ->where('owner_id', $partner->id)
                    ->lockForUpdate()
                    ->first()
                : null;

            $oldQuantity = $existing?->quantity ?? 0;
            if ($existing && $data['quantity'] < $existing->reserved_quantity) {
                abort(422, 'Inventory quantity cannot be lower than stock already reserved for active workflows.');
            }
            $payload = [
                'medicine_id' => $data['medicine_id'],
                'owner_type' => $partner->type,
                'owner_id' => $partner->id,
                'quantity' => $data['quantity'],
                'reserved_quantity' => $existing?->reserved_quantity ?? 0,
                'unit_price' => $data['unit_price'],
                'low_stock_threshold' => $data['low_stock_threshold'] ?? 5,
                'batch_number' => $partner->type === 'warehouse' ? ($data['batch_number'] ?? null) : ($existing?->batch_number ?? null),
                'manufactured_at' => $partner->type === 'warehouse' ? ($data['manufactured_at'] ?? null) : ($existing?->manufactured_at ?? null),
                'expires_at' => $partner->type === 'warehouse' ? ($data['expires_at'] ?? null) : ($existing?->expires_at ?? null),
                'received_at' => $partner->type === 'warehouse' ? ($data['received_at'] ?? null) : ($existing?->received_at ?? null),
                'storage_location' => $partner->type === 'warehouse' ? ($data['storage_location'] ?? null) : ($existing?->storage_location ?? null),
                'updated_at' => now(),
            ];

            if ($existing) {
                DB::table('inventories')->where('id', $existing->id)->update($payload);
                $inventoryId = $existing->id;
            } else {
                $payload['created_at'] = now();
                $payload['is_active'] = true;
                $inventoryId = DB::table('inventories')->insertGetId($payload);
            }

            $delta = $data['quantity'] - $oldQuantity;
            if ($delta !== 0) {
                DB::table('inventory_movements')->insert([
                    'medicine_id' => $data['medicine_id'],
                    'owner_type' => $partner->type,
                    'owner_id' => $partner->id,
                    'type' => 'manual_adjustment',
                    'quantity_delta' => $delta,
                    'quantity_after' => $data['quantity'],
                    'reason' => 'Inventory updated by pharmacy or warehouse',
                    'created_by' => $request->user()->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return DB::table('inventories')->where('id', $inventoryId)->first();
        }, config('medline.database_transaction_attempts', 3));

        AuditService::record($request, 'inventory.upsert', 'inventory', $inventory->id ?? null, [
            'medicine_id' => $data['medicine_id'],
            'quantity' => $data['quantity'],
            'unit_price' => $data['unit_price'],
            'batch_number' => $data['batch_number'] ?? null,
        ]);

        return response()->json([
            'message' => $partner->type === 'warehouse' ? 'Warehouse batch added.' : 'Pharmacy inventory updated.',
            'inventory' => $inventory,
        ], $partner->type === 'warehouse' ? 201 : 200);
    }

    public function updateStatus(Request $request, int $inventory): JsonResponse
    {
        $partner = $this->partnerFor($request);
        abort_unless($partner && $partner->type === 'warehouse', 403, 'Only an approved warehouse can change warehouse stock visibility.');
        $data = $request->validate(['is_active' => ['required', 'boolean']]);

        $record = DatabaseTransaction::run(function () use ($partner, $inventory, $data) {
            $record = DB::table('inventories')
                ->where('id', $inventory)
                ->where('owner_type', 'warehouse')
                ->where('owner_id', $partner->id)
                ->lockForUpdate()
                ->firstOrFail();
            DB::table('inventories')->where('id', $record->id)->update([
                'is_active' => $data['is_active'],
                'updated_at' => now(),
            ]);
            return DB::table('inventories')->where('id', $record->id)->first();
        }, config('medline.database_transaction_attempts', 3));

        AuditService::record($request, $data['is_active'] ? 'inventory.activated' : 'inventory.deactivated', 'inventory', $record->id, [
            'medicine_id' => $record->medicine_id,
            'owner_id' => $partner->id,
        ]);

        return response()->json([
            'message' => $data['is_active'] ? 'Warehouse medicine activated.' : 'Warehouse medicine deactivated.',
            'inventory' => $record,
        ]);
    }

    private function partnerFor(Request $request): ?Partner
    {
        return Partner::where('user_id', $request->user()->id)
            ->whereIn('type', ['pharmacy', 'warehouse'])
            ->where('approval_status', 'approved')
            ->where('subscription_status', 'active')
            ->first();
    }
}
