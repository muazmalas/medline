# MedLine architecture decisions

## ADR-001: Native multi-client deployment

MedLine is deployed without Docker. Laravel runs as a native PHP application behind IIS/FastCGI or a managed PHP process, React is published as static files, Flutter is released as Android/iOS binaries, and MySQL/queue/scheduler run as native services or scheduled tasks.

## ADR-002: API authority

The Laravel `/api/v1` contract is authoritative for permissions, status transitions, pricing, stock, reservations, document access, and idempotency. React and Flutter are clients and never perform critical state changes locally.

## ADR-003: Transaction boundaries

Stock locks, reservations, delivery claims, PIN completion, payment-proof records, and inventory movements are committed in database transactions. Notification persistence happens after the business mutation; external delivery is queued and retryable.

## ADR-004: Replaceable providers

Maps, push, SMS, mail, storage, and cache providers are accessed through configuration or adapters. Provider credentials are deployment secrets and are not stored in source control. OpenStreetMap is the initial map adapter; FCM/SMTP are initial notification adapters.

## ADR-005: Privacy by default

Prescriptions and payment evidence are stored privately. API responses expose controlled identifiers and authorized download endpoints, never raw storage paths or sensitive payloads. Delivery PINs are hashed for verification and encrypted only for the owning patient display flow.
