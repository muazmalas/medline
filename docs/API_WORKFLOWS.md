# MedLine API Workflow Contract

The machine-readable endpoint contract is maintained in [`openapi.yaml`](./openapi.yaml).

All endpoints are under `/api/v1`; protected endpoints require a Sanctum bearer token, while the refresh endpoint accepts either the native body credential or the trusted browser refresh cookie.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh` - atomically rotate a single-use refresh token and issue a replacement access token; React uses the trusted HttpOnly cookie transport and Flutter sends the body credential.
- `GET /auth/me`
- `POST /auth/logout`

## Patient and catalog

- `GET /medicines?search=` - debounced multi-field catalog search.
- `GET /partners?type=pharmacy|warehouse` - approved active partner discovery.
- `POST /orders` - patient order creation; send an `Idempotency-Key` header.
- Orders containing prescription-required medicines enter `prescription_required`; the patient must upload a prescription before pharmacy decision actions are permitted.
- `POST /orders/{order}/prescription` - private prescription upload.
- `GET /orders` - role-filtered order history.
- `GET /deliveries/mine` - patient delivery status and PIN.

## Pharmacy and warehouse operations

- `GET /partner/inventory`
- `PUT /partner/inventory`
- `GET /partner/orders`
- `POST /partner/orders/{order}/decision`
- `GET /procurement`
- `POST /procurement`
- `POST /procurement/{procurement}/decision`
- `GET /subscription`
- `GET /subscription/plans` (returns the configured annual plan for the authenticated partner type)
- `POST /subscription/payment-proof`
- `POST /pharmacy/prescriptions/{prescription}/review`

## Driver operations

- `GET /deliveries/available`
- `POST /deliveries/{delivery}/claim`
- `POST /deliveries/{delivery}/status`
- `POST /deliveries/{delivery}/complete`

## Administration

- `GET /admin/dashboard`
- `GET /admin/partners`
- `POST /admin/partners/{partner}/decision`
- `POST /admin/subscriptions/{subscription}/decision`
- `GET /complaints`
- `GET /complaints/{complaint}` - complaint detail and private evidence metadata.
- `POST /complaints` - create a complaint; optionally send one scanner-protected evidence file as multipart field `attachment`.
- `PATCH /complaints/{complaint}`
- `GET /complaints/{complaint}/attachments/{attachment}/download-url` - issue a five-minute signed evidence URL.
- `GET /admin/reports/complaints` - administrator complaint status and volume aggregates.

## Invariants

- The API is the authority for status, configured plan price, quantity, ownership, permissions, PIN verification, and subscription access.
- Inventory reservations are made inside database transactions and protected by row locks.
- Critical administrator mutations (user status/role changes, partner and subscription decisions, and delivery reassignment) use the same bounded deadlock-retry policy as stock, order, procurement, and delivery lifecycle transactions.
- Coordinated account, cart, address, consent, notification-preference, device-token, catalog-import, prescription, complaint, verification-document, subscription-proof, and notification-delivery writes use the same helper so deadlock exhaustion rolls the database mutation back and emits the standard operational log event. Upload workflows stage private files before the database transaction and delete staged files on failure, preventing retry-induced orphan files.
- Notifications are persisted after domain changes and can be consumed by future push, email, or SMS adapters.
- Private documents are never returned as public paths; access is authorized per patient, partner, or admin.
