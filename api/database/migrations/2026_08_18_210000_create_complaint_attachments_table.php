<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaint_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->string('file_path');
            $table->string('original_name', 255);
            $table->string('mime_type', 120);
            $table->unsignedInteger('file_size');
            $table->timestamps();
            $table->index(['complaint_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_attachments');
    }
};
