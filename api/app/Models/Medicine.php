<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Medicine extends Model
{
    use HasFactory;

    protected $fillable = [
        'category_id', 'name_en', 'name_ar', 'manufacturer', 'active_ingredient', 'form', 'dosage',
        'pack_size', 'administration_route', 'code', 'image_path', 'description', 'indications',
        'directions', 'side_effects', 'warnings', 'contraindications', 'drug_interactions',
        'storage_instructions', 'prescription_required', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'prescription_required' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
