<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ProcurementBatchService
{
    public function reserveFefo(int $itemId, int $warehouseId, int $medicineId, int $quantity): float
    {
        $batches = DB::table('inventories')
            ->where('owner_type', 'warehouse')
            ->where('owner_id', $warehouseId)
            ->where('medicine_id', $medicineId)
            ->where('is_active', true)
            ->where(fn ($query) => $query->whereNull('expires_at')->orWhereDate('expires_at', '>', today()))
            ->whereRaw('quantity > reserved_quantity')
            ->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('expires_at')
            ->orderBy('received_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $remaining = $quantity;
        $total = 0.0;
        foreach ($batches as $batch) {
            if ($remaining <= 0) break;
            $available = (int) $batch->quantity - (int) $batch->reserved_quantity;
            $allocated = min($remaining, $available);
            if ($allocated <= 0) continue;
            $this->createReservation($itemId, $batch, $allocated);
            $total += $allocated * (float) $batch->unit_price;
            $remaining -= $allocated;
        }

        abort_if($remaining > 0, 422, 'Requested warehouse stock is unavailable across the active batches.');
        return $total;
    }

    public function replaceReservations(int $itemId, int $warehouseId, int $medicineId, array $requestedAllocations, int $acceptedQuantity): float
    {
        $this->releaseReservations($itemId);
        if ($acceptedQuantity === 0) return 0.0;

        $allocations = collect($requestedAllocations)
            ->map(fn ($allocation) => [
                'inventory_id' => (int) ($allocation['inventory_id'] ?? 0),
                'quantity' => (int) ($allocation['quantity'] ?? 0),
            ])
            ->filter(fn ($allocation) => $allocation['quantity'] > 0);

        abort_if($allocations->pluck('inventory_id')->duplicates()->isNotEmpty(), 422, 'Each warehouse batch can be selected only once per medicine.');
        abort_unless($allocations->sum('quantity') === $acceptedQuantity, 422, 'Selected batch quantities must equal the quantity to fulfill.');

        $total = 0.0;
        foreach ($allocations as $allocation) {
            $batch = DB::table('inventories')
                ->where('id', $allocation['inventory_id'])
                ->where('owner_type', 'warehouse')
                ->where('owner_id', $warehouseId)
                ->where('medicine_id', $medicineId)
                ->where('is_active', true)
                ->where(fn ($query) => $query->whereNull('expires_at')->orWhereDate('expires_at', '>', today()))
                ->lockForUpdate()
                ->first();
            abort_unless($batch, 422, 'A selected warehouse batch is unavailable or no longer eligible for sale.');
            $available = (int) $batch->quantity - (int) $batch->reserved_quantity;
            abort_if($allocation['quantity'] > $available, 422, 'A selected warehouse batch does not have enough available stock.');
            $this->createReservation($itemId, $batch, $allocation['quantity']);
            $total += $allocation['quantity'] * (float) $batch->unit_price;
        }

        return $total;
    }

    public function releaseReservations(int $itemId): void
    {
        $allocations = DB::table('procurement_item_batch_allocations')
            ->where('procurement_order_item_id', $itemId)
            ->where('status', 'reserved')
            ->lockForUpdate()
            ->get();

        // Procurement records created before batch allocation tracking still
        // hold inventory reservations directly. Release those reservations so
        // an old request can be reviewed or rejected without double-reserving.
        if ($allocations->isEmpty() && ! $this->hasAllocationHistory($itemId)) {
            $this->releaseLegacyReservation($itemId);
            return;
        }

        foreach ($allocations as $allocation) {
            $batch = DB::table('inventories')->where('id', $allocation->inventory_id)->lockForUpdate()->first();
            if ($batch) {
                DB::table('inventories')->where('id', $batch->id)->update([
                    'reserved_quantity' => max(0, (int) $batch->reserved_quantity - (int) $allocation->quantity),
                    'updated_at' => now(),
                ]);
            }
            DB::table('procurement_item_batch_allocations')->where('id', $allocation->id)->update([
                'status' => 'released',
                'released_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function batchOptions(int $itemId, int $warehouseId, int $medicineId): Collection
    {
        $reserved = DB::table('procurement_item_batch_allocations')
            ->select('inventory_id', DB::raw('SUM(quantity) as allocated_quantity'))
            ->where('procurement_order_item_id', $itemId)
            ->where('status', 'reserved')
            ->groupBy('inventory_id');

        return DB::table('inventories')
            ->leftJoinSub($reserved, 'current_allocation', fn ($join) => $join->on('current_allocation.inventory_id', '=', 'inventories.id'))
            ->where('inventories.owner_type', 'warehouse')
            ->where('inventories.owner_id', $warehouseId)
            ->where('inventories.medicine_id', $medicineId)
            ->where('inventories.is_active', true)
            ->where(fn ($query) => $query->whereNull('inventories.expires_at')->orWhereDate('inventories.expires_at', '>', today()))
            ->select('inventories.id', 'inventories.batch_number', 'inventories.manufactured_at', 'inventories.expires_at', 'inventories.received_at', 'inventories.storage_location', 'inventories.quantity', 'inventories.reserved_quantity', 'inventories.unit_price', DB::raw('COALESCE(current_allocation.allocated_quantity, 0) as allocated_quantity'), DB::raw('(inventories.quantity - inventories.reserved_quantity + COALESCE(current_allocation.allocated_quantity, 0)) as allocatable_quantity'))
            ->orderByRaw('CASE WHEN inventories.expires_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('inventories.expires_at')
            ->orderBy('inventories.received_at')
            ->orderBy('inventories.id')
            ->get();
    }

    public function consumeReservations(int $itemId): Collection
    {
        $allocations = DB::table('procurement_item_batch_allocations')
            ->where('procurement_order_item_id', $itemId)
            ->where('status', 'reserved')
            ->lockForUpdate()
            ->get();
        if ($allocations->isEmpty() && ! $this->hasAllocationHistory($itemId)) {
            return $this->consumeLegacyReservation($itemId);
        }
        abort_if($allocations->isEmpty(), 409, 'No warehouse batch allocation is reserved for this procurement item.');

        return $allocations->map(function ($allocation) {
            $batch = DB::table('inventories')->where('id', $allocation->inventory_id)->lockForUpdate()->firstOrFail();
            $quantity = (int) $allocation->quantity;
            abort_unless((int) $batch->quantity >= $quantity && (int) $batch->reserved_quantity >= $quantity, 409, 'Reserved warehouse batch stock is no longer consistent.');
            $after = (int) $batch->quantity - $quantity;
            DB::table('inventories')->where('id', $batch->id)->update([
                'quantity' => $after,
                'reserved_quantity' => (int) $batch->reserved_quantity - $quantity,
                'updated_at' => now(),
            ]);
            DB::table('procurement_item_batch_allocations')->where('id', $allocation->id)->update([
                'status' => 'consumed',
                'consumed_at' => now(),
                'updated_at' => now(),
            ]);
            return (object) [
                'inventory_id' => (int) $batch->id,
                'batch_number' => $batch->batch_number,
                'quantity' => $quantity,
                'quantity_after' => $after,
            ];
        });
    }

    private function createReservation(int $itemId, object $batch, int $quantity): void
    {
        DB::table('procurement_item_batch_allocations')->insert([
            'procurement_order_item_id' => $itemId,
            'inventory_id' => $batch->id,
            'quantity' => $quantity,
            'status' => 'reserved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('inventories')->where('id', $batch->id)->update([
            'reserved_quantity' => (int) $batch->reserved_quantity + $quantity,
            'updated_at' => now(),
        ]);
    }

    private function hasAllocationHistory(int $itemId): bool
    {
        return DB::table('procurement_item_batch_allocations')
            ->where('procurement_order_item_id', $itemId)
            ->exists();
    }

    private function legacyContext(int $itemId): object
    {
        return DB::table('procurement_order_items as items')
            ->join('procurement_orders as orders', 'orders.id', '=', 'items.procurement_order_id')
            ->where('items.id', $itemId)
            ->select('items.id', 'items.medicine_id', 'items.quantity', 'items.accepted_quantity', 'orders.warehouse_id')
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function legacyReservedBatches(object $context): Collection
    {
        return DB::table('inventories')
            ->where('owner_type', 'warehouse')
            ->where('owner_id', $context->warehouse_id)
            ->where('medicine_id', $context->medicine_id)
            ->where('reserved_quantity', '>', 0)
            ->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('expires_at')
            ->orderBy('received_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();
    }

    private function releaseLegacyReservation(int $itemId): void
    {
        $context = $this->legacyContext($itemId);
        $remaining = (int) ($context->accepted_quantity ?: $context->quantity);

        foreach ($this->legacyReservedBatches($context) as $batch) {
            if ($remaining <= 0) break;
            $released = min($remaining, (int) $batch->reserved_quantity);
            DB::table('inventories')->where('id', $batch->id)->update([
                'reserved_quantity' => (int) $batch->reserved_quantity - $released,
                'updated_at' => now(),
            ]);
            $remaining -= $released;
        }

        abort_if($remaining > 0, 409, 'Legacy warehouse reservation is no longer consistent.');
    }

    private function consumeLegacyReservation(int $itemId): Collection
    {
        $context = $this->legacyContext($itemId);
        $remaining = (int) $context->accepted_quantity;
        abort_if($remaining <= 0, 409, 'This procurement item has no accepted stock to consume.');
        $consumed = collect();

        foreach ($this->legacyReservedBatches($context) as $batch) {
            if ($remaining <= 0) break;
            $quantity = min($remaining, (int) $batch->reserved_quantity, (int) $batch->quantity);
            if ($quantity <= 0) continue;
            $after = (int) $batch->quantity - $quantity;
            DB::table('inventories')->where('id', $batch->id)->update([
                'quantity' => $after,
                'reserved_quantity' => (int) $batch->reserved_quantity - $quantity,
                'updated_at' => now(),
            ]);
            DB::table('procurement_item_batch_allocations')->insert([
                'procurement_order_item_id' => $itemId,
                'inventory_id' => $batch->id,
                'quantity' => $quantity,
                'status' => 'consumed',
                'consumed_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $consumed->push((object) [
                'inventory_id' => (int) $batch->id,
                'batch_number' => $batch->batch_number,
                'quantity' => $quantity,
                'quantity_after' => $after,
            ]);
            $remaining -= $quantity;
        }

        abort_if($remaining > 0, 409, 'Legacy warehouse reservation is no longer consistent.');
        return $consumed;
    }
}
