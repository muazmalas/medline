<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Services\DeliveryPricingService;
use App\Services\ProcurementBatchService;
use Carbon\Carbon;
use App\Support\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class ProcurementController extends Controller
{
    public function show(Request $request, int $procurement, ProcurementBatchService $batches): JsonResponse
    {
        $partner = $request->user()->role === 'admin'
            ? null
            : Partner::where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $order = DB::table('procurement_orders')->join('partners as pharmacies', 'pharmacies.id', '=', 'procurement_orders.pharmacy_id')->join('partners as warehouses', 'warehouses.id', '=', 'procurement_orders.warehouse_id')->where('procurement_orders.id', $procurement)->when($partner, function ($query) use ($partner) { $query->where(function ($nested) use ($partner) { $nested->where('procurement_orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.warehouse_id', $partner->id); }); })->select('procurement_orders.*', 'pharmacies.business_name as pharmacy_name', 'warehouses.business_name as warehouse_name')->firstOrFail();
        $items = DB::table('procurement_order_items')->join('medicines', 'medicines.id', '=', 'procurement_order_items.medicine_id')->where('procurement_order_id', $order->id)->get(['procurement_order_items.*', 'medicines.name_en', 'medicines.name_ar']);
        $items->transform(function ($item) use ($batches, $order) {
            $item->batch_options = $batches->batchOptions((int) $item->id, (int) $order->warehouse_id, (int) $item->medicine_id);
            return $item;
        });
        $delivery = DB::table('deliveries')->where('procurement_order_id', $order->id)->latest('id')->first();
        if ($delivery) {
            if ($partner?->type === 'pharmacy' && $delivery->pin_encrypted) {
                $delivery->delivery_pin = Crypt::decryptString($delivery->pin_encrypted);
            }
            unset($delivery->pin_hash, $delivery->pin_encrypted);
        }
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
        if ($request->string('status')->isNotEmpty()) {
            $query->where('procurement_orders.status', $request->string('status')->toString());
        }
        $sortable = [
            'public_id' => 'procurement_orders.public_id',
            'pharmacy_name' => 'pharmacies.business_name',
            'warehouse_name' => 'warehouses.business_name',
            'subtotal' => 'procurement_orders.subtotal',
            'delivery_fee' => 'procurement_orders.delivery_fee',
            'total' => 'procurement_orders.total',
            'status' => 'procurement_orders.status',
            'created_at' => 'procurement_orders.created_at',
        ];
        $sortBy = $sortable[$request->string('sort_by')->toString()] ?? 'procurement_orders.created_at';
        $sortDirection = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';

        return response()->json($query->orderBy($sortBy, $sortDirection)->orderBy('procurement_orders.id', $sortDirection)->paginate(min($request->integer('per_page', 20), 100)));
    }

    public function store(Request $request, DeliveryPricingService $pricing, ProcurementBatchService $batches): JsonResponse
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
            'delivery_address_snapshot' => ['nullable', 'string', 'max:1000'],
            'delivery_preference' => ['nullable', 'in:asap,scheduled'],
            'delivery_vehicle_type' => ['nullable', 'in:'.implode(',', $pricing->vehicleTypes())],
            'scheduled_delivery_at' => ['nullable', 'required_if:delivery_preference,scheduled', 'date', 'after:now'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.medicine_id' => ['required', 'integer', Rule::exists('medicines', 'id')->where('is_active', true)],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000'],
        ]);
        $warehouse = Partner::whereKey($data['warehouse_id'])->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $deliveryPreference = $data['delivery_preference'] ?? 'asap';
        $scheduledDeliveryAt = $deliveryPreference === 'scheduled'
            ? Carbon::parse($data['scheduled_delivery_at'])->utc()
            : null;

        $procurement = DatabaseTransaction::run(function () use ($data, $request, $pricing, $deliveryPreference, $scheduledDeliveryAt, $batches) {
            $pharmacy = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $pharmacy) abort(422, 'The pharmacy account is no longer available.');
            $warehouse = Partner::whereKey($data['warehouse_id'])->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $warehouse) abort(422, 'The warehouse account is no longer available.');
            $vehicleType = $pricing->normalizeVehicleType($data['delivery_vehicle_type'] ?? null);
            $currentRate = $pricing->current($vehicleType, true);
            $deliveryPricing = [
                'pricing_rate_id' => $currentRate->id ? (int) $currentRate->id : null,
                'distance_km' => null,
                'rate_per_km' => (float) $currentRate->rate_per_km,
                'fee' => 0.0,
            ];
            if ($warehouse->latitude !== null && $warehouse->longitude !== null && $pharmacy->latitude !== null && $pharmacy->longitude !== null) {
                $deliveryPricing = $pricing->estimate((float) $warehouse->latitude, (float) $warehouse->longitude, (float) $pharmacy->latitude, (float) $pharmacy->longitude, $currentRate);
            }
            $order = DB::table('procurement_orders')->insertGetId([
                'public_id' => (string) Str::ulid(), 'pharmacy_id' => $pharmacy->id, 'warehouse_id' => $warehouse->id,
                'status' => 'pending_warehouse_review', 'delivery_address_snapshot' => ($data['delivery_address_snapshot'] ?? null) ?: ($pharmacy->address ?? 'Pharmacy address not recorded'),
                'delivery_preference' => $deliveryPreference,
                'scheduled_delivery_at' => $scheduledDeliveryAt,
                'delivery_fee' => $deliveryPricing['fee'],
                'delivery_pricing_rate_id' => $deliveryPricing['pricing_rate_id'],
                'delivery_distance_km' => $deliveryPricing['distance_km'],
                'delivery_rate_per_km' => $deliveryPricing['rate_per_km'],
                'delivery_vehicle_type' => $vehicleType,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $subtotal = 0;
            foreach ($data['items'] as $item) {
                $itemId = DB::table('procurement_order_items')->insertGetId(['procurement_order_id' => $order, 'medicine_id' => $item['medicine_id'], 'quantity' => $item['quantity'], 'accepted_quantity' => 0, 'unit_price' => 0, 'line_total' => 0, 'created_at' => now(), 'updated_at' => now()]);
                $lineTotal = $batches->reserveFefo($itemId, (int) $warehouse->id, (int) $item['medicine_id'], (int) $item['quantity']);
                $averageUnitPrice = $lineTotal / (int) $item['quantity'];
                $subtotal += $lineTotal;
                DB::table('procurement_order_items')->where('id', $itemId)->update(['unit_price' => $averageUnitPrice, 'line_total' => $lineTotal, 'updated_at' => now()]);
            }
            DB::table('procurement_orders')->where('id', $order)->update(['subtotal' => $subtotal, 'total' => $subtotal + $deliveryPricing['fee'], 'updated_at' => now()]);
            return DB::table('procurement_orders')->where('id', $order)->first();
        }, config('medline.database_transaction_attempts', 3));
        $warehouse = Partner::findOrFail($procurement->warehouse_id);
        NotificationService::send($warehouse->user_id, 'procurement.created', ['procurement_id' => $procurement->public_id, 'message' => 'A pharmacy procurement order is awaiting review.']);
        AuditService::record($request, 'procurement.created', 'procurement_order', $procurement->id, ['warehouse_id' => $warehouse->id, 'subtotal' => $procurement->subtotal, 'delivery_distance_km' => $procurement->delivery_distance_km, 'delivery_rate_per_km' => $procurement->delivery_rate_per_km, 'delivery_vehicle_type' => $procurement->delivery_vehicle_type, 'delivery_fee' => $procurement->delivery_fee, 'total' => $procurement->total, 'delivery_preference' => $procurement->delivery_preference, 'scheduled_delivery_at' => $procurement->scheduled_delivery_at]);
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

    public function decide(Request $request, int $procurement, ProcurementBatchService $batches): JsonResponse
    {
        $warehouse = Partner::where('user_id', $request->user()->id)->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $data = $request->validate([
            'decision' => ['required', 'in:accept,reject,partial'],
            'note' => ['nullable', 'required_if:decision,reject,partial', 'string', 'min:5', 'max:1000'],
            'items' => ['nullable', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer'],
            'items.*.accepted_quantity' => ['required', 'integer', 'min:0'],
            'items.*.batches' => ['nullable', 'array'],
            'items.*.batches.*.inventory_id' => ['required', 'integer'],
            'items.*.batches.*.quantity' => ['required', 'integer', 'min:1'],
        ]);
        $result = DatabaseTransaction::run(function () use ($data, $warehouse, $procurement, $request, $batches) {
            $warehouse = Partner::whereKey($warehouse->id)->where('type', 'warehouse')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $warehouse) abort(403, 'Warehouse account is not currently eligible to process procurement.');
            $order = DB::table('procurement_orders')->where('id', $procurement)->where('warehouse_id', $warehouse->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== 'pending_warehouse_review') abort(422, 'Procurement order is no longer awaiting review.');
            $items = DB::table('procurement_order_items')->where('procurement_order_id', $order->id)->lockForUpdate()->get();
            $requested = collect($data['items'] ?? [])->keyBy('id');
            if ($data['decision'] !== 'reject') {
                abort_unless($requested->count() === $items->count() && $items->every(fn ($item) => $requested->has($item->id)), 422, 'Provide a quantity and batch allocation for every requested medicine.');
                abort_if($items->contains(fn ($item) => (int) $requested[$item->id]['accepted_quantity'] > (int) $item->quantity), 422, 'Accepted quantities cannot exceed the quantities requested by the pharmacy.');
            }
            if ($data['decision'] === 'accept') {
                abort_unless($items->every(fn ($item) => (int) $requested[$item->id]['accepted_quantity'] === (int) $item->quantity), 422, 'Accept all requires the complete requested quantity for every medicine.');
            }
            if ($data['decision'] === 'partial') {
                abort_unless($items->contains(fn ($item) => (int) $requested[$item->id]['accepted_quantity'] > 0), 422, 'A partial approval must include at least one unit. Reject the request when no units can be supplied.');
                abort_unless($items->contains(fn ($item) => (int) $requested[$item->id]['accepted_quantity'] < (int) $item->quantity), 422, 'Change at least one requested quantity before approving partially.');
            }
            $acceptedSubtotal = 0.0;
            foreach ($items as $item) {
                $accepted = $data['decision'] === 'accept'
                    ? $item->quantity
                    : ($data['decision'] === 'reject'
                        ? 0
                        : (int) $requested[$item->id]['accepted_quantity']);
                if ($data['decision'] === 'reject') {
                    $batches->releaseReservations((int) $item->id);
                    $lineTotal = 0.0;
                } else {
                    $lineTotal = $batches->replaceReservations((int) $item->id, (int) $warehouse->id, (int) $item->medicine_id, $requested[$item->id]['batches'] ?? [], (int) $accepted);
                }
                $unitPrice = $accepted > 0 ? $lineTotal / $accepted : (float) $item->unit_price;
                DB::table('procurement_order_items')->where('id', $item->id)->update(['accepted_quantity' => $accepted, 'unit_price' => $unitPrice, 'line_total' => $lineTotal, 'updated_at' => now()]);
                $acceptedSubtotal += $lineTotal;
            }
            $status = $data['decision'] === 'accept'
                ? 'accepted'
                : ($data['decision'] === 'partial' ? 'partial_approval_required' : 'rejected');
            DB::table('procurement_orders')->where('id', $order->id)->update([
                'status' => $status,
                'subtotal' => $acceptedSubtotal,
                'total' => $status === 'rejected' ? 0 : $acceptedSubtotal + (float) $order->delivery_fee,
                'warehouse_note' => $data['note'] ?? null,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);
            $deliveryId = null;
            if ($status === 'accepted') {
                $pin = (string) random_int(100000, 999999);
                $deliveryId = DB::table('deliveries')->insertGetId([
                    'public_id' => (string) Str::ulid(),
                    'procurement_order_id' => $order->id,
                    'status' => 'available',
                    'scheduled_for' => $order->scheduled_delivery_at,
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
        NotificationService::send($pharmacyUser, 'procurement.decision', ['procurement_id' => $result->public_id, 'status' => $result->status, 'note' => $data['note'] ?? null, 'message' => 'The warehouse updated your procurement order.']);
        if ($deliveryId) {
            NotificationService::send($pharmacyUser, 'procurement.delivery_created', ['delivery_id' => $deliveryId, 'message' => 'Your warehouse procurement is ready for delivery.']);
            NotificationService::send($pharmacyUser, 'delivery.pin_available', ['delivery_id' => $deliveryId, 'message' => 'Your delivery PIN is available in the secure order screen.']);
            DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.available', ['delivery_id' => $deliveryId, 'message' => 'A new delivery job is available.']));
        }
        AuditService::record($request, 'procurement.' . $result->status, 'procurement_order', $result->id, ['decision' => $data['decision'], 'note' => $data['note'] ?? null, 'items' => $data['items'] ?? []]);
        return response()->json(['message' => 'Procurement decision saved.', 'procurement' => $result]);
    }

    public function pharmacyPartialDecision(Request $request, int $procurement, ProcurementBatchService $batches): JsonResponse
    {
        $pharmacy = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $data = $request->validate(['decision' => ['required', 'in:approve,reject']]);

        $transactionResult = DatabaseTransaction::run(function () use ($pharmacy, $procurement, $data, $batches) {
            $order = DB::table('procurement_orders')->where('id', $procurement)->where('pharmacy_id', $pharmacy->id)->lockForUpdate()->firstOrFail();
            abort_unless($order->status === 'partial_approval_required', 422, 'This procurement partial offer is no longer awaiting pharmacy approval.');
            $items = DB::table('procurement_order_items')->where('procurement_order_id', $order->id)->lockForUpdate()->get();
            $deliveryId = null;

            if ($data['decision'] === 'reject') {
                foreach ($items as $item) {
                    $batches->releaseReservations((int) $item->id);
                }
                DB::table('procurement_orders')->where('id', $order->id)->update(['status' => 'partial_offer_rejected', 'subtotal' => 0, 'total' => 0, 'updated_at' => now()]);
            } else {
                DB::table('procurement_orders')->where('id', $order->id)->update(['status' => 'partially_accepted', 'updated_at' => now()]);
                $pin = (string) random_int(100000, 999999);
                $deliveryId = DB::table('deliveries')->insertGetId([
                    'public_id' => (string) Str::ulid(),
                    'procurement_order_id' => $order->id,
                    'status' => 'available',
                    'scheduled_for' => $order->scheduled_delivery_at,
                    'pin_hash' => Hash::make($pin),
                    'pin_encrypted' => Crypt::encryptString($pin),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return ['order' => DB::table('procurement_orders')->where('id', $order->id)->first(), 'delivery_id' => $deliveryId];
        }, config('medline.database_transaction_attempts', 3));

        $result = $transactionResult['order'];
        $warehouseUser = Partner::whereKey($result->warehouse_id)->value('user_id');
        NotificationService::send($warehouseUser, 'procurement.partial_offer_decision', ['procurement_id' => $result->public_id, 'status' => $result->status, 'message' => $data['decision'] === 'approve' ? 'The pharmacy approved the partial procurement offer.' : 'The pharmacy declined the partial procurement offer.']);
        if ($transactionResult['delivery_id']) {
            NotificationService::send($request->user(), 'procurement.delivery_created', ['delivery_id' => $transactionResult['delivery_id'], 'message' => 'Your approved partial procurement is ready for delivery.']);
            NotificationService::send($request->user(), 'delivery.pin_available', ['delivery_id' => $transactionResult['delivery_id'], 'message' => 'Your delivery PIN is available in the secure procurement screen.']);
            DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.available', ['delivery_id' => $transactionResult['delivery_id'], 'message' => 'A new delivery job is available.']));
        }
        AuditService::record($request, 'procurement.partial_offer_' . $data['decision'], 'procurement_order', $result->id, ['decision' => $data['decision']]);

        return response()->json(['message' => $data['decision'] === 'approve' ? 'Partial procurement approved and sent to delivery.' : 'Partial procurement offer declined.', 'procurement' => $result]);
    }
}
