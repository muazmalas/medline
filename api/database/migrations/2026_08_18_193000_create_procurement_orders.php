<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('procurement_orders', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 26)->unique();
            $table->foreignId('pharmacy_id')->constrained('partners')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('partners')->cascadeOnDelete();
            $table->string('status', 40)->default('pending_warehouse_review')->index();
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('delivery_fee', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->text('delivery_address_snapshot');
            $table->text('pharmacy_note')->nullable();
            $table->timestamps();
        });

        Schema::create('procurement_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('procurement_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('medicine_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('accepted_quantity')->default(0);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('line_total', 12, 2);
            $table->timestamps();
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->foreignId('procurement_order_id')->nullable()->after('order_id')->constrained()->nullOnDelete();
            $table->foreignId('order_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropForeign(['procurement_order_id']);
            $table->dropColumn('procurement_order_id');
        });
        Schema::dropIfExists('procurement_order_items');
        Schema::dropIfExists('procurement_orders');
    }
};
