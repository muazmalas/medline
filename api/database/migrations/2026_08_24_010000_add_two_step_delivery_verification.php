<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->string('pickup_code_hash')->nullable()->after('pin_locked_at');
            $table->timestamp('pickup_code_sent_at')->nullable()->after('pickup_code_hash');
            $table->timestamp('pickup_code_expires_at')->nullable()->after('pickup_code_sent_at');
            $table->timestamp('pickup_code_verified_at')->nullable()->after('pickup_code_expires_at');
            $table->unsignedTinyInteger('pickup_code_attempts')->default(0)->after('pickup_code_verified_at');
            $table->timestamp('pickup_code_locked_at')->nullable()->after('pickup_code_attempts');

            $table->string('recipient_code_hash')->nullable()->after('pickup_code_locked_at');
            $table->timestamp('recipient_code_sent_at')->nullable()->after('recipient_code_hash');
            $table->timestamp('recipient_code_expires_at')->nullable()->after('recipient_code_sent_at');
            $table->timestamp('recipient_code_verified_at')->nullable()->after('recipient_code_expires_at');
            $table->unsignedTinyInteger('recipient_code_attempts')->default(0)->after('recipient_code_verified_at');
            $table->timestamp('recipient_code_locked_at')->nullable()->after('recipient_code_attempts');
        });

        DB::table('deliveries')
            ->whereIn('status', ['picked_up', 'in_transit', 'arrived', 'delivered'])
            ->update(['pickup_code_verified_at' => DB::raw('COALESCE(claimed_at, updated_at)')]);
        DB::table('deliveries')
            ->where('status', 'delivered')
            ->update(['recipient_code_verified_at' => DB::raw('COALESCE(completed_at, updated_at)')]);
        DB::table('deliveries')->update([
            'pin_hash' => null,
            'pin_encrypted' => null,
            'pin_attempts' => 0,
            'pin_locked_at' => null,
        ]);
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn([
                'pickup_code_hash',
                'pickup_code_sent_at',
                'pickup_code_expires_at',
                'pickup_code_verified_at',
                'pickup_code_attempts',
                'pickup_code_locked_at',
                'recipient_code_hash',
                'recipient_code_sent_at',
                'recipient_code_expires_at',
                'recipient_code_verified_at',
                'recipient_code_attempts',
                'recipient_code_locked_at',
            ]);
        });
    }
};
