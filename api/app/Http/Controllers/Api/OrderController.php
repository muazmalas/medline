<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Partner;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use App\Support\NotificationService;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['patient', 'admin'], true), 403);
        $sortable = ['public_id', 'status', 'created_at', 'total', 'delivery_address_snapshot'];
        $sortBy = in_array($request->string('sort_by')->toString(), $sortable, true) ? $request->string('sort_by')->toString() : 'created_at';
        $sortDirection = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';
        $orders = Order::query()
            ->with('items')
            ->when($request->user()->role === 'patient', fn ($query) => $query->where('patient_id', $request->user()->id))
            ->when($request->string('search')->isNotEmpty(), function ($query) use ($request) {
                $like = '%' . $request->string('search')->toString() . '%';
                $query->where(function ($nested) use ($like) {
                    $nested->where('public_id', 'like', $like)
                        ->orWhere('status', 'like', $like)
                        ->orWhere('delivery_address_snapshot', 'like', $like);
                });
            })
            ->when($request->string('status')->isNotEmpty(), fn ($query) => $query->where('status', $request->string('status')->toString()))
            ->orderBy($sortBy, $sortDirection)
            ->paginate(min($request->integer('per_page', 15), 50));
        $orders->getCollection()->transform(function ($record) {
            $record->customer_name = DB::table('users')->where('id', $record->patient_id)->value('name');
            $record->pharmacy_name = DB::table('partners')->where('id', $record->pharmacy_id)->value('business_name');
            $record->driver_name = DB::table('deliveries')->join('drivers', 'drivers.id', '=', 'deliveries.driver_id')->join('users', 'users.id', '=', 'drivers.user_id')->where('deliveries.order_id', $record->id)->value('users.name');
            $record->medicine_names = DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $record->id)->pluck('medicines.name_en')->implode(', ');
            $record->prescription_id = DB::table('prescriptions')->where('order_id', $record->id)->value('id');
            return $record;
        });

        return response()->json($orders);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        $user = $request->user();
        $canView = $user->role === 'admin' || $order->patient_id === $user->id;
        $canView = $canView || ($user->role === 'pharmacy' && $order->pharmacy_id === DB::table('partners')->where('user_id', $user->id)->value('id'));
        $canView = $canView || ($user->role === 'driver' && DB::table('deliveries')->join('drivers', 'drivers.id', '=', 'deliveries.driver_id')->where('deliveries.order_id', $order->id)->where('drivers.user_id', $user->id)->exists());
        abort_unless($canView, 403);
        $items = DB::table('order_items')
            ->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')
            ->where('order_items.order_id', $order->id)
            ->select('order_items.*', 'medicines.name_en', 'medicines.name_ar', 'medicines.manufacturer', 'medicines.form', 'medicines.dosage', 'medicines.image_path', 'medicines.prescription_required')
            ->orderBy('order_items.id')
            ->get();
        $prescriptions = DB::table('prescriptions')->where('order_id', $order->id)->latest('created_at')->get()->groupBy('order_item_id');
        $items->each(function ($item) use ($prescriptions) {
            $current = $prescriptions->get($item->id)?->first();
            $item->prescription = $current ? [
                'id' => $current->id,
                'status' => $current->status,
                'review_note' => $current->review_note,
                'created_at' => $current->created_at,
                'reviewed_at' => $current->reviewed_at,
            ] : null;
            $item->requested_line_total = (float) $item->unit_price * (int) $item->quantity;
            $item->accepted_line_total = (float) $item->unit_price * (int) $item->accepted_quantity;
        });
        $order->setRelation('items', $items);
        $delivery = DB::table('deliveries')->where('order_id', $order->id)->select('id', 'public_id', 'status', 'driver_id', 'completed_at', 'failure_reason', 'pin_used_at', 'pin_encrypted', 'last_latitude', 'last_longitude', 'location_accuracy_meters', 'location_updated_at', 'created_at', 'updated_at')->first();
        if ($delivery) {
            $delivery->driver = $delivery->driver_id
                ? DB::table('drivers')->join('users', 'users.id', '=', 'drivers.user_id')->where('drivers.id', $delivery->driver_id)->select('drivers.id as driver_id', 'users.name', 'users.email', 'drivers.vehicle_type', 'drivers.vehicle_plate', 'drivers.approval_status', 'drivers.is_available')->first()
                : null;
            if ($request->user()->role === 'patient' && $delivery->status !== 'delivered' && ! $delivery->pin_used_at && $delivery->pin_encrypted) $delivery->delivery_pin = Crypt::decryptString($delivery->pin_encrypted);
            $locationFreshAfter = now()->subMinutes(config('medline.delivery_location_stale_minutes', 10));
            if (! in_array($delivery->status, ['claimed', 'pickup_started', 'picked_up', 'in_transit', 'arrived'], true) || ! $delivery->location_updated_at || strtotime((string) $delivery->location_updated_at) < $locationFreshAfter->timestamp) {
                $delivery->last_latitude = null;
                $delivery->last_longitude = null;
                $delivery->location_accuracy_meters = null;
                $delivery->location_updated_at = null;
            }
            unset($delivery->pin_encrypted);
        }
        $events = $delivery
            ? DB::table('delivery_events')->where('delivery_id', $delivery->id)->select('from_status', 'to_status', 'note', 'created_at')->orderBy('created_at')->get()
            : collect();
        $rating = DB::table('ratings')->where('order_id', $order->id)->where('created_by', $request->user()->id)->select('score', 'comment', 'created_at')->first();
        $pickup = DB::table('partners')->where('id', $order->pharmacy_id)->select('business_name as label', 'address', 'latitude', 'longitude')->first();
        $dropoff = $order->address_id
            ? DB::table('addresses')->where('id', $order->address_id)->select('address_line as label', 'city', 'district', 'latitude', 'longitude')->first()
            : null;

        return response()->json([
            'order' => $order,
            'delivery' => $delivery,
            'route' => [
                'pickup' => $pickup,
                'dropoff' => $dropoff,
            ],
            'timeline' => $events,
            'rating' => $rating,
            'invoice' => [
                'requested_subtotal' => $items->sum('requested_line_total'),
                'accepted_subtotal' => $items->sum('accepted_line_total'),
                'subtotal' => $order->subtotal,
                'delivery_fee' => $order->delivery_fee,
                'total' => $order->total,
                'payment_method' => $order->payment_method,
                'payment_status' => $order->payment_status,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'patient') {
            return response()->json(['message' => 'Only patients can create patient orders.', 'code' => 'ORDER_ROLE_FORBIDDEN'], 403);
        }

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
            'pharmacy_id' => ['required', 'integer', 'exists:partners,id'],
            'address_id' => ['nullable', 'integer', 'exists:addresses,id'],
            'delivery_address_snapshot' => ['nullable', 'required_without:address_id', 'string', 'max:1000'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0'],
            'patient_note' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.medicine_id' => ['required', 'integer', 'distinct', 'exists:medicines,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:100'],
        ]);

        if (! empty($data['address_id'])) {
            $address = DB::table('addresses')->where('id', $data['address_id'])->where('user_id', $request->user()->id)->firstOrFail();
            $data['delivery_address_snapshot'] = implode(', ', array_filter([$address->address_line, $address->district, $address->city]));
        }

        $pharmacy = Partner::where('id', $data['pharmacy_id'])
            ->where('type', 'pharmacy')
            ->where('approval_status', 'approved')
            ->where('subscription_status', 'active')
            ->first();

        if (! $pharmacy) {
            return response()->json(['message' => 'The selected pharmacy is not currently available.', 'code' => 'PHARMACY_UNAVAILABLE'], 422);
        }

        try {
            $order = DatabaseTransaction::run(function () use ($data, $request) {
                $pharmacy = Partner::where('id', $data['pharmacy_id'])
                    ->where('type', 'pharmacy')
                    ->where('approval_status', 'approved')
                    ->where('subscription_status', 'active')
                    ->lockForUpdate()
                    ->first();
                if (! $pharmacy) throw new \RuntimeException('PHARMACY_UNAVAILABLE');
                $requiresPrescription = false;
                $order = Order::create([
                    'public_id' => (string) Str::ulid(),
                    'patient_id' => $request->user()->id,
                    'pharmacy_id' => $pharmacy->id,
                    'status' => 'pending_pharmacy_review',
                    'payment_method' => 'cash_on_delivery',
                    'payment_status' => 'pending',
                    'delivery_fee' => $data['delivery_fee'] ?? 0,
                    'delivery_address_snapshot' => $data['delivery_address_snapshot'],
                    'patient_note' => $data['patient_note'] ?? null,
                ]);

                $subtotal = 0;
                foreach ($data['items'] as $item) {
                    $medicine = DB::table('medicines')->where('id', $item['medicine_id'])->select('prescription_required')->firstOrFail();
                    $requiresPrescription = $requiresPrescription || (bool) $medicine->prescription_required;
                    $inventory = DB::table('inventories')
                        ->where('owner_type', 'pharmacy')
                        ->where('owner_id', $pharmacy->id)
                        ->where('medicine_id', $item['medicine_id'])
                        ->lockForUpdate()
                        ->first();

                    $available = ($inventory?->quantity ?? 0) - ($inventory?->reserved_quantity ?? 0);
                    if (! $inventory || $available < $item['quantity']) {
                        throw new \RuntimeException('MEDICINE_STOCK_UNAVAILABLE');
                    }

                    $lineTotal = (float) $inventory->unit_price * $item['quantity'];
                    $subtotal += $lineTotal;
                    OrderItem::create([
                        'order_id' => $order->id,
                        'medicine_id' => $item['medicine_id'],
                        'prescription_required_snapshot' => (bool) $medicine->prescription_required,
                        'quantity' => $item['quantity'],
                        'unit_price' => $inventory->unit_price,
                        'line_total' => $lineTotal,
                    ]);

                    DB::table('inventories')->where('id', $inventory->id)->update([
                        'reserved_quantity' => $inventory->reserved_quantity + $item['quantity'],
                        'updated_at' => now(),
                    ]);
                }

                $order->update(['status' => $requiresPrescription ? 'prescription_required' : 'pending_pharmacy_review', 'subtotal' => $subtotal, 'total' => $subtotal + ($data['delivery_fee'] ?? 0)]);
                return $order->load('items');
            }, config('medline.database_transaction_attempts', 3));
        } catch (\RuntimeException $exception) {
            if ($exception->getMessage() === 'PHARMACY_UNAVAILABLE') {
                return response()->json(['message' => 'The selected pharmacy is not currently available.', 'code' => 'PHARMACY_UNAVAILABLE'], 422);
            }
            if ($exception->getMessage() === 'MEDICINE_STOCK_UNAVAILABLE') {
                return response()->json(['message' => 'One or more medicines are no longer available in the requested quantity.', 'code' => 'ORDER_STOCK_UNAVAILABLE'], 422);
            }
            throw $exception;
        } catch (QueryException $exception) {
            report($exception);
            return response()->json(['message' => 'The order could not be created safely. Please retry.', 'code' => 'ORDER_TRANSACTION_FAILED'], 409);
        }

        $pharmacy = Partner::findOrFail($order->pharmacy_id);
        NotificationService::send($pharmacy->user_id, 'order.created', [
            'order_id' => $order->public_id,
            'status' => $order->status,
            'message' => $order->status === 'prescription_required' ? 'A patient order is awaiting prescription upload.' : 'A new patient order is awaiting review.',
        ]);
        NotificationService::send($order->patient_id, 'order.created_patient', [
            'order_id' => $order->public_id,
            'status' => $order->status,
            'message' => $order->status === 'prescription_required' ? 'Your order was submitted. Upload a prescription to continue.' : 'Your order was submitted successfully.',
        ]);
        AuditService::record($request, 'order.created', Order::class, $order->id, ['pharmacy_id' => $order->pharmacy_id, 'total' => $order->total]);

        $payload = ['message' => 'Order created successfully.', 'order' => $order];
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

    public function cancel(Request $request, Order $order): JsonResponse
    {
        abort_unless($order->patient_id === $request->user()->id || $request->user()->role === 'admin', 403);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);
        $cancelled = DatabaseTransaction::run(function () use ($order, $data, $request) {
            $locked = Order::with('items')->whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($locked->status, ['prescription_required', 'pending_pharmacy_review', 'prescription_review', 'partial_approval_required', 'accepted', 'partially_accepted', 'ready_for_delivery'], true), 409, 'This order can no longer be cancelled.');
            $delivery = DB::table('deliveries')->where('order_id', $locked->id)->lockForUpdate()->first();
            abort_unless(! $delivery || in_array($delivery->status, ['available', 'failed'], true), 409, 'This order is already in delivery.');
            $usesAcceptedQuantities = in_array($locked->status, ['partial_approval_required', 'accepted', 'partially_accepted', 'ready_for_delivery'], true);
            foreach ($locked->items as $item) {
                $release = $usesAcceptedQuantities ? $item->accepted_quantity : $item->quantity;
                $inventory = DB::table('inventories')->where('owner_type', 'pharmacy')->where('owner_id', $locked->pharmacy_id)->where('medicine_id', $item->medicine_id)->lockForUpdate()->first();
                if ($inventory) DB::table('inventories')->where('id', $inventory->id)->update(['reserved_quantity' => max(0, $inventory->reserved_quantity - $release), 'updated_at' => now()]);
            }
            if ($delivery) {
                DB::table('deliveries')->where('id', $delivery->id)->update(['status' => 'cancelled', 'last_latitude' => null, 'last_longitude' => null, 'location_accuracy_meters' => null, 'location_updated_at' => null, 'updated_at' => now()]);
                DB::table('delivery_events')->insert(['delivery_id' => $delivery->id, 'actor_id' => $request->user()->id, 'from_status' => $delivery->status, 'to_status' => 'cancelled', 'note' => $data['reason'] ?? null, 'created_at' => now(), 'updated_at' => now()]);
            }
            $locked->update(['status' => 'cancelled', 'updated_at' => now()]);
            return $locked->fresh('items');
        }, config('medline.database_transaction_attempts', 3));
        $pharmacyUserId = Partner::whereKey($cancelled->pharmacy_id)->value('user_id');
        if ($pharmacyUserId) NotificationService::send($pharmacyUserId, 'order.cancelled', ['order_id' => $cancelled->public_id, 'message' => 'A patient order was cancelled.']);
        NotificationService::send($cancelled->patient_id, 'order.cancelled_patient', ['order_id' => $cancelled->public_id, 'message' => 'Your order was cancelled.']);
        AuditService::record($request, 'order.cancelled', Order::class, $cancelled->id, ['reason' => $data['reason'] ?? null]);
        return response()->json(['message' => 'Order cancelled.', 'order' => $cancelled]);
    }
}
