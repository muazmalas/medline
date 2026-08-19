<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Support\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class ProcurementController extends Controller
{
    public function show(Request $request, int $procurement): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $order = DB::table('procurement_orders')->join('partners as pharmacies', 'pharmacies.id', '=', 'procurement_orders.pharmacy_id')->join('partners as warehouses', 'warehouses.id', '=', 'procurement_orders.warehouse_id')->where('procurement_orders.id', $procurement)->where(function ($query) use ($partner) { $query->where('procurement_orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.warehouse_id', $partner->id); })->select('procurement_orders.*', 'pharmacies.business_name as pharmacy_name', 'warehouses.business_name as warehouse_name')->firstOrFail();
        $items = DB::table('procurement_order_items')->join('medicines', 'medicines.id', '=', 'procurement_order_items.medicine_id')->where('procurement_order_id', $order->id)->get(['procurement_order_items.*', 'medicines.name_en', 'medicines.name_ar']);
        $delivery = DB::table('deliveries')->where('procurement_order_id', $order->id)->latest('id')->first();
        $timeline = $delivery ? DB::table('delivery_events')->where('delivery_id', $delivery->id)->orderBy('created_at')->get() : collect();
        return response()->json(['procurement' => $order, 'items' => $items, 'delivery' => $delivery, 'timeline' => $timeline]);
    }

    public function index(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $query = DB::table('procurement_orders')->join('partners as pharmacies', 'pharmacies.id', '=', 'procurement_orders.pharmacy_id')->join('partners as warehouses', 'warehouses.id', '=', 'procurement_orders.warehouse_id')->where(function ($q) use ($partner) { $q->where('procurement_orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.warehouse_id', $partner->id); })->select('procurement_orders.*', 'pharmacies.business_name as pharmacy_name', 'warehouses.business_name as warehouse_name');
        if ($request->string('search')->isNotEmpty()) {
            $like = '%' . $request->string('search')->toString() . '%';
            $query->where(function ($nested) use ($like) {
                $nested->where('procurement_orders.public_id', 'like', $like)
                    ->orWhere('procurement_orders.status', 'like', $like)
                    ->orWhere('procurement_orders.delivery_address_snapshot', 'like', $like)
                    ->orWhere('pharmacies.business_name', 'like', $like)
                    ->orWhere('warehouses.business_name', 'like', $like);
            });
        }
        return response()->json($query->latest()->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $pharmacy = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        $requestHash = hash('sha256', $request->getContent());
        if ($idempotencyKey !== '' && ! $request->attributes->get('idempotency_reserved')) {
            $previous = DB::table('idempotency_keys')->where('user_id', $request->user()->id)->where('key', $idempotencyKey)->first();
            if ($previous) {
                if ($previous->request_hash !== $requestHash) {
                    return response()->json(['message' => 'The idempotency key was already used with a different request.', 'code' => 'IDEMPOTENCY_KEY_REUSED'], 409);
                }
                return response()->json(json_decode($previous->response_body, true), $previous->response_status ?? 201);
            }
        }
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer', 'exists:partners,id'],
            'delivery_address_snapshot' => ['required', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000'],
        ]);
        $warehouse = Partner::whereKey($data['warehouse_id'])->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();

        $procurement = DatabaseTransaction::run(function () use ($data, $request) {
            $pharmacy = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $pharmacy) abort(422, 'The pharmacy account is no longer available.');
            $warehouse = Partner::whereKey($data['warehouse_id'])->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $warehouse) abort(422, 'The warehouse account is no longer available.');
            $order = DB::table('procurement_orders')->insertGetId([
                'public_id' => (string) Str::ulid(), 'pharmacy_id' => $pharmacy->id, 'warehouse_id' => $warehouse->id,
                'status' => 'pending_warehouse_review', 'delivery_address_snapshot' => $data['delivery_address_snapshot'],
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $subtotal = 0;
            foreach ($data['items'] as $item) {
                $inventory = DB::table('inventories')->where('owner_type', 'warehouse')->where('owner_id', $warehouse->id)->where('medicine_id', $item['medicine_id'])->lockForUpdate()->first();
                $available = ($inventory?->quantity ?? 0) - ($inventory?->reserved_quantity ?? 0);
                if (! $inventory || $available < $item['quantity']) abort(422, 'Requested warehouse stock is unavailable.');
                $lineTotal = (float) $inventory->unit_price * $item['quantity'];
                $subtotal += $lineTotal;
                DB::table('procurement_order_items')->insert(['procurement_order_id' => $order, 'medicine_id' => $item['medicine_id'], 'quantity' => $item['quantity'], 'unit_price' => $inventory->unit_price, 'line_total' => $lineTotal, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('inventories')->where('id', $inventory->id)->update(['reserved_quantity' => $inventory->reserved_quantity + $item['quantity'], 'updated_at' => now()]);
            }
            DB::table('procurement_orders')->where('id', $order)->update(['subtotal' => $subtotal, 'total' => $subtotal, 'updated_at' => now()]);
            return DB::table('procurement_orders')->where('id', $order)->first();
        }, config('medline.database_transaction_attempts', 3));
        $warehouse = Partner::findOrFail($procurement->warehouse_id);
        NotificationService::send($warehouse->user_id, 'procurement.created', ['procurement_id' => $procurement->public_id, 'message' => 'A pharmacy procurement order is awaiting review.']);
        AuditService::record($request, 'procurement.created', 'procurement_order', $procurement->id, ['warehouse_id' => $warehouse->id, 'total' => $procurement->total]);
        $payload = ['message' => 'Procurement order created.', 'procurement' => $procurement];
        if ($idempotencyKey !== '') {
            DB::table('idempotency_keys')->updateOrInsert([
                'user_id' => $request->user()->id, 'key' => $idempotencyKey,
            ], [
                'request_hash' => $requestHash,
                'response_status' => 201,
                'response_body' => json_encode($payload, JSON_THROW_ON_ERROR),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        return response()->json($payload, 201);
    }

    public function decide(Request $request, int $procurement): JsonResponse
    {
        $warehouse = Partner::where('user_id', $request->user()->id)->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $data = $request->validate(['decision' => ['required', 'in:accept,reject,partial'], 'items' => ['nullable', 'array'], 'items.*.id' => ['required', 'integer'], 'items.*.accepted_quantity' => ['required', 'integer', 'min:0']]);
        $result = DatabaseTransaction::run(function () use ($data, $warehouse, $procurement) {
            $warehouse = Partner::whereKey($warehouse->id)->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $warehouse) abort(403, 'Warehouse account is not currently eligible to process procurement.');
            $order = DB::table('procurement_orders')->where('id', $procurement)->where('warehouse_id', $warehouse->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== 'pending_warehouse_review') abort(422, 'Procurement order is no longer awaiting review.');
            $items = DB::table('procurement_order_items')->where('procurement_order_id', $order->id)->lockForUpdate()->get();
            $requested = collect($data['items'] ?? [])->keyBy('id');
            foreach ($items as $item) {
                $accepted = $data['decision'] === 'accept'
                    ? $item->quantity
                    : ($data['decision'] === 'reject'
                        ? 0
                        : min($item->quantity, (int) ($requested[$item->id]['accepted_quantity'] ?? 0)));
                $release = $item->quantity - $accepted;
                $inventory = DB::table('inventories')->where('owner_type', 'warehouse')->where('owner_id', $warehouse->id)->where('medicine_id', $item->medicine_id)->lockForUpdate()->first();
                if ($inventory && $release > 0) DB::table('inventories')->where('id', $inventory->id)->update(['reserved_quantity' => max(0, $inventory->reserved_quantity - $release), 'updated_at' => now()]);
                DB::table('procurement_order_items')->where('id', $item->id)->update(['accepted_quantity' => $accepted, 'updated_at' => now()]);
            }
            $status = $data['decision'] === 'accept'
                ? 'accepted'
                : ($data['decision'] === 'partial' ? 'partially_accepted' : 'rejected');
            DB::table('procurement_orders')->where('id', $order->id)->update(['status' => $status, 'updated_at' => now()]);
            $deliveryId = null;
            if (in_array($status, ['accepted', 'partially_accepted'], true)) {
                $pin = (string) random_int(100000, 999999);
                $deliveryId = DB::table('deliveries')->insertGetId([
                    'public_id' => (string) Str::ulid(),
                    'procurement_order_id' => $order->id,
                    'status' => 'available',
                    'pin_hash' => Hash::make($pin),
                    'pin_encrypted' => Crypt::encryptString($pin),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            return ['order' => DB::table('procurement_orders')->where('id', $order->id)->first(), 'delivery_id' => $deliveryId];
        }, config('medline.database_transaction_attempts', 3));
        $transactionResult = $result;
        $result = $transactionResult['order'];
        $deliveryId = $transactionResult['delivery_id'];
        $pharmacyUser = Partner::whereKey($result->pharmacy_id)->value('user_id');
        NotificationService::send($pharmacyUser, 'procurement.decision', ['procurement_id' => $result->public_id, 'status' => $result->status, 'message' => 'The warehouse updated your procurement order.']);
        if ($deliveryId) {
            NotificationService::send($pharmacyUser, 'procurement.delivery_created', ['delivery_id' => $deliveryId, 'message' => 'Your warehouse procurement is ready for delivery.']);
            NotificationService::send($pharmacyUser, 'delivery.pin_available', ['delivery_id' => $deliveryId, 'message' => 'Your delivery PIN is available in the secure order screen.']);
            DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.available', ['delivery_id' => $deliveryId, 'message' => 'A new delivery job is available.']));
        }
        AuditService::record($request, 'procurement.' . $result->status, 'procurement_order', $result->id, ['decision' => $data['decision']]);
        return response()->json(['message' => 'Procurement decision saved.', 'procurement' => $result]);
    }
}
