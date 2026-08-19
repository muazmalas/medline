# MedLine Release Handoff Checklist

This checklist is for the deployment owner after the source implementation handoff. It intentionally does not execute tests, builds, browser checks, migrations, or runtime verification.

Use [`RELEASE_CONFIGURATION_MATRIX.md`](./RELEASE_CONFIGURATION_MATRIX.md) as the single checklist for protected API, web, mobile, provider, backup, and signing values.

## Source and configuration handoff

- [x] Laravel API versioning, health/readiness responses, exception format, request IDs, queues, scheduler, throttles, private storage, and audit boundaries are implemented.
- [x] React role-aware portals, operational queues, catalog, procurement, prescriptions, delivery monitoring, support, notifications, settings, and an opt-in privacy-safe crash/API telemetry boundary are implemented.
- [x] Flutter role routing, patient ordering, partner workflows, driver delivery lifecycle, secure storage, push registration, telemetry boundary, and Android flavors are implemented.
- [x] MySQL migrations, seed structure, idempotency, reservations, inventory movements, PIN protection, and notification persistence are implemented.
- [x] API contract, workflow guide, ERD, traceability matrix, privacy baseline, security operations, local development, and Windows deployment documentation are present.
- [x] Operations recovery runbook covers stuck orders/deliveries, failed notifications, payment-proof backlog, private-file recovery, severity, and rollback boundaries.
- [x] Native Windows release configuration validation, including HTTPS/session/token/idempotency settings, stale-location freshness policy, IIS security headers/SPA fallback with an OpenStreetMap-only frame policy, encrypted MySQL backup, encrypted-backup retention, and notification delivery health operations are documented.
- [x] Added a no-Docker GitHub Actions quality-gate workflow for Laravel/MySQL, React, and Flutter with bounded `-j4` build settings and a disposable native-MySQL migration rehearsal; it is owner-triggered/owner-reviewed and was not executed during implementation.
- [x] Added a no-Docker scheduled/owner-triggered dependency audit for locked Composer and npm packages plus the Flutter dependency graph; findings must be reviewed and approved before release.
- [x] Added [`SECURITY_REVIEW_CHECKLIST.md`](./SECURITY_REVIEW_CHECKLIST.md) as the owner-led OWASP review and security-finding disposition artifact.
- [x] Added `deploy/windows/record-release-manifest.ps1` to produce secret-safe SHA-256 release artifact evidence for the API, React, Flutter, deployment, and documentation surfaces.
- [x] Added `deploy/windows/check-medline-health.ps1` as a native HTTPS liveness/readiness probe that never logs response bodies or secrets.
- [x] Added [`ENVIRONMENT_PROMOTION_CHECKLIST.md`](./ENVIRONMENT_PROMOTION_CHECKLIST.md) for repeatable no-Docker development, staging, and production promotion records.
- [x] Added [`RELEASE_NOTES_TEMPLATE.md`](./RELEASE_NOTES_TEMPLATE.md) for secret-safe release identity, artifact, migration, security, operations, validation, rollback, and support records.
- [x] Account, medical-document, payment-proof, complaint-attachment, audit, telemetry, backup, legal-hold, and deletion boundaries are documented in [`RETENTION_AND_DELETION_POLICY.md`](./RETENTION_AND_DELETION_POLICY.md).
- [x] Browser refresh credentials use an encrypted HttpOnly cookie with configurable trusted-origin credentialed CORS; native Flutter sessions retain secure body-token transport.
- [x] Client acceptance gates are explicitly documented for Arabic RTL/English LTR navigation and detail views, keyboard and screen-reader semantics, private evidence visibility, and driver location permission/freshness behavior.

## Owner-supplied release values

- [ ] Create the restricted production MySQL account and set the production database secret.
- [ ] Generate and protect `APP_KEY`.
- [ ] Set trusted `APP_URL`, explicit `CORS_ALLOWED_ORIGINS`, `CORS_SUPPORTS_CREDENTIALS=true`, refresh-cookie name/domain, and domain routing.
- [ ] Set approved annual pharmacy and warehouse prices and payment evidence policy.
- [ ] Configure mail, FCM, SMS, map-provider, object-storage, and upload-scanner credentials.
- [ ] If telemetry is approved, configure the protected `VITE_TELEMETRY_URL` endpoint and confirm its retention/access policy; leave it unset otherwise.
- [ ] Supply Android/iOS signing keys, Firebase release values, app identifiers, and store accounts.
- [ ] Obtain legal approval for prescription handling, privacy/retention, delivery coverage, fees, currency, and support escalation.
- [ ] Approve the retention periods, deletion request channel, legal-hold process, and responsible operator before enabling permanent private-file expiry.

## Deployment operations

- [ ] Run the documented migration/seed procedure in the chosen environment.
- [ ] Complete the applicable environment promotion checklist and attach the protected release record.
- [ ] Run the dependency-audit workflow and resolve or formally accept every high/critical finding before release.
- [ ] Complete and sign the OWASP-oriented security review checklist; resolve or formally accept every critical/high finding.
- [ ] Publish the React `dist` directory behind HTTPS.
- [ ] Start the Laravel queue worker and scheduler as restricted native Windows services/tasks.
- [ ] Configure private storage ACLs outside public web roots.
- [ ] Configure encrypted MySQL and object-storage backups.
- [ ] Configure error monitoring, queue alerts, health monitoring, and searchable request IDs.
- [ ] Register the health probe with the approved uptime/Windows monitoring system and alert on a non-zero exit code.
- [ ] Run `deploy/windows/validate-release-config.ps1 -RequireBackupEncryption` with protected owner configuration before publishing the release.
- [ ] Alert on `medline.notification.delivery_failed`, review `/api/v1/admin/notification-delivery-health`, and confirm readiness traffic gating.
- [ ] Complete the owner’s requested API, React, Flutter, security, concurrency, restore, and pilot validation.
- [ ] Validate Arabic RTL and English LTR across authenticated role workflows, including order, procurement, complaint evidence, subscription proof, delivery map, and notification views.
- [ ] Validate keyboard/screen-reader announcements for loading, error, queued-update, private-file, and destructive-action states.
- [ ] Validate Android location permission disclosure, active-delivery-only updates, stale-location suppression, and terminal-delivery coordinate removal.

## Rollback and support

- [ ] Record the release version, migration state, configuration revision, and rollback owner.
- [ ] Complete and archive `RELEASE_NOTES_TEMPLATE.md` for the release candidate.
- [ ] Generate and archive the protected release manifest with artifact hashes, source revision, migration revision, and owner approvals.
- [ ] Publish support contacts, escalation levels, incident severity targets, and emergency admin access procedure.
- [ ] Confirm recovery procedures for failed notifications, stuck orders, stuck deliveries, payment-proof review, and lost private files.

See [`OPERATIONS_RECOVERY_RUNBOOK.md`](./OPERATIONS_RECOVERY_RUNBOOK.md) for the owner procedure and closure checklist.

No Docker or container step is required by this handoff.
