# Native Windows Deployment

This deployment path intentionally uses no Docker or containers.

## Services

- MySQL 8 as the `MySQL80` Windows service.
- Laravel API served behind IIS/FastCGI or a managed PHP process.
- Laravel queue worker as a Windows scheduled task or service.
- Laravel scheduler as a Windows scheduled task running every minute.
- React production files hosted by IIS.
- Private prescription and payment-proof files stored outside the public web root.

## Deployment order

1. Create the `medline` database and restricted application credentials.
2. Copy `api/.env.example` to `api/.env` and add production secrets.
3. Run `composer install --no-dev --optimize-autoloader` in `api`.
4. Run `php artisan migrate --force`.
5. Run `php artisan storage:link` only for explicitly public assets.
6. Cache configuration and routes with Laravel Artisan.
7. Start the queue worker and scheduler under a restricted Windows account.
8. Build the React application and publish `web/dist` through IIS.
9. Configure HTTPS, API CORS origins, private storage ACLs, and health monitoring.
10. Confirm backup and restore procedures before accepting real data.

## Production environment handoff

- Review [`docs/RELEASE_CONFIGURATION_MATRIX.md`](../../docs/RELEASE_CONFIGURATION_MATRIX.md) before creating protected environment files; it identifies every owner-supplied value and release gate.
- Copy `api/.env.production.example` to a protected release location as `api/.env`; never commit the populated file. The template includes explicit HTTPS, secure-cookie, Sanctum lifetime, and idempotency-recovery settings required by the release validator.
- Copy `web/.env.production.example` to the protected web release environment as `web/.env.production`; run `validate-release-config.ps1 -RequireBackupEncryption` from an elevated release shell after owner values are populated. The guard checks paths, HTTPS, production mode, restricted database identity, bounded access-token lifetime, secure sessions, private storage, explicit CORS, upload scanning, subscription/map configuration, stale-location freshness bounds, transaction retry bounds, backup certificate-thumbprint shape, and placeholder values without contacting external services or printing secrets. Add `-RequireProviderCredentials` only after mail/push provider values have been supplied.
- Publish `web/dist` together with `web/public/web.config` (or the equivalent generated release file) so IIS provides React route fallback, the documented browser security headers, and the explicit OpenStreetMap-only frame policy required by the operational delivery map.
- After producing the approved API/web/mobile artifacts, run `deploy/windows/record-release-manifest.ps1 -OutputPath <protected-release-record>\release-manifest.json`. It records SHA-256 hashes and the source revision for release evidence while excluding environment files, runtime storage, logs, dumps, backups, and dependency caches.
- Use a dedicated MySQL application account with only the MedLine database privileges; do not use `root` outside local development.
- Keep `QUEUE_CONNECTION=database` and `CACHE_STORE=database` unless an approved Redis provider is configured.
- Run the queue worker and scheduler under separate restricted Windows identities where practical; keep their logs outside the public web roots.
- Copy `web/.env.production.example` to the web build environment and publish only the generated `web/dist` files.
- Set `APP_DEBUG=false`, enforce HTTPS, set `SESSION_SECURE_COOKIE=true`, keep `SESSION_HTTP_ONLY=true` and an appropriate `SESSION_SAME_SITE` value, enable `CORS_SUPPORTS_CREDENTIALS=true` for the trusted React origin, and list only trusted web origins in `CORS_ALLOWED_ORIGINS`. The browser refresh cookie must remain Secure and HttpOnly in production.
- Set `SANCTUM_TOKEN_EXPIRATION` to the approved production bearer-token lifetime in minutes; expired mobile/web API tokens require a fresh sign-in.
- Set `MEDLINE_ENFORCE_HTTPS=true` in the protected production API environment. When IIS or another trusted edge terminates TLS, pass the request's secure state through the server configuration; do not enable application trust for arbitrary `X-Forwarded-Proto` headers.
- Store `APP_KEY`, database, mail, push, storage, and signing secrets in the release secret manager or protected Windows environment, never in source control.
- Restrict the React Audit log and `/api/v1/admin/audit-logs` endpoint to administrator accounts; retain audit records according to the approved legal and operational retention policy.

## Backup and restore

- Run `scripts/backup-mysql.ps1 -RequireEncryption` from a protected scheduled task using `MEDLINE_BACKUP_DB_PASSWORD`, `MEDLINE_BACKUP_DB_USER`, `MEDLINE_BACKUP_ENCRYPTION_CERT_THUMBPRINT`, and optional `MEDLINE_MYSQL_BIN` environment values supplied by the secret/task account. The script encrypts the generated dump with the certificate in `LocalMachine\My` and removes the plaintext dump.
- Register the queue, scheduler, and daily backup tasks with `deploy/windows/register-medline-tasks.ps1` from an elevated PowerShell session after reviewing the service account and protected environment configuration.
- The scheduler runs `medline:subscriptions-maintain` daily at 01:00 to mark expiring/expired subscriptions and send reminders.
- The scheduler runs `medline:deliveries-release-stale` every five minutes to return abandoned `claimed` jobs to the available queue; tune `MEDLINE_DELIVERY_CLAIM_TIMEOUT_MINUTES` through protected configuration.
- Configure `MEDLINE_DELIVERY_LOCATION_STALE_MINUTES` (10 minutes by default) through the protected API environment. Coordinates older than this window are withheld from delivery views until a fresh foreground update arrives.
- The scheduler runs `medline:idempotency-prune` daily at 03:00 and retains keyed mutation responses for `MEDLINE_IDEMPOTENCY_RETENTION_DAYS` (default seven days) before pruning them.
- An idempotency reservation that remains unfinished beyond `MEDLINE_IDEMPOTENCY_IN_PROGRESS_TIMEOUT_SECONDS` (default 900 seconds) is eligible for safe reservation recovery on the next identical request; keep this above the longest expected critical transaction duration.
- The scheduler runs `medline:notification-attempts-prune` daily at 03:15 and retains delivery attempts/claims for `MEDLINE_NOTIFICATION_ATTEMPT_RETENTION_DAYS` (default 90 days); it does not delete the user-facing notification inbox.
- `MEDLINE_DATABASE_TRANSACTION_ATTEMPTS` controls bounded retry attempts for coordinated API write transactions, including stock, order, procurement, delivery, administrator, account, catalog, document, prescription, subscription, and notification workflows; upload files are staged and compensated on database failure. It defaults to three and must remain between one and five.
- Alert on structured `medline.database.deadlock_exhausted` log events. They indicate that a bounded delivery transaction retry budget was exhausted and require operational review before replaying the same idempotent request.
- The scheduler runs `medline:auth-artifacts-prune` daily at 03:30 to remove expired personal access tokens and password-reset/email-verification artifacts; it leaves legacy tokens without an explicit expiry untouched for controlled migration review.
- Store generated SQL files outside the web roots with restricted ACLs and an organization-approved retention policy.
- The weekly `MedLine Encrypted Backup Retention` task prunes only `.sql.cms` artifacts under the configured backup directory using `MEDLINE_BACKUP_RETENTION_DAYS` (default 30); review the retention period against legal and recovery requirements.
- For encrypted `.sql.cms` backups, decrypt only on an isolated maintenance machine with the protected private certificate using `Unprotect-CmsMessage`; never copy decrypted dumps into a web root or shared folder.
- Restore only into an isolated maintenance database first, using the native MySQL client, then document the restore result before changing production traffic.
- Use [`docs/OPERATIONS_RECOVERY_RUNBOOK.md`](../../docs/OPERATIONS_RECOVERY_RUNBOOK.md) for stuck orders/deliveries, notification failures, payment-proof review backlog, private-file recovery, severity, and rollback boundaries.
- Include database, private prescription/payment-proof storage, `.env` secret material, and release artifacts in the approved backup plan; never place backups in `web/dist` or `api/public`.

## Monitoring endpoints

- `GET /api/v1/health` is a lightweight liveness check.
- `GET /api/v1/health/ready` checks database and configured storage availability and returns HTTP 503 when the API should not receive traffic.
- Monitor both endpoints over HTTPS without exposing application secrets or database details in the monitoring response.
- Use `deploy/windows/check-medline-health.ps1 -BaseUri https://api.example.com -FailureLogPath <protected-log-path>` from an approved uptime scheduler or Windows monitoring task. It checks both liveness and readiness, requires HTTPS, logs only status/error text, and returns a failure exit code for alerting.
- API exceptions return stable JSON error codes; production responses suppress exception details while server logs retain reportable diagnostics at the configured warning level.
- Terminal notification job failures are written to structured logs and `notification_delivery_attempts`; alert on `medline.notification.delivery_failed` and retain the notification reference for support investigation.
- Preserve the `X-Request-ID` response value when escalating an incident; it correlates API errors and audit records without exposing request secrets.
- Do not attach request bodies, authorization headers, prescription contents, payment proofs, or database credentials to external error-monitoring events.

## Operational rules

- Never run production with `APP_DEBUG=true`.
- Never use the MySQL root account from production application code.
- Never expose private prescription or payment-proof paths through IIS.
- Keep `CORS_ALLOWED_ORIGINS` explicit and HTTPS-only; wildcard origins are rejected by the release guard.
- Configure SMS endpoint and bearer token together, or leave both disabled; partial provider credentials are rejected.
- Rotate API, database, storage, and notification credentials separately.
- Keep queue and scheduler logs outside the public web root.
