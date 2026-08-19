<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_delivery_claims', function (Blueprint $table) {
            $table->id();
            $table->uuid('notification_id');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('channel', 24);
            $table->string('target_key', 128);
            $table->string('status', 24);
            $table->timestamps();
            $table->unique(['notification_id', 'channel', 'target_key'], 'notification_delivery_claim_unique');
            $table->index(['status', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_delivery_claims');
    }
};
