<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_verification_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token', 64);
            $table->timestamp('created_at')->nullable();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_verification_tokens');
    }
};
