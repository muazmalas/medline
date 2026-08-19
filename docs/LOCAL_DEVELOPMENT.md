# MedLine Native Development Handoff

This project uses native Windows tooling only. Docker and container orchestration are intentionally not part of the workflow.

## Prerequisites

- PHP and Composer for Laravel.
- MySQL 8 running as a native Windows service.
- Node.js and npm for the React client.
- Flutter SDK for the mobile client.
- Optional native queue/scheduler services according to the selected deployment profile.

## Backend

1. Copy `api/.env.example` to `api/.env` and set the local MySQL connection. Keep credentials out of source control.
2. From `api`, install Composer dependencies and generate the application key on the local machine.
3. Create the local `medline` database, then run Laravel migrations and seed data when the developer is ready to initialize the environment.
4. Serve the API with the native PHP/Laravel development server.
5. Run the database queue worker and Laravel scheduler as separate native processes when exercising notifications and maintenance commands.

## React web client

1. Copy `web/.env.example` to the local web environment and set `VITE_API_URL` to the Laravel `/api/v1` URL.
2. Install npm dependencies from `web`.
3. Use the normal Vite development server for local UI work; publish only the generated `dist` directory for IIS deployment.

## Flutter mobile client

- Android emulator API host: `http://10.0.2.2:8000/api/v1`.
- Physical device API host: use the development machine LAN address.
- Supply `MEDLINE_API_URL` with `--dart-define`.
- Use the `development`, `staging`, or `production` Android flavor and keep Firebase/signing values in protected release configuration.

## Data and privacy

- Local development may use the anonymized seed data only.
- `DatabaseSeeder` is refused in production. Local/testing environments use the documented development seed password; any non-local/non-testing seed requires an explicit protected `MEDLINE_SEED_PASSWORD`.
- Never use the MySQL root account in production application configuration.
- Never commit `.env` files, API tokens, Firebase values, signing keys, private uploads, or database dumps.
- Prescriptions, verification documents, and payment proofs must remain outside public web roots.

## Handoff boundary

This guide documents setup; the project owner performs the requested migrations, builds, runtime checks, security review, provider configuration, and pilot validation separately.
