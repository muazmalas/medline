<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MedicineCategory extends Model
{
    protected $table = 'medicine_categories';

    protected $fillable = ['name_en', 'name_ar', 'slug'];
}
