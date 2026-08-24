<?php

namespace App\Services;

use App\Contracts\MapProvider;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

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
        $cacheKey = 'medline:road-route:'.hash('sha256', implode('|', [
            number_format($fromLatitude, 6, '.', ''),
            number_format($fromLongitude, 6, '.', ''),
            number_format($toLatitude, 6, '.', ''),
            number_format($toLongitude, 6, '.', ''),
        ]));

        return Cache::remember($cacheKey, (int) config('maps.routing_cache_seconds', 86400), function () use ($fromLatitude, $fromLongitude, $toLatitude, $toLongitude) {
            $coordinates = $fromLongitude.','.$fromLatitude.';'.$toLongitude.','.$toLatitude;
            try {
                $response = Http::acceptJson()
                    ->timeout((int) config('maps.routing_timeout_seconds', 12))
                    ->withHeaders(['User-Agent' => config('maps.user_agent')])
                    ->get(rtrim(config('maps.routing_url'), '/').'/route/v1/driving/'.$coordinates, [
                        'alternatives' => 'false',
                        'overview' => 'full',
                        'geometries' => 'geojson',
                        'steps' => 'false',
                    ]);
            } catch (Throwable $exception) {
                throw new RuntimeException('ROAD_ROUTE_UNAVAILABLE', 0, $exception);
            }

            $route = $response->json('routes.0');
            $geometry = is_array($route) ? ($route['geometry'] ?? null) : null;
            $geometryCoordinates = is_array($geometry) ? ($geometry['coordinates'] ?? null) : null;
            if ($response->failed() || $response->json('code') !== 'Ok' || ! is_array($route) || ! is_array($geometryCoordinates) || count($geometryCoordinates) < 2) {
                throw new RuntimeException('ROAD_ROUTE_UNAVAILABLE');
            }

            return [
                'distance_meters' => (float) $route['distance'],
                'duration_seconds' => (int) round((float) $route['duration']),
                'geometry' => [
                    'type' => 'LineString',
                    'coordinates' => array_values($geometryCoordinates),
                ],
                'provider' => 'osrm',
            ];
        });
    }
}
