# MedLine Contribution and Release Conventions

## Scope

MedLine is maintained as three native applications: the Laravel API, the React web client, and the Flutter mobile client. Docker and container-based development are intentionally out of scope.

## Before changing code

1. Read `MEDLINE_IMPLEMENTATION_TRACKER.md` and continue from its `Current Project Status` and `Next task` fields.
2. Preserve existing user changes and update the tracker after every meaningful implementation change.
3. Keep API behavior documented in `docs/API_CONTRACT.md`, `docs/API_WORKFLOWS.md`, and `docs/openapi.yaml` when endpoints or response contracts change.
4. Never commit `.env` files, credentials, private medical documents, payment proofs, tokens, or real patient data.

## Change conventions

- Keep backend authorization authoritative; clients must not implement security by convention only.
- Use database transactions and row locks for inventory, order, procurement, delivery, subscription, and other critical state changes.
- Use the existing idempotency-key conventions for retryable mutations.
- Dispatch notifications after successful database commit and preserve request correlation IDs in operational errors.
- Keep Arabic and English copy in the shared localization catalogs and preserve RTL/LTR behavior.
- Prefer small, reviewable changes with explicit tracker evidence and changed-file references.

## Verification ownership

The implementation pass may add or update verification assets, but the project owner controls when tests, builds, browser checks, migrations, and runtime verification are executed. Any verification command used during handoff must be recorded in the tracker; do not claim a green result without executing the relevant check.

## Native release flow

- Backend: PHP/Composer/Laravel with native MySQL80, queue worker, and scheduler.
- Web: Node/npm/Vite with the configured API URL.
- Mobile: Flutter with the configured flavor and owner-supplied signing/Firebase values.
- Production secrets, DNS, certificates, provider credentials, signing keys, and app-store accounts remain deployment-owner gates.

## Definition of done

A change is ready for owner verification when its source workflow, authorization boundary, failure/retry behavior, documentation impact, localization impact, and tracker entry are addressed. Runtime confidence is established only after the owner runs the appropriate verification checks.
