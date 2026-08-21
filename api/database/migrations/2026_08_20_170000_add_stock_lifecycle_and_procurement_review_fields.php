<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->index();
            $table->string('batch_number', 100)->nullable();
            $table->date('manufactured_at')->nullable();
            $table->date('expires_at')->nullable()->index();
            $table->date('received_at')->nullable();
            $table->string('storage_location', 150)->nullable();
        });

        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->text('warehouse_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('procurement_orders', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by']);
            $table->dropColumn(['warehouse_note', 'reviewed_by', 'reviewed_at']);
        });

        Schema::table('inventories', function (Blueprint $table) {
            $table->dropIndex(['is_active']);
            $table->dropIndex(['expires_at']);
            $table->dropColumn(['is_active', 'batch_number', 'manufactured_at', 'expires_at', 'received_at', 'storage_location']);
        });
    }
};
