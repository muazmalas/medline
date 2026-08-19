<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('type', 24)->index();
            $table->string('business_name');
            $table->string('license_number')->nullable()->unique();
            $table->string('phone', 32)->nullable();
            $table->text('address')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('approval_status', 32)->default('pending')->index();
            $table->string('subscription_status', 32)->default('inactive')->index();
            $table->timestamps();
        });

        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('national_id')->nullable()->unique();
            $table->string('vehicle_type', 64)->nullable();
            $table->string('vehicle_plate', 32)->nullable();
            $table->string('approval_status', 32)->default('pending')->index();
            $table->boolean('is_available')->default(false)->index();
            $table->decimal('last_latitude', 10, 7)->nullable();
            $table->decimal('last_longitude', 10, 7)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });

        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label', 80);
            $table->text('address_line');
            $table->string('city', 100)->nullable();
            $table->string('district', 100)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('medicine_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name_en');
            $table->string('name_ar');
            $table->string('slug')->unique();
            $table->timestamps();
        });

        Schema::create('medicines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained('medicine_categories')->nullOnDelete();
            $table->string('name_en')->index();
            $table->string('name_ar')->index();
            $table->string('manufacturer')->nullable()->index();
            $table->string('form', 80)->nullable();
            $table->string('dosage', 80)->nullable();
            $table->string('code', 100)->nullable()->unique();
            $table->string('image_path')->nullable();
            $table->boolean('prescription_required')->default(false)->index();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->fullText(['name_en', 'name_ar', 'manufacturer']);
        });

        Schema::create('inventories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medicine_id')->constrained()->cascadeOnDelete();
            $table->string('owner_type', 24);
            $table->unsignedBigInteger('owner_id');
            $table->unsignedInteger('quantity')->default(0);
            $table->unsignedInteger('reserved_quantity')->default(0);
            $table->decimal('unit_price', 12, 2)->default(0);
            $table->unsignedInteger('low_stock_threshold')->default(5);
            $table->timestamps();
            $table->unique(['medicine_id', 'owner_type', 'owner_id']);
            $table->index(['owner_type', 'owner_id']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 26)->unique();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('pharmacy_id')->constrained('partners')->cascadeOnDelete();
            $table->foreignId('address_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 40)->default('pending_pharmacy_review')->index();
            $table->string('payment_method', 32)->default('cash_on_delivery');
            $table->string('payment_status', 32)->default('pending');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('delivery_fee', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->text('delivery_address_snapshot');
            $table->text('patient_note')->nullable();
            $table->timestamps();
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('medicine_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('accepted_quantity')->default(0);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('line_total', 12, 2);
            $table->timestamps();
        });

        Schema::create('prescriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->string('file_path');
            $table->string('status', 32)->default('pending_review')->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('review_note')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('deliveries', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 26)->unique();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
            $table->string('status', 32)->default('available')->index();
            $table->string('pin_hash')->nullable();
            $table->timestamp('pin_used_at')->nullable();
            $table->unsignedTinyInteger('pin_attempts')->default(0);
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->timestamps();
        });

        Schema::create('delivery_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 32)->nullable();
            $table->string('to_status', 32);
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medicine_id')->constrained()->restrictOnDelete();
            $table->string('owner_type', 24);
            $table->unsignedBigInteger('owner_id');
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 32);
            $table->integer('quantity_delta');
            $table->unsignedInteger('quantity_after');
            $table->string('reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['owner_type', 'owner_id']);
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_id')->constrained()->cascadeOnDelete();
            $table->string('status', 32)->default('pending_payment')->index();
            $table->decimal('amount', 12, 2)->default(0);
            $table->date('starts_at')->nullable();
            $table->date('ends_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('payment_proofs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_id')->constrained()->cascadeOnDelete();
            $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
            $table->string('file_path');
            $table->string('status', 32)->default('under_review')->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('review_note')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('complaints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('category', 64);
            $table->string('priority', 16)->default('normal');
            $table->string('status', 32)->default('open')->index();
            $table->string('subject');
            $table->text('description');
            $table->text('resolution')->nullable();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('score');
            $table->text('comment')->nullable();
            $table->timestamps();
            $table->unique(['order_id', 'created_by']);
        });

        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('key', 128);
            $table->string('request_hash', 64);
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->json('response_body')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'key']);
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 120);
            $table->string('auditable_type')->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
            $table->index(['auditable_type', 'auditable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('ratings');
        Schema::dropIfExists('complaints');
        Schema::dropIfExists('payment_proofs');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('delivery_events');
        Schema::dropIfExists('deliveries');
        Schema::dropIfExists('prescriptions');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('inventories');
        Schema::dropIfExists('medicines');
        Schema::dropIfExists('medicine_categories');
        Schema::dropIfExists('addresses');
        Schema::dropIfExists('drivers');
        Schema::dropIfExists('partners');
    }
};
