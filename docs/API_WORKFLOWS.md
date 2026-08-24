# MedLine API Workflow Contract

The machine-readable endpoint contract is maintained in [`openapi.yaml`](./openapi.yaml).

All endpoints are under `/api/v1`; protected endpoints require a Sanctum bearer token, while the refresh endpoint accepts either the native body credential or the trusted browser refresh cookie.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- Administrator login requires `two_factor_code` when authenticator protection is enabled.
- `POST /auth/refresh` - atomically rotate a single-use refresh token and issue a replacement access token; React uses the trusted HttpOnly cookie transport and Flutter sends the body credential.
- `GET /auth/me`
- `POST /auth/logout`

## Patient and catalog

- `GET /medicines?search=` - debounced multi-field catalog search.
- `GET /partners?type=pharmacy|warehouse` - approved active partner discovery.
- `POST /orders` - patient multi-medicine order creation with item-specific prescriptions, `asap` or scheduled delivery, and a selected delivery vehicle type; send an `Idempotency-Key` header.
- Orders containing prescription-required medicines enter `prescription_required`; the patient must upload a prescription before pharmacy decision actions are permitted.
- `POST /orders/{order}/items/{item}/prescription` - private prescription upload for one prescription-required medicine.
- `GET /orders` - role-filtered order history.
- `GET /deliveries/mine` - patient delivery status; verification codes are never returned by an API.
- `POST /orders/{order}/partial-offer/decision` - patient acceptance or rejection of the pharmacy's reduced quantities.

## Pharmacy and warehouse operations

- `GET /partner/inventory`
- `PUT /partner/inventory`
- `GET /partner/orders`
- `POST /partner/orders/{order}/decision`
- `GET /procurement`
- `POST /procurement`
- `GET /procurement/{procurement}` - full request, requested and accepted lines, batch choices, delivery snapshot, and timeline.
- Procurement delivery details expose verification state only; code hashes and code values are never serialized.
- `POST /procurement/{procurement}/decision` - warehouse full, partial, or rejected decision with bounded quantities, comment rules, and exact batch allocations.
- `POST /procurement/{procurement}/partial-offer/decision` - pharmacy acceptance or rejection before a partial delivery is created.
- `GET /subscription`
- `GET /subscription/plans` (returns the configured annual plan for the authenticated partner type)
- `POST /subscription/payment-proof`
- `POST /pharmacy/prescriptions/{prescription}/review`

## Driver operations

- `GET /deliveries/available` - approved, available orders matching the driver's vehicle type, including the stored driving-route geometry, road distance, duration, and route-based fee.
- `GET /deliveries/{delivery}` - authorized stored road route, pickup and drop-off map data, schedule, captured fee, required vehicle, and medicine pickup manifest.
- `POST /deliveries/{delivery}/accept-order` - accept the order for delivery after vehicle eligibility is rechecked under a lock. The older `/claim` path remains a deprecated compatibility alias.
- `POST /deliveries/{delivery}/status` - after verified pickup has automatically entered `in_transit`, the assigned driver may advance to `arrived` or report failure; pickup states cannot be bypassed manually.
- `POST /deliveries/{delivery}/pickup-verification/initiate` - pickup pharmacy or procurement warehouse emails a four-digit code to the assigned driver.
- `POST /deliveries/{delivery}/pickup-verification/verify` - the pickup partner enters the driver's code, confirms the medicine handoff, and automatically moves the delivery to `in_transit`.
- `POST /deliveries/{delivery}/recipient-verification/initiate` - after arrival, the assigned driver emails a separate four-digit code to the patient or procurement pharmacy.
- `POST /deliveries/{delivery}/recipient-verification/verify` - the assigned driver enters the recipient's code and atomically completes delivery, stock, and payment settlement.

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
- `GET /admin/delivery-pricing` - current bicycle, motorcycle, car, and van rates plus the complete version history.
- `POST /admin/delivery-pricing` - create a vehicle-specific rate version with a required reason; existing order snapshots never change.

## Invariants

- The API is the authority for status, configured plan price, quantity, ownership, permissions, handoff verification, and subscription access.
- Verification codes are stored only as password hashes, expire after a configurable interval, have a resend cooldown and bounded attempts, and never enter notification payloads, logs, audit metadata, or API responses.
- Current workflow states are defined in [`DOMAIN_SPECIFICATION.md`](./DOMAIN_SPECIFICATION.md). Retired states are normalized by migration and are not accepted by current UI actions.
- Role middleware protects server routes independently of navigation visibility; direct links do not grant access.
- Inventory reservations are made inside database transactions and protected by row locks.
- Critical administrator mutations (user status/role changes, partner and subscription decisions, and delivery reassignment) use the same bounded deadlock-retry policy as stock, order, procurement, and delivery lifecycle transactions.
- Coordinated account, cart, address, consent, notification-preference, device-token, catalog-import, prescription, complaint, verification-document, subscription-proof, and notification-delivery writes use the same helper so deadlock exhaustion rolls the database mutation back and emits the standard operational log event. Upload workflows stage private files before the database transaction and delete staged files on failure, preventing retry-induced orphan files.
- Notifications are persisted after domain changes and can be consumed by future push, email, or SMS adapters.
- Private documents are never returned as public paths; access is authorized per patient, partner, or admin.
