# MedLine Requirements Traceability Matrix

This matrix connects the approved implementation plan to source evidence. Runtime validation, legal approval, provider credentials, and pilot sign-off remain release gates and are intentionally not marked complete here.

| ID | Requirement / workflow | Laravel evidence | React evidence | Flutter evidence | State |
|---|---|---|---|---|---|
| AUTH-01 | Patient and partner registration, login, recovery, verification | `AuthController`, `api/routes/api.php` auth routes | `LoginPage`, settings/profile actions | `RoleGate`, `LoginScreen`, `Session` | Implemented; verification pending |
| AUTH-02 | Role and permission enforcement | Controller ownership checks, admin routes, role assignment endpoint | Role-aware navigation and management panels | Role-aware routing and session restore | Implemented; authorization testing pending |
| CAT-01 | Bilingual catalog search and suggestions | `MedicineController@index/suggestions`, category controller | Dashboard search, catalog admin, category editor | Catalog search and medicine details | Implemented; client refinement pending |
| CAT-02 | Pharmacy/warehouse availability and reservation-safe stock | Inventory, reservation, movement transactions | Inventory and procurement forms | Inventory/procurement screens | Implemented |
| ORDER-01 | Cart checkout, price validation, prescription gate, cancellation | `CartController`, `OrderController`, `PrescriptionController` | Order queue, prescription review, detail/timeline | Cart, checkout, upload, order detail | Implemented; end-to-end validation pending |
| PROC-01 | Pharmacy-to-warehouse procurement | `ProcurementController`, idempotency and reservation logic | Request form, queue, detail/timeline | Procurement create and decision screens | Implemented |
| DEL-01 | Driver claim, status progression, privacy-scoped latest location, PIN completion, reassignment | `DeliveryController`, delivery events, location migration, lockout migration | Patient/partner/admin delivery monitoring | Driver claim/status/location/PIN workflow | Implemented; concurrency and device-permission validation pending |
| SUB-01 | Annual partner subscription and payment evidence | `SubscriptionController`, plan metadata migration, maintenance command | Subscription plan/proof page and admin review | Subscription status/proof upload | Implemented; provider/pricing gates pending |
| NOT-01 | In-app, push, email, SMS abstraction and preferences | `NotificationService`, queued dispatch job, preferences | Notification popover/settings | Notification inbox/preferences/FCM registration | Implemented; provider credentials pending |
| SUP-01 | Complaints, private evidence, ratings, moderation | Complaint/rating controllers, attachment migration, admin moderation | Complaint detail/report and ratings moderation | Support and rating screens | Implemented; policy/pilot validation pending |
| OPS-01 | Admin operations, dashboards, alerts, audit, role management | Admin/dashboard/audit controllers | Admin queues, alerts, role panel, exports | Role home and profile operations | Implemented; operational acceptance pending |
| SEC-01 | Private files, signed URLs, encryption, audit, consent | File scanner, signed routes, encrypted fields, audit/consent services | Authorized private download actions | Secure storage and upload boundaries | Implemented; security review pending |
| SEC-02 | Dependency and OWASP-oriented release security controls | `.github/workflows/security-audit.yml`, `docs/SECURITY_REVIEW_CHECKLIST.md`, release configuration guard | React dependency lock and deployment CSP | Flutter dependency lock and secure platform configuration | Source controls implemented; owner scan/review pending |
| OPS-02 | Liveness/readiness monitoring and observable release operations | `/health`, `/health/ready`, notification health endpoint | Operational health panels and delivery refreshes | Connectivity/reconnect indicators and queued-update status | Implemented; monitoring registration and alert validation pending |
| REL-01 | Repeatable no-Docker environment promotion and artifact integrity | Native Windows deployment scripts and `record-release-manifest.ps1` | React artifact and IIS security policy | Flutter flavors and release artifact handoff | Source handoff implemented; secrets, signing, promotion, and owner approval pending |
| MOB-01 | Native Flutter Android application with environment flavors | N/A | N/A | `mobile/android/app/build.gradle.kts`, shared Flutter shell | Implemented; release signing pending |

## Release-gate categories

- Owner decisions: payment provider, legal/prescription policy, zones, fees, retention periods, domains, and production secrets.
- Verification requested by the project owner: migrations, API behavior, React build, Flutter analysis/build, concurrency, security review, backups, and pilot workflows.
- Deployment handoff: native Windows services, queue worker, scheduler, private storage ACLs, HTTPS, monitoring, and release signing.
