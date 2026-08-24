# MedLine

MedLine is a medication delivery and medical logistics platform for patients, pharmacies, warehouses, drivers, and administrators.

The project runs natively on Windows using PHP, Composer, Node/npm, MySQL80, and Flutter. Docker is intentionally not part of the development setup.

## Applications

- `api/` - Laravel 12 REST API with Sanctum and MySQL.
- `web/` - React + TypeScript + Vite operational dashboard.
- `mobile/` - Flutter role-based mobile client with full current-workflow portal parity.
- `MEDLINE_IMPLEMENTATION_TRACKER.md` - source of truth for implementation progress.
- `deploy/windows/` - native Windows deployment and operations guidance.
- `deploy/mobile/` - Flutter Android/web release handoff and signing guidance.
- `docs/API_WORKFLOWS.md` - versioned API workflow contract and invariants.
- `docs/MOBILE_FEATURE_PARITY.md` - screen-by-screen and major-feature Flutter parity map.
- `docs/RELEASE_HANDOFF.md` - owner release gates and final handoff record.
- `docs/ENVIRONMENT_PROMOTION_CHECKLIST.md` - no-Docker development/staging/production promotion record.
- `docs/SECURITY_REVIEW_CHECKLIST.md` - owner-led OWASP-oriented review record.
- `docs/RELEASE_NOTES_TEMPLATE.md` - secret-safe release record template.
- `docs/REQUIREMENTS_TRACEABILITY.md` - plan-to-source evidence matrix.
- `.github/workflows/quality-gates.yml` and `.github/workflows/security-audit.yml` - owner-triggered quality and dependency automation.

## Native local setup

### API

```powershell
cd api
composer install
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

The API uses the native MySQL80 service and the `medline` database. Configure credentials in `api/.env`; do not commit that file.

Seed administrator credentials for local development:

- Email: `admin@medline.local`
- Password: `ChangeMe123!`

Change this password before any shared or production use.

The destructive theater seed uses `2468` only for its pre-staged `pickup_started` and `arrived` verification scenarios. New pickup and recipient handoffs generate a fresh four-digit code and email it; no code is returned by the API or stored in decryptable form.

### Web

```powershell
cd web
npm install
npm run dev
```

The Vite dashboard runs on port `3001` and reads `VITE_API_URL` from `.env` when provided.

Convenience scripts are available from the project root:

```powershell
.\scripts\start-api.ps1
.\scripts\start-web.ps1
.\scripts\start-queue.ps1
```

Native Windows task registration is documented in `deploy/windows/register-medline-tasks.ps1`; review the task identity and secret environment before running it from an elevated PowerShell session.

Native database backup template:

```powershell
# MEDLINE_BACKUP_DB_PASSWORD must already be supplied by the protected task secret store.
.\scripts\backup-mysql.ps1
```

These scripts use native PHP and Node processes only. No Docker, containers, or container orchestration are required.

### Tests and local notifications

The validation suite is run natively; it does not open a browser or use Docker.

```powershell
cd api
php artisan test

cd ..\web
npm run test
npm run test:coverage
npm run build

cd ..\mobile
flutter analyze
flutter test --coverage
```

Backend tests use the separate native MySQL database `medline_test` so the development seed database is not reset by tests. See [`docs/LOCALHOST_TESTING_POLICY.md`](docs/LOCALHOST_TESTING_POLICY.md) for Reverb, email-log, Android, Redis, and ClamAV behavior.

### Send local emails through Gmail

Laravel already sends password-reset and enabled notification emails through its configured mailer. Gmail does not accept a normal Google Account password over SMTP. For temporary local testing, enable 2-Step Verification and create a 16-character Google App Password, then set the following values only in `api/.env`:

```dotenv
MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-account@gmail.com
MAIL_PASSWORD=your-google-app-password
MAIL_FROM_ADDRESS=your-account@gmail.com
MAIL_FROM_NAME="${APP_NAME}"
```

After saving `api/.env`, reload Laravel's configuration:

```powershell
cd api
php artisan config:clear
```

Keep `QUEUE_CONNECTION=sync` for the simplest local notification test. The password-recovery endpoint sends immediately regardless of the external notification queue. Do not commit `api/.env` or share the App Password; revoke it in your Google Account when testing is complete.

## Important safety rules

- Never use Docker for this project.
- Do not commit `.env`, credentials, prescription files, payment proofs, or real patient data.
- Do not bypass backend authorization from React or Flutter.
- Inventory changes must use transactions and row locks.
- Notifications must be dispatched after successful database commit.
- Update `MEDLINE_IMPLEMENTATION_TRACKER.md` after meaningful work.
The implementation is tracked in [`MEDLINE_IMPLEMENTATION_TRACKER.md`](MEDLINE_IMPLEMENTATION_TRACKER.md). Start each continuation from its `Current Project Status` and `Next task` fields, then use [`docs/RELEASE_HANDOFF.md`](docs/RELEASE_HANDOFF.md), [`docs/ENVIRONMENT_PROMOTION_CHECKLIST.md`](docs/ENVIRONMENT_PROMOTION_CHECKLIST.md), and [`docs/SECURITY_REVIEW_CHECKLIST.md`](docs/SECURITY_REVIEW_CHECKLIST.md) for owner gates.
