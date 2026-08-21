<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('delivery_pricing_rates', function (Blueprint $table) {
            $table->string('vehicle_type', 32)->default('motorcycle')->after('id')->index();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('delivery_vehicle_type', 32)->default('motorcycle')->after('delivery_rate_per_km')->index();
        });

        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->string('delivery_vehicle_type', 32)->default('motorcycle')->after('delivery_rate_per_km')->index();
        });

        $now = now();
        $defaults = [
            'bicycle' => (float) config('medline.delivery_rates.bicycle', 60),
            'car' => (float) config('medline.delivery_rates.car', 140),
            'van' => (float) config('medline.delivery_rates.van', 180),
        ];
        foreach ($defaults as $vehicleType => $rate) {
            DB::table('delivery_pricing_rates')->insert([
                'vehicle_type' => $vehicleType,
                'rate_per_km' => $rate,
                'changed_by' => null,
                'reason' => 'Initial system '.$vehicleType.' delivery rate',
                'effective_at' => $now->copy()->subSecond(),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->dropIndex(['delivery_vehicle_type']);
            $table->dropColumn('delivery_vehicle_type');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['delivery_vehicle_type']);
            $table->dropColumn('delivery_vehicle_type');
        });
        Schema::table('delivery_pricing_rates', function (Blueprint $table) {
            $table->dropIndex(['vehicle_type']);
            $table->dropColumn('vehicle_type');
        });
    }
};
