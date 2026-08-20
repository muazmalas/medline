<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id', 'medicine_id', 'prescription_required_snapshot', 'quantity', 'accepted_quantity',
        'unit_price', 'line_total',
    ];

    protected function casts(): array
    {
        return ['prescription_required_snapshot' => 'boolean', 'unit_price' => 'decimal:2', 'line_total' => 'decimal:2'];
    }
}
