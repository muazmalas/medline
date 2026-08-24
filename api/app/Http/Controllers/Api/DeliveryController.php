<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\MedlineMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use App\Support\NotificationService;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;
use App\Services\ProcurementBatchService;
use App\Services\DeliveryPricingService;

class DeliveryController extends Controller
{
    public function show(Request $request, int $delivery, DeliveryPricingService $pricing): JsonResponse
    {
        $row = DB::table('deliveries')->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where('deliveries.id', $delivery)->select('deliveries.id', 'deliveries.public_id', 'deliveries.order_id', 'deliveries.procurement_order_id', 'deliveries.status', 'deliveries.scheduled_for', 'deliveries.driver_id', 'deliveries.claimed_at', 'deliveries.completed_at', 'deliveries.last_latitude', 'deliveries.last_longitude', 'deliveries.location_accuracy_meters', 'deliveries.location_updated_at', 'deliveries.pickup_code_sent_at', 'deliveries.pickup_code_expires_at', 'deliveries.pickup_code_verified_at', 'deliveries.pickup_code_attempts', 'deliveries.pickup_code_locked_at', 'deliveries.recipient_code_sent_at', 'deliveries.recipient_code_expires_at', 'deliveries.recipient_code_verified_at', 'deliveries.recipient_code_attempts', 'deliveries.recipient_code_locked_at', 'orders.patient_id', 'orders.address_id as order_address_id', 'orders.delivery_latitude as order_delivery_latitude', 'orders.delivery_longitude as order_delivery_longitude', 'orders.pharmacy_id as order_pharmacy_id', 'procurement_orders.pharmacy_id as procurement_pharmacy_id', 'procurement_orders.warehouse_id', 'orders.public_id as order_public_id', 'procurement_orders.public_id as procurement_public_id', DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.delivery_fee, procurement_orders.delivery_fee) as job_price'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'), DB::raw('COALESCE(orders.delivery_distance_km, procurement_orders.delivery_distance_km) as delivery_distance_km'), DB::raw('COALESCE(orders.delivery_rate_per_km, procurement_orders.delivery_rate_per_km) as delivery_rate_per_km'), DB::raw("COALESCE(orders.delivery_vehicle_type, procurement_orders.delivery_vehicle_type, 'motorcycle') as delivery_vehicle_type"), DB::raw('COALESCE(orders.delivery_route_geometry, procurement_orders.delivery_route_geometry) as delivery_route_geometry'), DB::raw('COALESCE(orders.delivery_route_duration_seconds, procurement_orders.delivery_route_duration_seconds) as delivery_route_duration_seconds'), DB::raw('COALESCE(orders.delivery_route_provider, procurement_orders.delivery_route_provider) as delivery_route_provider'))->firstOrFail();
        $allowed = $request->user()->role === 'admin' || (int) $row->patient_id === (int) $request->user()->id;
        $viewingDriver = null;
        if ($request->user()->role === 'driver') {
            $viewingDriver = DB::table('drivers')->where('user_id', $request->user()->id)->first();
            $assignedToDriver = $viewingDriver && (int) $viewingDriver->id === (int) $row->driver_id;
            $availableToDriver = $viewingDriver
                && $viewingDriver->approval_status === 'approved'
                && (bool) $viewingDriver->is_available
                && $row->status === 'available'
                && ! $row->driver_id
                && $pricing->normalizeVehicleType($viewingDriver->vehicle_type) === $pricing->normalizeVehicleType($row->delivery_vehicle_type);
            $allowed = $assignedToDriver || $availableToDriver;
            $row->can_claim = $availableToDriver;
            $row->can_accept_order = $availableToDriver;
        }
        $viewingPartnerId = 0;
        if (in_array($request->user()->role, ['pharmacy', 'warehouse'], true)) {
            $viewingPartnerId = (int) DB::table('partners')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->value('id');
            $allowed = $viewingPartnerId > 0 && in_array($viewingPartnerId, [(int) $row->order_pharmacy_id, (int) $row->procurement_pharmacy_id, (int) $row->warehouse_id], true);
        }
        abort_unless($allowed, 403);
        $events = DB::table('delivery_events')->where('delivery_id', $delivery)->orderBy('created_at')->get();
        $pickupPartnerId = (int) ($row->order_pharmacy_id ?: $row->warehouse_id);
        $dropoffPartnerId = (int) ($row->procurement_pharmacy_id ?: 0);
        $pickup = DB::table('partners')
            ->join('users', 'users.id', '=', 'partners.user_id')
            ->where('partners.id', $pickupPartnerId)
            ->select(
                'partners.business_name as label',
                'partners.business_name',
                'partners.type',
                'partners.address',
                'partners.latitude',
                'partners.longitude',
                'users.name as contact_name',
                'users.email as contact_email',
                DB::raw('COALESCE(partners.phone, users.phone) as contact_phone')
            )
            ->first();
        $dropoff = $row->order_delivery_latitude !== null && $row->order_delivery_longitude !== null
            ? (object) [
                'label' => $row->delivery_address_snapshot,
                'city' => null,
                'district' => null,
                'latitude' => (float) $row->order_delivery_latitude,
                'longitude' => (float) $row->order_delivery_longitude,
            ]
            : ($row->order_address_id
                ? DB::table('addresses')->where('id', $row->order_address_id)->select('address_line as label', 'city', 'district', 'latitude', 'longitude')->first()
                : ($dropoffPartnerId ? DB::table('partners')->where('id', $dropoffPartnerId)->select('business_name as label', 'address', 'latitude', 'longitude')->first() : null));
        $driver = $row->driver_id
            ? DB::table('drivers')->join('users', 'users.id', '=', 'drivers.user_id')->where('drivers.id', $row->driver_id)->select('drivers.id as driver_id', 'users.name', 'users.email', 'drivers.vehicle_type', 'drivers.vehicle_plate', 'drivers.approval_status', 'drivers.is_available')->first()
            : null;
        $recipient = $row->order_id
            ? DB::table('users')->where('id', $row->patient_id)->select('name', 'email', 'phone')->first()
            : DB::table('partners')
                ->join('users', 'users.id', '=', 'partners.user_id')
                ->where('partners.id', $dropoffPartnerId)
                ->select('users.name', 'users.email', 'users.phone', 'partners.business_name as organization_name')
                ->first();
        if ($recipient) {
            $recipient->recipient_type = $row->order_id ? 'patient' : 'pharmacy';
        }
        $items = $row->order_id
            ? DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $row->order_id)->select('order_items.id', 'order_items.medicine_id', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.form', 'medicines.dosage', 'order_items.quantity as requested_quantity', DB::raw('CASE WHEN order_items.accepted_quantity > 0 THEN order_items.accepted_quantity ELSE order_items.quantity END as pickup_quantity'))->get()
            : DB::table('procurement_order_items')->join('medicines', 'medicines.id', '=', 'procurement_order_items.medicine_id')->where('procurement_order_items.procurement_order_id', $row->procurement_order_id)->select('procurement_order_items.id', 'procurement_order_items.medicine_id', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.form', 'medicines.dosage', 'procurement_order_items.quantity as requested_quantity', DB::raw('CASE WHEN procurement_order_items.accepted_quantity > 0 THEN procurement_order_items.accepted_quantity ELSE procurement_order_items.quantity END as pickup_quantity'))->get();
        $locationFreshAfter = now()->subMinutes(config('medline.delivery_location_stale_minutes', 10));
        if (! in_array($row->status, ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'], true) || ! $row->location_updated_at || strtotime((string) $row->location_updated_at) < $locationFreshAfter->timestamp) {
            $row->last_latitude = null;
            $row->last_longitude = null;
            $row->location_accuracy_meters = null;
            $row->location_updated_at = null;
        }
        $row->source_type = $row->order_id ? 'patient_order' : 'procurement_order';
        $pickupVerification = $this->verificationState($row, 'pickup');
        $recipientVerification = $this->verificationState($row, 'recipient');
        $isPickupPartner = $viewingPartnerId > 0 && $viewingPartnerId === $pickupPartnerId;
        $isAssignedDriver = $viewingDriver && (int) $viewingDriver->id === (int) $row->driver_id;
        $isRecipient = ($request->user()->role === 'patient' && (int) $row->patient_id === (int) $request->user()->id)
            || ($viewingPartnerId > 0 && $viewingPartnerId === $dropoffPartnerId);
        $row->verification = [
            'pickup' => $pickupVerification,
            'recipient' => $recipientVerification,
        ];
        $row->can_initiate_pickup_verification = $isPickupPartner && in_array($row->status, ['claimed', 'pickup_started'], true) && ! $row->pickup_code_verified_at;
        $row->can_verify_pickup = $isPickupPartner && $row->status === 'pickup_started' && $pickupVerification['state'] === 'code_sent';
        $row->can_initiate_recipient_verification = $isAssignedDriver && $row->status === 'arrived' && (bool) $row->pickup_code_verified_at && ! $row->recipient_code_verified_at;
        $row->can_verify_recipient = $isAssignedDriver && $row->status === 'arrived' && $recipientVerification['state'] === 'code_sent';
        $row->viewer_is_pickup_partner = $isPickupPartner;
        $row->viewer_is_recipient = $isRecipient;
        $routeGeometry = $this->decodeRouteGeometry($row->delivery_route_geometry);
        $routeDurationSeconds = $row->delivery_route_duration_seconds;
        $routeProvider = $row->delivery_route_provider;
        unset($row->patient_id, $row->order_address_id, $row->order_delivery_latitude, $row->order_delivery_longitude, $row->order_pharmacy_id, $row->procurement_pharmacy_id, $row->warehouse_id, $row->order_id, $row->procurement_order_id, $row->pickup_code_sent_at, $row->pickup_code_expires_at, $row->pickup_code_verified_at, $row->pickup_code_attempts, $row->pickup_code_locked_at, $row->recipient_code_sent_at, $row->recipient_code_expires_at, $row->recipient_code_verified_at, $row->recipient_code_attempts, $row->recipient_code_locked_at);
        unset($row->delivery_route_geometry, $row->delivery_route_duration_seconds, $row->delivery_route_provider);
        $row->driver = $driver;
        return response()->json(['delivery' => $row, 'recipient' => $recipient, 'route' => ['pickup' => $pickup, 'dropoff' => $dropoff, 'geometry' => $routeGeometry, 'distance_km' => $row->delivery_distance_km, 'duration_seconds' => $routeDurationSeconds, 'provider' => $routeProvider], 'items' => $items, 'events' => $events]);
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

        $query
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(fn ($nested) => $nested->where('deliveries.public_id', 'like', $like)->orWhere('orders.public_id', 'like', $like)->orWhere('procurement_orders.public_id', 'like', $like)->orWhere('deliveries.status', 'like', $like)->orWhere('orders.delivery_address_snapshot', 'like', $like)->orWhere('procurement_orders.delivery_address_snapshot', 'like', $like));
            })
            ->when($request->boolean('active_only'), fn ($query) => $query->whereIn('deliveries.status', ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived']))
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('deliveries.status', $request->string('status')->toString()));
        $sortBy = match ($request->string('sort_by')->toString()) { 'public_id' => 'deliveries.public_id', 'related_order' => 'order_public_id', 'delivery_address_snapshot' => 'delivery_address_snapshot', 'scheduled_for' => 'deliveries.scheduled_for', 'status' => 'deliveries.status', 'job_price' => 'job_price', 'total' => 'total', default => 'deliveries.created_at' };
        $direction = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';
        $deliveries = $query
            ->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.scheduled_for', 'deliveries.driver_id', 'deliveries.created_at', 'deliveries.completed_at', 'deliveries.pickup_code_sent_at', 'deliveries.pickup_code_expires_at', 'deliveries.pickup_code_verified_at', 'deliveries.recipient_code_sent_at', 'deliveries.recipient_code_expires_at', 'deliveries.recipient_code_verified_at', 'deliveries.last_latitude', 'deliveries.last_longitude', 'deliveries.location_accuracy_meters', 'deliveries.location_updated_at', 'orders.public_id as order_public_id', 'procurement_orders.public_id as procurement_public_id', DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.delivery_fee, procurement_orders.delivery_fee) as job_price'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))
            ->orderBy($sortBy, $direction)
            ->orderBy('deliveries.id', $direction)
            ->paginate(min($request->integer('per_page', 20), 100));
        $deliveries->getCollection()->transform(function ($delivery) {
                $locationFreshAfter = now()->subMinutes(config('medline.delivery_location_stale_minutes', 10));
                if (! in_array($delivery->status, ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'], true) || ! $delivery->location_updated_at || strtotime((string) $delivery->location_updated_at) < $locationFreshAfter->timestamp) {
                    $delivery->last_latitude = null;
                    $delivery->last_longitude = null;
                    $delivery->location_accuracy_meters = null;
                    $delivery->location_updated_at = null;
                }
                return $delivery;
            });
        return response()->json($deliveries);
    }

    public function partnerMine(Request $request): JsonResponse
    {
        $partner = DB::table('partners')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $sortBy = match ($request->string('sort_by')->toString()) { 'public_id' => 'deliveries.public_id', 'related_order' => 'order_public_id', 'delivery_address_snapshot' => 'delivery_address_snapshot', 'scheduled_for' => 'deliveries.scheduled_for', 'status' => 'deliveries.status', 'job_price' => 'job_price', 'total' => 'total', default => 'deliveries.created_at' };
        $direction = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';
        $deliveries = DB::table('deliveries')->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')->where(function ($query) use ($partner) { $query->where('orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.pharmacy_id', $partner->id)->orWhere('procurement_orders.warehouse_id', $partner->id); })->when($request->boolean('pickup_only'), function ($query) use ($partner) { if ($partner->type === 'pharmacy') { $query->whereNotNull('orders.id')->where('orders.pharmacy_id', $partner->id); } else { $query->whereNotNull('procurement_orders.id')->where('procurement_orders.warehouse_id', $partner->id); } })->when($request->string('search')->isNotEmpty(), function ($query) use ($request) { $like = '%' . $request->string('search')->toString() . '%'; $query->where(fn ($nested) => $nested->where('deliveries.public_id', 'like', $like)->orWhere('orders.public_id', 'like', $like)->orWhere('procurement_orders.public_id', 'like', $like)->orWhere('deliveries.status', 'like', $like)->orWhere('orders.delivery_address_snapshot', 'like', $like)->orWhere('procurement_orders.delivery_address_snapshot', 'like', $like)); })->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('deliveries.status', $request->string('status')->toString()))->select('deliveries.id', 'deliveries.public_id', 'deliveries.status', 'deliveries.scheduled_for', 'deliveries.driver_id', 'deliveries.created_at', 'deliveries.claimed_at', 'deliveries.completed_at', DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.last_latitude END as last_latitude"), DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.last_longitude END as last_longitude"), DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.location_accuracy_meters END as location_accuracy_meters"), DB::raw("CASE WHEN deliveries.status IN ('claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived') THEN deliveries.location_updated_at END as location_updated_at"), 'orders.public_id as order_public_id', 'procurement_orders.public_id as procurement_public_id', DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'), DB::raw('COALESCE(orders.delivery_fee, procurement_orders.delivery_fee) as job_price'), DB::raw('COALESCE(orders.total, procurement_orders.total) as total'))->orderBy($sortBy, $direction)->orderBy('deliveries.id', $direction)->paginate(min($request->integer('per_page', 30), 100));
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

    public function available(Request $request, DeliveryPricingService $pricing): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->firstOrFail();
        abort_unless($driver->approval_status === 'approved' && $driver->is_available, 403, 'Driver availability must be enabled before viewing new jobs.');
        $direction = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';
        $sortBy = match ($request->string('sort_by')->toString()) { 'public_id' => 'deliveries.public_id', 'related_order' => 'order_public_id', 'delivery_address_snapshot' => 'delivery_address_snapshot', 'scheduled_for' => 'deliveries.scheduled_for', 'status' => 'deliveries.status', 'job_price' => 'job_price', 'total' => 'total', default => 'deliveries.created_at' };
        $vehicleType = $pricing->normalizeVehicleType($driver->vehicle_type);
        $deliveries = DB::table('deliveries')
            ->leftJoin('orders', 'orders.id', '=', 'deliveries.order_id')
            ->leftJoin('procurement_orders', 'procurement_orders.id', '=', 'deliveries.procurement_order_id')
            ->leftJoin('partners as order_pharmacies', 'order_pharmacies.id', '=', 'orders.pharmacy_id')
            ->leftJoin('partners as procurement_warehouses', 'procurement_warehouses.id', '=', 'procurement_orders.warehouse_id')
            ->leftJoin('partners as procurement_pharmacies', 'procurement_pharmacies.id', '=', 'procurement_orders.pharmacy_id')
            ->leftJoin('addresses as order_addresses', 'order_addresses.id', '=', 'orders.address_id')
            ->where('deliveries.status', 'available')
            ->whereRaw("LOWER(COALESCE(orders.delivery_vehicle_type, procurement_orders.delivery_vehicle_type, 'motorcycle')) = ?", [$vehicleType])
            ->when(config('maps.routing_required', true), fn ($query) => $query->whereRaw('COALESCE(orders.delivery_route_geometry, procurement_orders.delivery_route_geometry) IS NOT NULL'))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(fn ($nested) => $nested
                    ->where('deliveries.public_id', 'like', $like)
                    ->orWhere('orders.public_id', 'like', $like)
                    ->orWhere('procurement_orders.public_id', 'like', $like)
                    ->orWhere('orders.delivery_address_snapshot', 'like', $like)
                    ->orWhere('procurement_orders.delivery_address_snapshot', 'like', $like));
            })
            ->select(
                'deliveries.id',
                'deliveries.public_id',
                'deliveries.status',
                'deliveries.scheduled_for',
                'deliveries.created_at',
                DB::raw('COALESCE(orders.public_id, procurement_orders.public_id) as order_public_id'),
                DB::raw('COALESCE(orders.delivery_address_snapshot, procurement_orders.delivery_address_snapshot) as delivery_address_snapshot'),
                DB::raw('COALESCE(orders.delivery_fee, procurement_orders.delivery_fee) as job_price'),
                DB::raw('COALESCE(orders.total, procurement_orders.total) as total'),
                DB::raw('COALESCE(orders.delivery_distance_km, procurement_orders.delivery_distance_km) as delivery_distance_km'),
                DB::raw('COALESCE(orders.delivery_rate_per_km, procurement_orders.delivery_rate_per_km) as delivery_rate_per_km'),
                DB::raw('COALESCE(orders.delivery_route_geometry, procurement_orders.delivery_route_geometry) as route_geometry'),
                DB::raw('COALESCE(orders.delivery_route_duration_seconds, procurement_orders.delivery_route_duration_seconds) as route_duration_seconds'),
                DB::raw('COALESCE(orders.delivery_route_provider, procurement_orders.delivery_route_provider) as route_provider'),
                DB::raw("COALESCE(orders.delivery_vehicle_type, procurement_orders.delivery_vehicle_type, 'motorcycle') as delivery_vehicle_type"),
                DB::raw('COALESCE(order_pharmacies.business_name, procurement_warehouses.business_name) as pickup_label'),
                DB::raw('COALESCE(order_pharmacies.address, procurement_warehouses.address) as pickup_address'),
                DB::raw('COALESCE(order_pharmacies.latitude, procurement_warehouses.latitude) as pickup_latitude'),
                DB::raw('COALESCE(order_pharmacies.longitude, procurement_warehouses.longitude) as pickup_longitude'),
                DB::raw('COALESCE(orders.delivery_latitude, order_addresses.latitude, procurement_pharmacies.latitude) as dropoff_latitude'),
                DB::raw('COALESCE(orders.delivery_longitude, order_addresses.longitude, procurement_pharmacies.longitude) as dropoff_longitude')
            )
            ->orderBy($sortBy, $direction)
            ->orderBy('deliveries.id', $direction)
            ->paginate(min($request->integer('per_page', 20), 100));
        $deliveries->getCollection()->transform(function ($delivery) {
            $delivery->route_geometry = $this->decodeRouteGeometry($delivery->route_geometry);
            return $delivery;
        });
        return response()->json($deliveries);
    }

    public function acceptOrder(Request $request, int $delivery, DeliveryPricingService $pricing): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('is_available', true)->firstOrFail();
        $claimed = DatabaseTransaction::run(function () use ($delivery, $driver, $pricing) {
            $lockedDriver = DB::table('drivers')->where('id', $driver->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedDriver->approval_status === 'approved' && $lockedDriver->is_available, 403, 'Driver availability must be enabled before accepting an order.');
            $row = DB::table('deliveries')->where('id', $delivery)->lockForUpdate()->firstOrFail();
            if ($row->status !== 'available') abort(409, 'This order has already been accepted by a driver.');
            $vehicleType = $row->order_id
                ? DB::table('orders')->where('id', $row->order_id)->value('delivery_vehicle_type')
                : DB::table('procurement_orders')->where('id', $row->procurement_order_id)->value('delivery_vehicle_type');
            abort_unless($pricing->normalizeVehicleType($lockedDriver->vehicle_type) === $pricing->normalizeVehicleType($vehicleType), 403, 'This job requires a different vehicle type.');
            if (config('maps.routing_required', true)) {
                $routeGeometry = $row->order_id
                    ? DB::table('orders')->where('id', $row->order_id)->value('delivery_route_geometry')
                    : DB::table('procurement_orders')->where('id', $row->procurement_order_id)->value('delivery_route_geometry');
                abort_if(blank($routeGeometry), 409, 'This order is waiting for its road-route calculation and cannot be accepted yet.');
            }
            DB::table('deliveries')->where('id', $delivery)->update(['driver_id' => $lockedDriver->id, 'status' => 'claimed', 'claimed_at' => now(), 'updated_at' => now()]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $lockedDriver->user_id, 'from_status' => $row->status, 'to_status' => 'claimed', 'created_at' => now(), 'updated_at' => now()]);
            return DB::table('deliveries')->where('id', $delivery)->first();
        }, config('medline.database_transaction_attempts', 3));
        $recipientId = DB::table('orders')->where('id', $claimed->order_id)->value('patient_id');
        if (! $recipientId && $claimed->procurement_order_id) {
            $pharmacyId = DB::table('procurement_orders')->where('id', $claimed->procurement_order_id)->value('pharmacy_id');
            $recipientId = DB::table('partners')->where('id', $pharmacyId)->value('user_id');
        }
        if ($recipientId) NotificationService::send($recipientId, 'delivery.order_accepted', ['delivery_id' => $delivery, 'message' => 'A driver accepted your order for delivery.']);
        DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->whereRaw('LOWER(vehicle_type) = ?', [strtolower((string) $driver->vehicle_type)])->where('user_id', '!=', $driver->user_id)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.unavailable', ['delivery_id' => $delivery, 'message' => 'An order was accepted by another driver.']));
        AuditService::record($request, 'delivery.order_accepted', 'delivery', $delivery, ['driver_id' => $driver->id]);
        return response()->json(['message' => 'Order accepted for delivery.', 'delivery' => $this->safeDelivery($claimed)]);
    }

    public function claim(Request $request, int $delivery, DeliveryPricingService $pricing): JsonResponse
    {
        return $this->acceptOrder($request, $delivery, $pricing);
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
        $data = $request->validate(['status' => ['required', 'in:arrived,failed'], 'failure_reason' => ['nullable', 'string', 'max:1000']]);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->firstOrFail();
        $deliveryRow = DatabaseTransaction::run(function () use ($delivery, $driver, $data) {
            $row = DB::table('deliveries')->where('id', $delivery)->where('driver_id', $driver->id)->lockForUpdate()->firstOrFail();
            $allowed = ['claimed' => ['failed'], 'pickup_started' => ['failed'], 'picked_up' => ['arrived', 'failed'], 'in_transit' => ['arrived', 'failed'], 'arrived' => ['failed']];
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

    public function initiatePickupVerification(Request $request, int $delivery): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['pharmacy', 'warehouse'], true), 403);
        $partner = DB::table('partners')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $code = (string) random_int(1000, 9999);
        $sentAt = now();
        $result = DatabaseTransaction::run(function () use ($delivery, $partner, $code, $sentAt) {
            $row = DB::table('deliveries')->where('id', $delivery)->lockForUpdate()->firstOrFail();
            $pickupPartnerId = $row->order_id
                ? (int) DB::table('orders')->where('id', $row->order_id)->value('pharmacy_id')
                : (int) DB::table('procurement_orders')->where('id', $row->procurement_order_id)->value('warehouse_id');
            abort_unless((int) $partner->id === $pickupPartnerId, 403, 'Only the pickup partner can start pickup verification.');
            abort_unless($row->driver_id, 409, 'A driver must accept the order before pickup verification.');
            abort_unless(in_array($row->status, ['claimed', 'pickup_started'], true) && ! $row->pickup_code_verified_at, 409, 'Pickup verification is not available in this delivery state.');
            $this->enforceResendCooldown($row->pickup_code_sent_at);

            DB::table('deliveries')->where('id', $delivery)->update([
                'status' => 'pickup_started',
                'pickup_code_hash' => Hash::make($code),
                'pickup_code_sent_at' => $sentAt,
                'pickup_code_expires_at' => $sentAt->copy()->addMinutes(config('medline.delivery_verification_ttl_minutes', 10)),
                'pickup_code_attempts' => 0,
                'pickup_code_locked_at' => null,
                'updated_at' => $sentAt,
            ]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $partner->user_id, 'from_status' => $row->status, 'to_status' => 'pickup_started', 'note' => 'Pickup verification code sent to the assigned driver.', 'created_at' => $sentAt, 'updated_at' => $sentAt]);

            return [
                'driver_user_id' => (int) DB::table('drivers')->where('id', $row->driver_id)->value('user_id'),
                'pickup_name' => (string) $partner->business_name,
                'reference' => (string) $row->public_id,
                'previous_status' => (string) $row->status,
            ];
        }, config('medline.database_transaction_attempts', 3));

        $driverUser = User::findOrFail($result['driver_user_id']);
        try {
            MedlineMail::deliveryVerificationCode($driverUser, 'pickup', $code, $result['reference'], $result['pickup_name']);
        } catch (\Throwable $exception) {
            $this->clearUnsentVerification($delivery, 'pickup', $sentAt, $result['previous_status']);
            throw $exception;
        }
        AuditService::record($request, 'delivery.pickup_verification_initiated', 'delivery', $delivery, ['driver_id' => $result['driver_user_id']]);

        return response()->json(['message' => 'A 4-digit pickup code was emailed to the assigned driver.', 'expires_at' => $sentAt->copy()->addMinutes(config('medline.delivery_verification_ttl_minutes', 10))]);
    }

    public function verifyPickup(Request $request, int $delivery): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['pharmacy', 'warehouse'], true), 403);
        $data = $request->validate(['code' => ['required', 'digits:4']]);
        $partner = DB::table('partners')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->where('subscription_status', 'active')->firstOrFail();
        $result = DatabaseTransaction::run(function () use ($delivery, $partner, $data) {
            $row = DB::table('deliveries')->where('id', $delivery)->lockForUpdate()->firstOrFail();
            $pickupPartnerId = $row->order_id
                ? (int) DB::table('orders')->where('id', $row->order_id)->value('pharmacy_id')
                : (int) DB::table('procurement_orders')->where('id', $row->procurement_order_id)->value('warehouse_id');
            abort_unless((int) $partner->id === $pickupPartnerId, 403, 'Only the pickup partner can verify pickup.');
            abort_unless($row->status === 'pickup_started' && ! $row->pickup_code_verified_at, 409, 'Pickup verification is not available in this delivery state.');
            $this->assertVerificationUsable($row, 'pickup');

            if (! Hash::check($data['code'], $row->pickup_code_hash)) {
                return $this->recordFailedVerificationAttempt($delivery, $row, 'pickup');
            }

            $verifiedAt = now();
            DB::table('deliveries')->where('id', $delivery)->update(['status' => 'in_transit', 'pickup_code_hash' => null, 'pickup_code_verified_at' => $verifiedAt, 'pickup_code_attempts' => 0, 'pickup_code_locked_at' => null, 'updated_at' => $verifiedAt]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $partner->user_id, 'from_status' => 'pickup_started', 'to_status' => 'in_transit', 'note' => 'Pickup verified; the delivery entered transit automatically.', 'created_at' => $verifiedAt, 'updated_at' => $verifiedAt]);

            return ['verified' => true, 'delivery' => DB::table('deliveries')->where('id', $delivery)->first()];
        }, config('medline.database_transaction_attempts', 3));

        if (! $result['verified']) return $this->failedVerificationResponse($result);
        $recipientId = $this->deliveryRecipientUserId($result['delivery']);
        if ($recipientId) NotificationService::send($recipientId, 'delivery.in_transit', ['delivery_id' => $delivery, 'status' => 'in_transit', 'message' => 'Pickup was verified and your medicines are now in transit.']);
        AuditService::record($request, 'delivery.pickup_verified', 'delivery', $delivery, []);

        return response()->json(['message' => 'Driver pickup verified. The delivery is now in transit.', 'delivery' => $this->safeDelivery($result['delivery'])]);
    }

    public function initiateRecipientVerification(Request $request, int $delivery): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->firstOrFail();
        $code = (string) random_int(1000, 9999);
        $sentAt = now();
        $result = DatabaseTransaction::run(function () use ($delivery, $driver, $code, $sentAt) {
            $row = DB::table('deliveries')->where('id', $delivery)->where('driver_id', $driver->id)->lockForUpdate()->firstOrFail();
            abort_unless($row->status === 'arrived' && $row->pickup_code_verified_at && ! $row->recipient_code_verified_at, 409, 'Recipient verification is available only after verified pickup and arrival.');
            $this->enforceResendCooldown($row->recipient_code_sent_at);
            $recipientId = $this->deliveryRecipientUserId($row);
            abort_unless($recipientId, 409, 'The delivery recipient does not have an account email.');

            DB::table('deliveries')->where('id', $delivery)->update([
                'recipient_code_hash' => Hash::make($code),
                'recipient_code_sent_at' => $sentAt,
                'recipient_code_expires_at' => $sentAt->copy()->addMinutes(config('medline.delivery_verification_ttl_minutes', 10)),
                'recipient_code_attempts' => 0,
                'recipient_code_locked_at' => null,
                'updated_at' => $sentAt,
            ]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $driver->user_id, 'from_status' => 'arrived', 'to_status' => 'arrived', 'note' => 'Recipient handoff verification code sent.', 'created_at' => $sentAt, 'updated_at' => $sentAt]);

            return ['recipient_user_id' => $recipientId, 'reference' => (string) $row->public_id];
        }, config('medline.database_transaction_attempts', 3));

        $recipient = User::findOrFail($result['recipient_user_id']);
        try {
            MedlineMail::deliveryVerificationCode($recipient, 'recipient', $code, $result['reference'], (string) $request->user()->name);
        } catch (\Throwable $exception) {
            $this->clearUnsentVerification($delivery, 'recipient', $sentAt);
            throw $exception;
        }
        AuditService::record($request, 'delivery.recipient_verification_initiated', 'delivery', $delivery, ['recipient_id' => $result['recipient_user_id']]);

        return response()->json(['message' => 'A 4-digit handoff code was emailed to the recipient.', 'expires_at' => $sentAt->copy()->addMinutes(config('medline.delivery_verification_ttl_minutes', 10))]);
    }

    public function verifyRecipient(Request $request, int $delivery, ProcurementBatchService $batches): JsonResponse
    {
        abort_unless($request->user()->role === 'driver', 403);
        $data = $request->validate(['code' => ['required', 'digits:4']]);
        $driver = DB::table('drivers')->where('user_id', $request->user()->id)->where('approval_status', 'approved')->firstOrFail();
        $result = DatabaseTransaction::run(function () use ($delivery, $driver, $data, $batches) {
            $row = DB::table('deliveries')->where('id', $delivery)->where('driver_id', $driver->id)->lockForUpdate()->firstOrFail();
            abort_unless($row->status === 'arrived' && $row->pickup_code_verified_at && ! $row->recipient_code_verified_at, 409, 'Recipient verification is not available in this delivery state.');
            $this->assertVerificationUsable($row, 'recipient');
            if (! Hash::check($data['code'], $row->recipient_code_hash)) {
                return $this->recordFailedVerificationAttempt($delivery, $row, 'recipient');
            }
            if ($row->order_id) {
                $this->finalizePatientOrderStock($row->order_id, $driver->user_id);
            } elseif ($row->procurement_order_id) {
                $this->finalizeProcurementStock($row->procurement_order_id, $driver->user_id, $batches);
            }
            $verifiedAt = now();
            DB::table('deliveries')->where('id', $delivery)->update(['status' => 'delivered', 'recipient_code_hash' => null, 'recipient_code_verified_at' => $verifiedAt, 'recipient_code_attempts' => 0, 'recipient_code_locked_at' => null, 'pin_used_at' => $verifiedAt, 'completed_at' => $verifiedAt, 'last_latitude' => null, 'last_longitude' => null, 'location_accuracy_meters' => null, 'location_updated_at' => null, 'updated_at' => $verifiedAt]);
            DB::table('delivery_events')->insert(['delivery_id' => $delivery, 'actor_id' => $driver->user_id, 'from_status' => 'arrived', 'to_status' => 'delivered', 'note' => 'Recipient handoff verified and delivery completed.', 'created_at' => $verifiedAt, 'updated_at' => $verifiedAt]);
            if ($row->order_id) {
                DB::table('orders')->where('id', $row->order_id)->update(['status' => 'completed', 'payment_status' => 'paid', 'updated_at' => $verifiedAt]);
            } elseif ($row->procurement_order_id) {
                DB::table('procurement_orders')->where('id', $row->procurement_order_id)->update(['status' => 'completed', 'updated_at' => $verifiedAt]);
            }

            return ['verified' => true, 'delivery' => DB::table('deliveries')->where('id', $delivery)->first()];
        }, config('medline.database_transaction_attempts', 3));

        if (! $result['verified']) return $this->failedVerificationResponse($result);
        $recipientId = $this->deliveryRecipientUserId($result['delivery']);
        if ($recipientId) {
            NotificationService::send($recipientId, 'delivery.completed', ['delivery_id' => $delivery, 'status' => 'delivered', 'message' => 'The driver verified the secure handoff and completed your delivery.']);
            if ($result['delivery']->order_id) NotificationService::send($recipientId, 'payment.recorded', ['order_id' => $result['delivery']->order_id, 'payment_status' => 'paid', 'message' => 'Cash on delivery payment was recorded.']);
        }
        AuditService::record($request, 'delivery.recipient_verified', 'delivery', $delivery, ['driver_id' => $driver->id]);

        return response()->json(['message' => 'Recipient verified. Delivery completed successfully.', 'delivery' => $this->safeDelivery($result['delivery'])]);
    }

    /** Backward-compatible endpoint for clients that still post `pin`. */
    public function complete(Request $request, int $delivery, ProcurementBatchService $batches): JsonResponse
    {
        $request->merge(['code' => $request->input('code', $request->input('pin'))]);

        return $this->verifyRecipient($request, $delivery, $batches);
    }

    /** @return array{state:string,sent_at:mixed,expires_at:mixed,verified_at:mixed,attempts_remaining:int} */
    private function verificationState(object $row, string $prefix): array
    {
        $sentAt = $row->{$prefix . '_code_sent_at'};
        $expiresAt = $row->{$prefix . '_code_expires_at'};
        $verifiedAt = $row->{$prefix . '_code_verified_at'};
        $attempts = (int) $row->{$prefix . '_code_attempts'};
        $lockedAt = $row->{$prefix . '_code_locked_at'};
        $maximum = (int) config('medline.delivery_verification_max_attempts', 5);
        $state = $verifiedAt
            ? 'verified'
            : (($lockedAt || $attempts >= $maximum)
                ? 'locked'
                : (! $sentAt
                    ? 'not_started'
                    : (($expiresAt && now()->greaterThan(Carbon::parse($expiresAt))) ? 'expired' : 'code_sent')));

        return [
            'state' => $state,
            'sent_at' => $sentAt,
            'expires_at' => $expiresAt,
            'verified_at' => $verifiedAt,
            'attempts_remaining' => max(0, $maximum - $attempts),
        ];
    }

    private function enforceResendCooldown(mixed $sentAt): void
    {
        if (! $sentAt) return;
        $availableAt = Carbon::parse($sentAt)->addSeconds(config('medline.delivery_verification_resend_seconds', 60));
        if (now()->lt($availableAt)) {
            abort(429, 'Please wait ' . now()->diffInSeconds($availableAt) . ' seconds before requesting another code.');
        }
    }

    private function assertVerificationUsable(object $row, string $prefix): void
    {
        $hash = $row->{$prefix . '_code_hash'};
        $expiresAt = $row->{$prefix . '_code_expires_at'};
        $attempts = (int) $row->{$prefix . '_code_attempts'};
        $lockedAt = $row->{$prefix . '_code_locked_at'};
        abort_unless($hash && $expiresAt, 409, 'Request a verification code before entering it.');
        abort_if($lockedAt || $attempts >= config('medline.delivery_verification_max_attempts', 5), 423, 'Verification is locked. Request a new code to continue.');
        abort_if(now()->greaterThan(Carbon::parse($expiresAt)), 410, 'This verification code has expired. Request a new code.');
    }

    /** @return array{verified:false,locked:bool,attempts_remaining:int} */
    private function recordFailedVerificationAttempt(int $delivery, object $row, string $prefix): array
    {
        $maximum = (int) config('medline.delivery_verification_max_attempts', 5);
        $attemptsColumn = $prefix . '_code_attempts';
        $lockedColumn = $prefix . '_code_locked_at';
        $attempts = min(255, (int) $row->{$attemptsColumn} + 1);
        $locked = $attempts >= $maximum;
        DB::table('deliveries')->where('id', $delivery)->update([$attemptsColumn => $attempts, $lockedColumn => $locked ? now() : null, 'updated_at' => now()]);

        return ['verified' => false, 'locked' => $locked, 'attempts_remaining' => max(0, $maximum - $attempts)];
    }

    private function failedVerificationResponse(array $result): JsonResponse
    {
        if ($result['locked']) {
            return response()->json(['message' => 'Too many incorrect attempts. Request a new verification code.', 'attempts_remaining' => 0], 423);
        }

        return response()->json(['message' => 'The 4-digit verification code is incorrect.', 'attempts_remaining' => $result['attempts_remaining']], 422);
    }

    private function deliveryRecipientUserId(object $delivery): ?int
    {
        if ($delivery->order_id) {
            $id = DB::table('orders')->where('id', $delivery->order_id)->value('patient_id');

            return $id ? (int) $id : null;
        }
        if ($delivery->procurement_order_id) {
            $pharmacyId = DB::table('procurement_orders')->where('id', $delivery->procurement_order_id)->value('pharmacy_id');
            $id = $pharmacyId ? DB::table('partners')->where('id', $pharmacyId)->value('user_id') : null;

            return $id ? (int) $id : null;
        }

        return null;
    }

    private function clearUnsentVerification(int $delivery, string $prefix, Carbon $sentAt, ?string $previousStatus = null): void
    {
        $update = [
            $prefix . '_code_hash' => null,
            $prefix . '_code_sent_at' => null,
            $prefix . '_code_expires_at' => null,
            $prefix . '_code_attempts' => 0,
            $prefix . '_code_locked_at' => null,
            'updated_at' => now(),
        ];
        if ($prefix === 'pickup' && $previousStatus) $update['status'] = $previousStatus;
        $cleared = DB::table('deliveries')->where('id', $delivery)->where($prefix . '_code_sent_at', $sentAt)->whereNull($prefix . '_code_verified_at')->update($update);
        if ($cleared) DB::table('delivery_events')->where('delivery_id', $delivery)->where('created_at', $sentAt)->delete();
    }

    private function safeDelivery(object $delivery): object
    {
        unset(
            $delivery->pin_hash,
            $delivery->pin_encrypted,
            $delivery->pickup_code_hash,
            $delivery->recipient_code_hash
        );

        return $delivery;
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

    /** @return array<string, mixed>|null */
    private function decodeRouteGeometry(mixed $geometry): ?array
    {
        if (is_array($geometry)) return $geometry;
        if (! is_string($geometry) || trim($geometry) === '') return null;
        $decoded = json_decode($geometry, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function finalizeProcurementStock(int $procurementId, int $actorId, ProcurementBatchService $batches): void
    {
        $order = DB::table('procurement_orders')->where('id', $procurementId)->lockForUpdate()->firstOrFail();
        $items = DB::table('procurement_order_items')->where('procurement_order_id', $procurementId)->lockForUpdate()->get();
        foreach ($items as $item) {
            $quantity = (int) $item->accepted_quantity;
            if ($quantity <= 0) continue;
            $consumedBatches = $batches->consumeReservations((int) $item->id);
            foreach ($consumedBatches as $consumedBatch) {
                DB::table('inventory_movements')->insert(['medicine_id' => $item->medicine_id, 'owner_type' => 'warehouse', 'owner_id' => $order->warehouse_id, 'order_id' => null, 'type' => 'procurement_delivery_out', 'quantity_delta' => -$consumedBatch->quantity, 'quantity_after' => $consumedBatch->quantity_after, 'reason' => 'Procurement delivery completed from batch ' . ($consumedBatch->batch_number ?: '#'.$consumedBatch->inventory_id) . ': ' . $order->public_id, 'created_by' => $actorId, 'created_at' => now(), 'updated_at' => now()]);
            }
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
