<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('delivery_preference', 20)->default('asap')->after('delivery_address_snapshot');
            $table->timestamp('scheduled_delivery_at')->nullable()->after('delivery_preference')->index();
        });

        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->string('delivery_preference', 20)->default('asap')->after('delivery_address_snapshot');
            $table->timestamp('scheduled_delivery_at')->nullable()->after('delivery_preference')->index();
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->timestamp('scheduled_for')->nullable()->after('status')->index();
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropIndex(['scheduled_for']);
            $table->dropColumn('scheduled_for');
        });

        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->dropIndex(['scheduled_delivery_at']);
            $table->dropColumn(['delivery_preference', 'scheduled_delivery_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['scheduled_delivery_at']);
            $table->dropColumn(['delivery_preference', 'scheduled_delivery_at']);
        });
    }
};
