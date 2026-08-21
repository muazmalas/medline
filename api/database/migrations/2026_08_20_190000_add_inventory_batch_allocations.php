<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->index(['medicine_id', 'owner_type', 'owner_id'], 'inventories_medicine_owner_index');
        });
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropUnique(['medicine_id', 'owner_type', 'owner_id']);
        });

        Schema::create('procurement_item_batch_allocations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('procurement_order_item_id');
            $table->unsignedBigInteger('inventory_id');
            $table->unsignedInteger('quantity');
            $table->string('status', 24)->default('reserved')->index();
            $table->timestamp('released_at')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
            $table->index(['procurement_order_item_id', 'status'], 'procurement_batch_item_status_index');
            $table->index(['inventory_id', 'status'], 'procurement_batch_inventory_status_index');
            $table->foreign('procurement_order_item_id', 'procurement_batch_item_fk')->references('id')->on('procurement_order_items')->cascadeOnDelete();
            $table->foreign('inventory_id', 'procurement_batch_inventory_fk')->references('id')->on('inventories')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('procurement_item_batch_allocations');

        $duplicates = DB::table('inventories')
            ->select('medicine_id', 'owner_type', 'owner_id')
            ->groupBy('medicine_id', 'owner_type', 'owner_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $duplicate) {
            $rows = DB::table('inventories')
                ->where('medicine_id', $duplicate->medicine_id)
                ->where('owner_type', $duplicate->owner_type)
                ->where('owner_id', $duplicate->owner_id)
                ->orderBy('id')
                ->get();
            $keeper = $rows->first();
            DB::table('inventories')->where('id', $keeper->id)->update([
                'quantity' => $rows->sum('quantity'),
                'reserved_quantity' => $rows->sum('reserved_quantity'),
                'updated_at' => now(),
            ]);
            DB::table('inventories')->whereIn('id', $rows->skip(1)->pluck('id'))->delete();
        }

        Schema::table('inventories', function (Blueprint $table) {
            $table->unique(['medicine_id', 'owner_type', 'owner_id']);
        });
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropIndex('inventories_medicine_owner_index');
        });
    }
};
