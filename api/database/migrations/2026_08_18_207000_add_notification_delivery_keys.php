<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_delivery_attempts', function (Blueprint $table) {
            $table->uuid('notification_id')->nullable()->after('id');
            $table->string('target_key', 128)->nullable()->after('channel');
            $table->index(['notification_id', 'channel', 'target_key', 'status'], 'notification_delivery_idempotency_index');
        });
    }

    public function down(): void
    {
        Schema::table('notification_delivery_attempts', function (Blueprint $table) {
            $table->dropIndex('notification_delivery_idempotency_index');
            $table->dropColumn(['notification_id', 'target_key']);
        });
    }
};
