<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partner_working_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('day_of_week');
            $table->time('opens_at');
            $table->time('closes_at');
            $table->timestamps();
            $table->index(['partner_id', 'day_of_week']);
            $table->unique(['partner_id', 'day_of_week', 'opens_at', 'closes_at'], 'partner_hours_unique_shift');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_working_hours');
    }
};
