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
use App\Support\AuditService;
use App\Support\DatabaseTransaction;

class OrderWorkflowController extends Controller
{
    public function partnerOrders(Request $request): JsonResponse
    {
        $partner = Partner::where('user_id', $request->user()->id)->where('type', 'pharmacy')->where('approval_status', 'approved')->where('subscription_status', 'active')->first();
        if (! $partner) {
            return response()->json(['message' => 'Partner profile not found.'], 404);
        }

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
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 50));
        $orders->getCollection()->transform(function ($record) use ($partner) {
            $record->customer_name = DB::table('users')->where('id', $record->patient_id)->value('name');
            $record->pharmacy_name = $partner->business_name;
            $record->driver_name = DB::table('deliveries')->join('drivers', 'drivers.id', '=', 'deliveries.driver_id')->join('users', 'users.id', '=', 'drivers.user_id')->where('deliveries.order_id', $record->id)->value('users.name');
            $record->medicine_names = DB::table('order_items')->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')->where('order_items.order_id', $record->id)->pluck('medicines.name_en')->implode(', ');
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
            'items' => ['nullable', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.accepted_quantity' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

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
                $lockedOrder->update(['status' => 'rejected']);
            } else {
                $requested = collect($data['items'] ?? [])->keyBy('id');
                foreach ($lockedOrder->items as $item) {
                    $accepted = $data['decision'] === 'accept'
                        ? $item->quantity
                        : min($item->quantity, (int) ($requested[$item->id]['accepted_quantity'] ?? 0));
                    $this->releaseReservation($lockedOrder, $item, $accepted);
                    $item->update(['accepted_quantity' => $accepted]);
                }
                $lockedOrder->update(['status' => $data['decision'] === 'accept' ? 'accepted' : 'partially_accepted']);
            }

            $deliveryId = null;
            if (in_array($lockedOrder->status, ['accepted', 'partially_accepted'], true)) {
                $pin = (string) random_int(100000, 999999);
                $deliveryId = DB::table('deliveries')->insertGetId([
                    'public_id' => (string) Str::ulid(),
                    'order_id' => $lockedOrder->id,
                    'status' => 'available',
                    'pin_hash' => Hash::make($pin),
                    'pin_encrypted' => Crypt::encryptString($pin),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
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
