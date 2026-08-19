# MedLine Production Security Review Checklist

This checklist is the owner-led OWASP-oriented review boundary for the MedLine release. It is a review artifact, not evidence that the review has been executed. Each item must be marked only after the deployment owner records evidence, an owner, and a disposition for any finding.

## Review record

| Field | Value |
|---|---|
| Release/version | Owner to complete |
| Review date | Owner to complete |
| Reviewer(s) | Owner to complete |
| Environment | Owner to complete; never use production medical data for exploratory review |
| Finding register | Owner to link |
| Approval authority | Security/product owner to complete |

## A01 — Broken access control and tenant isolation

- [ ] Verify every route is protected by authentication and the intended role/profile boundary.
- [ ] Verify patients can access only their own addresses, carts, orders, prescriptions, complaints, ratings, consents, and notifications.
- [ ] Verify pharmacies and warehouses can access only their own inventory, procurement, orders, deliveries, documents, and subscription records.
- [ ] Verify drivers can access only assigned/eligible delivery records and privacy-scoped location data.
- [ ] Verify administrators cannot suspend or change their own role and every override has an audit reason.
- [ ] Attempt cross-user, cross-pharmacy, cross-warehouse, and cross-driver identifiers through path, query, body, and download endpoints.
- [ ] Confirm private-file download authorization is enforced server-side and signed URLs are short-lived and audience-scoped.

## A02 — Cryptographic and secret handling

- [ ] Confirm production `APP_KEY`, database, mail, push, storage, scanner, and signing secrets are outside source control.
- [ ] Confirm refresh tokens, passwords, TOTP secrets, private files, and sensitive fields use the documented storage protection.
- [ ] Confirm HTTPS, secure HttpOnly refresh cookies, trusted-origin credentialed CORS, and bearer-token lifetimes match approved configuration.
- [ ] Confirm logs, telemetry, notifications, exports, and error responses do not contain passwords, tokens, PINs, prescription contents, or payment proofs.

## A03/A05 — Injection, validation, and security configuration

- [ ] Review validation and output encoding for search, CSV import/export, filenames, free text, provider responses, and audit filters.
- [ ] Confirm database queries use bounded parameters/ORM constraints and no user-controlled SQL, shell, or filesystem path is accepted.
- [ ] Confirm production debug output, permissive CORS, wildcard origins, unsafe headers, and default credentials are rejected by the release guard.
- [ ] Confirm IIS CSP, frame policy, HSTS, referrer policy, permissions policy, and private-storage ACLs are deployed with the release.

## A04 — Insecure design and critical transaction abuse

- [ ] Review stock reservation, order creation, payment-proof review, procurement, delivery claim/status/PIN, subscription, and idempotency workflows against the domain rules.
- [ ] Confirm bounded transaction retries are safe for every upload and mutation and failed private files are compensated.
- [ ] Confirm repeated idempotency keys cannot create duplicate critical records and stale in-progress reservations have controlled recovery.
- [ ] Confirm notification failure does not roll back a successful business transaction and provider payloads are redacted.

## A06/A07 — Authentication and session management

- [ ] Verify registration, email verification, password reset, login throttling, refresh rotation, logout, suspension, and unauthorized-session recovery.
- [ ] Verify administrator TOTP enrollment, confirmation, disable, failed-attempt audit, and recovery policy.
- [ ] Confirm mobile secure storage and browser cookie/session boundaries are appropriate for the release platforms.

## A08/A09 — Integrity, logging, and monitoring

- [ ] Verify audit coverage for role changes, partner/document/payment decisions, stock changes, order/delivery transitions, privacy actions, and security events.
- [ ] Confirm request IDs correlate API errors, audit records, queue failures, and notification delivery attempts without exposing secrets.
- [ ] Confirm alerts exist for failed jobs, notification failures, readiness failures, suspicious authentication, storage/scanner failures, and backup failures.
- [ ] Confirm audit exports, retention, legal holds, and deletion workflows are access-controlled and approved.

## A10 — SSRF, upload, and provider boundaries

- [ ] Confirm outbound provider URLs and map/scanner commands are allowlisted and protected from user-controlled destinations.
- [ ] Confirm prescription, verification, complaint, and payment-proof uploads enforce type/size/content validation, private storage, and fail-closed scanning when enabled.
- [ ] Confirm provider credentials, user-agent/contact requirements, rate limits, and outage behavior are configured and documented.

## Release disposition

- [ ] Record every finding with severity, affected workflow, evidence, owner, remediation, and due date.
- [ ] No unresolved critical or high-severity findings remain, or a named security authority has formally accepted the risk.
- [ ] Attach the signed review record to the release candidate and repeat the review after material security or dependency changes.

No Docker or container step is required by this checklist.
