<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class DeliveryPricingService
{
    public const VEHICLE_TYPES = ['bicycle', 'motorcycle', 'car', 'van'];

    public function normalizeVehicleType(?string $vehicleType): string
    {
        $normalized = strtolower(trim((string) $vehicleType));
        $aliases = [
            'bike' => 'bicycle',
            'motorbike' => 'motorcycle',
            'motor cycle' => 'motorcycle',
            'vehicle' => 'car',
            'automobile' => 'car',
        ];
        $normalized = $aliases[$normalized] ?? $normalized;

        return in_array($normalized, self::VEHICLE_TYPES, true) ? $normalized : 'motorcycle';
    }

    public function vehicleTypes(): array
    {
        return self::VEHICLE_TYPES;
    }

    public function current(string|bool|null $vehicleType = 'motorcycle', bool $lockForUpdate = false): object
    {
        // Preserve the original current(true) call contract while callers migrate.
        if (is_bool($vehicleType)) {
            $lockForUpdate = $vehicleType;
            $vehicleType = 'motorcycle';
        }
        $vehicleType = $this->normalizeVehicleType($vehicleType);
        $query = DB::table('delivery_pricing_rates')
            ->where('vehicle_type', $vehicleType)
            ->orderByDesc('effective_at')
            ->orderByDesc('id');
        if ($lockForUpdate) {
            $query->lockForUpdate();
        }
        $rate = $query->first();

        if ($rate) {
            return $rate;
        }

        return (object) [
            'id' => null,
            'vehicle_type' => $vehicleType,
            'rate_per_km' => (float) config('medline.delivery_rates.'.$vehicleType, config('medline.delivery_fee_per_km', 100)),
            'changed_by' => null,
            'reason' => 'System default delivery rate',
            'effective_at' => null,
            'created_at' => null,
            'updated_at' => null,
        ];
    }

    public function allCurrent(): array
    {
        return collect($this->vehicleTypes())
            ->map(fn (string $vehicleType) => $this->current($vehicleType))
            ->all();
    }

    public function estimate(float $fromLatitude, float $fromLongitude, float $toLatitude, float $toLongitude, ?object $rate = null): array
    {
        $rate ??= $this->current();
        $latitudeDelta = deg2rad($toLatitude - $fromLatitude);
        $longitudeDelta = deg2rad($toLongitude - $fromLongitude);
        $haversine = sin($latitudeDelta / 2) ** 2
            + cos(deg2rad($fromLatitude)) * cos(deg2rad($toLatitude)) * sin($longitudeDelta / 2) ** 2;
        $boundedHaversine = min(1, max(0, $haversine));
        $distanceKm = round(6371 * 2 * atan2(sqrt($boundedHaversine), sqrt(1 - $boundedHaversine)), 2);
        $ratePerKm = (float) $rate->rate_per_km;

        return [
            'pricing_rate_id' => $rate->id ? (int) $rate->id : null,
            'distance_km' => $distanceKm,
            'rate_per_km' => $ratePerKm,
            'fee' => (float) round($distanceKm * $ratePerKm),
        ];
    }
}
