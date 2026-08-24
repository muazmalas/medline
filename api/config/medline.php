<?php

return [
    'enforce_https' => filter_var(env('MEDLINE_ENFORCE_HTTPS', env('APP_ENV', 'production') === 'production'), FILTER_VALIDATE_BOOL),
    'delivery_claim_timeout_minutes' => (int) env('MEDLINE_DELIVERY_CLAIM_TIMEOUT_MINUTES', 30),
    'delivery_location_stale_minutes' => max(1, (int) env('MEDLINE_DELIVERY_LOCATION_STALE_MINUTES', 10)),
    'delivery_verification_ttl_minutes' => max(1, min(60, (int) env('MEDLINE_DELIVERY_VERIFICATION_TTL_MINUTES', 10))),
    'delivery_verification_resend_seconds' => max(15, min(600, (int) env('MEDLINE_DELIVERY_VERIFICATION_RESEND_SECONDS', 60))),
    'delivery_verification_max_attempts' => max(1, min(10, (int) env('MEDLINE_DELIVERY_VERIFICATION_MAX_ATTEMPTS', 5))),
    'operations_timezone' => env('MEDLINE_OPERATIONS_TIMEZONE', 'Asia/Damascus'),
    'web_url' => env('MEDLINE_WEB_URL', 'http://127.0.0.1:3001'),
    'currency' => env('MEDLINE_CURRENCY', 'SYP'),
    'tax_rate' => max(0, (float) env('MEDLINE_TAX_RATE', 0)),
    'delivery_fee' => max(0, (float) env('MEDLINE_DELIVERY_FEE', 2500)),
    'delivery_fee_per_km' => max(0, (float) env('MEDLINE_DELIVERY_FEE_PER_KM', 100)),
    'delivery_rates' => [
        'bicycle' => max(0, (float) env('MEDLINE_BICYCLE_DELIVERY_FEE_PER_KM', 60)),
        'motorcycle' => max(0, (float) env('MEDLINE_MOTORCYCLE_DELIVERY_FEE_PER_KM', env('MEDLINE_DELIVERY_FEE_PER_KM', 100))),
        'car' => max(0, (float) env('MEDLINE_CAR_DELIVERY_FEE_PER_KM', 140)),
        'van' => max(0, (float) env('MEDLINE_VAN_DELIVERY_FEE_PER_KM', 180)),
    ],
    'subscription_grace_period_days' => max(0, (int) env('MEDLINE_SUBSCRIPTION_GRACE_PERIOD_DAYS', 7)),
    'idempotency_retention_days' => max(1, (int) env('MEDLINE_IDEMPOTENCY_RETENTION_DAYS', 7)),
    'idempotency_in_progress_timeout_seconds' => max(60, (int) env('MEDLINE_IDEMPOTENCY_IN_PROGRESS_TIMEOUT_SECONDS', 900)),
    'database_transaction_attempts' => max(1, min(5, (int) env('MEDLINE_DATABASE_TRANSACTION_ATTEMPTS', 3))),
    'refresh_token_expiration_days' => max(1, (int) env('MEDLINE_REFRESH_TOKEN_EXPIRATION_DAYS', 30)),
    'refresh_cookie_name' => env('MEDLINE_REFRESH_COOKIE_NAME', 'medline_refresh'),
    'notification_attempt_retention_days' => max(7, (int) env('MEDLINE_NOTIFICATION_ATTEMPT_RETENTION_DAYS', 90)),
    'privacy' => [
        'policy_version' => env('MEDLINE_POLICY_VERSION', '2026-08-18'),
    ],
    'uploads' => [
        'scan_enabled' => (bool) env('MEDLINE_UPLOAD_SCAN_ENABLED', false),
        'scanner_command' => env('MEDLINE_UPLOAD_SCANNER_COMMAND', 'clamscan'),
    ],
    'notifications' => [
        'fcm_endpoint' => env('MEDLINE_FCM_ENDPOINT'),
        'fcm_bearer_token' => env('MEDLINE_FCM_BEARER_TOKEN'),
        'sms_endpoint' => env('MEDLINE_SMS_ENDPOINT'),
        'sms_bearer_token' => env('MEDLINE_SMS_BEARER_TOKEN'),
        'max_attempts' => (int) env('MEDLINE_NOTIFICATION_MAX_ATTEMPTS', 3),
    ],
    'subscription_plans' => [
        'annual_pharmacy' => [
            'partner_type' => 'pharmacy',
            'duration_months' => 12,
            'amount' => env('MEDLINE_ANNUAL_PHARMACY_AMOUNT'),
        ],
        'annual_warehouse' => [
            'partner_type' => 'warehouse',
            'duration_months' => 12,
            'amount' => env('MEDLINE_ANNUAL_WAREHOUSE_AMOUNT'),
        ],
    ],
];
