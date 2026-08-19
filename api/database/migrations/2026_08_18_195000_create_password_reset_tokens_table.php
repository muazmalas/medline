<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Laravel's base users migration already creates this table. Keep this
        // migration upgrade-safe for installations where that migration ran.
        if (Schema::hasTable('password_reset_tokens')) {
            return;
        }
        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token', 64);
            $table->timestamp('created_at')->nullable();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        // The table belongs to Laravel's base users migration and must not be
        // dropped when this compatibility migration is rolled back.
    }
};
