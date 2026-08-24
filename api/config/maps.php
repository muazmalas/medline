<?php

return [
    'provider' => env('MEDLINE_MAP_PROVIDER', 'openstreetmap'),
    'user_agent' => env('MEDLINE_MAP_USER_AGENT', 'MedLine/1.0 contact@example.com'),
    'geocoding_url' => env('MEDLINE_MAP_GEOCODING_URL', 'https://nominatim.openstreetmap.org'),
    'routing_url' => env('MEDLINE_MAP_ROUTING_URL', 'https://router.project-osrm.org'),
    'routing_required' => filter_var(env('MEDLINE_MAP_ROUTING_REQUIRED', true), FILTER_VALIDATE_BOOL),
    'routing_timeout_seconds' => max(3, (int) env('MEDLINE_MAP_ROUTING_TIMEOUT_SECONDS', 12)),
    'routing_cache_seconds' => max(60, (int) env('MEDLINE_MAP_ROUTING_CACHE_SECONDS', 86400)),
];
