<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->foreignId('delivery_pricing_rate_id')->nullable()->after('delivery_fee')->constrained('delivery_pricing_rates')->nullOnDelete();
            $table->decimal('delivery_distance_km', 10, 2)->nullable()->after('delivery_pricing_rate_id');
            $table->decimal('delivery_rate_per_km', 12, 2)->nullable()->after('delivery_distance_km');
        });
    }

    public function down(): void
    {
        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('delivery_pricing_rate_id');
            $table->dropColumn(['delivery_distance_km', 'delivery_rate_per_km']);
        });
    }
};
