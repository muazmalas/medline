<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->decimal('last_latitude', 10, 7)->nullable()->after('completed_at');
            $table->decimal('last_longitude', 10, 7)->nullable()->after('last_latitude');
            $table->decimal('location_accuracy_meters', 8, 2)->nullable()->after('last_longitude');
            $table->timestamp('location_updated_at')->nullable()->after('location_accuracy_meters');
            $table->index(['status', 'location_updated_at'], 'deliveries_location_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropIndex('deliveries_location_status_index');
            $table->dropColumn(['last_latitude', 'last_longitude', 'location_accuracy_meters', 'location_updated_at']);
        });
    }
};
