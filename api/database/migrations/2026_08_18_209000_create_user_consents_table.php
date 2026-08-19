<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('consent_type', 64);
            $table->string('policy_version', 32);
            $table->timestamp('consented_at');
            $table->timestamp('revoked_at')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'consent_type', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_consents');
    }
};
