<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->string('plan_code', 64)->nullable()->after('partner_id')->index();
            $table->unsignedSmallInteger('duration_months')->default(12)->after('amount');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn(['plan_code', 'duration_months']);
        });
    }
};
