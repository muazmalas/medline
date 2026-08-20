<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medicines', function (Blueprint $table) {
            $table->string('active_ingredient')->nullable()->after('manufacturer');
            $table->string('pack_size', 100)->nullable()->after('dosage');
            $table->string('administration_route', 80)->nullable()->after('pack_size');
            $table->text('description')->nullable()->after('image_path');
            $table->text('indications')->nullable()->after('description');
            $table->text('directions')->nullable()->after('indications');
            $table->text('side_effects')->nullable()->after('directions');
            $table->text('warnings')->nullable()->after('side_effects');
            $table->text('contraindications')->nullable()->after('warnings');
            $table->text('drug_interactions')->nullable()->after('contraindications');
            $table->text('storage_instructions')->nullable()->after('drug_interactions');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->boolean('prescription_required_snapshot')->default(false)->after('medicine_id');
        });

        Schema::table('prescriptions', function (Blueprint $table) {
            $table->foreignId('order_item_id')->nullable()->after('order_id')->constrained('order_items')->cascadeOnDelete();
            $table->index(['order_id', 'order_item_id', 'status']);
        });

        // Preserve legacy one-medicine prescriptions by attaching them to their only order line.
        foreach (DB::table('prescriptions')->whereNull('order_item_id')->pluck('order_id', 'id') as $prescriptionId => $orderId) {
            $itemIds = DB::table('order_items')->where('order_id', $orderId)->limit(2)->pluck('id');
            if ($itemIds->count() === 1) {
                DB::table('prescriptions')->where('id', $prescriptionId)->update(['order_item_id' => $itemIds->first()]);
            }
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->text('partial_offer_note')->nullable()->after('patient_note');
            $table->timestamp('partial_offered_at')->nullable()->after('partial_offer_note');
            $table->text('patient_decision_note')->nullable()->after('partial_offered_at');
            $table->timestamp('patient_decided_at')->nullable()->after('patient_decision_note');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['partial_offer_note', 'partial_offered_at', 'patient_decision_note', 'patient_decided_at']);
        });
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->dropIndex(['order_id', 'order_item_id', 'status']);
            $table->dropConstrainedForeignId('order_item_id');
        });
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('prescription_required_snapshot'));
        Schema::table('medicines', function (Blueprint $table) {
            $table->dropColumn(['active_ingredient', 'pack_size', 'administration_route', 'description', 'indications', 'directions', 'side_effects', 'warnings', 'contraindications', 'drug_interactions', 'storage_instructions']);
        });
    }
};
