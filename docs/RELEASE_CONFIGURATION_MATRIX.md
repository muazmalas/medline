# MedLine Release Configuration Matrix

This is the owner handoff for production values that must be supplied outside source control. Populate the protected release store, then render the runtime files only on the release machine. Never commit populated `.env` files, signing material, provider tokens, private certificates, or database dumps.

| Area | Required values | Consumer | Owner and release gate |
|---|---|---|---|
| API identity | `APP_KEY`, `APP_URL`, `APP_ENV=production`, `APP_DEBUG=false`, `MEDLINE_ENFORCE_HTTPS=true`, explicit `CORS_ALLOWED_ORIGINS`, `CORS_SUPPORTS_CREDENTIALS=true`, `MEDLINE_REFRESH_COOKIE_NAME` | Laravel | Technical owner; HTTPS, trusted-origin, and browser-cookie review |
| Database | Restricted MySQL username/password, host, port, database name | Laravel and backup task | Database owner; no production `root` account |
| Sessions/cache/queue | Database or approved provider credentials; `SESSION_SECURE_COOKIE=true`, `SESSION_HTTP_ONLY=true`, `SESSION_SAME_SITE=lax`, secure session cookie/domain, short-lived `SANCTUM_TOKEN_EXPIRATION` (60 minutes in the template), `MEDLINE_REFRESH_TOKEN_EXPIRATION_DAYS` | Laravel | Platform owner; queue worker and scheduler registration |
| Private files | Private filesystem path, ACL, backup inclusion, upload scanner command | Laravel/IIS/backup task | Security owner; scanner must be available when enabled |
| Notifications | SMTP values, FCM endpoint/token, optional SMS endpoint/token | Laravel queue | Notification owner; each enabled provider must be tested by owner |
| Maps | Provider, geocoding/routing URLs, descriptive user agent | Laravel | Operations owner; provider terms and quota review |
| Commercial and operational policy | Annual pharmacy/warehouse amounts, policy version, delivery timeout, stale-location freshness window, database transaction retry attempts, retention periods, idempotency in-progress timeout | Laravel and support runbook | Product/legal/operations owner; approved pricing, privacy, location-sharing, and policy text; retry attempts must remain bounded |
| Backup protection | Backup DB account, backup directory, certificate thumbprint, retention | Native Windows scheduled task | Infrastructure owner; isolated restore procedure |
| Web release | `VITE_API_URL`, trusted web origin, IIS site and TLS certificate | React/IIS | Web owner; publish only generated `web/dist` |
| Android release | API URL, Firebase values, application ID, version, keystore and passwords | Flutter flavors/Gradle | Mobile owner; signed artifact and store account |
| iOS release | API URL, Firebase values, bundle ID, signing certificate/profile, store account | Flutter/Xcode on macOS | Mobile owner; iOS host generation and signing |

## Safe release sequence

1. Store values in the organization-approved secret manager or protected Windows environment.
2. Render `api/.env` and `web/.env.production` on the release machine with restricted ACLs.
3. Review the values for placeholders, wildcard CORS, debug mode, insecure URLs, root database identity, and partial provider credentials.
4. Run the native validator with the required backup and provider flags from the deployment owner’s release shell.
5. Register the queue, scheduler, and encrypted-backup tasks under restricted accounts.
6. Publish the API and React artifact, then prepare signed mobile artifacts using protected signing configuration.
7. Record the configuration revision, artifact hashes, migration revision, owner approvals, and rollback contact in the release record.

The implementation pass does not populate these values or execute release validation. They are external release gates because they require owner-controlled credentials, certificates, accounts, and policy decisions.
