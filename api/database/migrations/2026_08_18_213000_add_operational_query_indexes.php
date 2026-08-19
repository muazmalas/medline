<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->index(['patient_id', 'status'], 'orders_patient_status_index');
            $table->index(['pharmacy_id', 'status'], 'orders_pharmacy_status_index');
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->index(['status', 'claimed_at'], 'deliveries_status_claimed_index');
            $table->index(['driver_id', 'status'], 'deliveries_driver_status_index');
        });

        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->index(['warehouse_id', 'status'], 'procurement_warehouse_status_index');
            $table->index(['pharmacy_id', 'status'], 'procurement_pharmacy_status_index');
        });

        Schema::table('complaints', function (Blueprint $table) {
            $table->index(['status', 'created_at'], 'complaints_status_created_index');
            $table->index(['created_by', 'status'], 'complaints_creator_status_index');
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->index('created_at', 'audit_logs_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', fn (Blueprint $table) => $table->dropIndex('audit_logs_created_at_index'));
        Schema::table('complaints', function (Blueprint $table) {
            $table->dropIndex('complaints_status_created_index');
            $table->dropIndex('complaints_creator_status_index');
        });
        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->dropIndex('procurement_warehouse_status_index');
            $table->dropIndex('procurement_pharmacy_status_index');
        });
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropIndex('deliveries_status_claimed_index');
            $table->dropIndex('deliveries_driver_status_index');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_patient_status_index');
            $table->dropIndex('orders_pharmacy_status_index');
        });
    }
};
