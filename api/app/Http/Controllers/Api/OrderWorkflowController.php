<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\NotificationService;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class OrderWorkflowController extends Controller
{
    public function partnerOrders(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->first();
        if (! $partner) {
            return response()->json(['message' => 'Pharmacy profile not found.'], 404);
        }

        $sortable = ['public_id', 'status', 'created_at', 'total', 'delivery_address_snapshot'];
        $sortBy = in_array($request->string('sort_by')->toString(), $sortable, true) ? $request->string('sort_by')->toString() : 'created_at';
        $sortDirection = $request->string('sort_direction')->toString() === 'asc' ? 'asc' : 'desc';
        $orders = Order::with('items')
            ->where('pharmacy_id', $partner->id)
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
            ->orderBy('id', $sortDirection)
            ->paginate(min($request->integer('per_page', 20), 50));
        $orders->getCollection()->transform(function ($record) use ($partner) {
            $record->customer_name = DB::table('users')->where('id', $record->patient_id)->value('name');
            $record->pharmacy_name = $partner->business_name;
            $record->driver_name = DB::table('deliveries')->join('drivers', 'drivers.id', '=', 'deliveries.driver_id')->join('users', 'users.id', '=', 'drivers.user_id')->where('deliveries.order_id', $record->id)->value('users.name');
            $record->medicine_names = DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $record->id)->pluck('medicines.name_en')->implode(', ');
            $record->prescription_id = DB::table('prescriptions')->where('order_id', $record->id)->value('id');
            return $record;
        });

        return response()->json($orders);
    }

    public function decide(Request $request, Order $order): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->first();
        if (! $partner || $order->pharmacy_id !== $partner->id) {
            return response()->json(['message' => 'You cannot manage this order.'], 403);
        }

        $data = $request->validate([
            'decision' => ['required', 'in:accept,reject,partial'],
            'items' => ['nullable', 'required_if:decision,partial', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.accepted_quantity' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'required_if:decision,partial,reject', 'string', 'min:5', 'max:1000'],
        ]);
        if (in_array($data['decision'], ['partial', 'reject'], true) && mb_strlen(trim((string) ($data['note'] ?? ''))) < 5) {
            throw ValidationException::withMessages(['note' => ['Explain the partial approval or rejection in at least 5 characters.']]);
        }

        $order = DatabaseTransaction::run(function () use ($data, $order, $request) {
            $partner = Partner::whereKey($order->pharmacy_id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->lockForUpdate()->first();
            if (! $partner) abort(403, 'Pharmacy account is not currently eligible to process orders.');
            $lockedOrder = Order::with('items')->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($lockedOrder->status === 'prescription_required') {
                abort(409, 'This order requires an uploaded and approved prescription before pharmacy processing.');
            }
            if (! in_array($lockedOrder->status, ['pending_pharmacy_review', 'prescription_review'], true)) {
                abort(422, 'This order is no longer awaiting pharmacy review.');
            }

            if ($data['decision'] === 'reject') {
                foreach ($lockedOrder->items as $item) {
                    $this->releaseReservation($lockedOrder, $item);
                    $item->update(['accepted_quantity' => 0]);
                }
                $lockedOrder->update([
                    'status' => 'rejected',
                    'partial_offer_note' => trim($data['note']),
                    'partial_offered_at' => null,
                ]);
            } else {
                $requested = collect($data['items'] ?? [])->keyBy('id');
                $acceptedSubtotal = 0.0;
                $acceptedUnits = 0;
                $requestedUnits = (int) $lockedOrder->items->sum('quantity');
                foreach ($lockedOrder->items as $item) {
                    $submittedQuantity = (int) ($requested[$item->id]['accepted_quantity'] ?? 0);
                    if ($data['decision'] === 'partial' && $submittedQuantity > $item->quantity) {
                        abort(422, 'A fulfilled quantity cannot be greater than the quantity requested.');
                    }
                    $accepted = $data['decision'] === 'accept' ? $item->quantity : $submittedQuantity;
                    $requiresPrescription = (bool) $item->prescription_required_snapshot || (bool) DB::table('medicines')->where('id', $item->medicine_id)->value('prescription_required');
                    if ($accepted > 0 && $requiresPrescription) {
                        $approvedPrescription = DB::table('prescriptions')->where('order_item_id', $item->id)->where('status', 'approved')->exists();
                        abort_unless($approvedPrescription, 409, 'Every accepted prescription medicine must have its own approved prescription.');
                    }
                    $this->releaseReservation($lockedOrder, $item, $accepted);
                    $item->update(['accepted_quantity' => $accepted]);
                    $acceptedSubtotal += (float) $item->unit_price * $accepted;
                    $acceptedUnits += $accepted;
                }
                if ($data['decision'] === 'partial') {
                    abort_unless($acceptedUnits > 0 && $acceptedUnits < $requestedUnits, 422, 'A partial offer must accept at least one item and leave at least one requested unit unaccepted.');
                }
                $taxAmount = round($acceptedSubtotal * (float) $lockedOrder->tax_rate / 100, 2);
                $lockedOrder->update([
                    'status' => $data['decision'] === 'accept' ? 'accepted' : 'partial_approval_required',
                    'subtotal' => $acceptedSubtotal,
                    'tax_amount' => $taxAmount,
                    'total' => $acceptedSubtotal + $taxAmount + (float) $lockedOrder->delivery_fee,
                    'partial_offer_note' => $data['decision'] === 'partial' ? trim($data['note']) : null,
                    'partial_offered_at' => $data['decision'] === 'partial' ? now() : null,
                    'patient_decision_note' => null,
                    'patient_decided_at' => null,
                ]);
            }

            $deliveryId = null;
            if ($lockedOrder->status === 'accepted') $deliveryId = $this->createDelivery($lockedOrder);
            return ['order' => $lockedOrder->fresh('items'), 'delivery_id' => $deliveryId];
        }, config('medline.database_transaction_attempts', 3));

        $transactionResult = $order;
        $order = $transactionResult['order'];
        $deliveryId = $transactionResult['delivery_id'];
        if ($deliveryId) {
            NotificationService::send($order->patient_id, 'delivery.created', [
                'delivery_id' => $deliveryId,
                'message' => 'Your order is ready for delivery.',
            ]);
            NotificationService::send($order->patient_id, 'delivery.pin_available', ['delivery_id' => $deliveryId, 'message' => 'Your delivery PIN is available in the secure order screen.']);
            DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.available', ['delivery_id' => $deliveryId, 'message' => 'A new delivery job is available.']));
        }

        NotificationService::send($order->patient_id, 'order.decision', [
            'order_id' => $order->public_id,
            'status' => $order->status,
            'message' => 'The pharmacy updated your order.',
        ]);
        AuditService::record($request, 'order.' . $order->status, Order::class, $order->id, ['decision' => $data['decision'], 'note' => $data['note'] ?? null]);

        return response()->json(['message' => 'Order decision saved.', 'order' => $order]);
    }

    public function patientPartialDecision(Request $request, Order $order): JsonResponse
    {
        abort_unless($request->user()->role === 'patient' && $order->patient_id === $request->user()->id, 403);
        $data = $request->validate(['decision' => ['required', 'in:approve,reject'], 'note' => ['nullable', 'string', 'max:1000']]);
        $result = DatabaseTransaction::run(function () use ($request, $order, $data) {
            $lockedOrder = Order::with('items')->whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedOrder->patient_id === $request->user()->id && $lockedOrder->status === 'partial_approval_required', 409, 'This partial offer is no longer awaiting your decision.');
            $deliveryId = null;
            if ($data['decision'] === 'approve') {
                $lockedOrder->update(['status' => 'partially_accepted', 'patient_decision_note' => $data['note'] ?? null, 'patient_decided_at' => now()]);
                $deliveryId = $this->createDelivery($lockedOrder);
            } else {
                foreach ($lockedOrder->items as $item) {
                    if ($item->accepted_quantity > 0) $this->releaseReservation($lockedOrder, $item, max(0, $item->quantity - $item->accepted_quantity));
                }
                $lockedOrder->update(['status' => 'partial_offer_rejected', 'patient_decision_note' => $data['note'] ?? null, 'patient_decided_at' => now()]);
            }
            return ['order' => $lockedOrder->fresh('items'), 'delivery_id' => $deliveryId];
        }, config('medline.database_transaction_attempts', 3));

        if ($result['delivery_id']) {
            NotificationService::send($order->patient_id, 'delivery.created', ['delivery_id' => $result['delivery_id'], 'message' => 'Your approved partial order is ready for delivery.']);
            NotificationService::send($order->patient_id, 'delivery.pin_available', ['delivery_id' => $result['delivery_id'], 'message' => 'Your delivery PIN is available in the secure order screen.']);
            DB::table('drivers')->where('approval_status', 'approved')->where('is_available', true)->pluck('user_id')->each(fn ($driverUserId) => NotificationService::send($driverUserId, 'delivery.available', ['delivery_id' => $result['delivery_id'], 'message' => 'A new delivery job is available.']));
        }
        $pharmacyUserId = Partner::whereKey($order->pharmacy_id)->value('user_id');
        if ($pharmacyUserId) NotificationService::send($pharmacyUserId, 'order.partial_offer_' . $data['decision'], ['order_id' => $order->public_id, 'status' => $result['order']->status, 'message' => 'The patient ' . ($data['decision'] === 'approve' ? 'approved' : 'declined') . ' the partial order offer.']);
        AuditService::record($request, 'order.partial_offer_' . $data['decision'], Order::class, $order->id, ['note' => $data['note'] ?? null]);
        return response()->json(['message' => $data['decision'] === 'approve' ? 'Partial order approved and sent to delivery.' : 'Partial order declined.', ...$result]);
    }

    private function createDelivery(Order $order): int
    {
        $existing = DB::table('deliveries')->where('order_id', $order->id)->value('id');
        if ($existing) return (int) $existing;
        $pin = (string) random_int(100000, 999999);
        return DB::table('deliveries')->insertGetId([
            'public_id' => (string) Str::ulid(),
            'order_id' => $order->id,
            'status' => 'available',
            'scheduled_for' => $order->scheduled_delivery_at,
            'pin_hash' => Hash::make($pin),
            'pin_encrypted' => Crypt::encryptString($pin),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function releaseReservation(Order $order, object $item, int $accepted = 0): void
    {
        $release = $item->quantity - $accepted;
        if ($release <= 0) {
            return;
        }

        $inventory = DB::table('inventories')
            ->where('owner_type', 'pharmacy')
            ->where('owner_id', $order->pharmacy_id)
            ->where('medicine_id', $item->medicine_id)
            ->lockForUpdate()
            ->first();

        if ($inventory) {
            DB::table('inventories')->where('id', $inventory->id)->update([
                'reserved_quantity' => max(0, $inventory->reserved_quantity - $release),
                'updated_at' => now(),
            ]);
        }
    }
}
