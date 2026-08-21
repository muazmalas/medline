<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
        });

        $adminOwnedPartners = DB::table('partners')
            ->join('users', 'users.id', '=', 'partners.user_id')
            ->where('users.role', 'admin')
            ->select('partners.id', 'partners.type')
            ->get();

        foreach ($adminOwnedPartners as $partner) {
            $replacementUserId = DB::table('users')
                ->leftJoin('partners', 'partners.user_id', '=', 'users.id')
                ->where('users.role', $partner->type)
                ->whereNull('partners.id')
                ->orderBy('users.id')
                ->value('users.id');

            DB::table('partners')->where('id', $partner->id)->update([
                'user_id' => $replacementUserId,
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Partner ownership intentionally remains nullable. Re-attaching an organization
        // to an administrator during rollback would recreate the security boundary defect.
    }
};
