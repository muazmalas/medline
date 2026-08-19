# MedLine API contract handoff

The canonical machine-readable contract is [`openapi.yaml`](./openapi.yaml). The API base path is `/api/v1`.

## Authentication

Authenticated requests use a Laravel Sanctum bearer token:

```http
Authorization: Bearer <token>
Accept: application/json
```

Tokens are issued by registration/login as a short-lived access token plus a single-use refresh token. Native clients send the refresh token in the request body; the React browser client requests `transport=cookie`, receives the refresh credential in an encrypted `HttpOnly` cookie, and never stores it in web storage. `POST /auth/refresh` atomically rotates the credential, issues a replacement access token, and revokes the superseded refresh token. Logout, password reset, and administrator suspension revoke credentials; refresh tokens are stored only as hashes and are pruned after expiry or revocation. Role authorization is enforced by the API; clients must treat `403` as a permission result rather than hiding a server failure.

## Response and error shape

Successful mutations return a human-readable `message` and the relevant resource. Validation and domain errors use the following shape where applicable:

```json
{
  "message": "One or more medicines are no longer available.",
  "code": "ORDER_STOCK_UNAVAILABLE",
  "errors": {},
  "request_id": "request-correlation-id"
}
```

Clients should display `message`, use `code` for deterministic recovery behavior, and preserve `X-Request-ID` when escalating an incident. Do not display raw exception details.

## Pagination and filtering

List endpoints use Laravel pagination with `data`, `current_page`, `last_page`, `per_page`, and total metadata. `per_page` is server-capped. Search and status filters are endpoint-specific; unknown filters must not be assumed to be applied.

`GET /medicines/suggestions?search=<term>` returns up to twelve lightweight active-catalog suggestions when the term has at least two characters. Each result includes `matched_fields` so clients can present bilingual name, manufacturer, and code matches without rendering unsafe server-provided HTML.

When a filtered `GET /medicines` search returns no records, the response may include up to three safe `suggested_queries` based on the first search character for an empty-state recovery prompt.

`GET /medicine-categories` returns bilingual category records. Administrators may create or update categories through the protected mutation endpoints; category removal is intentionally non-destructive and is handled through medicine reassignment rather than deleting referenced records.

`GET /medicines` accepts `category_id`, `prescription_required`, `available_only`, `partner_id`, `inventory_type` (`pharmacy` or `warehouse`), and bounded `sort` values (`name_en` or `created_at`). Availability checks compare the selected inventory source's quantity against reserved quantity on the server. `GET /partners` accepts only `pharmacy` or `warehouse` for its type filter.

Authenticated non-admin users can read `/dashboard` for role-scoped operational metrics. The response never exposes another patient's, partner's, or driver's records; administrators use `/admin/dashboard` for organization-wide metrics.

Approved pharmacy and warehouse partners can read `/partner/deliveries` to monitor only deliveries linked to their owned orders or procurement records; active assigned deliveries include the latest location fields, terminal deliveries suppress them, and driver PIN material is never included.

Authorized participants can read `/deliveries/{id}` for a privacy-scoped delivery record and event timeline. PIN material is not returned by this endpoint.

Assigned drivers may submit `/deliveries/{id}/location` while an active delivery is in progress. The API stores only the latest latitude/longitude, accuracy, and update time; authorized patient, assigned driver, partner, and administrator delivery views receive location data only while the delivery is active and the update is fresher than `MEDLINE_DELIVERY_LOCATION_STALE_MINUTES` (10 minutes by default). Failed, cancelled, reassigned, and completed deliveries clear it and no location history is retained.

Authenticated partners can read `/subscription/plans` for the plan catalog matching their partner type. Payment-proof submissions may include `plan_code`; the API enforces partner type, configured amount (when supplied), duration, and persists the selected plan metadata. Pricing values remain deployment/legal-owner configuration.

Pharmacy partners can read `/pharmacy/prescriptions?status=pending_review` and review only prescriptions belonging to their own orders through `/pharmacy/prescriptions/{id}/review`; files remain available only through authorized private download URLs.

Pharmacy and warehouse partners can read `/procurement/{id}` for an owned procurement, its line items, delivery record, and delivery-event timeline. Cross-partner procurement access is rejected server-side.

Administrators can review `/admin/ratings` and use `/admin/ratings/{rating}/moderate` with `hide` or `restore`; moderation is audited and hidden ratings remain recoverable. Completed-order rating submissions accept the same optional idempotency header, and duplicate concurrent submissions return a stable conflict.

Administrators can update a user's role through `/admin/users/{id}/role`. Partner and driver assignments require the corresponding profile, and the current administrator cannot change their own role.

Administrators can review partner applications through `/admin/partners` and submit `approve`, `reject`, or `correction` decisions to `/admin/partners/{id}/decision`; each decision is authorized and audited.

## Localization

The authenticated profile `locale` is `ar` or `en` and controls server-generated notification text. Clients may send `Accept-Language: ar` or `Accept-Language: en` as a presentation hint, but authorization and stored preference remain server authoritative. React and Flutter persist the profile locale and switch RTL/LTR at the shell level.

## Uploads and private files

Prescriptions, verification documents, payment proofs, and catalog images/imports are validated for type and size. Production upload scanning is enabled with `MEDLINE_UPLOAD_SCAN_ENABLED=true` and a configured ClamAV command. The readiness endpoint fails when scanning is enabled but unavailable.

Sensitive files are private. Authorized clients may request a five-minute signed URL from the corresponding `download-url` endpoint and then fetch the signed route. Ownership/administrator authorization is still checked. Never expose storage paths, PINs, or file contents in logs.

## Idempotency

Critical create/status mutations accept an optional `Idempotency-Key` header. Reuse the same key and identical request body after a timeout to replay the stored response. Reusing a key with a different body returns `409` with `IDEMPOTENCY_KEY_REUSED`.

This applies to patient orders, procurement creation and decisions, partner inventory updates, payment-proof submission, delivery claims and status transitions, delivery PIN completion, and other documented critical mutations. Keys are scoped to the authenticated user. A client retrying an inventory update, claim, partner decision, status/failure transition, or PIN completion must reuse the original key and identical body; it must never generate a new key merely because the response was lost.

## Order and delivery states

Patient orders containing prescription-required medicines enter `prescription_required` and cannot be accepted by a pharmacy until the patient uploads a prescription and the pharmacist approves it. They then progress through pharmacy review, acceptance/partial acceptance, readiness, delivery, and completion. Cancellation is permitted only before the delivery is in transit and releases reservations transactionally.

Delivery transitions are sequential: `available → claimed → pickup_started → picked_up → in_transit → arrived → delivered`. A driver must be approved and available to list or claim new jobs. Completion requires the six-digit patient PIN, is lock-protected after repeated failures, and atomically settles inventory and payment status.

## Notifications and providers

In-app notifications are listed at `/notifications`; channel preferences are managed at `/notification-preferences`. Push, email, and SMS are queued after commit, use locale-aware content, record provider attempts, and use per-target delivery claims to avoid duplicate sends during retries. Administrators can read body-free aggregate delivery health and recent failures from `/admin/notification-delivery-health`. Provider endpoints and credentials are deployment configuration, not source-controlled values.

Authenticated requests may include an `Idempotency-Key` header containing 1–128 alphanumeric characters or `.`, `_`, `:`, and `-`. Invalid keys are rejected before controller execution; omitting the header remains valid for non-idempotent operations.

Saved-address creation, updates, and deletion are idempotent-capable mutations. Clients should generate one stable key per user action and reuse it only when retrying that same request after a timeout or lost response.

React and Flutter clients send an `X-Request-ID` value on each API request. The API validates or generates the identifier and returns it on responses for support correlation; CORS exposes the identifier, replay signal, and `Retry-After` guidance to trusted React origins. Clients must not place credentials, medical contents, or payment data in the value.

For mutations (`POST`, `PUT`, `PATCH`, and `DELETE`), MedLine atomically reserves the key before controller execution. JSON requests use their body hash; multipart requests use form fields plus uploaded-file fingerprints. A concurrent identical request receives `IDEMPOTENCY_REQUEST_IN_PROGRESS` with `Retry-After: 2`; after completion, the stored JSON response is replayed for the same key and request hash with `Idempotency-Replayed: true`. Failed responses release the reservation so the client may retry safely.

Authenticated state-changing routes are also protected by named mutation or authentication rate limiters. Upload endpoints retain their stricter upload limiter, and critical routes may use both controls. A rate-limit response is not a signal to create a new idempotency key; clients should honor `Retry-After` and retry the same action with the same key.

## Support and complaint evidence

Complaints are available through `/complaints` to their creator and administrators. A complaint may include one optional JPG, PNG, WebP, or PDF evidence file (maximum 10 MB); uploads use the same production malware-scanning boundary as other private documents. Evidence is stored outside the public web root, and authorized users may request a five-minute signed download URL. Administrators may read aggregate complaint status, category, priority, and recent-volume data from `/admin/reports/complaints`.

## Operational endpoints

- `GET /health` — liveness.
- `GET /health/ready` — database, storage, and enabled upload-scanner readiness.
- `GET /admin/audit-logs` — administrator-filtered audit records.
- `GET /admin/audit-logs/export` — bounded CSV audit export for administrators.

`GET /admin/dashboard` also returns actionable low-stock, failed-delivery, complaint, and pending-partner alerts for the administrator operations dashboard.

All production traffic must use HTTPS and a trusted web origin. The native Windows handoff in [`deploy/windows/README.md`](../deploy/windows/README.md) defines queue, scheduler, backup, storage, and secret requirements.
