<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Medicine;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
                        ->orWhere('medicines.manufacturer', 'like', $like);
                });
            })
            ->select('inventories.*', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.prescription_required')
            ->orderBy('medicines.name_en')
            ->paginate(min($request->integer('per_page', 20), 100));

        return response()->json($inventory);
    }

    public function upsert(Request $request): JsonResponse
    {
        $partner = $this->partnerFor($request);
        if (! $partner) {
            return response()->json(['message' => 'Only approved pharmacy and warehouse users can manage inventory.'], 403);
        }

        $data = $request->validate([
            'medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'quantity' => ['required', 'integer', 'min:0'],
            'unit_price' => ['required', 'numeric', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0', 'max:1000000'],
        ]);

        $inventory = DatabaseTransaction::run(function () use ($data, $partner, $request) {
            $partner = Partner::whereKey($partner->id)
                ->whereIn('type', ['pharmacy', 'warehouse'])
                ->where('approval_status', 'approved')
                ->where('subscription_status', 'active')
                ->lockForUpdate()
                ->first();
            abort_unless($partner, 403, 'Partner account is not currently eligible to manage inventory.');
            $existing = DB::table('inventories')
                ->where('medicine_id', $data['medicine_id'])
                ->where('owner_type', $partner->type)
                ->where('owner_id', $partner->id)
                ->lockForUpdate()
                ->first();

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
                'updated_at' => now(),
            ];

            if ($existing) {
                DB::table('inventories')->where('id', $existing->id)->update($payload);
                $inventoryId = $existing->id;
            } else {
                $payload['created_at'] = now();
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
                    'reason' => 'Inventory updated by partner',
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
        ]);

        return response()->json(['inventory' => $inventory]);
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
