<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('notification_type', 120);
            $table->string('channel', 24);
            $table->string('provider', 80)->nullable();
            $table->string('status', 24);
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->text('response_excerpt')->nullable();
            $table->timestamp('attempted_at');
            $table->timestamps();
            $table->index(['user_id', 'channel', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_delivery_attempts');
    }
};
