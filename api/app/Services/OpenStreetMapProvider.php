<?php

namespace App\Services;

use App\Contracts\MapProvider;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenStreetMapProvider implements MapProvider
{
    public function geocode(string $address): array
    {
        $response = Http::timeout(8)->withHeaders(['User-Agent' => config('maps.user_agent')])->get(rtrim(config('maps.geocoding_url'), '/') . '/search', ['q' => $address, 'format' => 'jsonv2', 'limit' => 1]);
        if ($response->failed()) throw new RuntimeException('Map geocoding provider unavailable.');
        $result = $response->json()[0] ?? null;
        if (! $result) throw new RuntimeException('Address could not be geocoded.');
        return ['latitude' => (float) $result['lat'], 'longitude' => (float) $result['lon'], 'display_name' => $result['display_name'] ?? $address];
    }

    public function route(float $fromLatitude, float $fromLongitude, float $toLatitude, float $toLongitude): array
    {
        $coordinates = $fromLongitude . ',' . $fromLatitude . ';' . $toLongitude . ',' . $toLatitude;
        $response = Http::timeout(8)->get(rtrim(config('maps.routing_url'), '/') . '/route/v1/driving/' . $coordinates, ['overview' => 'false', 'steps' => 'false']);
        if ($response->failed() || ! data_get($response->json(), 'routes.0')) throw new RuntimeException('Map routing provider unavailable.');
        $route = $response->json('routes.0');
        return ['distance_meters' => (float) $route['distance'], 'duration_seconds' => (float) $route['duration'], 'provider' => 'openstreetmap'];
    }
}
