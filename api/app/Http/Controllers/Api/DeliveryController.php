<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Support\NotificationService;
use Illuminate\Support\Facades\Crypt;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class DeliveryController extends Controller
{
    public function show(Request $request, int $delivery): JsonResponse
    {
        $row = DB::table('deliveries')->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where('deliveries.id', $delivery)->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.driver_id', 'deliveries.claimed_at', 'deliveries.completed_at', 'deliveries.last_latitude', 'deliveries.last_longitude', 'deliveries.location_accuracy_meters', 'deliveries.location_updated_at', 'orders.patient_id', 'orders.pharmacy_id as order_pharmacy_id', 'procurement_orders.pharmacy_id as procurement_pharmacy_id', 'procurement_orders.warehouse_id', 'orders.public_id as order_public_id', 'procurement_orders.public_id as procurement_public_id', DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))->firstOrFail();
        $allowed = $request->user()->role === 'admin' || (int) $row->patient_id === (int) $request->user()->id;
        if ($request->user()->role === 'driver') $allowed = (int) DB::table('drivers')->where('user_id', $request->user()->id)->value('id') === (int) $row->driver_id;
        if (in_array($request->user()->role, ['pharmacy', 'warehouse'], true)) {
            $partnerId = (int) DB::table('partners')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->value('id');
            $allowed = $partnerId > 0 && in_array($partnerId, [(int) $row->order_pharmacy_id, (int) $row->procurement_pharmacy_id, (int) $row->warehouse_id], true);
        }
        abort_unless($allowed, 403);
        $events = DB::table('delivery_events')->where('delivery_id', $delivery)->orderBy('created_at')->get();
        $locationFreshAfter = now()->subMinutes(config('medline.delivery_location_stale_minutes', 10));
        if (! in_array($row->status, ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'], true) || ! $row->location_updated_at || strtotime((string) $row->location_updated_at) < $locationFreshAfter->timestamp) {
            $row->last_latitude = null;
            $row->last_longitude = null;
            $row->location_accuracy_meters = null;
            $row->location_updated_at = null;
        }
        unset($row->patient_id, $row->order_pharmacy_id, $row->procurement_pharmacy_id, $row->warehouse_id);
        return response()->json(['delivery' => $row, 'events' => $events]);
    }

    public function mine(Request $request): JsonResponse
    {
        $query = DB::table('deliveries')
            ->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')
            ->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id');

        if ($request->user()->role === 'driver') {
            $driver = DB::table('drivers')->where('user_id', $request->user()->id)->first();
            abort_unless($driver, 404);
            $query->where('deliveries.driver_id', $driver->id);
        } else {
            $query->where('orders.patient_id', $request->user()->id);
        }

        $deliveries = $query
            ->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.driver_id', 'deliveries.completed_at', 'deliveries.pin_used_at', 'deliveries.pin_encrypted', 'deliveries.last_latitude', 'deliveries.last_longitude', 'deliveries.location_accuracy_meters', 'deliveries.location_updated_at', 'orders.public_id as order_public_id', 'procurement_orders.public_id as procurement_public_id', DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))
            ->latest('deliveries.created_at')
            ->get()
            ->map(function ($delivery) use ($request) {
                if ($request->user()->role === 'patient' && $delivery->status !== 'delivered' && ! $delivery->pin_used_at) {
                    $delivery->delivery_pin = $delivery->pin_encrypted ? Crypt::decryptString($delivery->pin_encrypted) : null;
                }
                $locationFreshAfter = now()->subMinutes(config('medline.delivery_location_stale_minutes', 10));
                if (! in_array($delivery->status, ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'], true) || ! $delivery->location_updated_at || strtotime((string) $delivery->location_updated_at) < $locationFreshAfter->timestamp) {
                    $delivery->last_latitude = null;
                    $delivery->last_longitude = null;
                    $delivery->location_accuracy_meters = null;
                    $delivery->location_updated_at = null;
                }
                unset($delivery->pin_encrypted);
                return $delivery;
            });
        return response()->json(['data' => $deliveries]);
    }

    public function partnerMine(Request $request): JsonResponse
    {
        $partner = DB::table('partners')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $deliveries = DB::table('deliveries')->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where(function ($query) use ($partner) { $query->where('orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.warehouse_id', $partner->id); })->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.driver_id', 'deliveries.claimed_at', 'deliveries.completed_at', DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.last_latitude END as last_latitude"), DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.last_longitude END as last_longitude"), DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.location_accuracy_meters END as location_accuracy_meters"), DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.location_updated_at END as location_updated_at"), 'orders.public_id as order_public_id', 'procurement_orders.public_id as procurement_public_id', DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))->latest('deliveries.created_at')->paginate(min($request->integer('per_page', 30), 100));
        $locationFreshAfter = now()->subMinutes(config('medline.delivery_location_stale_minutes', 10));
        $deliveries->getCollection()->transform(function ($delivery) use ($locationFreshAfter) {
            if (! $delivery->location_updated_at || strtotime((string) $delivery->location_updated_at) < $locationFreshAfter->timestamp) {
                $delivery->last_latitude = null;
                $delivery->last_longitude = null;
                $delivery->location_accuracy_meters = null;
                $delivery->location_updated_at = null;
            }
            return $delivery;
        });
        return response()->json($deliveries);
    }

    public function available(Request $request): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->firstOrFail();
        abort_unless($driver->approval_status === 'approved' && $driver->is_available, 403, 'Driver availability must be enabled before viewing new jobs.');
        $deliveries = DB::table('deliveries')->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where('deliveries.status', 'available')->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.created_at', DB::raw('COALESCE(orders.public_id, procurement_orders.public_id) as order_public_id'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))->latest('deliveries.created_at')->paginate(20);
        return response()->json($deliveries);
    }

    public function claim(Request $request, int $delivery): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('is_available', true)->firstOrFail();
        $claimed = DatabaseTransaction::run(function () use ($delivery, $driver) {
            $lockedDriver = DB::table('drivers')->where('id', $driver->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedDriver->approval_status === 'approved' && $lockedDriver->is_available, 403, 'Driver availability must be enabled before claiming a delivery.');
            $row = DB::table('deliveries')->where('id', $delivery)->lockForUpdate()->firstOrFail();
            if ($row->status !== 'available') abort(409, 'This delivery has already been claimed.');
            DB::table('deliveries')->where('id', $delivery)->update(['driver_id' => $lockedDriver->id, 'status' => 'claimed', 'claimed_at' => now(), 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $lockedDriver->user_id, 'from_status' => $row->status, 'to_status' => 'claimed', 'created_at' => now(), 'updated_at' => now()]);
            return DB::table('deliveries')->where('id', $delivery)->first();
        }, config('medline.database_transaction_attempts', 3));
        $recipientId = DB::table('orders')->where('id', $claimed->order_id)->value('patient_id');
        if (! $recipientId && $claimed->procurement_order_id) {
            $pharmacyId = DB::table('procurement_orders')->where('id', $claimed->procurement_order_id)->value('pharmacy_id');
            $recipientId = DB::table('partners')->where('id', $pharmacyId)->value('user_id');
        }
        if ($recipientId) NotificationService::send($recipientId, 'delivery.claimed', ['delivery_id' => $delivery, 'message' => 'A driver has claimed your delivery.']);
        DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->where('user_id', '!=', $driver->user_id)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.unavailable', ['delivery_id' => $delivery, 'message' => 'A delivery job was claimed by another driver.']));
        AuditService::record($request, 'delivery.claimed', 'delivery', $delivery, ['driver_id' => $driver->id]);
        return response()->json(['delivery' => $claimed]);
    }

    public function updateStatus(Request $request, int $delivery): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        $requestHash = hash('sha256', $request->getContent());
        if ($idempotencyKey !== '' && ! $request->attributes->get('idempotency_reserved')) {
            $previous = DB::table('idempotency_keys')->where('user_id', $request->user()->id)->where('key', $idempotencyKey)->first();
            if ($previous) {
                if ($previous->request_hash !== $requestHash) return response()->json(['message' => 'The idempotency key was already used with a different request.', 'code' => 'IDEMPOTENCY_KEY_REUSED'], 409);
                return response()->json(json_decode($previous->response_body, true), $previous->response_status ?? 200);
            }
        }
        $data = $request->validate(['status' => ['required', 'in:pickup_started,picked_up,in_transit,arrived,failed'], 'failure_reason' => ['nullable', 'string', 'max:1000']]);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->firstOrFail();
        $deliveryRow = DatabaseTransaction::run(function () use ($delivery, $driver, $data) {
            $row = DB::table('deliveries')->where('id', $delivery)->where('driver_id', $driver->id)->lockForUpdate()->firstOrFail();
            $allowed = ['claimed' => ['pickup_started'], 'pickup_started' => ['picked_up', 'failed'], 'picked_up' => ['in_transit', 'failed'], 'in_transit' => ['arrived', 'failed'], 'arrived' => ['failed']];
            abort_unless(in_array($data['status'], $allowed[$row->status] ?? [], true), 409);
            DB::table('deliveries')->where('id', $delivery)->update(['status' => $data['status'], 'failure_reason' => $data['status'] === 'failed' ? ($data['failure_reason'] ?? 'Driver reported a failed delivery.') : null, 'last_latitude' => $data['status'] === 'failed' ? null : DB::raw('last_latitude'), 'last_longitude' => $data['status'] === 'failed' ? null : DB::raw('last_longitude'), 'location_accuracy_meters' => $data['status'] === 'failed' ? null : DB::raw('location_accuracy_meters'), 'location_updated_at' => $data['status'] === 'failed' ? null : DB::raw('location_updated_at'), 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $driver->user_id, 'from_status' => $row->status, 'to_status' => $data['status'], 'created_at' => now(), 'updated_at' => now()]);
            return DB::table('deliveries')->where('id', $delivery)->first();
        }, config('medline.database_transaction_attempts', 3));
        $recipientId = DB::table('orders')->where('id', $deliveryRow->order_id)->value('patient_id');
        if (! $recipientId && $deliveryRow->procurement_order_id) {
            $pharmacyId = DB::table('procurement_orders')->where('id', $deliveryRow->procurement_order_id)->value('pharmacy_id');
            $recipientId = DB::table('partners')->where('id', $pharmacyId)->value('user_id');
        }
        if ($recipientId) {
            $eventType = match ($data['status']) {
                'arrived' => 'delivery.arrived',
                'failed' => 'delivery.failed',
                'picked_up' => 'delivery.picked_up',
                'in_transit' => 'delivery.in_transit',
                default => 'delivery.status',
            };
            NotificationService::send($recipientId, $eventType, ['delivery_id' => $delivery, 'status' => $data['status'], 'message' => 'Your delivery status was updated.']);
        }
        AuditService::record($request, 'delivery.' . $data['status'], 'delivery', $delivery, ['driver_id' => $driver->id]);
        $payload = ['message' => 'Delivery status updated.'];
        if ($idempotencyKey !== '') DB::table('idempotency_keys')->updateOrInsert(['user_id' => $request->user()->id, 'key' => $idempotencyKey], ['request_hash' => $requestHash, 'response_status' => 200, 'response_body' => json_encode($payload, JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now()]);
        return response()->json($payload);
    }

    public function updateLocation(Request $request, int $delivery): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $data = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0', 'max:10000'],
        ]);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->firstOrFail();
        $updated = DatabaseTransaction::run(function () use ($delivery, $driver, $data) {
            $row = DB::table('deliveries')->where('id', $delivery)->where('driver_id', $driver->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($row->status, ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'], true), 409, 'Location updates are unavailable for this delivery state.');
            DB::table('deliveries')->where('id', $delivery)->update([
                'last_latitude' => $data['latitude'],
                'last_longitude' => $data['longitude'],
                'location_accuracy_meters' => $data['accuracy_meters'] ?? null,
                'location_updated_at' => now(),
                'updated_at' => now(),
            ]);
            return DB::table('deliveries')->where('id', $delivery)->select('id', 'status', 'last_latitude', 'last_longitude', 'location_accuracy_meters', 'location_updated_at')->first();
        }, config('medline.database_transaction_attempts', 3));
        AuditService::record($request, 'delivery.location_updated', 'delivery', $delivery, ['driver_id' => $driver->id]);
        return response()->json(['delivery' => $updated]);
    }

    public function complete(Request $request, int $delivery): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $idempotencyKey = trim((string) $request->header('Idempotency-Key'));
        $requestHash = hash('sha256', $request->getContent());
        if ($idempotencyKey !== '' && ! $request->attributes->get('idempotency_reserved')) {
            $previous = DB::table('idempotency_keys')->where('user_id', $request->user()->id)->where('key', $idempotencyKey)->first();
            if ($previous) {
                if ($previous->request_hash !== $requestHash) return response()->json(['message' => 'The idempotency key was already used with a different request.', 'code' => 'IDEMPOTENCY_KEY_REUSED'], 409);
                return response()->json(json_decode($previous->response_body, true), $previous->response_status ?? 200);
            }
        }
        $data = $request->validate(['pin' => ['required', 'digits:6']]);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->firstOrFail();
        $result = DatabaseTransaction::run(function () use ($delivery, $driver, $data) {
            $row = DB::table('deliveries')->where('id', $delivery)->where('driver_id', $driver->id)->lockForUpdate()->firstOrFail();
            if ($row->status === 'delivered' || $row->pin_used_at) abort(409, 'Delivery is already completed.');
            if ($row->status !== 'arrived') abort(409, 'Delivery must be marked arrived before PIN confirmation.');
            if (! $row->pin_hash) abort(409, 'This delivery does not have a valid PIN.');
            if ($row->pin_locked_at || $row->pin_attempts >= 5) abort(423, 'Delivery PIN entry is locked. Contact support for reassignment.');
            if ($row->pin_hash && ! Hash::check($data['pin'], $row->pin_hash)) {
                $attempts = min(255, $row->pin_attempts + 1);
                DB::table('deliveries')->where('id', $delivery)->update(['pin_attempts' => $attempts, 'pin_locked_at' => $attempts >= 5 ? now() : null, 'updated_at' => now()]);
                abort(422, 'The delivery PIN is incorrect.');
            }
            if ($row->order_id) {
                $this->finalizePatientOrderStock($row->order_id, $driver->user_id);
            } elseif ($row->procurement_order_id) {
                $this->finalizeProcurementStock($row->procurement_order_id, $driver->user_id);
            }
            DB::table('deliveries')->where('id', $delivery)->update(['status' => 'delivered', 'pin_used_at' => now(), 'completed_at' => now(), 'last_latitude' => null, 'last_longitude' => null, 'location_accuracy_meters' => null, 'location_updated_at' => null, 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $driver->user_id, 'from_status' => $row->status, 'to_status' => 'delivered', 'created_at' => now(), 'updated_at' => now()]);
            if ($row->order_id) {
                DB::table('orders')->where('id', $row->order_id)->update(['status' => 'completed', 'payment_status' => 'paid', 'updated_at' => now()]);
            } elseif ($row->procurement_order_id) {
                DB::table('procurement_orders')->where('id', $row->procurement_order_id)->update(['status' => 'completed', 'updated_at' => now()]);
            }
            return DB::table('deliveries')->where('id', $delivery)->first();
        }, config('medline.database_transaction_attempts', 3));
        $recipientId = DB::table('orders')->where('id', $result->order_id)->value('patient_id');
        if (! $recipientId && $result->procurement_order_id) {
            $pharmacyId = DB::table('procurement_orders')->where('id', $result->procurement_order_id)->value('pharmacy_id');
            $recipientId = DB::table('partners')->where('id', $pharmacyId)->value('user_id');
        }
        if ($recipientId) {
            NotificationService::send($recipientId, 'delivery.completed', ['delivery_id' => $delivery, 'status' => 'delivered', 'message' => 'Your delivery has been completed.']);
            if ($result->order_id) NotificationService::send($recipientId, 'payment.recorded', ['order_id' => $result->order_id, 'payment_status' => 'paid', 'message' => 'Cash on delivery payment was recorded.']);
        }
        AuditService::record($request, 'delivery.completed', 'delivery', $delivery, ['driver_id' => $driver->id]);
        $payload = ['message' => 'Delivery completed successfully.', 'delivery' => $result];
        if ($idempotencyKey !== '') DB::table('idempotency_keys')->updateOrInsert(['user_id' => $request->user()->id, 'key' => $idempotencyKey], ['request_hash' => $requestHash, 'response_status' => 200, 'response_body' => json_encode($payload, JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now()]);
        return response()->json($payload);
    }

    private function finalizePatientOrderStock(int $orderId, int $actorId): void
    {
        $order = DB::table('orders')->where('id', $orderId)->lockForUpdate()->firstOrFail();
        $items = DB::table('order_items')->where('order_id', $orderId)->lockForUpdate()->get();
        foreach ($items as $item) {
            $quantity = (int) $item->accepted_quantity;
            if ($quantity <= 0) continue;
            $inventory = DB::table('inventories')->where('owner_type', 'pharmacy')->where('owner_id', $order->pharmacy_id)->where('medicine_id', $item->medicine_id)->lockForUpdate()->firstOrFail();
            abort_unless($inventory->quantity >= $quantity && $inventory->reserved_quantity >= $quantity, 409, 'Reserved pharmacy stock is no longer consistent.');
            $after = $inventory->quantity - $quantity;
            DB::table('inventories')->where('id', $inventory->id)->update(['quantity' => $after, 'reserved_quantity' => $inventory->reserved_quantity - $quantity, 'updated_at' => now()]);
            DB::table('inventory_movements')->insert(['medicine_id' => $item->medicine_id, 'owner_type' => 'pharmacy', 'owner_id' => $order->pharmacy_id, 'order_id' => $orderId, 'type' => 'delivery_completed', 'quantity_delta' => -$quantity, 'quantity_after' => $after, 'reason' => 'Patient delivery completed', 'created_by' => $actorId, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    private function finalizeProcurementStock(int $procurementId, int $actorId): void
    {
        $order = DB::table('procurement_orders')->where('id', $procurementId)->lockForUpdate()->firstOrFail();
        $items = DB::table('procurement_order_items')->where('procurement_order_id', $procurementId)->lockForUpdate()->get();
        foreach ($items as $item) {
            $quantity = (int) $item->accepted_quantity;
            if ($quantity <= 0) continue;
            $source = DB::table('inventories')->where('owner_type', 'warehouse')->where('owner_id', $order->warehouse_id)->where('medicine_id', $item->medicine_id)->lockForUpdate()->firstOrFail();
            abort_unless($source->quantity >= $quantity && $source->reserved_quantity >= $quantity, 409, 'Reserved warehouse stock is no longer consistent.');
            $sourceAfter = $source->quantity - $quantity;
            DB::table('inventories')->where('id', $source->id)->update(['quantity' => $sourceAfter, 'reserved_quantity' => $source->reserved_quantity - $quantity, 'updated_at' => now()]);
            DB::table('inventory_movements')->insert(['medicine_id' => $item->medicine_id, 'owner_type' => 'warehouse', 'owner_id' => $order->warehouse_id, 'order_id' => null, 'type' => 'procurement_delivery_out', 'quantity_delta' => -$quantity, 'quantity_after' => $sourceAfter, 'reason' => 'Procurement delivery completed: ' . $order->public_id, 'created_by' => $actorId, 'created_at' => now(), 'updated_at' => now()]);
            $destination = DB::table('inventories')->where('owner_type', 'pharmacy')->where('owner_id', $order->pharmacy_id)->where('medicine_id', $item->medicine_id)->lockForUpdate()->first();
            if ($destination) {
                $destinationAfter = $destination->quantity + $quantity;
                DB::table('inventories')->where('id', $destination->id)->update(['quantity' => $destinationAfter, 'updated_at' => now()]);
            } else {
                $destinationAfter = $quantity;
                DB::table('inventories')->insert(['medicine_id' => $item->medicine_id, 'owner_type' => 'pharmacy', 'owner_id' => $order->pharmacy_id, 'quantity' => $quantity, 'reserved_quantity' => 0, 'unit_price' => $item->unit_price, 'low_stock_threshold' => 5, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('inventory_movements')->insert(['medicine_id' => $item->medicine_id, 'owner_type' => 'pharmacy', 'owner_id' => $order->pharmacy_id, 'order_id' => null, 'type' => 'procurement_delivery_in', 'quantity_delta' => $quantity, 'quantity_after' => $destinationAfter, 'reason' => 'Procurement delivery received: ' . $order->public_id, 'created_by' => $actorId, 'created_at' => now(), 'updated_at' => now()]);
        }
    }
}
