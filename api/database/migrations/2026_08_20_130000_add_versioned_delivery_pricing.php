<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_pricing_rates', function (Blueprint $table) {
            $table->id();
            $table->decimal('rate_per_km', 12, 2);
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason');
            $table->timestamp('effective_at')->index();
            $table->timestamps();
        });

        $now = now();
        DB::table('delivery_pricing_rates')->insert([
            'rate_per_km' => (float) config('medline.delivery_fee_per_km', 100),
            'changed_by' => null,
            'reason' => 'Initial system delivery rate',
            'effective_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('delivery_pricing_rate_id')->nullable()->after('delivery_fee')->constrained('delivery_pricing_rates')->nullOnDelete();
            $table->decimal('delivery_distance_km', 10, 2)->nullable()->after('delivery_pricing_rate_id');
            $table->decimal('delivery_rate_per_km', 12, 2)->nullable()->after('delivery_distance_km');
            $table->decimal('delivery_latitude', 10, 7)->nullable()->after('delivery_rate_per_km');
            $table->decimal('delivery_longitude', 10, 7)->nullable()->after('delivery_latitude');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('delivery_pricing_rate_id');
            $table->dropColumn(['delivery_distance_km', 'delivery_rate_per_km', 'delivery_latitude', 'delivery_longitude']);
        });
        Schema::dropIfExists('delivery_pricing_rates');
    }
};
