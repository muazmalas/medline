<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $deliveryStateMap = [
            'ready_for_delivery' => 'available',
            'driver_claimed' => 'claimed',
            'in_delivery' => 'in_transit',
            'completed' => 'delivered',
        ];

        foreach ($deliveryStateMap as $legacy => $current) {
            DB::table('deliveries')->where('status', $legacy)->update(['status' => $current, 'updated_at' => now()]);
            DB::table('delivery_events')->where('from_status', $legacy)->update(['from_status' => $current, 'updated_at' => now()]);
            DB::table('delivery_events')->where('to_status', $legacy)->update(['to_status' => $current, 'updated_at' => now()]);
        }

        $this->normalizeRequestStates('orders', 'order_items', 'order_id');
        $this->normalizeRequestStates('procurement_orders', 'procurement_order_items', 'procurement_order_id');
    }

    private function normalizeRequestStates(string $table, string $itemsTable, string $foreignKey): void
    {
        DB::table($table)
            ->whereIn('status', ['ready_for_delivery', 'in_delivery', 'in_transit', 'driver_claimed'])
            ->orderBy('id')
            ->get(['id'])
            ->each(function (object $record) use ($table, $itemsTable, $foreignKey): void {
                $deliveryStatus = DB::table('deliveries')
                    ->where($table === 'orders' ? 'order_id' : 'procurement_order_id', $record->id)
                    ->value('status');
                $partial = DB::table($itemsTable)
                    ->where($foreignKey, $record->id)
                    ->where('accepted_quantity', '>', 0)
                    ->whereColumn('accepted_quantity', '<', 'quantity')
                    ->exists();

                DB::table($table)->where('id', $record->id)->update([
                    'status' => $deliveryStatus === 'delivered' ? 'completed' : ($partial ? 'partially_accepted' : 'accepted'),
                    'updated_at' => now(),
                ]);
            });
    }

    public function down(): void
    {
        // Obsolete workflow states are intentionally not restored.
    }
};
