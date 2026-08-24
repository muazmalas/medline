<?php

namespace App\Services;

use App\Contracts\MapProvider;
use Illuminate\Support\Facades\DB;

class DeliveryPricingService
{
    public const VEHICLE_TYPES = ['bicycle', 'motorcycle', 'car', 'van'];

    public function __construct(private readonly MapProvider $maps)
    {
    }

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
        $route = $this->roadRoute($fromLatitude, $fromLongitude, $toLatitude, $toLongitude);

        return $this->priceRoute($route, $rate);
    }

    /** @return array{distance_km: float, duration_seconds: int, geometry: array<string, mixed>, provider: string} */
    public function roadRoute(float $fromLatitude, float $fromLongitude, float $toLatitude, float $toLongitude): array
    {
        $route = $this->maps->route($fromLatitude, $fromLongitude, $toLatitude, $toLongitude);

        return [
            'distance_km' => round((float) $route['distance_meters'] / 1000, 2),
            'duration_seconds' => max(0, (int) round((float) $route['duration_seconds'])),
            'geometry' => $route['geometry'],
            'provider' => (string) $route['provider'],
        ];
    }

    /** @param array{distance_km: float, duration_seconds: int, geometry: array<string, mixed>, provider: string} $route */
    public function priceRoute(array $route, ?object $rate = null): array
    {
        $rate ??= $this->current();
        $distanceKm = (float) $route['distance_km'];
        $ratePerKm = (float) $rate->rate_per_km;

        return [
            'pricing_rate_id' => $rate->id ? (int) $rate->id : null,
            'distance_km' => $distanceKm,
            'rate_per_km' => $ratePerKm,
            'fee' => (float) round($distanceKm * $ratePerKm),
            'route_geometry' => $route['geometry'],
            'route_duration_seconds' => $route['duration_seconds'],
            'route_provider' => $route['provider'],
        ];
    }
}
