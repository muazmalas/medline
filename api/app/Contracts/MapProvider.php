<?php

namespace App\Contracts;

interface MapProvider
{
    /** @return array<string, mixed> */
    public function geocode(string $address): array;

    /** @return array<string, mixed> */
    public function route(float $fromLatitude, float $fromLongitude, float $toLatitude, float $toLongitude): array;
}
