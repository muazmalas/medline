<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:3001,http://127.0.0.1:3001'))))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => ['X-Request-ID', 'Idempotency-Replayed', 'Retry-After'],
    'max_age' => 0,
    'supports_credentials' => filter_var(env('CORS_SUPPORTS_CREDENTIALS', true), FILTER_VALIDATE_BOOL),
];
