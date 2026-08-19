# MedLine localhost testing policy

This profile is intentionally native Windows only: PHP/Laravel, MySQL, Node/npm, and Flutter Android. Docker is not used.

## Local services

- MySQL uses the `medline` database configured in `api/.env`.
- Laravel queue is `sync`, so critical notification jobs execute during the request and do not need Redis or a worker.
- Laravel cache is file-backed locally. Redis environment keys remain only as framework compatibility placeholders; no Redis server is started or contacted.
- Laravel Reverb provides live portal notifications on `127.0.0.1:8080` with `REVERB_SCALING_ENABLED=false`.
- Email is triggered through Laravel's `log` mailer. The complete generated message is written to `api/storage/logs/laravel.log`; this does not send to a real mailbox. Configure SMTP only when an SMTP account is intentionally supplied.
- Payment provider integration is disabled. The localhost subscription flow uses manually reviewed payment evidence and cash-on-delivery order payments.
- ClamAV is disabled locally (`MEDLINE_UPLOAD_SCAN_ENABLED=false`) because this workstation does not require an antivirus daemon for the test loop. Upload MIME/size validation and private storage remain enabled. Production must enable a reviewed malware-scanning boundary before accepting real documents.

## Run the portal and API

```powershell
cd api
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

In another terminal:

```powershell
cd api
php artisan reverb:start --host=127.0.0.1 --port=8080
```

In a third terminal:

```powershell
cd web
npm run dev -- --host 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001`. The local administrator is `admin@medline.local` / `ChangeMe123!`.

## Android testing

Use an Android emulator with `10.0.2.2` resolving to the host, or replace the URL with the host LAN address for a physical device:

```powershell
cd mobile
flutter pub get
flutter run --flavor development --dart-define=MEDLINE_API_URL=http://10.0.2.2:8000/api/v1
```

The Android app keeps its existing in-app notification inbox and refreshes from the API. The React portal receives live notification events through Reverb and also retains polling as a safe fallback.

## Local business defaults

The test profile uses `SYP`, 0% tax, a configurable 2,500 SYP delivery fee, annual pharmacy/warehouse plans of 120,000/240,000 SYP, and a 7-day subscription grace period. These are test assumptions, not legal or tax advice.

For prescription safety, medicines marked prescription-required remain pharmacist-review gated. Antibiotics, controlled medicines, and other high-risk categories should be configured as prescription-required before any real-world use. This conservative approach is informed by the WHO Eastern Mediterranean summary of Syria's prescription framework, which specifically notes antibiotics as excluded from non-prescription sale: https://www.emro.who.int/emhj-volume-16-2010/volume-16-issue-5/article-09.html.

The currency setting follows the current local testing assumption of the new Syrian pound (`SYP`) after the 2026 redenomination announcement; confirm display and accounting treatment with a Syrian accountant before production: https://sana.sy/en/presidency/2286703/.

## Secrets

`api/.env` and `web/.env` contain local keys and credentials and are intentionally ignored by Git. Safe templates are committed as `.env.example` files. Do not force-add local database passwords or application secrets to the GitHub repository.
