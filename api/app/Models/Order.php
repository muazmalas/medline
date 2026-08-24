<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'public_id', 'patient_id', 'pharmacy_id', 'address_id', 'status',
        'payment_method', 'payment_status', 'subtotal', 'tax_rate', 'tax_amount', 'delivery_fee', 'total',
        'delivery_pricing_rate_id', 'delivery_distance_km', 'delivery_rate_per_km', 'delivery_vehicle_type',
        'delivery_latitude', 'delivery_longitude', 'delivery_route_geometry', 'delivery_route_duration_seconds', 'delivery_route_provider',
        'delivery_address_snapshot', 'delivery_preference', 'scheduled_delivery_at', 'patient_note', 'partial_offer_note', 'partial_offered_at',
        'patient_decision_note', 'patient_decided_at',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'delivery_fee' => 'decimal:2',
            'delivery_distance_km' => 'decimal:2',
            'delivery_rate_per_km' => 'decimal:2',
            'delivery_latitude' => 'decimal:7',
            'delivery_longitude' => 'decimal:7',
            'delivery_route_geometry' => 'array',
            'delivery_route_duration_seconds' => 'integer',
            'total' => 'decimal:2',
            'scheduled_delivery_at' => 'datetime',
            'partial_offered_at' => 'datetime',
            'patient_decided_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
