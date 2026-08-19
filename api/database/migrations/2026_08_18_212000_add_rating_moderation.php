<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ratings', function (Blueprint $table) {
            $table->timestamp('hidden_at')->nullable()->index();
            $table->foreignId('moderated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('moderation_reason', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ratings', function (Blueprint $table) {
            $table->dropForeign(['moderated_by']);
            $table->dropColumn(['hidden_at', 'moderated_by', 'moderation_reason']);
        });
    }
};
