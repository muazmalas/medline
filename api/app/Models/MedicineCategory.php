<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class MedicineCategory extends Model
{
    protected $table = 'medicine_categories';

    protected $fillable = ['name_en', 'name_ar', 'slug'];

    public function medicines(): HasMany
    {
        return $this->hasMany(Medicine::class, 'category_id');
    }
}
