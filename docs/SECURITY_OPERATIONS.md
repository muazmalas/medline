# MedLine security and incident operations

## Incident triage

1. Preserve the API `X-Request-ID`, timestamp, actor, endpoint, and affected public record identifier.
2. Do not copy authorization headers, request bodies, prescriptions, payment files, PINs, or secrets into tickets.
3. Check audit logs, failed queue jobs, notification delivery attempts, and delivery events using least-privilege access.
4. Suspend compromised accounts, revoke tokens, rotate exposed credentials, and preserve required evidence.
5. If stock, payment, or delivery state is uncertain, stop manual retries and reconcile the database transaction, inventory ledger, and event history before resuming.

## Operational controls

- Keep `APP_DEBUG=false` and HTTPS enforced in production.
- Laravel rejects insecure API traffic with `HTTPS_REQUIRED` and redirects non-API requests to HTTPS when `MEDLINE_ENFORCE_HTTPS=true`; local development keeps the flag false. If TLS terminates at a reverse proxy, configure the web server/proxy to pass the secure request state to PHP rather than trusting arbitrary client headers.
- Run queue workers and the scheduler under restricted identities.
- Monitor readiness, failed jobs, queue latency, API error rate, slow requests, storage capacity, backup failures, and notification provider failures.
- Keep named authentication, mutation, upload, and general API rate limits enabled on every authenticated state-changing route; review `Retry-After` responses during incident triage without generating duplicate mutation keys.
- The readiness endpoint checks database access, the configured queue connection, the configured upload scanner when enabled, and local private-storage existence/writability; treat a `not_ready` response as a traffic-gating signal. Synchronous queues are permitted only for local/testing environments.
- A `not_ready` response includes `Retry-After: 30` so traffic managers can back off while dependencies recover.
- Review administrator accounts, TOTP enrollment, database access, storage ACLs, and provider credentials regularly.
- Production session cookies default to secure behavior when `APP_ENV=production`; browser refresh credentials use an encrypted `HttpOnly` cookie, while native clients use body credentials. Sanctum bearer tokens are issued with an explicit bounded `expires_at` timestamp from the configured lifetime, with the production template using a 60-minute access-token lifetime. Keep the production overrides explicit in the protected environment and revoke access/refresh credentials immediately on suspension, password reset, and logout.
- The scheduled `medline:auth-artifacts-prune` command removes expired personal access tokens and short-lived reset/verification artifacts; records without an explicit token expiry are intentionally preserved for owner-reviewed migration handling.
- Use the native backup script and restore into an isolated database before any production recovery.
- Reassign failed or PIN-locked deliveries only through the audited administrator workflow.
- When `MEDLINE_UPLOAD_SCAN_ENABLED=true`, provision ClamAV (or the approved compatible scanner) and set `MEDLINE_UPLOAD_SCANNER_COMMAND`; uploads fail closed if the scanner is unavailable or reports a threat.
- Keep scanner execution identities restricted to temporary upload access and never expose scanner output or local paths in API responses.
- Apply [`RETENTION_AND_DELETION_POLICY.md`](./RETENTION_AND_DELETION_POLICY.md) for account closure, private-file expiry, legal holds, backup review, and bounded retry-safe deletion operations. Do not enable permanent medical/financial file deletion until the deployment owner records legal approval.

## Rollback boundary

Do not roll back a release by deleting migrations or restoring application files over an active transaction. Freeze new critical mutations, preserve backups and audit records, assess schema compatibility, and use the deployment owner’s reviewed rollback/reconciliation procedure.
