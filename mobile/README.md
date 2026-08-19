# MedLine Flutter Client

This is the shared role-based mobile client for patients, pharmacies, warehouses, and drivers.

## Runtime configuration

- Android emulator API URL: `http://10.0.2.2:8000/api/v1`
- Physical device API URL: replace the host with the development machine LAN address.
- Production API URL: configure through the application flavor before release.

The API endpoint is injected at build time with `MEDLINE_API_URL`:

```powershell
flutter run --dart-define=MEDLINE_API_URL=https://api.example.com/api/v1
flutter build apk --release --dart-define=MEDLINE_API_URL=https://api.example.com/api/v1
flutter build web --release --dart-define=MEDLINE_API_URL=https://api.example.com/api/v1
```

Android release environments use the `development`, `staging`, and `production` flavors. Supply each flavor's API, Firebase, signing, and version values through protected release settings or CI; do not commit them.

Do not commit production credentials, signing keys, or private API values.

Push registration is configuration-gated. A release may supply `MEDLINE_FIREBASE_API_KEY`, `MEDLINE_FIREBASE_APP_ID`, `MEDLINE_FIREBASE_SENDER_ID`, and `MEDLINE_FIREBASE_PROJECT_ID` through `--dart-define`; the client then requests notification permission, registers the FCM token with the API, refreshes it, and revokes it during sign-out. Without those values, in-app, email, and other configured channels remain available.

Optional mobile error telemetry is enabled only when a protected `MEDLINE_TELEMETRY_URL` Dart define is supplied. The client sends only a redacted error type/message and non-sensitive allowlisted properties; telemetry failures are ignored and never block user actions.

Driver delivery tracking uses foreground location only while the driver has active assigned deliveries. Android location permission is requested on demand, the client submits a bounded latest-location update, and the API clears coordinates when the delivery ends or suppresses stale coordinates after the configured freshness window (`MEDLINE_DELIVERY_LOCATION_STALE_MINUTES`, 10 minutes by default); background tracking and iOS permission configuration require explicit release-owner approval.

Authenticated Sanctum tokens and the minimal user session are persisted with the platform secure-storage implementation. Tokens are not stored in ordinary preferences or logged; sign-out revokes the server token and clears secure storage.

When connectivity is unavailable, safe reads use the encrypted per-user cache. A bounded encrypted mutation queue may defer only idempotent profile-locale, notification-preference, consent, and driver-availability updates; queued writes retain their idempotency keys and replay sequentially after reconnect. Orders, payments, prescriptions, uploads, delivery claims/status/PIN completion, and other critical mutations remain online-only and require an explicit retry by the user.

## Feature structure

- `lib/core/` - API client and session state.
- `lib/features/orders/` - patient order status components.
- `lib/features/delivery/` - driver delivery components.
- `lib/main.dart` - role selection and shared application shell.

Patient order operations include prescription file selection and upload using the API’s private storage workflow. Supported client file types are JPG, JPEG, PNG, and PDF; the server remains authoritative for validation and access control.

Partner operations include inventory listing/adjustment and pharmacy-to-warehouse procurement requests. Medicine IDs are currently used in the compact operational form; the backend validates the selected medicine, partner approval, subscription, and stock reservation rules.

Partner subscription payment proofs use the same private multipart upload boundary as prescriptions; the server validates file type/size and stores the file outside public hosting.

Pharmacy and warehouse users can open the subscription screen from their role action cards to view status, validity, and submit a receipt for administrator review.

Android and web platform folders are generated in this workspace. The Dart application source and API contract are prepared; iOS host generation remains a release-environment task if iOS distribution is required.

To generate an iOS host on a macOS release machine:

```powershell
flutter create --no-pub --platforms=android,ios,web .
```

This project intentionally uses native Windows tooling and does not use Docker.
