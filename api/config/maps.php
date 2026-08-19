<?php

return [
    'provider' => env('MEDLINE_MAP_PROVIDER', 'openstreetmap'),
    'user_agent' => env('MEDLINE_MAP_USER_AGENT', 'MedLine/1.0 contact@example.com'),
    'geocoding_url' => env('MEDLINE_MAP_GEOCODING_URL', 'https://nominatim.openstreetmap.org'),
    'routing_url' => env('MEDLINE_MAP_ROUTING_URL', 'https://router.project-osrm.org'),
];
