<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->json('delivery_route_geometry')->nullable()->after('delivery_longitude');
            $table->unsignedInteger('delivery_route_duration_seconds')->nullable()->after('delivery_route_geometry');
            $table->string('delivery_route_provider', 40)->nullable()->after('delivery_route_duration_seconds');
        });

        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->json('delivery_route_geometry')->nullable()->after('delivery_vehicle_type');
            $table->unsignedInteger('delivery_route_duration_seconds')->nullable()->after('delivery_route_geometry');
            $table->string('delivery_route_provider', 40)->nullable()->after('delivery_route_duration_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_route_geometry', 'delivery_route_duration_seconds', 'delivery_route_provider']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_route_geometry', 'delivery_route_duration_seconds', 'delivery_route_provider']);
        });
    }
};
