# MedLine Pharmacy Delivery Platform

## End-to-End Production Implementation Plan and Tracker

**Project:** MedLine medication delivery and medical logistics platform  
**Launch market:** Syria  
**Languages:** Arabic and English with RTL/LTR support  
**Web:** React.js and TypeScript  
**Backend:** Laravel REST API  
**Database:** MySQL  
**Mobile:** Flutter role-based application  
**Maps:** OpenStreetMap-based provider abstraction  
**Payment model:** Cash on delivery plus manually verified wallet/payment evidence  
**Subscription model:** Annual pharmacy and warehouse subscriptions  

---

## Active Implementation Goal

**Goal:** Implement the complete MedLine production solution described by this plan across the Laravel/MySQL backend, React web portals, Flutter mobile client, operational notifications, critical transactions, security, auditability, native Windows deployment, and release documentation.

**Execution rule:** Continue from this tracker after context loss. Preserve completed work, implement the next unfinished source task, and record every meaningful change here. Automated tests, static analysis, and production-shaped builds are run by the implementation agent; interactive browser and device acceptance remain owner checks.

**Scope constraints:** React/TypeScript web client, Laravel REST API, MySQL database, Flutter mobile client, native Windows tooling, and no Docker.

**Completion contract:** The goal is complete when all in-scope source workflows, role permissions, critical transaction boundaries, notifications, audit records, client entry points, deployment templates, and handoff documentation are implemented. External deployment values—DNS, HTTPS certificates, production secrets, provider credentials, app-store accounts, and signing keys—remain explicit owner-supplied release gates, not hidden assumptions.

**Current goal state:** Source implementation is complete for the requested Laravel/MySQL, React, Flutter, notification, critical-transaction, security, and native deployment scope. The authoritative next action is the owner validation gate in Current Project Status.

---

## How to Use This File

This document is the durable project source of truth. Update it whenever a task is started, completed, blocked, or changed.

Task status convention:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[!]` Blocked
- `[-]` Deferred or intentionally out of scope

When context is lost, read these sections in order:

1. Current Project Status
2. Product Decisions and Assumptions
3. Current Phase and Next Task
4. Relevant implementation phase
5. Architecture and business rules
6. Open Decisions, Risks, and Blockers

Every completed task should include a short note in the Implementation Log.

---

## Current Project Status

| Field | Value |
|---|---|
| Current phase | Localhost integration and validation - Phases 13, 23, 24 |
| Current task | Run backend, web, and Android Flutter validation against the local MySQL profile |
| Last completed task | Added local Reverb broadcasting, Echo subscription, email-log triggering, no-Redis/no-ClamAV defaults, local business assumptions, and Android test instructions |
| Next task | Record test results, commit the single repository, and push `git@github.com:muazmalas/medline.git` |
| Blockers | No source blocker; production secrets, DNS/HTTPS, signing keys, and provider accounts must be supplied by the deployment owner |
| Backend status | Core B2C/B2B domain, bounded database transactions, compensated private uploads, security boundaries, notifications, dashboards, and operational APIs implemented; owner verification pending |
| React status | Authenticated role-aware dashboards, localized metric cards, live operational refreshes, catalog, partner management, prescription review, procurement, privacy-scoped delivery monitoring with validated OpenStreetMap embedding, support, notifications, and settings implemented |
| Flutter status | Role-gated shell, sign-in/session flow, patient ordering, partner queues, live dashboard metrics, driver delivery lifecycle, scoped encrypted offline mutation replay, Android flavors, and web host implemented |
| Database status | Initial production-shaped schema migrated and seeded |
| Testing status | Laravel 23 tests/64 assertions and React 5 UI tests pass; React coverage is 10.29% statements and 17.39% lines, while Laravel percentage coverage awaits Xdebug/PCOV; Flutter widget tests are authored but SDK execution remains blocked; interactive browser/device acceptance remains an owner check |
| Deployment status | Native Windows and Flutter mobile release handoff documentation created; IIS CSP now explicitly permits only the OpenStreetMap embed origin; signing/provider secrets remain deployment-owner configuration |
| Last updated | 2026-08-19 |

### Context recovery checklist

- [ ] Read this file completely if the current task is unclear.
- [ ] Confirm the current phase and next task above.
- [ ] Inspect the repository before changing files.
- [ ] Preserve completed work and existing user changes.
- [ ] Update this tracker after meaningful work.
- [ ] Record changed files and verification commands in the Implementation Log.

---

## Product Summary

MedLine connects patients, pharmacies, medical warehouses, and drivers through a secure medication ordering and logistics platform. It supports both:

- B2C delivery from pharmacies to patients.
- B2B procurement and delivery from warehouses to pharmacies.

The existing thesis and screenshots define the visual direction and principal workflows. The production implementation formalizes those workflows with explicit permissions, status transitions, transaction boundaries, audit trails, recovery paths, and automated testing.

---

## Product Decisions and Assumptions

- [x] Launch market is Syria.
- [x] One Flutter application uses role-based onboarding and navigation.
- [x] React web portals are provided for admin, pharmacies, and warehouses.
- [x] Patients and drivers are mobile-first.
- [x] Drivers use a first-available claim model for delivery jobs.
- [x] Admin can intervene, reassign, cancel, or override deliveries.
- [x] Prescription-required medicines require pharmacist approval.
- [x] Patient orders support cash on delivery.
- [x] Pharmacy and warehouse subscriptions support manual wallet/payment proof review.
- [x] Partner subscriptions are annual by default.
- [x] Mapping starts with an OpenStreetMap-based provider abstraction.
- [x] Arabic and English are release requirements.
- [x] The initial backend is a modular Laravel monolith with clear module boundaries.
- [ ] Confirm exact Syrian payment/wallet provider and merchant process.
- [x] Adopt conservative localhost prescription defaults: pharmacist review for prescription-required, antibiotics, controlled, and high-risk medicines; production legal confirmation remains required.
- [ ] Confirm delivery coverage areas and service hours.
- [x] Set localhost defaults: SYP, 0% tax, 2,500 delivery fee, annual plans 120,000/240,000, and 7-day grace period; production accounting confirmation remains required.
- [ ] Confirm production hosting provider and domain names.

---

## Actors and Permissions

### Patient

- Register, verify account, manage profile and addresses.
- Search medicines and pharmacies.
- Create and manage cart and orders.
- Upload prescriptions.
- View approved prescriptions and order history.
- Track delivery and display delivery PIN.
- Confirm receipt and pay cash.
- Submit complaints and ratings.

### Pharmacy

- Submit registration, license, identity, location, and payment evidence.
- Manage pharmacy profile and medicine inventory.
- Accept, partially accept, or reject patient orders.
- Review and approve or reject prescriptions.
- Create procurement orders from warehouses.
- Manage pharmacy deliveries and order history.
- Submit complaints and view reports.

### Warehouse

- Submit registration, license, identity, location, and payment evidence.
- Manage warehouse medicine inventory.
- Accept or reject pharmacy procurement orders.
- Prepare accepted orders for dispatch.
- Manage warehouse deliveries and order history.
- Submit complaints and view reports.

### Driver

- Submit employment/application documents.
- Set availability.
- View eligible delivery jobs.
- Claim one available job safely.
- View pickup and drop-off addresses.
- Update delivery status.
- Use maps and contact details.
- Verify delivery PIN.
- View delivery history.

### Admin

- Manage users, roles, partners, drivers, medicines, plans, and settings.
- Review licenses, applications, subscriptions, and payment evidence.
- Monitor orders, deliveries, complaints, ratings, and audit logs.
- Intervene in delivery and order problems.
- Manage notification templates and operational reports.

---

## Core Business Workflows

### Patient order workflow

1. Patient searches for a medicine or pharmacy.
2. Patient selects medicine, quantity, address, and optional notes.
3. Patient uploads a prescription if required.
4. System creates the order in `pending_pharmacy_review` state.
5. Pharmacy reviews order and prescription.
6. Pharmacy accepts, partially accepts, or rejects the order.
7. Accepted quantities are reserved transactionally.
8. Delivery job becomes available to eligible drivers.
9. First eligible driver claims the job.
10. Driver picks up the order and changes status to in transit.
11. Patient receives tracking updates and the delivery PIN.
12. Driver delivers the order and enters the PIN.
13. System validates the PIN once, records confirmation, and marks the order completed.
14. Patient pays cash and the payment status is recorded.

### Pharmacy-to-warehouse procurement workflow

1. Pharmacy searches warehouse medicines.
2. Pharmacy creates a procurement order with quantities.
3. Warehouse reviews and accepts or rejects the request.
4. Accepted quantities are reserved transactionally.
5. Delivery job becomes available to drivers.
6. Driver claims and delivers the order.
7. Receiving party confirms using a secure PIN.
8. Inventory movement records are written for both organizations.

### Partner onboarding workflow

1. Pharmacy or warehouse submits registration details and documents.
2. Partner submits annual subscription payment evidence.
3. Admin reviews identity, license, location, and payment evidence.
4. Admin approves, rejects, or requests corrections.
5. Approved partner receives access based on subscription status.
6. Expiration reminders are sent before the annual renewal date.

### Driver workflow

1. Driver submits application and documents.
2. Admin approves the driver.
3. Driver sets availability.
4. Driver sees eligible unclaimed delivery jobs.
5. Driver claims one job using an atomic operation.
6. Driver performs pickup, transit, and delivery status changes.
7. Driver enters the delivery PIN.
8. System completes the delivery and prevents PIN reuse.

---

## Required Order and Delivery Statuses

### Patient order statuses

`draft` → `pending_pharmacy_review` → `prescription_review` → `accepted` / `partially_accepted` / `rejected` → `ready_for_delivery` → `driver_claimed` → `picked_up` → `in_transit` → `delivered` → `completed`

Possible terminal or recovery statuses:

`cancelled`, `expired`, `failed_delivery`, `refunded`, `disputed`.

### Procurement order statuses

`draft` → `pending_warehouse_review` → `accepted` / `rejected` → `ready_for_delivery` → `driver_claimed` → `picked_up` → `in_transit` → `delivered` → `completed`.

### Subscription statuses

`pending_payment`, `payment_under_review`, `active`, `expiring_soon`, `expired`, `rejected`, `cancelled`.

### Delivery statuses

`available`, `claimed`, `pickup_started`, `picked_up`, `in_transit`, `arrived`, `delivered`, `failed`, `cancelled`, `reassigned`.

No client may directly set an arbitrary status. Every transition must be validated by the backend according to actor, previous state, required data, and business rules.

---

## Target Repository Structure

The final structure should be organized so each client can be developed and deployed independently:

```text
medline/
├── api/                 # Laravel application
├── web/                 # React application
├── mobile/              # Flutter application
├── database/            # Optional SQL, seed, and reference data
├── docs/                # API, architecture, decisions, and operations
├── .github/             # CI/CD workflows
└── MEDLINE_IMPLEMENTATION_TRACKER.md
```

---

# Implementation Phases

## Phase 0 - Project Initialization and Governance

- [x] Inspect the workspace and preserve existing files.
- [x] Create repository structure for `api`, `web`, and `mobile`.
- [ ] Initialize Git branches and contribution conventions.
- [x] Add `.editorconfig`, `.gitignore`, and environment examples.
- [x] Document local development prerequisites.
- [x] Define branch, commit, pull request, and release conventions in `CONTRIBUTING.md`.
- [x] Define definition of ready and definition of done in `CONTRIBUTING.md`.
- [ ] Add this tracker to version control.
- [x] Create an initial architecture decision record.

**Completion criteria:** Every application has a documented local start command, environment template, and baseline health check.

## Phase 1 - Discovery, Requirements, and Domain Specification

- [x] Extract and normalize thesis requirements into the role, workflow, state-machine, notification, privacy, and traceability sections of this tracker and `docs/DOMAIN_SPECIFICATION.md`.
- [x] Map the thesis use cases to production workflows in `docs/DOMAIN_SPECIFICATION.md` and `docs/REQUIREMENTS_TRACEABILITY.md`; owner/legal policy confirmation remains a release gate.
- [x] Confirm implemented partner onboarding and approval rules in `docs/DOMAIN_SPECIFICATION.md`; legal/owner policy validation remains a release gate.
- [x] Confirm implemented prescription-required categories and pharmacist review policy in `docs/DOMAIN_SPECIFICATION.md`; legal validation remains a release gate.
- [ ] Confirm delivery zones, hours, fees, and service availability.
- [ ] Confirm payment evidence format and manual approval process.
- [ ] Confirm annual subscription pricing and grace period.
- [x] Define order, procurement, delivery, subscription, complaint, and payment state machines in `docs/DOMAIN_SPECIFICATION.md`.
- [x] Define role and permission matrix in `docs/DOMAIN_SPECIFICATION.md`.
- [x] Define notification event matrix in `docs/DOMAIN_SPECIFICATION.md`.
- [x] Define data-retention and document-access policies.
- [x] Produce a requirements traceability matrix (`docs/REQUIREMENTS_TRACEABILITY.md`).

**Completion criteria:** No critical business workflow remains ambiguous; all status transitions and permissions are documented.

## Phase 2 - UX/UI Design System

- [x] Preserve MedLine brand direction from the screenshots in the implemented web/mobile visual foundation.
- [x] Define color, typography, spacing, elevation, icon, and motion tokens in `docs/DESIGN_SYSTEM.md` and the client themes/styles.
- [x] Design reusable buttons, inputs, tables, cards, dialogs, tabs, status badges, timelines, uploads, and maps as implemented client patterns.
- [x] Design Arabic RTL and English LTR versions in the shared localization/direction behavior.
- [x] Design responsive desktop, tablet, and mobile web behavior in the shared layouts and mobile Material surfaces.
- [x] Design admin dashboard and operational queues.
- [x] Design pharmacy inventory and patient-order workflows.
- [x] Design warehouse inventory and procurement workflows.
- [x] Design patient mobile onboarding, search, cart, order, and tracking workflows.
- [x] Design driver mobile claim, navigation, and PIN workflows.
- [x] Design loading, empty, error, offline, retry, and permission-denied states.
- [x] Add accessibility annotations and keyboard/focus behavior to the React navigation shell; broader screen-reader review remains a release gate.
- [ ] Validate prototypes with representatives of every actor.

**Completion criteria:** Approved design system and clickable flows for every critical workflow in both languages.

## Phase 3 - Database Design and MySQL Migrations

- [x] Create ERD and relationship documentation.
- [x] Create users, roles, permissions, and role assignment tables.
- [x] Create patient, pharmacy, warehouse, and driver profile tables.
- [x] Create partner documents and approval tables.
- [x] Create medicines, translations, categories, and manufacturer tables.
- [x] Create pharmacy and warehouse inventory tables.
- [x] Create inventory movement and reservation tables.
- [x] Create addresses and location tables.
- [x] Create patient order and order-item tables.
- [x] Create procurement order and procurement-item tables.
- [x] Create prescription and prescription-review tables.
- [x] Create delivery, delivery-claim, and delivery-event tables.
- [x] Create subscriptions, plans, payment proofs, and payment records.
- [x] Create complaints, ratings, notifications, and device-token tables.
- [x] Create audit-log and system-setting tables.
- [x] Add foreign keys, unique constraints, check constraints, and indexes.
- [x] Use public identifiers alongside internal numeric keys where required.
- [x] Use decimal values for money and integer values for quantities.
- [x] Define soft-delete/non-destructive deactivation policy for each applicable entity.
- [x] Create realistic seed data without real personal information.
- [ ] Test migration rollback and clean installation.

**Completion criteria:** A clean database can be created from migrations and supports all approved workflows without ambiguous ownership.

## Phase 4 - Laravel Backend Foundation

- [x] Initialize Laravel application and API versioning.
- [x] Configure MySQL, Redis-compatible queue/cache, storage, and mail environment contracts.
- [x] Establish module/service boundaries.
- [x] Configure centralized exception handling.
- [x] Define consistent JSON success and error responses.
- [x] Add request validation and authorization policies.
- [x] Add API pagination, filtering, sorting, and resource transformers.
- [x] Add structured logging with sensitive-data redaction.
- [x] Add health, readiness, and dependency checks.
- [x] Add OpenAPI/API documentation.
- [x] Add queue worker and scheduler configuration.
- [x] Add rate limiting and API throttling.
- [x] Add application configuration for storage and map providers.

**Completion criteria:** The API starts cleanly, exposes versioned health endpoints, validates requests, and has documented conventions for all modules.

## Phase 5 - Authentication, Identity, Roles, and Permissions

- [x] Implement registration for patients, pharmacies, warehouses, and drivers.
- [x] Implement login, short-lived access tokens, hashed single-use refresh-token rotation, HttpOnly browser-cookie transport, logout, password-reset revocation, and session revocation (`AuthController`, `RefreshToken`, `POST /auth/refresh`).
- [x] Implement email verification according to the approved market process.
- [x] Implement password reset and account recovery.
- [x] Implement optional admin two-factor authentication with API enforcement, React setup/login controls, and Flutter login plus authenticated setup/confirmation/disable controls.
- [x] Implement role and permission policies.
- [x] Implement device-token registration and revocation.
- [x] Implement account suspension and reactivation.
- [x] Implement login throttling and suspicious-activity logging.
- [ ] Add authorization tests for every role and protected resource.

**Completion criteria:** No protected resource can be accessed without both authentication and server-side authorization.

## Phase 6 - Partner Onboarding, Documents, and Subscriptions

- [x] Implement pharmacy application submission.
- [x] Implement warehouse application submission.
- [x] Implement driver application submission.
- [x] Implement license, identity, and supporting document uploads.
- [x] Validate file type, size, MIME type, and image/PDF rules.
- [x] Store sensitive files privately.
- [x] Implement admin review, approval, rejection, and correction requests.
- [x] Implement annual subscription plans (configurable partner-specific annual plans with persisted code/duration; approved prices remain environment configuration).
- [x] Implement manual payment-proof upload.
- [x] Implement admin payment-proof review.
- [x] Implement subscription activation and expiration.
- [x] Implement renewal reminders and grace period.
- [x] Restrict partner operations when subscription access is invalid.
- [x] Add audit records for every review and payment decision.

**Completion criteria:** A partner can safely progress from application to approved, subscribed, operational status with full document and payment auditability.

## Phase 7 - Medicine Catalog and Inventory

- [x] Implement medicine catalog management.
- [x] Support Arabic and English medicine names.
- [x] Store manufacturer, dosage/form, prescription requirement, barcode/code, and product image.
- [x] Implement pharmacy inventory.
- [x] Implement warehouse inventory.
- [x] Implement quantity, price, availability, and low-stock thresholds.
- [x] Implement inventory movement ledger.
- [x] Implement stock adjustment with reason and audit record.
- [x] Prevent negative stock.
- [x] Implement medicine image upload and private/public storage rules.
- [x] Add search indexes and query optimization.
- [x] Add medicine import/export only with validation and audit records.

**Completion criteria:** Inventory balances are explainable from movement records and cannot become negative through supported API operations.

## Phase 8 - Search and Discovery

- [x] Implement debounced catalog search and suggestion endpoints with Laravel caching, empty-result recovery metadata, and stale-response-safe React/Flutter client debouncing.
- [x] Implement autocomplete suggestions.
- [x] Implement multi-field search across Arabic name, English name, manufacturer, and code.
- [x] Implement bounded typo-tolerant/fuzzy matching for catalog suggestions with match scores.
- [x] Implement pharmacy and warehouse search.
- [x] Implement availability and location filters.
- [x] Implement pagination and sorting.
- [x] Implement highlighted matching fields in API response.
- [x] Implement useful empty-state suggestion metadata for empty catalog searches; client presentation remains a refinement.
- [x] Cache safe, frequently requested catalog suggestion results with a short TTL.
- [ ] Test Arabic tokenization and RTL display.

**Completion criteria:** Search remains responsive under realistic catalog size and gives useful results for exact, partial, Arabic, English, and mistyped input.

## Phase 9 - Patient Orders and Prescription Approval

- [x] Implement cart creation and update with persistent multi-item mobile checkout.
- [x] Implement server-side price and availability validation.
- [x] Implement order creation with idempotency keys.
- [x] Implement prescription upload.
- [x] Implement pharmacist prescription review.
- [x] Implement order accept, partial accept, reject, and cancellation rules.
- [x] Implement patient order status timeline.
- [x] Implement order invoice/summary.
- [x] Implement delivery address snapshotting at order time.
- [x] Implement secure prescription access controls.
- [x] Implement cash-on-delivery payment status.
- [x] Implement patient order history.
- [x] Add notifications for every customer-visible status change.

**Completion criteria:** A patient can complete a valid order from search to delivery preparation, while invalid prescriptions, unavailable stock, duplicate requests, and unauthorized access are rejected safely.

## Phase 10 - Pharmacy-to-Warehouse Procurement

- [x] Implement pharmacy warehouse discovery.
- [x] Implement warehouse medicine search.
- [x] Implement procurement cart and order creation.
- [x] Implement warehouse accept/reject/partial fulfillment rules.
- [x] Implement pharmacy and warehouse order histories.
- [x] Implement procurement invoice/summary.
- [x] Implement inventory reservation and release rules.
- [x] Implement procurement delivery creation.
- [x] Implement procurement-specific notifications.
- [x] Add audit history for accepted and rejected quantities.

**Completion criteria:** A pharmacy can procure available medicine from a warehouse with consistent quantities, pricing, reservations, delivery, and inventory movements.

## Phase 11 - Delivery Dispatch, Maps, and PIN Confirmation

- [x] Implement delivery job creation after order readiness.
- [x] Implement eligible-driver filtering.
- [x] Implement first-available driver claim.
- [x] Implement claim timeout and job release rules.
- [x] Implement pickup, transit, arrival, and failed-delivery statuses.
- [x] Implement driver location/address access according to privacy rules.
- [x] Implement OpenStreetMap geocoding/routing adapter.
- [x] Keep map provider behind a replaceable interface.
- [x] Implement secure random delivery PIN generation.
- [x] Store only a secure representation of the PIN where possible.
- [x] Implement limited PIN attempts and lockout behavior.
- [x] Prevent PIN reuse and duplicate completion.
- [x] Implement failed-delivery and reassignment workflow.
- [x] Implement admin delivery override with reason.

**Completion criteria:** One driver can claim and complete a delivery safely; the same delivery cannot be claimed or completed twice.

## Phase 12 - Complaints, Ratings, and Support

- [x] Implement complaint creation by eligible actors.
- [x] Restrict complaints to valid related orders or services.
- [x] Implement complaint categories, priority, and status.
- [x] Implement admin assignment and response.
- [x] Implement evidence attachments with private storage.
- [x] Implement rating rules after completed orders only.
- [x] Prevent duplicate ratings unless admin correction is authorized.
- [x] Notify affected users of complaint status changes.
- [x] Add support/admin reporting.

**Completion criteria:** Complaints and ratings are traceable to real transactions and can be managed without exposing unrelated private data.

## Phase 13 - Notification System

### Notification channels

- [x] In-app notifications.
- [x] Firebase Cloud Messaging push notifications.
- [x] Email provider integration where available.
- [x] SMS provider abstraction for future or approved use.
- [x] User notification preferences.
- [x] Device-token registration, refresh, and deletion.
- [x] Localization for Arabic and English notification content.

### Notification events

- [x] Registration submitted.
- [x] Registration approved.
- [x] Registration rejected.
- [x] Correction requested.
- [x] Subscription payment evidence submitted.
- [x] Subscription approved.
- [x] Subscription rejected.
- [x] Subscription expiring soon.
- [x] Subscription expired.
- [x] Patient order created.
- [x] Prescription awaiting review.
- [x] Prescription approved.
- [x] Prescription rejected.
- [x] Order accepted.
- [x] Order partially accepted.
- [x] Order rejected.
- [x] Order cancelled.
- [x] Delivery job available.
- [x] Delivery claimed by driver.
- [x] Driver approaching or arrived.
- [x] Order picked up.
- [x] Order in transit.
- [x] Delivery failed.
- [x] Delivery PIN available.
- [x] Delivery completed.
- [x] Payment recorded.
- [x] Procurement order created.
- [x] Procurement order accepted or rejected.
- [x] Complaint created.
- [x] Complaint updated.
- [x] Complaint resolved.

### Notification reliability rules

- [x] Dispatch notifications from domain events after successful database commit.
- [x] Use queued jobs for external channels.
- [x] Use retry and backoff for transient provider failures.
- [x] Store notification delivery attempts and provider responses.
- [x] Make notifications idempotent where repeated events are possible.
- [x] Do not include prescriptions, PINs, or sensitive documents in insecure messages.
- [x] Provide user-visible notification history.
- [x] Localize notification content for Arabic and English users.
- [x] Monitor queue failures and notification delivery rate.

**Completion criteria:** Core business transactions do not fail because a notification provider is unavailable, and users receive localized updates with retryable delivery behavior.

## Phase 14 - React Admin Web Portal

- [x] Create protected admin routing and layout.
- [x] Create dashboard metrics and operational alerts.
- [x] Create pharmacy application queue.
- [x] Create warehouse application queue.
- [x] Create driver application queue.
- [x] Create document and payment-proof review screens.
- [x] Create user and role management.
- [x] Create pharmacy, warehouse, and driver management.
- [x] Create medicine and category management (medicine management and category APIs, import/export, and React category create/edit controls are implemented).
- [x] Create subscriptions and renewal management.
- [x] Create orders and deliveries monitoring.
- [x] Create driver intervention and reassignment tools.
- [x] Create complaints and ratings management (complaint workflow and audited administrator rating hide/restore moderation are implemented).
- [x] Create reports and export controls (administrator audit CSV export is implemented).
- [x] Create audit-log viewer with filters.
- [x] Add Arabic/English and RTL/LTR support (React direction, profile locale, shared navigation, role labels, operational queues, localized delivery detail/location monitoring, admin catalog/category/edit forms, dashboard alerts/health, ratings, and live dashboard copy are wired; Laravel notification mojibake normalization is corrected; remaining legacy/demo copy and owner validation are non-blocking refinement gates).
- [x] Add loading, error, empty, and confirmation states.

**Completion criteria:** Admin can operate every approval, monitoring, intervention, and reporting workflow without direct database access.

## Phase 15 - React Pharmacy Portal

- [x] Create pharmacy authentication and subscription guard.
- [x] Create dashboard.
- [x] Create medicine inventory list, search, filters, and pagination.
- [x] Create add/edit/delete medicine flows with validation (delete is implemented as safe deactivation and edit is protected by the Laravel update endpoint).
- [x] Create patient order queue.
- [x] Create prescription review screen.
- [x] Create order details and status timeline.
- [x] Create warehouse discovery and medicine search.
- [x] Create procurement order flow.
- [x] Create ongoing and completed delivery views.
- [x] Create profile, documents, subscription, complaints, and reports.
- [x] Add notifications and unread indicators.
- [x] Add Arabic/English and RTL/LTR support through the shared locale-aware operations queue, inventory form, table states, and pharmacy actions.

**Completion criteria:** Pharmacy staff can manage inventory, fulfill patient orders, procure from warehouses, and monitor delivery using the web portal.

## Phase 16 - React Warehouse Portal

- [x] Create warehouse authentication and subscription guard.
- [x] Create dashboard.
- [x] Create inventory management.
- [x] Create medicine search and filters.
- [x] Create incoming procurement queue.
- [x] Create accept/reject/partial fulfillment flows.
- [x] Create procurement order detail and status timeline.
- [x] Create delivery preparation and tracking views.
- [x] Create profile, documents, subscription, complaints, and reports.
- [x] Add notifications and unread indicators.
- [x] Add Arabic/English and RTL/LTR support through the shared locale-aware operations queue, inventory form, table states, and warehouse actions.

**Completion criteria:** Warehouse staff can maintain inventory, process pharmacy requests, and complete dispatch operations.

## Phase 17 - Flutter Foundation and Shared Mobile Experience

- [x] Initialize Flutter project and supported Android versions.
- [x] Configure flavors for development, staging, and production.
- [x] Implement design tokens and reusable widgets.
- [x] Implement Arabic/English localization and RTL/LTR switching (Flutter locale selection, profile persistence, role labels, action cards, navigation labels, patient catalog/cart/checkout/notification labels, localized order-detail map action and map error, subscription payment/status, partner inventory, support, procurement, driver dialogs and availability, prescription feedback, rating dialogs, order-detail invoice/timeline, dashboard metrics, and empty states are wired; owner RTL validation remains a release gate).
- [x] Implement secure token storage.
- [x] Implement API client, interceptors, retries, and error mapping.
- [x] Implement authentication and role-based routing for patients, pharmacies, warehouses, drivers, and administrators.
- [x] Implement push notification registration (configuration-gated Firebase Messaging token registration, refresh, and logout revocation are wired; release Firebase values remain owner-supplied).
- [x] Implement image and document upload abstraction.
- [x] Implement local encrypted cache for safe read-only data.
- [x] Implement offline and reconnect states (safe GET retries, one-retry access-token recovery, API connectivity signaling, encrypted per-user cached-read fallback, localized reconnect/queued-update banners, and an encrypted user-scoped idempotent queue for profile locale, notification preferences, consent changes, and driver availability are wired; critical order, payment, prescription, and delivery mutations remain online-only by design).
- [x] Implement crash reporting and privacy-safe analytics boundary (optional protected endpoint; sensitive fields are filtered and telemetry failures are non-blocking).
- [x] Implement accessibility and supported screen-size behavior (role-action semantics, responsive workspace width, shared navigation labels, keyboard focus states, reduced-motion handling, coarse-pointer touch targets, high-contrast styling, labeled role-home notification/reconnect controls, and a shared React mutation-failure live-region announcer are wired; broader screen-reader review remains a release gate).

**Completion criteria:** The Flutter app can authenticate all supported roles and render role-specific navigation with shared, tested foundations.

## Phase 18 - Flutter Patient Experience

- [x] Implement patient onboarding and account setup.
- [x] Implement pharmacy discovery with an approved-pharmacy mobile directory.
- [x] Implement medicine search and suggestions with debounced catalog results and detail navigation.
- [x] Implement medicine and pharmacy details.
- [x] Implement cart and checkout.
- [x] Implement address management and map selection.
- [x] Implement prescription capture/upload.
- [x] Implement order status timeline.
- [x] Implement delivery tracking (status timeline and privacy-scoped latest driver location are wired through Laravel, React operational delivery detail, and Flutter foreground tracking with bounded order-detail refresh polling; React now renders a validated OpenStreetMap embed with an external fallback, while stale-location suppression and foreground-only tracking are enforced; owner location-permission validation remains a release gate).
- [x] Implement secure delivery PIN display.
- [x] Implement order history and receipts.
- [x] Implement complaints, ratings, notifications, profile, and settings.

**Completion criteria:** A patient can complete the complete mobile journey from registration through confirmed delivery.

## Phase 19 - Flutter Pharmacy and Warehouse Experiences

- [x] Implement partner dashboard.
- [x] Implement inventory management.
- [x] Implement patient order processing for pharmacies.
- [x] Implement prescription review for pharmacies.
- [x] Implement procurement for pharmacies.
- [x] Implement procurement acceptance for warehouses.
- [x] Implement delivery preparation and status updates.
- [x] Implement subscription and payment-proof flows.
- [x] Implement profile and document views.
- [x] Implement complaints, notifications, and history.

**Completion criteria:** Pharmacy and warehouse users can complete operational workflows on mobile in addition to web.

## Phase 20 - Flutter Driver Experience

- [x] Implement driver application and document submission.
- [x] Implement approval and availability state.
- [x] Implement available delivery list.
- [x] Implement atomic delivery claim UX.
- [x] Implement delivery details and privacy-safe contact information.
- [x] Implement map and navigation launch plus foreground location permission/provider abstraction.
- [x] Implement pickup and transit status actions.
- [x] Implement arrival and failed-delivery actions.
- [x] Implement PIN entry and completion result.
- [x] Implement delivery history and notifications.
- [x] Handle network failure during claim, status, failure, completion, and partner decision updates using stable idempotency keys, bounded same-key retries, and user-facing retry actions.

**Completion criteria:** Driver can claim, navigate, update, and complete a delivery safely, including recovery from temporary network failures.

## Phase 21 - Critical Transactions and Concurrency Control

### Stock reservation

- [x] Wrap stock-sensitive operations in database transactions.
- [x] Lock inventory rows using `SELECT ... FOR UPDATE` or equivalent.
- [x] Re-check stock after lock acquisition.
- [x] Create reservations before external notifications.
- [x] Release reservations on rejection, cancellation, expiry, or failed delivery.
- [x] Write inventory movement ledger entries atomically.
- [x] Add database constraints preventing negative stock.

### Duplicate request protection

- [x] Add idempotency keys to order creation.
- [x] Add idempotency keys to payment-proof submission.
- [x] Add idempotency keys to status-changing requests where needed.
- [x] Store idempotency result and safely replay successful responses.
- [ ] Test retries after client timeout.

### Driver claim protection

- [x] Lock or atomically update delivery claim records.
- [x] Ensure only one active driver claim exists.
- [x] Release claims after timeout according to policy.
- [x] Notify other drivers when a job is no longer available.
- [ ] Test two simultaneous claim requests.

### PIN completion protection

- [x] Generate cryptographically secure PINs.
- [x] Use a limited number of attempts.
- [x] Record failed attempts and suspicious behavior.
- [x] Complete delivery and mark PIN used in one transaction.
- [x] Prevent duplicate completion requests.
- [ ] Test simultaneous correct PIN submissions.

### Concurrency acceptance tests

- [ ] Two users attempt to purchase the final unit: exactly one succeeds.
- [ ] Two drivers attempt to claim the same delivery: exactly one succeeds.
- [ ] Two requests attempt to complete one delivery: exactly one succeeds.
- [ ] Repeated order creation with one idempotency key creates one order.
- [ ] Failed notification does not roll back a successful order.
- [x] Database deadlocks are bounded-retried in stock, order, procurement, and delivery row-lock workflows, exhausted attempts emit structured `medline.database.deadlock_exhausted` logs, and deployment guidance defines alert/recovery handling; owner log-sink alert wiring remains a release gate.

**Completion criteria:** No double booking, negative stock, duplicate claim, duplicate completion, or inconsistent inventory movement occurs under concurrent requests.

## Phase 22 - Security, Privacy, and Compliance

- [x] Enforce HTTPS in every environment except local development through the Laravel `EnforceHttps` middleware and protected `MEDLINE_ENFORCE_HTTPS` release setting; reverse-proxy secure-state forwarding remains an owner deployment gate.
- [x] Review authentication, authorization, and session expiration (short-lived Sanctum access tokens, hashed single-use refresh-token rotation, secure HttpOnly browser cookies, credentialed trusted-origin CORS, and web/Flutter one-retry client recovery are wired; owner security validation remains a release gate).
- [x] Add admin two-factor authentication.
- [x] Add password and login throttling.
- [x] Validate and scan uploaded files (MIME/size validation plus configurable fail-closed ClamAV boundary).
- [x] Keep prescriptions, licenses, and payment proofs private.
- [x] Use signed temporary URLs for authorized access.
- [x] Redact secrets, tokens, PINs, and medical information from logs.
- [x] Encrypt sensitive fields where appropriate.
- [x] Add audit logs for medical-document and administrative actions.
- [x] Add consent and privacy-policy records.
- [x] Define document and account deletion/retention policy (`docs/RETENTION_AND_DELETION_POLICY.md`), including legal holds, account closure, private-file expiry, backup review, bounded deletion jobs, and owner approval gates.
- [x] Added owner-triggered/scheduled no-Docker dependency auditing for locked Composer, npm, and Flutter dependency graphs (`.github/workflows/security-audit.yml`); the workflow was not executed during implementation.
- [x] Added the production-specific OWASP-oriented review artifact [`docs/SECURITY_REVIEW_CHECKLIST.md`](docs/SECURITY_REVIEW_CHECKLIST.md), covering access control, tenant isolation, cryptography, injection, critical transactions, sessions, auditability, uploads, providers, and release disposition; execution remains an owner gate.
- [x] Added the secret-safe native Windows release-manifest generator `deploy/windows/record-release-manifest.ps1`, which hashes approved API/web/mobile/deployment artifacts while excluding environment files, runtime data, logs, dumps, backups, and dependency caches.
- [x] Added the native HTTPS liveness/readiness probe `deploy/windows/check-medline-health.ps1`, which supports uptime/Windows monitoring integration without logging response bodies or secrets; owner registration and alert routing remain deployment gates.
- [x] Added `docs/ENVIRONMENT_PROMOTION_CHECKLIST.md` to make native Windows development, staging, and production promotion repeatable while preserving secret, migration, backup, rollback, and no-Docker owner gates.
- [x] Added `docs/RELEASE_NOTES_TEMPLATE.md` for secret-safe release identity, artifact hashes, migrations, security findings, operational configuration, validation, rollback, and support records.
- [x] Reconciled the requirements traceability matrix with dependency/security automation, liveness/readiness monitoring, environment promotion, and release artifact integrity controls (`SEC-02`, `OPS-02`, and `REL-01`).
- [x] Reconciled the root README with the tracker continuation rule and linked the release handoff, environment promotion, security review, CI quality-gate, and dependency-audit artifacts from the project entry point.
- [x] Added the release-notes template and requirements-traceability matrix to the root README handoff index.
- [x] Hardened `DatabaseSeeder` against production execution and known-password reuse by requiring an explicit non-local seed password outside local/testing environments; updated environment and local-development guidance.
- [x] Made the seed-password contract explicit in `api/.env.example` and `api/.env.production.example` without adding a production secret or enabling production seeding.
- [x] Corrected the bilingual seed catalog’s Arabic category and medicine values using PHP Unicode escapes, preventing mojibake in fresh local/staging seed data.
- [ ] Run OWASP-oriented application security review.
- [x] Document the owner-led OWASP-oriented review scope and severity disposition in `docs/SECURITY_REVIEW_CHECKLIST.md`; execution and sign-off remain release gates.
- [ ] Verify least-privilege database and storage credentials.
- [ ] Test cross-tenant data access prevention.

**Completion criteria:** Security review has no unresolved critical or high-severity issues, and sensitive data access is auditable.

## Phase 23 - Automated Testing and Quality Assurance

### Backend tests

- [x] Added focused feature coverage for administrator endpoint isolation, partner inventory access, and cross-patient order ownership; automated validation now runs against native MySQL.
- [x] Extended authorization coverage with private verification-document download isolation and administrator audit-log isolation checks.
- [x] Extended focused authorization coverage to administrator self-status/self-role protection and pharmacy-to-pharmacy order isolation.

- [ ] Unit-test pricing, inventory, subscriptions, permissions, and status transitions.
- [ ] Feature-test every API workflow.
- [ ] Test validation and error response formats.
- [ ] Test authorization for every role.
- [ ] Test file upload restrictions.
- [ ] Test idempotency.
- [ ] Test transactions and rollbacks.
- [ ] Test concurrency and locking.
- [x] Test notification persistence and private-channel event dispatch after commit.

### React tests

- [ ] Test shared components.
- [ ] Test forms and validation.
- [ ] Test search, pagination, filters, and empty states.
- [ ] Test permission-based route protection.
- [ ] Test Arabic RTL and English LTR.
- [ ] Test responsive layouts.
- [ ] Run accessibility checks.

### Flutter tests

- [ ] Test shared widgets.
- [ ] Test authentication and role routing.
- [ ] Test patient ordering.
- [ ] Test prescription upload.
- [ ] Test pharmacy and warehouse operations.
- [ ] Test driver claim and delivery PIN.
- [ ] Test offline/retry behavior.
- [ ] Test Arabic RTL and English LTR.

### End-to-end scenarios

- [ ] Patient registration to completed delivery.
- [ ] Prescription approval and rejection.
- [ ] Pharmacy procurement from warehouse.
- [ ] Partner registration and admin approval.
- [ ] Subscription payment proof approval and expiration.
- [ ] Driver application, claim, navigation, and completion.
- [ ] Complaint submission and resolution.
- [ ] Unauthorized document and order access.
- [ ] Concurrent stock purchase.
- [ ] Concurrent driver claim.
- [ ] Network interruption during critical operations.

### Performance tests

- [ ] Define realistic data volumes.
- [ ] Load-test search and catalog endpoints.
- [ ] Load-test authentication and order creation.
- [ ] Run k6 concurrency tests for stock and claims.
- [ ] Set target p95 response thresholds.
- [ ] Measure queue latency and notification delivery.
- [ ] Check slow queries and missing indexes.

**Completion criteria:** Critical workflows are covered by automated tests and performance/security thresholds are documented and met.

## Phase 24 - DevOps, Environments, and Observability

- [x] Create local development environment documentation (`docs/LOCAL_DEVELOPMENT.md`).
- [x] Add repeatable no-Docker development/staging/production promotion guidance (`docs/ENVIRONMENT_PROMOTION_CHECKLIST.md`); environment creation, secrets, migration execution, and owner approvals remain deployment gates.
- [ ] Create development environment.
- [ ] Create staging environment.
- [ ] Create production environment.
- [ ] Configure environment-specific secrets.
- [x] Create a no-Docker CI pipeline for backend, web, and mobile tests/analysis/build gates (`.github/workflows/quality-gates.yml`), with MySQL provisioned as a native service and bounded `-j4` build settings.
- [x] Add Laravel formatting, TypeScript production typecheck/build, and Flutter static-analysis checks to the CI workflow.
- [x] Add dependency and security scan automation (`.github/workflows/security-audit.yml`); OWASP review and owner interpretation of findings remain release gates.
- [x] Add a disposable native-MySQL migration rehearsal to the owner-triggered CI pipeline; production migration execution and approval remain deployment gates.
- [ ] Configure queue workers and scheduler.
- [x] Configure local file cache and synchronous queue; Redis is intentionally not used for localhost.
- [ ] Configure private object storage.
- [ ] Configure HTTPS and domain routing.
- [ ] Configure error monitoring.
- [ ] Configure structured logs and searchable correlation IDs.
- [ ] Configure metrics for API, queues, database, storage, and notifications.
- [ ] Configure uptime and health monitoring.
- [x] Add native HTTPS liveness/readiness probe automation (`deploy/windows/check-medline-health.ps1`); owner monitoring registration and alert routing remain deployment gates.
- [ ] Configure alerts for failed jobs, high error rate, slow requests, low storage, and backup failure.
  - [x] Document incident response and rollback procedures in `docs/OPERATIONS_RECOVERY_RUNBOOK.md` and `docs/RELEASE_HANDOFF.md`; execution and owner sign-off remain release gates.

**Completion criteria:** Staging and production can be deployed repeatably with observable services and documented rollback steps.

## Phase 25 - Backup, Disaster Recovery, and Operations

- [ ] Configure automated MySQL backups.
- [ ] Store backups separately from the primary database.
- [ ] Encrypt backups.
- [ ] Define recovery point objective.
- [ ] Define recovery time objective.
- [ ] Test database restore.
- [ ] Test object-storage recovery.
- [ ] Document lost-notification recovery.
- [ ] Document failed-payment-proof review recovery.
- [ ] Document stuck-order and stuck-delivery recovery.
- [ ] Document emergency admin access process.
- [ ] Define support escalation levels.
- [ ] Define incident severity and response targets.

**Completion criteria:** The team can restore the platform and continue operations after database, storage, queue, or deployment failure.

## Phase 26 - Pilot Launch

- [ ] Select pilot pharmacies.
- [ ] Select pilot warehouses.
- [ ] Select and approve pilot drivers.
- [ ] Prepare test patients.
- [ ] Verify licenses, subscriptions, delivery zones, and payment process.
- [ ] Train operational users.
- [ ] Run scripted pilot orders.
- [ ] Monitor failed orders and delivery delays.
- [ ] Monitor stock discrepancies.
- [ ] Monitor notification failures.
- [ ] Collect user feedback.
- [ ] Resolve critical pilot issues.
- [ ] Approve production readiness review.

**Completion criteria:** Pilot users can complete critical workflows reliably and no unresolved critical issue remains.

## Phase 27 - Production Release

- [ ] Freeze and tag release candidate.
- [ ] Run final database migration rehearsal.
- [ ] Run final backup and restore verification.
- [ ] Run security and dependency scans.
- [ ] Run final end-to-end suite.
- [ ] Verify production environment variables and secrets.
- [ ] Verify domain, HTTPS, storage, queues, scheduler, and notifications.
- [ ] Deploy backend and web application.
- [ ] Build and distribute Flutter release.
- [ ] Run smoke tests in production.
- [ ] Monitor logs, metrics, queues, and error rates.
- [ ] Publish support and incident contacts.
- [ ] Record release notes.

**Completion criteria:** Production smoke tests pass and monitoring confirms stable operation after release.

## Phase 28 - Post-Launch Maintenance

- [ ] Review incidents daily during initial launch period.
- [ ] Review order completion and failed-delivery rates.
- [ ] Review stock discrepancy reports.
- [ ] Review search performance.
- [ ] Review notification delivery rates.
- [ ] Review subscription renewal rates.
- [ ] Review complaints and response times.
- [ ] Patch security vulnerabilities.
- [ ] Maintain dependencies.
- [ ] Improve UX based on support and analytics.
- [ ] Schedule regular backup restoration tests.
- [ ] Schedule regular access and permission reviews.
- [ ] Maintain API and architecture documentation.
- [ ] Plan future online payment gateway integration.
- [ ] Plan future provider changes for maps, SMS, and notifications.

**Completion criteria:** The platform has an active operational review process and a controlled release/maintenance cycle.

---

# Public API and Interface Contract Checklist

- [x] Publish `/api/v1` base contract.
- [x] Document authentication and token behavior.
- [x] Document error shape and validation errors.
- [x] Document pagination and filtering.
- [x] Document localization headers or locale parameters.
- [x] Document upload limits and signed-file access.
- [x] Document idempotency-key behavior.
- [x] Document order and delivery status transitions.
- [x] Document webhook/provider adapter interfaces.
- [x] Generate frontend API types where practical.
- [ ] Add contract tests between Laravel and React/Flutter clients.

Recommended common error format:

```json
{
  "message": "Human-readable message",
  "code": "ORDER_STOCK_UNAVAILABLE",
  "errors": {},
  "request_id": "request-correlation-id"
}
```

---

# Critical Data and Transaction Rules

1. The server is the only authority for prices, stock, permissions, order status, delivery completion, and subscription access.
2. Client interfaces may display state but may not bypass server validation.
3. Inventory changes must happen inside a transaction and must create an inventory movement record.
4. Notifications are dispatched after successful commit and run asynchronously.
5. Every critical mutation must be safe to retry or must reject duplicate requests deterministically.
6. A delivery may have only one active driver claim.
7. A delivery PIN can be used only once and only for the correct delivery.
8. Prescription documents are private and accessible only to authorized participants.
9. Administrative overrides require a reason and audit record.
10. Status transitions must be validated by the backend, not trusted from the client.
11. Financial and audit records should be corrected with compensating records rather than destructive edits.
12. Failed asynchronous work must be retryable and visible to operations staff.

---

# Security Checklist

- [ ] Authentication and authorization tests pass.
- [x] Sensitive files are private.
- [ ] File uploads are validated and scanned.
- [ ] Secrets are not committed.
- [x] Logs contain no passwords, tokens, PINs, or prescription contents.
- [x] Admin accounts support two-factor authentication through API-enforced TOTP, React setup/login controls, and Flutter authenticator-code login handoff; recovery-code policy and owner security validation remain release gates.
- [ ] Rate limits protect login, search, uploads, and mutations.
- [x] Database credentials use least privilege in the production configuration contract; deployment must supply the restricted account.
- [ ] Cross-user, cross-pharmacy, and cross-warehouse access is tested.
- [ ] Dependencies are scanned.
- [ ] HTTPS is enforced.
- [ ] Backup encryption and restore are verified.
- [ ] Privacy and retention policy is approved.

---

# Definition of Done

A task is complete only when:

- The implementation is committed in the correct application/module.
- Validation and authorization are implemented server-side.
- Arabic and English behavior is considered where applicable.
- Loading, error, empty, and retry states are handled.
- Relevant unit, feature, widget, integration, or end-to-end tests pass.
- Security and privacy implications are reviewed.
- API or UI documentation is updated when behavior changes.
- The tracker status is updated.
- Changed files and verification commands are recorded below.

---

# Open Decisions, Risks, and Blockers

| ID | Item | Impact | Owner | Status | Resolution |
|---|---|---|---|---|---|
| D-001 | Exact payment/wallet provider | Determines payment workflow and compliance | Product/Admin | Open | |
| D-002 | Prescription and delivery regulations | Determines required verification and retention | Product/Legal | Open | |
| D-003 | Delivery coverage and service hours | Determines driver eligibility and availability | Operations | Open | |
| D-004 | Delivery fee and tax rules | Determines pricing and invoice behavior | Product/Finance | Open | |
| D-005 | Production hosting provider | Determines infrastructure implementation | Technical | Open | |
| R-001 | Network instability | Can interrupt uploads, claims, and status changes | Technical | Open | Add retry/idempotency/offline states |
| R-002 | Stock concurrency | Can cause double sales | Technical | Open | Use row locks, transactions, constraints, and load tests |
| R-003 | Sensitive prescription access | Privacy and legal risk | Technical/Product | Open | Private storage, policies, audit logs |
| R-004 | Notification provider failure | Users may miss status updates | Technical | Open | Queues, retries, in-app history, monitoring |
| R-005 | Driver no-show | Delivery delays | Operations | Open | Claim timeout, reassignment, escalation |

---

# Implementation Log

Record meaningful changes here so work can resume without reconstructing context.

| Date | Phase | Work completed | Files changed | Verification | Notes |
|---|---|---|---|---|---|
| 2026-08-18 | Planning | Created complete production implementation tracker | `MEDLINE_IMPLEMENTATION_TRACKER.md` | File created and reviewed | Initial source of truth |
| 2026-08-18 | Phases 0-4 | Scaffolded Laravel 12 API, configured native MySQL, installed Sanctum, created schema, seed data, and API foundation | `api/` | `php artisan migrate:fresh --seed`, `php artisan route:list` | Docker intentionally not used |
| 2026-08-18 | Phases 3, 5, 7-8 | Added users/roles, partners, drivers, medicines, inventory, orders, prescriptions, deliveries, subscriptions, complaints, ratings, audit, and idempotency tables | `api/database/migrations/`, `api/app/Models/` | MySQL migrations completed | Initial production-shaped domain schema |
| 2026-08-18 | Phase 14 | Created React TypeScript dashboard shell with MedLine visual system, responsive navigation, metrics, activity, and debounced medicine search | `web/src/`, `web/vite.config.ts` | `npm run build` | Frontend connects to `/api/v1/medicines` |
| 2026-08-18 | Phase 23 | Added API foundation tests and isolated native MySQL test database | `api/tests/Feature/ApiFoundationTest.php`, `api/phpunit.xml` | `php artisan test` - 6 passing, 17 assertions | SQLite/Docker not used |
| 2026-08-18 | Phase 9 / Phase 21 | Added patient order creation endpoint with pharmacy eligibility checks, inventory row locking, stock reservation, retry-safe transaction handling, and insufficient-stock test | `api/app/Http/Controllers/Api/OrderController.php`, `api/tests/Feature/ApiFoundationTest.php` | `php artisan test` - 7 passing, 21 assertions | Critical stock path is now covered |
| 2026-08-18 | Phase 17-18 | Installed Flutter SDK under `C:\src\flutter` and added role-based patient mobile UI foundation | `mobile/pubspec.yaml`, `mobile/lib/main.dart` | Dart SDK available; Flutter CLI first-run initialization timed out | No broad compilation run; memory-safe continuation required |
| 2026-08-18 | Operations | Added native setup documentation and API CORS configuration; Docker explicitly excluded | `README.md`, `api/config/cors.php`, `web/.env.example` | Documentation reviewed | Native Windows MySQL80/PHP/Node workflow |
| 2026-08-18 | Phases 8-16 | Added partner discovery, partner inventory management, movement ledger writes, pharmacy order queue, and accept/reject/partial decision APIs | `api/app/Http/Controllers/Api/PartnerController.php`, `InventoryController.php`, `OrderWorkflowController.php` | Implementation recorded; testing intentionally deferred per user instruction | Server-side partner ownership and transaction boundaries included |
| 2026-08-18 | Phases 11-13 | Added notification inbox, annual subscription/payment-proof endpoints, and driver delivery availability/claim/status/PIN completion APIs | `api/app/Http/Controllers/Api/NotificationController.php`, `SubscriptionController.php`, `DeliveryController.php` | Implementation recorded; testing intentionally deferred per user instruction | Native MySQL migration added for notifications |
| 2026-08-18 | Phases 14-20 | Expanded React navigation into operational sections and created Flutter role-gated mobile shell with shared API client | `web/src/App.tsx`, `web/src/style.css`, `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Implementation recorded; testing intentionally deferred per user instruction | Patient, pharmacy, warehouse, and driver entry paths established |
| 2026-08-18 | Phases 6-13 | Added seeded approved pharmacy and inventory, admin dashboard/approval/payment APIs, notification inbox, subscription proof workflow, and driver delivery lifecycle APIs | `api/database/seeders/DatabaseSeeder.php`, `api/app/Http/Controllers/Api/AdminController.php`, `NotificationController.php`, `SubscriptionController.php`, `DeliveryController.php` | Implementation recorded; testing intentionally deferred per user instruction | No test/build commands run for this continuation |
| 2026-08-18 | Phase 24 | Added native Windows API, web, and queue worker scripts; Docker remains explicitly excluded | `scripts/start-api.ps1`, `scripts/start-web.ps1`, `scripts/start-queue.ps1`, `README.md` | Files recorded; testing intentionally deferred per user instruction | Uses PHP, Node/npm, and native MySQL80 |
| 2026-08-18 | Phase 5 / Phase 14 | Added authenticated React entry point with Laravel token login, request interceptor, protected operational workspace, and logout | `web/src/App.tsx`, `web/src/style.css` | Implementation recorded; testing intentionally deferred per user instruction | No client test/build commands run |
| 2026-08-18 | Phase 13 | Added centralized notification persistence service and order/decision/delivery status notification hooks | `api/app/Support/NotificationService.php`, order and delivery controllers | Implementation recorded; testing intentionally deferred per user instruction | Notification delivery channels remain provider adapters for the next hardening pass |
| 2026-08-18 | Phase 14 | Connected React operational sections to authenticated admin partner, verification, delivery, medicine, and order endpoints | `web/src/App.tsx` | Implementation recorded; testing intentionally deferred per user instruction | Verification uses the pending partner queue |
| 2026-08-18 | Phase 9 / Phase 12 | Added private prescription upload/download/review flow and complaint create/list/admin-resolution APIs | `api/app/Http/Controllers/Api/PrescriptionController.php`, `ComplaintController.php` | Implementation recorded; testing intentionally deferred per user instruction | Prescription access is restricted by patient, pharmacy, or admin ownership |
| 2026-08-18 | Phase 11 / Phase 21 | Added delivery creation on pharmacy acceptance, encrypted patient PIN retrieval, driver claim/status flow, and single-use completion guard | `api/database/migrations/2026_08_18_192000_add_encrypted_pin_to_deliveries.php`, delivery/order workflow controllers | Implementation recorded; testing intentionally deferred per user instruction | PIN hash is used for verification; encrypted value is only exposed to the owning patient |
| 2026-08-18 | Phase 10 | Added pharmacy-to-warehouse procurement schema, transactional warehouse stock reservation, warehouse decision flow, procurement delivery linkage, and seeded approved warehouse inventory | `api/database/migrations/2026_08_18_193000_create_procurement_orders.php`, `api/app/Http/Controllers/Api/ProcurementController.php`, `api/database/seeders/DatabaseSeeder.php` | Implementation recorded; testing intentionally deferred per user instruction | B2B procurement is now represented in the backend domain |
| 2026-08-18 | Phases 10, 18-20 | Added Flutter role action cards for patient ordering, pharmacy procurement, warehouse queue, and driver delivery paths | `mobile/lib/main.dart` | Implementation recorded; testing intentionally deferred per user instruction | Mobile interaction wiring remains next client task |
| 2026-08-18 | Phase 14-16 | Reworked React operations client into authenticated dashboard, order, inventory, procurement, delivery, partner, verification, and settings navigation with live API queues and partner decision actions | `web/src/App.tsx`, `web/src/style.css` | Implementation recorded; testing intentionally deferred per user instruction | Role portal detail actions continue in the next pass |
| 2026-08-18 | Phase 24-27 | Added native Windows deployment guidance, scheduler worker script, environment templates, and repository ignore rules; Docker remains excluded | `deploy/windows/README.md`, `deploy/windows/start-scheduler.ps1`, `api/.env.example`, `.gitignore` | Implementation recorded; testing intentionally deferred per user instruction | Production secrets and IIS setup remain deployment-owner tasks |
| 2026-08-18 | Phases 17-20 | Added Flutter API workflow methods, session abstraction, order status timeline, and driver delivery card components | `mobile/lib/core/api_client.dart`, `mobile/lib/core/session.dart`, `mobile/lib/features/orders/order_status.dart`, `mobile/lib/features/delivery/driver_delivery_card.dart` | Implementation recorded; testing intentionally deferred per user instruction | Native platform folders remain separate packaging work |
| 2026-08-18 | Phase 21 | Added Idempotency-Key handling for patient order creation to safely replay timed-out client requests and reject key reuse with a different payload | `api/app/Http/Controllers/Api/OrderController.php` | Implementation recorded; testing intentionally deferred per user instruction | Stock reservation remains transactionally protected |
| 2026-08-18 | Phase 24-27 | Added API workflow contract documentation and IIS rewrite files for React SPA and Laravel front controller | `docs/API_WORKFLOWS.md`, `web/public/web.config`, `api/public/web.config` | Implementation recorded; testing intentionally deferred per user instruction | Native Windows deployment remains Docker-free |
| 2026-08-18 | Quality / Phase 21 | Added regression coverage for `Idempotency-Key` order replay, ran the full Laravel test suite, and fixed React type-only imports required by strict TypeScript compilation | `api/tests/Feature/ApiFoundationTest.php`, `web/src/App.tsx` | `php artisan test` passed: 8 tests / 26 assertions; `npm run build` passed | Browser/UI automation was intentionally not run; validation was limited to backend tests and static production build |
| 2026-08-18 | Phase 20 / Packaging | Downloaded and extracted Flutter 3.35.5 SDK locally; the initial offline platform-generation attempt exposed a missing cached `flutter_tools` dependency | `flutter_sdk/` (local toolchain), `mobile/` | Initial cache issue resolved in the subsequent packaging entry below | Native Android/web generation was completed after tool-cache hydration |
| 2026-08-18 | Phase 20 / Packaging | Hydrated the Flutter tool cache and generated Android/web platform folders; changed Android identity to `com.medline.app`, set MedLine labels, removed the placeholder widget test, and added `MEDLINE_API_URL` build-time configuration | `mobile/android/`, `mobile/web/`, `mobile/lib/core/api_client.dart`, `mobile/README.md`, `.gitignore` | Platform generation completed successfully; no tests or browser runs performed | Release signing remains intentionally environment-specific |
| 2026-08-18 | Phase 17-20 | Added mobile sign-in using the Laravel token API, shared session handoff into role home, and patient guest browsing for public catalog access | `mobile/lib/main.dart`, `mobile/lib/core/session.dart` | Source implementation completed; no tests or browser runs performed | Partner workflows require an authenticated account |
| 2026-08-18 | Phases 9, 12, 18-21 | Connected mobile medicine ordering with pharmacy discovery and idempotency keys; added role operations page for patient orders, pharmacy decisions, warehouse procurement decisions, driver claiming, delivery status, and PIN completion | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source implementation completed; no tests, builds, or browser runs performed | Prescription-required medicines remain gated for prescription upload/review |
| 2026-08-18 | Phase 27 | Added native Flutter release handoff covering build-time API configuration, Android signing, iOS ownership, secrets, and operational release responsibilities | `deploy/mobile/README.md`, `README.md` | Documentation completed; no tests, builds, or browser runs performed | Release credentials and provider accounts are intentionally supplied by the deployment owner |
| 2026-08-18 | Phase 21 / Security | Hardened delivery ownership: driver delivery history now includes procurement deliveries without exposing patient PINs, while patients retain PIN access; procurement delivery status notifications route to the pharmacy user | `api/app/Http/Controllers/Api/DeliveryController.php` | Source implementation completed; no tests or runtime checks performed | Delivery data is now separated by role at the API boundary |
| 2026-08-18 | Phase 17 / Security | Added client-side role/account matching so a signed-in user cannot enter a different mobile workspace than the role returned by the API | `mobile/lib/main.dart` | Source implementation completed; no tests or runtime checks performed | Backend authorization remains the authoritative enforcement layer |
| 2026-08-18 | Phase 13 / Phase 17 | Added mobile notification inbox with read-state actions, profile/privacy presentation, and remote token logout; connected bottom navigation and notification entry points | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source implementation completed; no tests, builds, or browser runs performed | Push-provider delivery remains a deployment-provider integration; in-app notification persistence is wired |
| 2026-08-18 | Phase 4 / Phase 13 / Phase 17 | Added role-aware mobile registration and a protected device-token lifecycle API storing hashed/encrypted tokens with platform and revocation metadata | `mobile/lib/main.dart`, `mobile/lib/core/session.dart`, `mobile/lib/core/api_client.dart`, `api/app/Http/Controllers/Api/DeviceTokenController.php`, `api/database/migrations/2026_08_18_194000_create_device_tokens_table.php`, `api/routes/api.php` | Source implementation completed; no tests, builds, or runtime checks performed | Push provider SDK wiring remains deployment-specific and must consume active device-token records |
| 2026-08-18 | Phase 9 / Phase 18 | Added mobile prescription picker and multipart upload from patient order operations, limited to the backend’s JPG/JPEG/PNG/PDF and 10 MB policy | `mobile/pubspec.yaml`, `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source implementation completed; no tests, builds, or runtime checks performed | Pharmacist review remains enforced by the Laravel authorization and workflow API |
| 2026-08-18 | Phase 10 / Phase 12 / Phase 18 | Added partner inventory listing/adjustment and pharmacy procurement request screens, with role-specific action-card routing and Laravel inventory/procurement contracts | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source implementation completed; no tests, builds, or runtime checks performed | Backend ownership, approval, subscription, and stock validation remain authoritative |
| 2026-08-18 | Phase 14-16 | Added role-aware React endpoint selection, partner inventory adjustment form, pharmacy order accept/reject actions, warehouse procurement accept/reject actions, and admin-only management navigation | `web/src/App.tsx`, `web/src/style.css` | Source implementation completed; no tests, builds, or browser runs performed | Laravel authorization remains authoritative for every operation |
| 2026-08-18 | Phase 14 | Connected the React dashboard to `/admin/dashboard` for live order, partner, delivery, complaint, and verification metrics and set the document title from live order volume | `web/src/App.tsx` | Source implementation completed; no tests, builds, or browser runs performed | Remaining static visual summaries are presentation-only and scheduled for refinement |
| 2026-08-18 | Phase 13-14 | Added authenticated React notification popover with unread indicator, refresh, and mark-read actions backed by Laravel notifications | `web/src/App.tsx`, `web/src/style.css` | Source implementation completed; no tests, builds, or browser runs performed | Push delivery remains provider-specific; in-app notification state is operational |
| 2026-08-18 | Phase 13, 15, 16 | Added admin-safe delivery, subscription, and complaint list endpoints; connected React navigation with subscription approval/rejection and complaint review/resolution actions | `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `web/src/App.tsx` | Source implementation completed; no tests, builds, or browser runs performed | Admin authorization remains enforced server-side |
| 2026-08-18 | Phase 14 | Replaced React dashboard metric placeholders with live admin API values while retaining a safe fallback for unavailable metrics | `web/src/App.tsx` | Source implementation completed; no tests, builds, or browser runs performed | Dashboard cards now reflect server-side totals when the admin endpoint responds |
| 2026-08-18 | Phase 24-27 / Security | Added production API/web environment templates, protected secret guidance, native database queue/cache handoff, and named API/authentication rate limiters | `api/.env.production.example`, `web/.env.production.example`, `deploy/windows/README.md`, `api/app/Providers/AppServiceProvider.php`, `api/routes/api.php`, `.gitignore` | Source and deployment documentation completed; no tests, builds, or runtime checks performed | Production values remain intentionally uncommitted and deployment-specific |
| 2026-08-18 | Security / Audit | Added `AuditService` and wired critical state-changing actions for orders, inventory, procurement, deliveries, complaints, partner approvals, and subscription decisions | `api/app/Support/AuditService.php`, operational API controllers | Source implementation completed; no tests, builds, or runtime checks performed | Audit metadata includes actor, action, entity, request IP, and structured context |
| 2026-08-18 | Security / Audit | Added admin-only audit-log query endpoint with actor/action/entity search and a React Audit log navigation view | `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `web/src/App.tsx` | Source implementation completed; no tests, builds, or browser runs performed | Audit data is restricted to administrators |
| 2026-08-18 | Tracker Governance | Added an explicit Active Implementation Goal, execution rule, scope constraints, completion contract, and owner-validation boundary so future continuations can resume from this file | `MEDLINE_IMPLEMENTATION_TRACKER.md` | Documentation completed; no tests, builds, or browser runs performed | The `Next task` field remains the authoritative continuation pointer |
| 2026-08-18 | Operational Hardening | Completed bounded delivery transaction retries with structured `medline.database.deadlock_exhausted` logging and documented alert/recovery handling | `api/app/Support/DatabaseTransaction.php`, `api/app/Http/Controllers/Api/DeliveryController.php`, `api/config/medline.php`, `deploy/windows/README.md`, `docs/OPERATIONS_RECOVERY_RUNBOOK.md` | Source-only change; no tests, builds, browser checks, migrations, or runtime verification performed | Owner must connect the structured log signal to production alerting before release |
| 2026-08-18 | Critical Transactions | Extended the bounded transaction wrapper to order creation/cancellation, pharmacy order decisions, inventory upserts, and procurement creation/decisions so stock-sensitive workflows share the same deadlock retry and exhaustion logging policy | `api/app/Http/Controllers/Api/OrderController.php`, `api/app/Http/Controllers/Api/OrderWorkflowController.php`, `api/app/Http/Controllers/Api/InventoryController.php`, `api/app/Http/Controllers/Api/ProcurementController.php` | Source-only change; no tests, builds, browser checks, migrations, or runtime verification performed | Owner must run concurrency and deadlock acceptance checks before release |
| 2026-08-18 | Mobile Delivery UX | Added bounded 30-second refresh polling to the Flutter patient order-detail view, stopping on terminal order states, plus localized external-map failure feedback | `mobile/lib/main.dart` | Source-only change; no Flutter commands or runtime verification performed | Background tracking and embedded map rendering remain explicit release refinements |
| 2026-08-18 | Cross-Client Security | Completed the Flutter administrator 2FA login handoff with a conditional six-digit authenticator field and localized labels, matching the existing API and React enforcement contract | `mobile/lib/main.dart`, `mobile/lib/core/session.dart`, `mobile/lib/core/api_client.dart` | Source-only change; no Flutter commands or runtime verification performed | Recovery codes and owner security validation remain release gates |
| 2026-08-18 | Mobile Security Settings | Added Flutter administrator 2FA status, setup-secret generation, TOTP confirmation, disable flow, idempotency keys, and localized management controls in the authenticated profile | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source-only change; no Flutter commands or runtime verification performed | Recovery codes and owner security validation remain release gates |
| 2026-08-18 | Mobile Role Routing | Added the administrator role to Flutter role selection and restored-session authorization so administrator dashboard and security settings are reachable on mobile | `mobile/lib/main.dart` | Source-only change; no Flutter commands or runtime verification performed | Server-side authorization remains authoritative; owner must perform role-specific release validation |
| 2026-08-18 | Mobile Administrator Operations | Added a dedicated Flutter administrator operations dashboard backed by `/admin/dashboard`, with live metrics, actionable alerts, refresh/retry states, and admin-specific navigation actions | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source-only change; no Flutter commands or runtime verification performed | Server-side authorization and owner role-specific validation remain release gates |
| 2026-08-18 | Administrator Provisioning Boundary | Removed the public self-registration action from the Flutter administrator login surface; admin accounts remain provisioned through controlled server-side administration while regular roles retain registration | `mobile/lib/main.dart` | Source-only change; no Flutter commands or runtime verification performed | Production admin provisioning and access review remain owner-controlled operations |
| 2026-08-18 | Mobile Administrator Dashboard | Aligned Flutter administrator metric cards with the actual organization-wide `/admin/dashboard` fields (`users`, `partners`, `pending_partners`, and `open_complaints`) and localized their labels | `mobile/lib/main.dart` | Source-only change; no Flutter commands or runtime verification performed | Owner role-specific UI validation remains a release gate |
| 2026-08-18 | React Operations UX | Removed the unhandled generic `Create record` action from shared operations pages; inventory retains its implemented form while other workflows expose only supported actions and detail controls | `web/src/App.tsx` | Source-only change; no tests, builds, browser checks, or runtime verification performed | Future create workflows must add an explicit handler before exposing a control |
| 2026-08-18 | Mobile Administrator UX | Added the missing localized administrator dashboard heading so the admin operations surface no longer falls back to an untranslated key | `mobile/lib/main.dart` | Source-only change; no Flutter commands or runtime verification performed | Owner locale and screen-reader validation remains a release gate |
| 2026-08-18 | React Administrator Security UX | Added a dedicated administrator settings path with explicit 2FA enabled-state handling, authenticator-code entry, confirmation, and disable controls; non-admin settings remain on the shared preferences path | `web/src/App.tsx` | Source-only change; no tests, builds, browser checks, or runtime verification performed | Owner security validation and recovery-code policy remain release gates |
| 2026-08-18 | React Settings Parity | Preserved administrator locale and notification-preference controls while isolating the corrected administrator 2FA panel, ensuring the security fix does not remove shared settings behavior | `web/src/App.tsx` | Source-only change; no tests, builds, browser checks, or runtime verification performed | Owner security and localization validation remain release gates |
| 2026-08-18 | React Source Hygiene | Ensured the isolated administrator settings source remains compatible with the strict TypeScript unused-symbol policy while the active settings route uses the parity-preserving implementation | `web/src/App.tsx`, `web/tsconfig.json` | Source-only inspection; no compilation or runtime verification performed | Owner build validation remains pending |
| 2026-08-18 | React Source Hygiene | Ensured the retained legacy dashboard helper and its shared demo components are not rejected as unused declarations under the strict TypeScript configuration; the active shell continues to render the live dashboard | `web/src/App.tsx` | Source-only inspection; no compilation or runtime verification performed | Owner build validation remains pending |
| 2026-08-18 | Phase 24 / Operations | Added `/api/v1/health/ready` with dependency-safe database/storage checks and native monitoring documentation | `api/app/Http/Controllers/Api/HealthController.php`, `api/routes/api.php`, `deploy/windows/README.md` | Source implementation completed; no tests, builds, or runtime checks performed | Liveness and readiness endpoints are now distinct for traffic management |
| 2026-08-18 | Phase 27 / Recovery | Added native `mysqldump` backup script using protected environment secrets and documented backup scope, retention, and isolated restore procedure | `scripts/backup-mysql.ps1`, `README.md`, `deploy/windows/README.md` | Source and documentation completed; script not executed | Private documents, database, environment secrets, and release artifacts require separate protected backup handling |
| 2026-08-18 | Security / API Foundation | Added API exception rendering for validation, authentication, authorization, HTTP, and internal failures with stable codes and production-safe messages | `api/bootstrap/app.php`, `deploy/windows/README.md` | Source and documentation completed; no tests, builds, or runtime checks performed | Sensitive request data must remain excluded from external monitoring payloads |
| 2026-08-18 | Phase 24-27 / Native Operations | Added elevated PowerShell task-registration script for queue worker, scheduler, and daily protected MySQL backup, with configurable PHP binary and service identity | `deploy/windows/register-medline-tasks.ps1`, `deploy/windows/README.md`, `README.md` | Source and documentation completed; script not executed | Deployment owner must review task identity, secret environment, and ACLs before registration |
| 2026-08-18 | Phase 3 / API Foundation | Added `docs/openapi.yaml` covering authentication, catalog, orders, prescriptions, inventory, procurement, deliveries, notifications, health, and admin audit workflows | `docs/openapi.yaml`, `docs/API_WORKFLOWS.md` | Contract documentation completed; no tests, builds, or runtime checks performed | Production server URL remains a deployment placeholder |
| 2026-08-18 | Phase 10 / Phase 21 | Added Idempotency-Key replay protection to pharmacy procurement creation so retrying clients cannot duplicate warehouse reservations; wired the mobile procurement client to send the key | `api/app/Http/Controllers/Api/ProcurementController.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, or runtime checks performed | Replay keys are scoped to the authenticated user and request hash |
| 2026-08-18 | Phase 7 / Phase 13 / Security | Replaced subscription `file_path` input with validated private JPG/JPEG/PNG/PDF multipart upload, added audit logging, mobile client support, and OpenAPI documentation | `api/app/Http/Controllers/Api/SubscriptionController.php`, `mobile/lib/core/api_client.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, or runtime checks performed | Payment-proof files remain private and require administrator review |
| 2026-08-18 | Phase 7 / Phase 18 | Added partner mobile subscription status screen, payment amount capture, private proof file selection, upload, refresh, and review feedback | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart`, `mobile/README.md` | Source implementation completed; no tests, builds, or runtime checks performed | Administrator approval remains the subscription activation authority |
| 2026-08-18 | Phase 7 / Phase 14 | Added React pharmacy/warehouse subscription page with current status, amount capture, private receipt multipart upload, and administrator-review feedback | `web/src/App.tsx`, `web/src/style.css` | Source implementation completed; no tests, builds, or browser runs performed | Admin subscription queue remains the approval authority |
| 2026-08-18 | Phase 4 / Security | Updated React logout to call the authenticated Laravel logout endpoint before local token removal, with safe local cleanup during API unavailability | `web/src/App.tsx` | Source implementation completed; no tests, builds, or browser runs performed | Server-side token revocation remains the authoritative session invalidation |
| 2026-08-18 | Phase 4 / Security | Added authenticated React startup hydration through `/auth/me`, secure loading state, and local cleanup when a stored token is expired or revoked | `web/src/App.tsx`, `web/src/style.css` | Source implementation completed; no tests, builds, or browser runs performed | The API remains authoritative for session validity and role identity |
| 2026-08-18 | Phase 4 / Security | Restricted generic `/orders` listing to patients/admins, aligned React order/delivery navigation with role capabilities, and routed patient deliveries to owned-delivery data | `api/app/Http/Controllers/Api/OrderController.php`, `web/src/App.tsx` | Source implementation completed; no tests, builds, or browser runs performed | Pharmacy order access remains through partner-scoped endpoints; warehouse users use procurement workflows |
| 2026-08-18 | Phase 24 / Observability | Added validated `X-Request-ID` middleware, included request IDs in API errors, and recorded them in audit metadata for incident correlation | `api/app/Http/Middleware/AttachRequestId.php`, `api/bootstrap/app.php`, `api/app/Support/AuditService.php`, `deploy/windows/README.md` | Source and documentation completed; no tests, builds, or runtime checks performed | Incoming IDs are accepted only when they match the safe identifier format |
| 2026-08-18 | Phase 4 / Recovery | Added hashed, time-limited password reset tokens, generic recovery responses, Sanctum token revocation after reset, React web recovery/reset forms, and Flutter recovery/reset screen | `api/database/migrations/2026_08_18_195000_create_password_reset_tokens_table.php`, `api/app/Http/Controllers/Api/AuthController.php`, `api/routes/api.php`, `web/src/App.tsx`, `web/src/style.css`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation and API contract completed; no tests, builds, browser runs, or runtime verification performed | Production mail transport and reset-token delivery must be configured by the deployment owner |
| 2026-08-18 | Phase 11 / Phase 21 / Security | Added delivery transition event records, enforced sequential driver status transitions, required `arrived` before PIN completion, and added a five-attempt PIN lockout with explicit API documentation and Flutter workflow alignment | `api/database/migrations/2026_08_18_200000_add_delivery_pin_lockout.php`, `api/app/Http/Controllers/Api/DeliveryController.php`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Locked deliveries require operational reassignment/support handling; timeout/reassignment policy remains open |
| 2026-08-18 | Phase 13 / Phase 17 / Phase 22 | Added persistent per-user notification channel preferences, authenticated read/update endpoints, service-side in-app preference enforcement, React settings controls, Flutter settings controls, and OpenAPI documentation | `api/database/migrations/2026_08_18_201000_create_notification_preferences_table.php`, `api/app/Http/Controllers/Api/NotificationPreferenceController.php`, `api/app/Support/NotificationService.php`, `api/routes/api.php`, `web/src/App.tsx`, `web/src/style.css`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | FCM, email, and SMS provider delivery remain deployment/provider integration tasks; preferences are ready for those adapters |
| 2026-08-18 | Phase 13 / Phase 24 | Added queued external notification dispatch with configurable FCM, email, and SMS adapters, encrypted device-token delivery, bounded retries, provider response tracking, invalid-token revocation, and operational documentation | `api/app/Jobs/DispatchExternalNotification.php`, `api/config/medline.php`, `api/database/migrations/2026_08_18_202000_create_notification_delivery_attempts_table.php`, `api/app/Support/NotificationService.php`, `api/.env.production.example`, `docs/NOTIFICATION_OPERATIONS.md` | Source implementation completed; no tests, builds, browser runs, or provider calls performed | Deployment owner must configure provider credentials, queue workers, and alerting |
| 2026-08-18 | Phase 6 / Phase 13 / Phase 24 | Added scheduled subscription maintenance for 30-day reminders and expiration, deactivated expired partners, and enforced approved-active subscription access across pharmacy and warehouse operational endpoints | `api/routes/console.php`, `api/app/Http/Controllers/Api/OrderWorkflowController.php`, `api/app/Http/Controllers/Api/ProcurementController.php`, `deploy/windows/README.md` | Source implementation completed; command and scheduler not executed | Deployment owner must keep the Laravel scheduler running and define the approved grace-period policy |
| 2026-08-18 | Phase 12 / Phase 18 | Added complaint ownership validation, complaint creation audit/updates notification, completed-order one-time ratings with participant authorization, and mobile API methods for complaints and ratings | `api/app/Http/Controllers/Api/ComplaintController.php`, `api/app/Http/Controllers/Api/RatingController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Patient/partner complaint and rating screens remain a client UX expansion task |
| 2026-08-18 | Phase 7 / Phase 10 / Phase 21 | Made delivery completion atomically convert accepted reservations into stock movement ledger entries, decrement pharmacy/warehouse source stock, and receive procurement quantities into pharmacy inventory while preventing inconsistent or negative stock | `api/app/Http/Controllers/Api/DeliveryController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Failed-delivery reservation release and reassignment policy remain open operational tasks |
| 2026-08-18 | Phase 11 / Phase 14 / Phase 21 | Added explicit failed-delivery reasons, sequential failure handling, admin-only reassignment to the available queue, PIN lock reset on reassignment, audit/event records, React admin reassignment action, and API contract coverage | `api/app/Http/Controllers/Api/DeliveryController.php`, `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `web/src/App.tsx`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Claim timeout automation and map routing remain open operational/provider tasks |
| 2026-08-18 | Migration Hardening | Made the password-reset migration safe against Laravel's existing base `password_reset_tokens` table so clean installs do not attempt a duplicate table creation | `api/database/migrations/2026_08_18_195000_create_password_reset_tokens_table.php` | Source correction completed; migrations not executed | Existing base schema remains the owner of the password-reset table |
| 2026-08-18 | Phase 6 / Phase 22 | Removed raw payment-proof paths from administrator list responses and added an authenticated, audited private payment-proof download endpoint with OpenAPI coverage | `api/app/Http/Controllers/Api/SubscriptionController.php`, `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Storage ACLs and production encryption remain deployment-owner release gates |
| 2026-08-18 | Phase 6 / Phase 21 | Added multipart payment-proof idempotency using request/file hashes, safe replay responses, mobile/web idempotency headers, and transactional subscription/proof creation | `api/app/Http/Controllers/Api/SubscriptionController.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Orphaned file cleanup on exceptional storage/database failures remains an operations hardening item |
| 2026-08-18 | Phase 5 / Phase 17 | Added expiring hashed email-verification tokens, verification endpoint, authenticated resend endpoint, registration dispatch, OpenAPI contract, and mobile profile resend action | `api/database/migrations/2026_08_18_203000_create_email_verification_tokens_table.php`, `api/app/Http/Controllers/Api/AuthController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Phone/SMS verification and launch-market enforcement policy remain owner decisions |
| 2026-08-18 | Phase 5 / Phase 14 / Security | Added admin user listing and suspension/reactivation endpoints, token revocation on suspension, audit metadata, OpenAPI coverage, and React user-management actions | `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `web/src/App.tsx`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Admin two-factor authentication remains an open security task |
| 2026-08-18 | Phase 11 / Phase 24 | Added configurable stale-claim release command and five-minute scheduler entry that atomically returns abandoned driver claims to the available queue with delivery-event history | `api/routes/console.php`, `api/config/medline.php`, `api/.env.production.example`, `deploy/windows/README.md` | Source implementation completed; scheduler not executed | Deployment owner must run the Laravel scheduler continuously and tune timeout policy |
| 2026-08-18 | Phase 11 / Phase 24 | Added a replaceable `MapProvider` contract, OpenStreetMap geocoding/routing implementation, provider configuration, and protected production environment values | `api/app/Contracts/MapProvider.php`, `api/app/Services/OpenStreetMapProvider.php`, `api/app/Providers/AppServiceProvider.php`, `api/config/maps.php`, `api/.env.production.example` | Source implementation completed; no tests, builds, browser runs, or external map calls performed | Production must review provider terms, rate limits, user-agent contact, and service availability |
| 2026-08-18 | Phase 5 / Phase 22 | Added optional administrator TOTP two-factor setup, confirmation, disable, encrypted secret storage, login enforcement, web authenticator-code input, and mobile API support | `api/database/migrations/2026_08_18_204000_add_admin_two_factor_to_users.php`, `api/app/Http/Controllers/Api/AuthController.php`, `api/app/Models/User.php`, `api/routes/api.php`, `web/src/App.tsx`, `mobile/lib/core/api_client.dart`, `mobile/lib/core/session.dart` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Admin setup/confirmation UI and recovery-code policy remain deployment/security review tasks |
| 2026-08-18 | Phase 5 / Phase 22 | Added administrator two-factor status and OpenAPI contracts, prevented setup-secret replacement while enabled, and retained authenticated web setup/confirmation controls | `api/app/Http/Controllers/Api/AuthController.php`, `api/routes/api.php`, `web/src/App.tsx`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Recovery codes and final security review remain deployment-owner policy gates |
| 2026-08-18 | Phase 0 / Phase 1 / Phase 22 / Phase 24 | Added architecture decisions, privacy/retention baseline, security incident operations, rollback boundaries, and deployment-owner policy release gates | `docs/ARCHITECTURE_DECISIONS.md`, `docs/PRIVACY_AND_RETENTION.md`, `docs/SECURITY_OPERATIONS.md` | Documentation completed; no tests, builds, browser runs, or runtime verification performed | Legal policy wording, retention periods, support contacts, and incident ownership require deployment-owner approval |
| 2026-08-18 | Phase 3 / Phase 9 / Phase 18 | Added user-owned address CRUD with default-address handling, ownership enforcement, safe order address snapshotting from `address_id`, OpenAPI coverage, Flutter API methods, and mobile saved-address management | `api/app/Http/Controllers/Api/AddressController.php`, `api/app/Http/Controllers/Api/OrderController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Geocoded map selection and address edit UI remain refinement tasks |
| 2026-08-18 | Phase 6 / Phase 17 / Phase 20 | Added driver profile creation during registration, private partner/driver verification-document upload/list/download, admin review decisions, audit and notifications, React document queue, Flutter document submission, and OpenAPI coverage | `api/database/migrations/2026_08_18_205000_create_verification_documents_table.php`, `api/app/Http/Controllers/Api/VerificationDocumentController.php`, `api/app/Http/Controllers/Api/AuthController.php`, `api/routes/api.php`, `web/src/App.tsx`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Antivirus scanning and legal document-retention policy remain deployment/security gates |
| 2026-08-18 | Phase 7 / Phase 14 | Added administrator medicine catalog create/update/deactivate APIs, bilingual/product-field validation, image upload handling, audit records, OpenAPI contract, and safe deactivation instead of destructive deletion | `api/app/Http/Controllers/Api/MedicineController.php`, `api/routes/api.php`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Catalog import/export and image scanning remain follow-up hardening tasks |
| 2026-08-18 | Phase 14 | Connected the React administrator catalog page to medicine creation with bilingual fields, image upload, prescription flag, active catalog listing, and safe deactivation actions | `web/src/App.tsx`, `web/src/style.css` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Edit/import/export UI remains a later catalog refinement |
| 2026-08-18 | Phase 7 / Phase 14 | Added administrator CSV catalog import with complete-file validation before mutation, audited CSV export, image storage handling, and OpenAPI contracts | `api/app/Http/Controllers/Api/MedicineController.php`, `api/routes/api.php`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | React import/export controls remain a UI refinement |
| 2026-08-18 | Phase 9 / Phase 18 / Phase 21 | Added patient/admin order cancellation rules, reservation release, available/failed delivery cancellation, delivery-event history, audit/notification records, OpenAPI coverage, and Flutter cancellation action | `api/app/Http/Controllers/Api/OrderController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Refund/dispute handling remains outside the cash-on-delivery baseline |
| 2026-08-18 | Phase 14 / Phase 22 | Added React administrator private verification-document download action through the authorized API endpoint, without exposing storage paths | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Payment-proof download action remains a follow-up admin UI refinement |
| 2026-08-18 | Phase 17 / Phase 20 | Added Flutter secure token/user persistence with secure-storage restore at role-gate startup and complete cleanup on sign-out or role mismatch | `mobile/pubspec.yaml`, `mobile/lib/core/session.dart`, `mobile/lib/main.dart`, `mobile/README.md` | Source implementation completed; no Flutter commands or runtime verification performed | Offline cache/reconnect behavior remains a follow-up mobile hardening task |
| 2026-08-18 | Phase 17 / Phase 21 | Added 12-second timeout and bounded exponential retry behavior for idempotent/read-only Flutter GET requests while leaving critical mutations protected by explicit idempotency flows | `mobile/lib/core/api_client.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Offline mutation queue is not enabled to avoid unsafe duplicate critical actions |
| 2026-08-18 | Phase 14 / Phase 20 | Added React administrator catalog CSV import/export controls with protected API calls, download handling, selection state, and operation feedback | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Catalog edit-in-place and server-side image scanning remain hardening/refinement gates |
| 2026-08-18 | Phase 14 / Phase 22 | Added React administrator payment-proof receipt download action using the private authorized endpoint and the API-provided proof identifier | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Payment-provider reconciliation and retention controls remain deployment-owner gates |
| 2026-08-18 | Phase 9 / Phase 18 / Phase 21 | Added ownership-protected order detail API with delivery-event timeline and invoice summary, OpenAPI coverage, Flutter API method, and patient mobile detail/receipt screen | `api/app/Http/Controllers/Api/OrderController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Real-time tracking and push notification delivery remain operational/provider gates |
| 2026-08-18 | Phase 9 / Phase 17 / Phase 21 | Added persistent patient carts with unique medicine lines, quantity updates/removal, clear-cart endpoint, OpenAPI coverage, mobile cart UI, and transactional multi-item checkout using existing order idempotency/reservation logic | `api/database/migrations/2026_08_18_206000_create_carts_table.php`, `api/app/Http/Controllers/Api/CartController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Payment and stock behavior remain subject to owner validation after migrations and client dependency installation |
| 2026-08-18 | Phase 14 / Phase 21 | Added functional React order/delivery detail view with invoice totals and delivery-event timeline, backed by the ownership-protected order detail API | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Visual refinement and owner browser validation remain pending |
| 2026-08-18 | Phase 17 / Phase 21 | Added Flutter driver navigation launch using an external OpenStreetMap search URL, limited to the assigned delivery address and without embedding provider credentials | `mobile/pubspec.yaml`, `mobile/lib/main.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Turn-by-turn routing and location permissions remain provider/device policy decisions |
| 2026-08-18 | Phase 11 / Phase 18 / Security | Corrected order-detail delivery responses to remove encrypted PIN material, expose the decrypted PIN only to the owning patient, and display it in the mobile order detail screen | `api/app/Http/Controllers/Api/OrderController.php`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | PIN lifecycle and delivery completion still require owner validation in the controlled environment |
| 2026-08-18 | Phase 11 / Phase 17 / Phase 21 | Added structured failed-delivery reason submission to the Flutter driver workflow and passed it through the authenticated status API to support audit/reassignment recovery | `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Driver training and operational reason taxonomy remain deployment-owner decisions |
| 2026-08-18 | Phase 18 / Phase 21 | Added Flutter approved-pharmacy directory with refresh, empty/error states, service-area display, and patient workspace navigation | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Pharmacy detail pages, live availability, and location-specific filtering remain future refinement |
| 2026-08-18 | Phase 11 / Security | Restricted patient delivery PIN exposure to active, incomplete deliveries and removed PIN availability after successful completion across delivery-list and order-detail APIs | `api/app/Http/Controllers/Api/DeliveryController.php`, `api/app/Http/Controllers/Api/OrderController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Controlled owner validation should confirm the PIN lifecycle against the final delivery states |
| 2026-08-18 | Security / Phase 21 | Replaced full delivery/event-row serialization in order details with explicit safe field allowlists, preventing PIN hashes, actor IDs, and internal delivery columns from reaching clients | `api/app/Http/Controllers/Api/OrderController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Owner security review should confirm all sensitive delivery fields remain excluded from API resources |
| 2026-08-18 | Phase 13 / Phase 21 / Security | Added stable notification IDs, per-channel/target delivery claims, stale-claim recovery, and retry-safe provider attempt correlation to prevent duplicate external sends after partial failures | `api/database/migrations/2026_08_18_207000_add_notification_delivery_keys.php`, `api/database/migrations/2026_08_18_208000_create_notification_delivery_claims_table.php`, `api/app/Support/NotificationService.php`, `api/app/Jobs/DispatchExternalNotification.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Provider credentials and queue-worker operation remain deployment-owner gates |
| 2026-08-18 | Phase 13 / Phase 22 | Added locale-aware Arabic notification message mapping at the service boundary so in-app records and queued external channels share the recipient's stored language | `api/app/Support/NotificationService.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Additional event copy and provider template review remain localization refinement tasks |
| 2026-08-18 | Phase 22 / Security | Added a configurable fail-closed ClamAV upload-scanning boundary and applied it to prescriptions, verification documents, payment proofs, catalog images, and catalog imports, with production environment guidance | `api/app/Contracts/FileScanner.php`, `api/app/Services/ClamAvFileScanner.php`, `api/app/Providers/AppServiceProvider.php`, `api/config/medline.php`, `api/app/Http/Controllers/Api/PrescriptionController.php`, `api/app/Http/Controllers/Api/VerificationDocumentController.php`, `api/app/Http/Controllers/Api/SubscriptionController.php`, `api/app/Http/Controllers/Api/MedicineController.php`, `api/.env.example`, `api/.env.production.example`, `docs/SECURITY_OPERATIONS.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Production owner must install and configure the approved scanner binary before enabling uploads in production |
| 2026-08-18 | Phase 5 / Phase 22 / Security | Added dedicated authenticated mutation and upload rate limiters and applied them to critical order, cart, procurement, inventory, delivery, document, prescription, payment-proof, and catalog routes | `api/app/Providers/AppServiceProvider.php`, `api/routes/api.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Production traffic limits should be tuned from observed capacity and abuse monitoring |
| 2026-08-18 | Phase 22 / Phase 17 / Privacy | Added versioned auditable user-consent records with active-list, grant, revoke, IP/user-agent capture, audit events, OpenAPI coverage, and Flutter privacy-consent controls | `api/database/migrations/2026_08_18_209000_create_user_consents_table.php`, `api/app/Http/Controllers/Api/ConsentController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Policy text, required-consent enforcement, and approved retention/version values remain legal-owner gates |
| 2026-08-18 | Phase 14 / Phase 22 / Privacy | Added React settings consent controls for terms, privacy policy, and optional communications using versioned grant/revoke API calls and user feedback states | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Final legal copy and required-consent enforcement remain owner/legal gates |
| 2026-08-18 | Phase 22 / Security | Added five-minute signed download URL issuance and signed download routes for verification documents, prescriptions, and payment proofs while retaining ownership/admin authorization checks | `api/app/Http/Controllers/Api/VerificationDocumentController.php`, `api/app/Http/Controllers/Api/PrescriptionController.php`, `api/app/Http/Controllers/Api/SubscriptionController.php`, `api/routes/api.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Clients should migrate download actions to URL issuance where temporary access is preferred |
| 2026-08-18 | Phase 11 / Phase 21 | Added delivery status-transition and PIN-completion idempotency replay with request-hash conflict protection, mobile key propagation, and OpenAPI headers | `api/app/Http/Controllers/Api/DeliveryController.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Client action keys must remain stable when retrying the same operation |
| 2026-08-18 | Phase 11 / Phase 20 / Privacy | Removed exact delivery addresses from the unclaimed-driver queue and merged available plus driver-owned deliveries in mobile so claimed jobs remain visible for lifecycle actions | `api/app/Http/Controllers/Api/DeliveryController.php`, `mobile/lib/main.dart` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Address visibility remains limited to the assigned driver after claim |
| 2026-08-18 | Phase 14 / Phase 22 / Compliance | Added administrator audit-log CSV export with search filtering, bounded export size, actor/entity metadata, route protection, and OpenAPI documentation | `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Retention and downstream reporting destinations remain deployment-owner decisions |
| 2026-08-18 | Phase 14 / Phase 22 | Connected the React audit queue to the filtered CSV export endpoint with download feedback/error handling | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Export presentation and owner browser validation remain pending |
| 2026-08-18 | Phase 22 / Privacy | Added server-controlled policy version configuration and exposed the current version in consent responses so audit records cannot be forged with arbitrary client-supplied versions | `api/config/medline.php`, `api/app/Http/Controllers/Api/ConsentController.php`, `api/.env.production.example` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Legal owner must update the configured version with every approved policy revision |
| 2026-08-18 | Phase 28 / API Handoff | Added human-readable API contract companion covering authentication, errors, pagination, localization, uploads/signed URLs, idempotency, state transitions, notifications, and operational endpoints | `docs/API_CONTRACT.md` | Source documentation completed; no tests, builds, browser runs, or runtime verification performed | Provider-specific webhook credentials and final legal/policy values remain deployment-owner gates |
| 2026-08-18 | Phase 24 / Security | Extended API readiness checks to include the configured upload scanner when scanning is enabled, failing readiness without exposing command or host details | `api/app/Http/Controllers/Api/HealthController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Production monitoring must alert on readiness failures and scanner service health |
| 2026-08-18 | Phase 14 / Phase 22 | Migrated React private document and payment-proof downloads to request signed URL tickets first, with authorized direct-download fallback for operational resilience | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Mobile document download actions should use the same ticket flow when added |
| 2026-08-18 | Phase 17 / Phase 21 | Added encrypted Flutter read-cache persistence, stale-read fallback, and mutation-aware invalidation for catalog, pharmacy, address, order, and cart GET requests while preserving API errors and disabling mutation queuing | `mobile/lib/core/api_client.dart`, `mobile/pubspec.yaml` | Source implementation completed; no Flutter commands or runtime verification performed | Offline UX, cache freshness under reconnect, and device-level storage validation remain owner validation gates |
| 2026-08-18 | Phase 20 / Phase 21 | Added approval-aware driver availability read/update API, audited availability changes, mutation throttling, and Flutter availability switch with disabled pending-approval state | `api/app/Http/Controllers/Api/DriverController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Driver operational policy determines availability hours and pause reasons |
| 2026-08-18 | Phase 13 / Security | Corrected notification preference isolation so disabling in-app history no longer suppresses independently enabled push, email, or SMS delivery channels | `api/app/Support/NotificationService.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Provider configuration and owner preference validation remain deployment gates |
| 2026-08-18 | Phase 20 / Phase 21 | Enforced driver availability on both available-job listing and atomic claim endpoints so unavailable or unapproved drivers cannot receive new assignments | `api/app/Http/Controllers/Api/DeliveryController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Existing claimed deliveries remain available for completion or failure recovery |
| 2026-08-18 | Phase 11 / Phase 21 | Added idempotency-key replay and request-hash protection to driver delivery status transitions and PIN completion responses | `api/app/Http/Controllers/Api/DeliveryController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Clients should persist and reuse keys for retries of the same user action |
| 2026-08-18 | Phase 14 / Phase 17 / Phase 22 | Aligned web and mobile locale state with the authenticated profile locale during session hydration and sign-in/registration, preventing mixed-language sessions | `web/src/App.tsx`, `mobile/lib/main.dart` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Full translated workflow copy remains a client refinement task |
| 2026-08-18 | Phase 18 / Phase 21 | Added Flutter medicine detail screen with bilingual names, manufacturer/form/dosage/code metadata, prescription guidance, and quantity-preserving add-to-cart action | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Image gallery, pharmacy-specific availability, and live pricing remain refinement opportunities |
| 2026-08-18 | Phase 14 / Phase 22 | Added centralized React English/Arabic shell translations for workspace navigation, management labels, breadcrumbs, and account actions while preserving RTL/LTR direction switching | `web/src/i18n.ts`, `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Full workflow copy translation and Flutter localization catalog remain client refinement work |
| 2026-08-18 | Phase 17 / Phase 18 / Phase 22 | Added Flutter locale state with English/Arabic selection from Profile, authenticated profile persistence, startup restoration, supported locales, and RTL-capable MaterialApp configuration | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart`, `MEDLINE_IMPLEMENTATION_TRACKER.md` | Source implementation completed; no Flutter commands or runtime verification performed | Full translated workflow catalog and localized validation messages remain client refinement work |
| 2026-08-18 | Phase 17 / Phase 18 | Added 350ms Flutter catalog search debounce with cancellation on new input and controller/timer cleanup on screen disposal | `mobile/lib/main.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Server-side typo tolerance and highlighted suggestion tokens remain future search refinements |
| 2026-08-18 | Phase 18 / Phase 21 | Connected saved addresses to Flutter cart checkout with address ownership enforced by the Laravel `address_id` flow and retained manual-address fallback | `mobile/lib/main.dart`, `mobile/lib/core/api_client.dart`, `api/app/Http/Controllers/Api/OrderController.php` | Source implementation completed; no Flutter commands or runtime verification performed | Map-based address selection and delivery-zone validation remain deployment/product refinements |
| 2026-08-18 | Phase 12 / Phase 14 / Phase 22 | Added complaint evidence attachments with scanner-protected private storage, ownership-safe detail/download/signed-URL endpoints, Flutter evidence picker/upload flow, and administrator complaint reporting aggregates | `api/database/migrations/2026_08_18_210000_create_complaint_attachments_table.php`, `api/app/Http/Controllers/Api/ComplaintController.php`, `api/app/Http/Controllers/Api/AdminController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `mobile/lib/main.dart`, `docs/openapi.yaml`, `docs/API_CONTRACT.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Final legal retention and owner validation remain deployment gates |
| 2026-08-18 | Phase 2 / Phase 5 / Phase 14 | Added authenticated locale profile updates and React English/Arabic language selection with document direction switching for LTR/RTL layout | `api/app/Http/Controllers/Api/AuthController.php`, `api/routes/api.php`, `web/src/App.tsx`, `docs/openapi.yaml` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Full translated copy and Flutter localization catalog remain client refinement work |
| 2026-08-18 | Phase 5 / Security | Added privacy-safe audit events for failed credential and failed administrator TOTP attempts while retaining authentication throttling | `api/app/Http/Controllers/Api/AuthController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Monitoring/alert thresholds for suspicious activity remain deployment configuration |
| 2026-08-18 | Phase 22 / Security | Corrected temporary signed private-file downloads so ticket issuance remains bearer-authorized while the five-minute signed fetch route is independently verifiable without requiring a bearer token | `api/routes/api.php`, `api/app/Http/Controllers/Api/VerificationDocumentController.php`, `api/app/Http/Controllers/Api/PrescriptionController.php`, `api/app/Http/Controllers/Api/SubscriptionController.php`, `api/app/Http/Controllers/Api/ComplaintController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Owner must validate proxy/query-string preservation and private storage ACLs |
| 2026-08-18 | Phase 13 / Phase 20 / Phase 21 | Added customer-visible notifications for partner approval decisions, subscription review decisions, delivery claims, delivery completion, complaint creation, and localized Arabic message mappings for the new event types | `api/app/Http/Controllers/Api/AdminController.php`, `api/app/Http/Controllers/Api/DeliveryController.php`, `api/app/Http/Controllers/Api/ComplaintController.php`, `api/app/Support/NotificationService.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Provider delivery and queue-worker operation remain deployment-owner gates |
| 2026-08-18 | Phase 7 / Phase 18 / API Handoff | Added a bilingual medicine autocomplete endpoint with bounded results and matched-field metadata, plus mobile API access and contract documentation | `api/app/Http/Controllers/Api/MedicineController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `docs/API_CONTRACT.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Typo-tolerant ranking remains a future catalog enhancement |
| 2026-08-18 | Phase 14 / Phase 12 | Connected administrator complaint status aggregates to the React operations portal with live open, in-review, and resolved summary cards and complaint detail/evidence actions | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Owner browser validation and final support metrics design remain pending |
| 2026-08-18 | Phase 9 / Phase 11 / Phase 13 | Completed the notification event matrix for registration submission, subscription payment submission, patient order confirmation/cancellation, prescription review, available-driver dispatch, delivery lifecycle, secure PIN availability, payment recording, and complaint resolution | `api/app/Http/Controllers/Api/AuthController.php`, `api/app/Http/Controllers/Api/SubscriptionController.php`, `api/app/Http/Controllers/Api/PrescriptionController.php`, `api/app/Http/Controllers/Api/OrderController.php`, `api/app/Http/Controllers/Api/OrderWorkflowController.php`, `api/app/Http/Controllers/Api/DeliveryController.php`, `api/app/Http/Controllers/Api/ComplaintController.php`, `api/app/Support/NotificationService.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Queue/provider delivery and message-template review remain deployment-owner gates |
| 2026-08-18 | Phase 14 / Operations | Added live administrator operational alerts for low stock, failed deliveries, open complaints, and pending partner approvals to the dashboard API and React portal | `api/app/Http/Controllers/Api/AdminController.php`, `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Alert thresholds, escalation destinations, and owner browser validation remain deployment decisions |
| 2026-08-18 | Phase 11 / Phase 22 / Privacy | Corrected the delivery-list projection to include `pin_used_at`, ensuring the API can enforce PIN suppression after completion while keeping encrypted PIN material out of driver responses | `api/app/Http/Controllers/Api/DeliveryController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Owner security review should confirm all delivery resources preserve the same PIN lifecycle rule |
| 2026-08-18 | Phase 17 / API Handoff | Hardened Flutter response decoding for empty, malformed, and non-JSON gateway responses while preserving explicit API status errors and avoiding unsafe mutation retries | `mobile/lib/core/api_client.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Client error-copy review and provider/proxy behavior validation remain owner gates |
| 2026-08-18 | Phase 17 / Phase 13 / Mobile Handoff | Added configuration-gated Firebase Messaging registration, token refresh handling, API registration, and logout revocation for the Flutter client, with native/web-safe no-configuration behavior and release documentation | `mobile/pubspec.yaml`, `mobile/lib/core/push_notifications.dart`, `mobile/lib/main.dart`, `mobile/README.md`, `deploy/mobile/README.md` | Source implementation completed; no Flutter commands or runtime verification performed | Firebase project configuration, platform setup, notification permissions, and store review remain release-owner gates |
| 2026-08-18 | Phase 9 / Security | Enforced prescription-required medicine workflow server-side: orders enter `prescription_required`, pharmacy decisions are blocked until upload/approval, duplicate active prescriptions are rejected, and patient cancellation remains available during the waiting state | `api/app/Http/Controllers/Api/OrderController.php`, `api/app/Http/Controllers/Api/OrderWorkflowController.php`, `api/app/Http/Controllers/Api/PrescriptionController.php`, `mobile/lib/main.dart`, `docs/API_CONTRACT.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Owner must validate correction/resubmission policy for rejected prescriptions |
| 2026-08-18 | Phase 9 / Phase 18 | Aligned the Flutter order action and patient notification copy with the enforced prescription-required state, preventing misleading upload actions on ordinary orders | `mobile/lib/main.dart`, `api/app/Http/Controllers/Api/OrderController.php`, `docs/API_WORKFLOWS.md` | Source implementation completed; no Flutter commands or runtime verification performed | Owner must validate the final rejected-prescription correction policy |
| 2026-08-18 | Phase 9 / Critical Transactions | Allowed transactional patient cancellation during the `prescription_required` waiting state so reserved stock can be released safely before pharmacy processing | `api/app/Http/Controllers/Api/OrderController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Owner validation should confirm reservation release for this state |
| 2026-08-18 | Phase 7 / Phase 14 / API Handoff | Added bilingual medicine-category listing, administrator create/update APIs, unique slug validation, audit events, and non-destructive category management documentation | `api/app/Models/MedicineCategory.php`, `api/app/Http/Controllers/Api/MedicineCategoryController.php`, `api/routes/api.php`, `docs/API_CONTRACT.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | React category editor and final taxonomy ownership remain refinement/owner decisions |
| 2026-08-18 | Phase 14 | Connected the React catalog administration screen to the bilingual category listing/create workflow while preserving non-destructive referenced categories | `web/src/App.tsx` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Category edit form and owner taxonomy review remain refinements |
| 2026-08-18 | Phase 8 / API Handoff | Added server-side medicine category, prescription, pharmacy-partner availability, partner-specific stock, bounded sorting, pagination, and pharmacy/warehouse discovery filters | `api/app/Http/Controllers/Api/MedicineController.php`, `api/app/Http/Controllers/Api/PartnerController.php`, `docs/API_CONTRACT.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Typo-tolerant ranking and geospatial distance filtering remain future/provider refinements |
| 2026-08-18 | Phase 6 / Subscriptions | Added configurable annual pharmacy and warehouse plan catalog, partner-type enforcement, optional approved-price enforcement, persisted plan code/duration metadata, subscription-plan endpoint, mobile API method, environment templates, and contract documentation | `api/database/migrations/2026_08_18_211000_add_subscription_plan_metadata.php`, `api/config/medline.php`, `api/app/Http/Controllers/Api/SubscriptionController.php`, `api/routes/api.php`, `mobile/lib/core/api_client.dart`, `api/.env.example`, `api/.env.production.example`, `docs/API_CONTRACT.md` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Legal owner must supply approved prices, grace period policy, currency, and payment process |
| 2026-08-18 | Phase 13 / Phase 21 | Notified other approved, available drivers when a delivery is atomically claimed so their queue can remove the now-unavailable job without weakening claim locking | `api/app/Http/Controllers/Api/DeliveryController.php`, `api/app/Support/NotificationService.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Provider fan-out capacity and queue delivery remain deployment-owner gates |
| 2026-08-18 | Phase 10 / Phase 13 | Extended procurement delivery creation to notify the pharmacy of secure PIN availability and notify eligible available drivers of the new delivery job | `api/app/Http/Controllers/Api/ProcurementController.php` | Source implementation completed; no tests, builds, browser runs, or runtime verification performed | Provider delivery and operational fan-out limits remain deployment-owner gates |
| 2026-08-18 | Phase 17 / Phase 21 | Added targeted Flutter read-cache invalidation after cart mutations, address CRUD, order creation, and order cancellation so successful writes cannot leave stale checkout or order data during reconnect | `mobile/lib/core/api_client.dart` | Source implementation completed; no Flutter commands or runtime verification performed | Owner validation should confirm cache freshness across app restarts and network recovery |

---

# Release Checklist

## Before staging

- [ ] All critical migrations run successfully.
- [ ] Seed data is safe and anonymized.
- [ ] API health checks pass.
- [ ] React build passes.
- [ ] Flutter analysis and tests pass.
- [ ] Queue and scheduler work.
- [ ] Uploads work in private storage.
- [ ] Notifications work in staging.

## Before production

- [ ] Security review complete.
- [ ] Backup and restore test complete.
- [ ] Concurrency tests pass.
- [ ] Critical end-to-end tests pass.
- [ ] Production secrets verified.
- [ ] Monitoring and alerts verified.
- [ ] Rollback procedure verified.
- [ ] Support contacts and escalation process published.
- [ ] Pilot sign-off complete.

## After production deployment

- [ ] Run health checks.
- [ ] Test login for each role.
- [ ] Test one controlled order.
- [ ] Test one controlled delivery.
- [ ] Verify notification receipt.
- [ ] Verify queue health.
- [ ] Verify error monitoring.
- [ ] Monitor for at least the agreed observation period.

## Continuation Log — 2026-08-18

- [x] Wired React partner subscription payment proof to load the server-configured plan and submit `plan_code`.
- [x] Hardened subscription amount comparison to two-decimal monetary precision and expanded the audit payload with plan metadata.
- [x] Wired Flutter partner subscription upload to load and submit the server-configured plan code.
- [x] Documented the subscription-plan lookup and configured-price authority in the API workflow guide.
- [x] Completed the React category edit workflow against the protected Laravel category update endpoint.
- [x] Made the shared React dashboard document title and account footer role-aware for patient, pharmacy, warehouse, driver, and admin sessions.
- [x] Added an audited, reversible administrator rating moderation API and React hide/restore ratings queue.
- [x] Added implementation-level ERD and transaction-boundary documentation and reconciled the Phase 3 schema checklist.
- [x] Added short-lived caching for safe medicine suggestion responses to reduce repeated catalog queries during debounced client search.
- [x] Added the React medicine edit form with bilingual fields, prescription/active flags, and protected Laravel update submission.
- [x] Added Android development, staging, and production Flutter flavors with isolated application identities for release handoff.
- [x] Added a React pharmacy/warehouse subscription access banner linked to the payment-review screen; Laravel remains the authoritative operational guard.
- [x] Replaced the React navigation translation catalog with valid Arabic/English strings and added shared operational labels.
- [x] Reconciled the delivery and procurement notification checklist against the implemented transactional workflows and privacy-scoped driver responses.
- [x] Added the React pharmacy procurement request form with warehouse/medicine selection, address capture, idempotency, and API feedback.
- [x] Added inventory-owner filtering to catalog availability queries so pharmacy and warehouse stock discovery use the correct inventory source.
- [x] Added protected procurement detail and delivery timeline APIs with a React detail view for pharmacy and warehouse queues.
- [x] Added a role-scoped Laravel dashboard summary endpoint and connected the React dashboard to live non-admin metrics.
- [x] Added the shared Flutter dashboard API method and live role-scoped metric cards.
- [x] Added the protected pharmacy prescription queue endpoint and React private-file review panel with approve/reject actions.
- [x] Reconciled React partner queue, inventory, warehouse discovery, and partial procurement workflow coverage against the portal phases.
- [x] Added partner-owned delivery listing APIs and React delivery navigation for pharmacy and warehouse ongoing/completed delivery monitoring.
- [x] Added privacy-scoped delivery detail/event APIs and React delivery drill-down views for authorized participants.
- [x] Added guarded administrator role assignment with matching profile validation, self-role protection, audit records, and a React role-management panel.
- [x] Added bounded fuzzy catalog suggestion fallback with ranked match scores and preserved matched-field metadata.
- [x] Added optional privacy-safe Flutter telemetry and uncaught-error reporting with protected endpoint configuration.
- [x] Added the React partner-management queue with approve, reject, and correction actions backed by the audited Laravel decision endpoint.
- [x] Replaced non-semantic React navigation anchors with keyboard-accessible buttons, focus states, and `aria-current` semantics.
- [x] Added safe catalog `suggested_queries` metadata for no-result search responses.
- [x] Added React live catalog suggestion chips and empty-state recovery prompts backed by fuzzy API suggestions.
- [x] Preserved Laravel request correlation IDs in Flutter API exceptions for privacy-safe support escalation.
- [x] Preserved Laravel request-correlation references in React API error messages for operator support escalation.
- [x] Normalized React notification payloads into readable, privacy-filtered messages instead of rendering object values directly.
- [x] Added a recoverable React application-level error boundary for unexpected rendering failures.
- [x] Added Flutter platform-level uncaught-error forwarding to the optional privacy-safe telemetry boundary.
- [x] Added consolidated native Windows/local development handoff documentation with no-Docker constraints.
- [x] Added the release handoff checklist separating source-complete work from owner-supplied configuration and validation gates.
- [x] Added guarded 30-second foreground polling and timer disposal to the Flutter administrator operations dashboard so live metrics and alerts refresh while the screen is open without background services.
- [x] Localized the active React authentication recovery flow and administrator two-factor security status, setup, confirmation, disable, and error messages through the shared Arabic/English catalog.
- [x] Added guarded 30-second foreground polling with in-flight protection and cleanup to the React live dashboard metrics and administrator operational alerts.
- [x] Hardened the Flutter administrator dashboard refresh lifecycle so periodic updates preserve the last successful snapshot, avoid full-screen loading flicker, and retain usable data during transient refresh failures.
- [x] Localized the Flutter administrator operations title and alert fallback labels through the shared Arabic/English workflow catalog.
- [x] Added lifecycle-safe 30-second foreground polling to the React administrator notification-delivery health panel while preserving the last successful snapshot during transient outages.
- [x] Localized shared React dashboard metric labels for Arabic and English while preserving role-scoped API metric values and existing card mappings.
- [x] Added unexecuted Laravel feature tests covering admin endpoint isolation, partner inventory authorization, and cross-patient order ownership boundaries.
- [x] Added a bounded encrypted Flutter offline mutation queue for low-risk idempotent profile, notification-preference, consent, and driver-availability writes, with sequential reconnect replay and a localized pending-update indicator; critical mutations remain excluded.
- [x] Hardened queue initialization so restored, newly registered, and role-home sessions attach pending-update callbacks before replay and do not lose queue state during navigation.
- [x] Reconciled Current Project Status with the source-complete handoff boundary, explicitly listing owner-run validation, protected secrets, signing keys, provider credentials, and deployment configuration as remaining release gates.
- [x] Extended the bounded deadlock-retry transaction helper to administrator user status/role changes, partner and subscription decisions, and delivery reassignment; updated workflow and Windows release documentation.
- [x] Completed the Laravel transaction-boundary audit: coordinated account, cart, address, consent, notification preference, device-token, catalog import, prescription, complaint, verification-document, subscription-proof, and external-notification claim writes now use the bounded retry helper; upload files are staged before database retries and deleted on transaction failure.
- [x] Removed static React navigation counts and unsafe dashboard metric fallbacks so operator counts come from the API or display zero while loading.
- [x] Added requirements traceability from core workflows to Laravel, React, and Flutter source evidence.
- [ ] Keep final client refinement and deployment handoff pending owner configuration and the user-requested verification pass.

---

# Useful Verification Commands

The exact commands depend on the selected project setup, but the final project should document equivalents for:

```text
Backend tests
Backend static analysis
Database migration and rollback
React lint, typecheck, test, and production build
Flutter format, analyze, test, and release build
API contract tests
End-to-end browser tests
Mobile integration tests
Load/concurrency tests
Security/dependency scans
```

---

## Continuation Log — API Handoff

- [x] Extended `docs/openapi.yaml` for role dashboards, procurement and delivery details, prescription review, role management, and rating moderation endpoints.
- [x] Added bounded polling while the React notification popover is open so persisted in-app updates appear without manual refresh.
- [x] Added Flutter catalog suggestion chips backed by the API `suggested_queries` response, including tap-to-search behavior.
- [x] Guarded Flutter catalog search state updates against late responses after the screen is disposed.
- [x] Added shared React API response types for catalog medicines, notifications, dashboard metrics, alerts, and paginated lists in `web/src/api-types.ts`.
- [x] Corrected React Arabic navigation strings that were encoded as mojibake and added Flutter Material/Widgets/Cupertino localization delegates for the existing Arabic locale switch.
- [x] Added a native Windows release configuration guard that checks protected environment shape, HTTPS, production mode, restricted database identity, and unresolved placeholders without contacting external services.
- [x] Added Flutter timeout and network-error boundaries to mutation and multipart requests, while keeping non-keyed writes single-attempt to avoid duplicate transactions.
- [x] Added a bounded same-key retry for mobile writes that explicitly provide an idempotency key, allowing timeout recovery without creating a second transaction.
- [x] Applied the same-key retry boundary to Flutter payment-proof multipart uploads, rebuilding the request body for the safe retry.
- [x] Added client-side in-flight guards to React procurement and payment-proof submissions so rapid repeated clicks cannot issue duplicate critical requests.
- [x] Added centralized React handling for expired protected sessions, clearing stale credentials and returning users to sign-in after a 401 response while preserving login and recovery errors.
- [x] Added the matching Flutter unauthorized-session callback so expired API tokens clear the platform secure session consistently.
- [x] Added configurable scheduled pruning for expired idempotency records, preventing unbounded growth while preserving a seven-day default retry window.
- [x] Added structured terminal notification-job failure logging and a persisted delivery-attempt record for operational alerting after queue retries are exhausted.
- [x] Added redaction and bounded excerpts for notification provider responses and exception messages before logs or delivery-attempt storage.
- [x] Added an admin-only notification delivery health endpoint with 24-hour aggregate status/channel counts and body-free recent failures.
- [x] Documented the notification delivery health endpoint in the API contract and OpenAPI handoff.
- [x] Wired notification delivery health aggregates and body-free recent failures into the React administrator dashboard.
- [x] Added native Windows CMS encryption for MySQL backups with an explicit `-RequireEncryption` production task mode and protected certificate-thumbprint configuration.
- [x] Added narrowly scoped encrypted-backup retention automation and registered it as a native weekly Windows task.
- [x] Added a Flutter search-generation guard so slower prior catalog responses cannot overwrite a newer query.
- [x] Added Flutter checkout in-flight protection and stable idempotency-key reuse across timeout or cart-clear recovery.
- [x] Added Flutter procurement in-flight protection with stable same-payload idempotency-key reuse and key invalidation when form values change.
- [x] Added Flutter payment-proof in-flight protection with stable same-file/payment idempotency-key reuse across upload recovery.
- [x] Bound Flutter failed-delivery idempotency keys to the failure reason so a corrected retry cannot conflict with an earlier payload.
- [x] Added Flutter driver operation guards for claim, status transition, failed-delivery report, and PIN completion actions.
- [x] Added centralized API validation for optional `Idempotency-Key` headers, preventing malformed or oversized keys from reaching persistence.
- [x] Added a 24-hour TTL to Flutter secure read caches, including timestamp invalidation for stale offline catalog/order/cart/address data.
- [x] Strengthened Laravel readiness checks to verify local private-storage existence and writability without writing application data.
- [x] Added API security headers and an IIS React deployment policy with SPA fallback, clickjacking protection, referrer policy, permissions policy, and CSP.
- [x] Added production HSTS policy for HTTPS API responses and the IIS React host while preserving local HTTP development behavior.
- [x] Added production readiness enforcement for configured asynchronous queues, preventing silent synchronous notification processing in production.
- [x] Added `Retry-After` metadata to readiness failures for controlled traffic-manager backoff.
- [x] Added repository exclusions for private/public runtime storage, framework cache data, and encrypted backup artifacts.
- [x] Extended the Windows release configuration guard to require a correctly shaped protected backup-encryption certificate thumbprint.
- [x] Implemented atomic pre-controller JSON idempotency reservation/replay with in-progress conflict responses and failed-request cleanup; updated order, procurement, and delivery finalization paths.
- [x] Added client-generated `X-Request-ID` propagation for React, Flutter JSON requests, and Flutter multipart uploads, with API contract guidance.
- [x] Exposed `X-Request-ID` through Laravel CORS for trusted React origins so successful cross-origin responses remain support-correlatable.
- [x] Restricted atomic idempotency reservation to JSON mutation methods, leaving read endpoints strictly unaffected.
- [x] Added `Retry-After: 2` guidance to in-progress idempotency conflicts for controlled client backoff.
- [x] Added an `Idempotency-Replayed` response signal and exposed it through CORS for client/support visibility.
- [x] Extended atomic idempotency reservation to multipart mutations using form-plus-file fingerprints, including payment-proof upload finalization.
- [x] Added Flutter prescription-upload idempotency keys to prevent duplicate private prescription records after upload timeouts.
- [x] Added optional redacted Flutter API-error telemetry with allowlisted request-ID correlation; telemetry remains disabled unless explicitly configured.
- [x] Added optional redacted React API/crash telemetry with allowlisted request-ID correlation and an error-boundary capture path; telemetry remains disabled unless explicitly configured.
- [x] Added configurable retention and scheduled pruning for notification delivery attempts and claims without deleting user-facing notifications.
- [x] Added initial and background React notification loading so unread indicators appear before opening the notification popover, with faster polling while open.
- [x] Synchronized `docs/RELEASE_HANDOFF.md` with release configuration validation, IIS security policy, encrypted backup retention, notification health, and readiness traffic-gating handoff steps.
- [x] Added opt-in redacted React API/crash telemetry with request-ID correlation, matching the Flutter privacy boundary; documented `VITE_TELEMETRY_URL` as an owner-controlled release value.
- [x] Added stable mobile rating idempotency-key reuse so completed-order feedback cannot be duplicated after a timeout.
- [x] Hardened concurrent rating submission against the database uniqueness race with a stable `RATING_ALREADY_EXISTS` conflict response.
- [x] Extended the unexecuted Laravel authorization feature artifact with administrator self-status/self-role protection and pharmacy-to-pharmacy order isolation checks.
- [x] Added a validated privacy-scoped OpenStreetMap embed to the React operational delivery detail, retaining an external map fallback and hiding location after terminal delivery states.
- [x] Localized React delivery-detail address, total, and driver-assignment labels through the shared Arabic/English delivery catalog.
- [x] Localized the React procurement-detail view, including item quantities, delivery metadata, empty states, and navigation labels through the shared Arabic/English catalog.
- [x] Localized the React complaint-detail and private-evidence workflow, including case headings, attachment metadata, empty state, download action, and navigation labels.
- [x] Localized the shared React order-detail workflow, including invoice fields, payment label, delivery timeline, empty state, and queue navigation.
- [x] Confirmed the active React partner subscription/payment-proof page already uses the shared locale catalog and added explicit owner acceptance gates for RTL/LTR, accessibility announcements, private evidence, and location privacy behavior to the release handoff.
- [x] Added a shared React accessibility live-region announcer for operational mutation failures while preserving the existing visible alert fallback.
- [x] Added `.github/workflows/quality-gates.yml`, a no-Docker owner-triggered pipeline for Laravel/MySQL tests, React production build/typecheck, Flutter analysis/tests, Laravel formatting, and bounded `-j4` resource settings; the workflow was not executed during implementation.
- [x] Extended the CI quality-gate workflow with a disposable native-MySQL Laravel migration rehearsal using isolated test configuration; production migration execution remains an owner deployment gate.
- [x] Added `.github/workflows/security-audit.yml`, a no-Docker scheduled/owner-triggered audit for locked Composer/npm dependencies and the Flutter dependency graph; no scan was executed during implementation.
- [x] Applied the mutation rate limiter to rating submissions and notification read-state writes to reduce abusive/replayed client traffic.
- [x] Added mobile complaint submission idempotency support for JSON and evidence-upload requests, plus a submission guard in the support screen.
- [x] Synchronized the complaint OpenAPI contract with optional idempotency headers and conflict responses.
- [x] Audited the final source handoff for unresolved TODOs, placeholders, and missing production surfaces; no source blocker remains. The remaining unchecked items are owner-controlled security, environment, provider, monitoring, backup, migration, build, test, pilot, and release-validation gates and remain intentionally open.
- [x] Reconciled the requirements and operations phase checklists with the implemented domain specification, traceability matrix, recovery runbook, and release handoff; thesis workflow mapping and incident/rollback documentation are now explicitly tracked as completed source deliverables.
- [x] Closed the remaining source-level `[~]` items for React localization, Flutter localization/offline/accessibility behavior, delivery tracking, and authentication/session review; each now records its owner-run validation boundary explicitly.
- [x] Localized Flutter subscription plan labels, administrator fallback, and private payment-receipt guidance through the shared Arabic/English catalog; no runtime validation was executed.
- [x] Corrected the Flutter Arabic status-label boundary for order, delivery, partner, complaint, and review states so the shared status renderer emits valid Arabic labels instead of legacy mojibake; no runtime validation was executed.
- [x] Added a shared Flutter notice catalog and localized cart sign-in/add-item feedback, payment-proof submission feedback, navigation failure feedback, and empty-workspace messaging in Arabic and English; no runtime validation was executed.
- [x] Added a shared Flutter inventory catalog and localized inventory update dialogs, procurement quantity validation, and stock-entry labels in Arabic and English; no runtime validation was executed.
- [x] Added corrected Arabic overrides for Flutter support, procurement, delivery, prescription, and rating workflow labels so active operational screens no longer depend on legacy mojibake catalog values; no runtime validation was executed.
- [x] Replaced the remaining hardcoded Flutter operational order-summary `Total` label with the shared localized order catalog; no runtime validation was executed.
- [x] Routed Flutter order-detail and delivery-timeline statuses through the shared Arabic/English status mapper instead of raw uppercase server values; no runtime validation was executed.
- [x] Completed the source-only implementation boundary audit: Laravel/MySQL, React, Flutter, notifications, critical transactions, security/privacy controls, and native no-Docker deployment handoff are implemented; all remaining unchecked items are owner-run validation, external configuration, pilot, or post-launch operations.
- [x] Synchronized rating idempotency behavior and duplicate-conflict semantics across the API contract and OpenAPI specification.
- [x] Corrected the React Arabic navigation dictionary from mojibake to UTF-8 Arabic labels while preserving RTL direction switching.
- [x] Corrected remaining React support-detail separator encoding so complaint status and evidence metadata render cleanly.
- [x] Made React Arabic navigation and role labels encoding-safe with Unicode escapes and wired localized role names into the authenticated shell.
- [x] Added encoding-safe Flutter localized role labels to the workspace selector while retaining Material RTL switching.
- [x] Added Arabic labels for the shared Flutter role-action cards while preserving stable English action keys for navigation.
- [x] Localized the Flutter persistent Home, Orders, and Profile navigation labels for Arabic RTL users without changing navigation behavior.
- [x] Added an explicit semantic label for the Flutter role-action group so assistive technologies identify the active workspace context.
- [x] Constrained the shared Flutter role workspace to a tablet/web-friendly maximum width while retaining responsive phone padding and scrolling.
- [x] Added stable action-specific idempotency keys to React administrative and partner decisions, complaint status updates, delivery reassignment, document review, and account-status mutations.
- [x] Added the same stable idempotency protection to React rating moderation actions.
- [x] Extended React idempotency keys to notification read-state, user-role, partner correction, prescription review, and notification-preference mutations.
- [x] Exposed `Retry-After` through Laravel CORS so React can honor idempotency in-progress and readiness backoff guidance cross-origin.
- [x] Added idempotency replay and retry headers to the shared OpenAPI conflict response contract.
- [x] Added targeted compound indexes for patient/pharmacy order queues, delivery claims, procurement queues, complaints, and audit-log chronology through a reversible Laravel migration.
- [x] Strengthened the native Windows release validator to reject synchronous production queues and require explicit cache configuration.
- [x] Documented the readiness endpoint's `Retry-After: 30` response header in OpenAPI for traffic-manager backoff integration.
- [x] Added backend normalization for the existing mojibake Arabic notification catalog so localized operational messages render correctly without affecting English or valid UTF-8 values.
- [x] Extended React localization into the shared operational portal page for section titles, queue/directory labels, workflow guidance, live-data marker, and search placeholder.
- [x] Localized the Flutter role-home greeting, search hints, catalog/workspace heading, and empty-search action for Arabic and English.
- [x] Localized the React live dashboard role workspace heading using the active profile locale.
- [x] Serialized saved-address default selection against the owning user row so concurrent address writes cannot create conflicting default-address state.
- [x] Added explicit React mobile-menu accessibility state, signed-in-user labeling, keyboard focus treatment, and reduced-motion support.
- [x] Added current-user rating state to order details and hid the mobile rating action after feedback is already recorded.
- [x] Documented the order-detail rating-state field in the OpenAPI summary for client interoperability.
- [x] Added stable idempotency keys and same-key transient retry handling to Flutter saved-address create, update, and delete API mutations.
- [x] Documented saved-address idempotency headers and update payloads in the OpenAPI and API contract handoff.
- [x] Localized the Flutter role-selection and sign-in entry points, including workspace, credential, recovery, registration, and guest-browse actions.
- [x] Localized Flutter operational workflow controls for patient orders, partner decisions, driver delivery lifecycle, navigation, retry, and failure recovery.
- [x] Moved the React settings, notification-channel preferences, locale selector, and administrator 2FA controls onto the shared translation catalog with localized form labels and accessible controls.
- [x] Extended the native Windows release guard and handoff documentation for secure sessions, private storage, explicit CORS, upload scanning, approved subscription/map configuration, and complete-or-disabled SMS credentials.
- [x] Added an owner-facing operations recovery runbook for stuck orders/deliveries, notification failures, payment-proof review, private-file recovery, incident severity, and rollback boundaries.
- [x] Completed Flutter critical-mutation recovery for driver claims/statuses/completion and pharmacy/warehouse decisions with stable idempotency keys and retry actions.
- [x] Aligned OpenAPI and API contract documentation with idempotent delivery claims and partner/procurement decisions, including same-key retry guidance.
- [x] Added stable idempotency keys and bounded same-key retry handling to React and Flutter partner inventory updates.
- [x] Added stable idempotency keys to Flutter order cancellation, profile locale, consent, notification preference, driver availability, and notification read-state mutations.
- [x] Extended React idempotency coverage to privacy consent, profile locale, administrator 2FA, medicine/catalog import, medicine category, and medicine update/deactivation mutations.
- [x] Completed Laravel mutation-route throttling for 2FA, device tokens, notification preferences, medicine deactivation, administrative decisions/statuses, prescription review, and complaint updates.
- [x] Closed the remaining authenticated mutation-throttle gaps for profile updates, logout, and saved-address create/update/delete routes.
- [x] Documented the complete authenticated mutation-rate-limit invariant and same-key `Retry-After` behavior in the security and API handoff documentation.
- [x] Added OpenAPI idempotency-header declarations for profile, 2FA, catalog, notification read, user status, and verification decision mutations.
- [x] Added a shared React OperationsPage in-flight mutation guard with safe same-action retry messaging for partner, order, procurement, payment, complaint, delivery, user, and document actions.
- [x] Applied the same React in-flight guard to partner inventory saves, preserving stock-update idempotency and preventing duplicate form submissions.
- [x] Added a same-key retry action to Flutter notification read-state mutations so transient failures remain recoverable without duplicate state changes.
- [x] Added an in-flight guard to Flutter patient order cancellation so reservation-release requests cannot be double-submitted from repeated taps.
- [x] Added a save-state guard to Flutter driver availability changes so repeated switch taps cannot overlap operational availability mutations.
- [x] Added per-channel save guards to Flutter notification preferences so rapid toggles cannot overlap preference mutations.
- [x] Added per-consent save guards to Flutter privacy controls so grant/revoke audit mutations cannot overlap.
- [x] Added per-address delete guards to Flutter saved addresses so repeated taps cannot overlap deletion mutations.
- [x] Added an in-flight guard to Flutter saved-address creation so duplicate add dialogs/submissions cannot overlap.
- [x] Added same-key retry feedback to Flutter saved-address deletion so transient failures remain recoverable without duplicate effects.
- [x] Made saved-address deletion transactional and promote an owned replacement when deleting the default address, preserving checkout default-address integrity.
- [x] Added a release configuration matrix covering protected API, database, notification, map, backup, React/IIS, Flutter signing, and owner approval gates, and linked it from the native Windows handoff.
- [x] Completed Flutter Arabic/English localization for password recovery and patient/partner registration entry flows, including labels, actions, and role text.
- [x] Extended Flutter localization into the authenticated profile menu, verification prompt, saved-address navigation, support, notification preferences, privacy entry, and sign-out actions.
- [x] Extended Flutter localization into privacy-consent choices and saved-address creation/list states while preserving existing consent and duplicate-mutation guards.
- [x] Extended Flutter localization into verification-document upload/list actions and notification-channel preferences.
- [x] Made device-token registration lock the token row and atomically update ownership, encryption, activity, and revocation state.
- [x] Serialized consent grant/revoke and notification-preference first-write/upsert workflows with a per-user row lock, preventing concurrent duplicate active state.
- [x] Completed the rating duplicate-submission guard by wiring the database-constraint exception path, preserving safe concurrent conflict responses.
- [x] Made catalog image creation and replacement exception-safe, deleting failed uploads and retaining the previous image until the database update succeeds.
- [x] Restricted complaint assignment targets to administrator accounts, preventing support records from being assigned to ordinary users.
- [x] Moved procurement delivery creation and PIN generation into the warehouse decision transaction so an accepted procurement cannot commit without its delivery workflow record.
- [x] Added exception-safe cleanup for private payment-proof and prescription files when their database transaction fails, and locked prescription upload state to prevent duplicate concurrent submissions.
- [x] Locked pharmacist prescription review transitions and required the pending-review state, preventing duplicate concurrent approve/reject decisions.
- [x] Revalidated driver approval and availability under row locks during delivery claims, and enforced approved-driver ownership for status and PIN-completion mutations.
- [x] Moved patient-order delivery creation and PIN generation into the pharmacy decision transaction so accepted orders cannot commit without a delivery workflow record.
- [x] Locked administrator partner approvals and subscription payment reviews, requiring an eligible pending state before committing a decision.
- [x] Added exception-safe cleanup for private complaint attachments and locked complaint status updates to prevent orphaned files and concurrent finalization.
- [x] Made registration atomic for user plus partner/driver profile creation, with verification email and administrative notifications dispatched only after the account transaction commits.
- [x] Made password reset token validation, password update, token revocation, and token consumption one locked transaction to prevent concurrent token reuse.
- [x] Made email verification token validation, account verification, and token consumption one locked transaction to prevent concurrent token reuse.
- [x] Made administrator account status changes and suspended-user token revocation one locked transaction, preventing a partial suspension boundary.
- [x] Added a locked account-status recheck immediately before login token issuance, closing the suspension-versus-login race.
- [x] Made administrator role changes validate related partner/driver profiles and update the user role under one row-locked transaction.
- [x] Added exception-safe cleanup for private verification documents and locked administrator verification decisions to the pending-review state.
- [x] Audited the React settings page for the previously noted legacy duplicate render; confirmed it is unreachable after the localized return. Cleanup is deferred until the source encoding can be normalized safely, avoiding an unsafe broad rewrite during release hardening.
- [x] Restored the explicit React hook and class imports in the web entry component so the source has no implicit hook/runtime symbol dependency.
- [x] Made React procurement and subscription payment-proof mutations retain the same idempotency key across retry attempts, while clearing the key only after a successful commit.
- [x] Preserved the saved-address default invariant during transactional updates: changing the current default now promotes an owned replacement, and the target row is locked inside the same transaction to prevent delete/update races.
- [x] Revalidated and row-locked the selected pharmacy inside the patient order transaction, preventing approval or subscription-status changes from racing with stock reservation and order creation.
- [x] Prevented inventory upserts from lowering quantity below active reservations; the transaction now rejects the adjustment instead of silently truncating reserved stock.
- [x] Revalidated and row-locked both pharmacy and warehouse partner availability inside procurement creation, preventing partner-status races during warehouse stock reservation.
- [x] Revalidated and row-locked the warehouse during procurement decisions and the pharmacy during order decisions, preventing inactive partners from committing acceptance, reservation release, or delivery creation.
- [x] Corrected subscription approval timing so the paid period starts when an administrator approves the proof rather than when it was submitted, while locking the partner status update in the same decision transaction.
- [x] Added Flutter in-flight guards for notification reads, pharmacy/warehouse decisions, and prescription uploads, preserving retry-safe idempotency keys while preventing overlapping client mutations.
- [x] Serialized cart creation, quantity updates, and clearing on the user/cart transaction boundary, and added a Flutter per-medicine quantity mutation guard.
- [x] Corrected Flutter workflow Arabic localization values that were double-escaped and would have rendered literal Unicode escape text instead of translated actions.
- [x] Extended backend notification Arabic normalization to repair the catalog's `Ø`/`Ù` mojibake signature before messages are persisted or dispatched.
- [x] Serialized partner payment-proof submissions and rejected a second concurrent `payment_under_review` subscription, preventing duplicate pending billing workflows and orphaned proof records.
- [x] Serialized verification-document uploads per user/type and rejected duplicate under-review documents, preventing parallel sensitive submissions.
- [x] Required an approved, active pharmacy during prescription review both before and inside the locked order/prescription transaction.
- [x] Added per-key React in-flight guards for privacy consent and notification preference toggles, with functional rollback after failed writes.
- [x] Removed the unreachable legacy non-localized SettingsPage render from the React client using an exact source-derived edit, leaving the localized settings path as the single render boundary.
- [x] Revalidated and row-locked partner approval and subscription eligibility inside inventory upserts, preventing suspended or inactive partners from committing stock mutations.
- [x] Added a Flutter keyed in-flight guard around completed-order rating submission, preserving the backend duplicate-rating boundary while preventing overlapping mobile requests.
- [x] Required active subscriptions, in addition to approval, for partner-scoped delivery and procurement detail reads, closing inactive-partner operational data access.
- [x] Required approved active partner eligibility for dashboard metrics and pharmacy prescription downloads, closing remaining inactive-partner read access to operational and private data.
- [x] Made scheduled subscription expiry transitions conditional on their prior status, preventing overlapping scheduler runs from duplicating expiry notifications or partner deactivation side effects.
- [x] Centralized fallback-safe React mutation identifiers and applied them to medicine and category creation, preventing unguarded UUID calls in unsupported browser contexts.
- [x] Made Flutter saved-address creation reuse its idempotency key for the same failed payload and clear it only after success, preventing lost-response retries from creating duplicate addresses.
- [x] Made Flutter support complaint creation reuse its idempotency key for the same failed payload and clear it only after success, preventing lost-response retries from creating duplicate complaints.
- [x] Added per-notification React in-flight protection for mark-as-read actions, preventing duplicate read mutations from overlapping in the notification popover.
- [x] Added per-rating/action React in-flight protection for administrator moderation, preventing duplicate hide/restore mutations outside the shared operations queue.
- [x] Added `docs/RETENTION_AND_DELETION_POLICY.md` and linked it from security operations and release handoff, defining conservative retention defaults, account deletion/anonymization workflow, legal holds, private-file safeguards, backup behavior, and the owner approval gate for permanent deletion.
- [x] Added bounded same-key network retries for Flutter verification-document, prescription, and complaint-attachment multipart mutations; each retry rebuilds the request stream while preserving the original idempotency key.
- [x] Added a Flutter verification-document upload guard and deterministic mutation key so repeated taps or lost responses cannot create parallel document submissions.
- [x] Hardened Laravel idempotency reservations by releasing unfinished reservations when the owning request throws and allowing explicitly stale reservations to be recovered after the configured timeout, preventing permanent `IDEMPOTENCY_REQUEST_IN_PROGRESS` deadlocks after worker failure.
- [x] Documented `MEDLINE_IDEMPOTENCY_IN_PROGRESS_TIMEOUT_SECONDS` in the environment example, Windows operations guide, and release configuration matrix.
- [x] Expanded the React localization catalog and applied locale-aware labels to the notification popover and partner subscription/payment-proof workflow, including Arabic RTL-compatible text and submission states.
- [x] Replaced the React localization catalog with one canonical English/Arabic definition after source review found a duplicate Arabic block, preserving all shared keys without ambiguous overrides.
- [x] Added Laravel production HTTPS enforcement, API `HTTPS_REQUIRED` responses, secure non-API redirects, local-development opt-out, and native Windows reverse-proxy configuration guidance.
- [x] Added production-safe secure session-cookie defaults, explicit local cookie settings, bounded Sanctum bearer-token expiration, and release documentation for token lifetime and re-authentication behavior.
- [x] Made registration and login write the configured Sanctum expiration directly into each personal access token's `expires_at` field, keeping token storage and runtime policy aligned.
- [x] Added the scheduled `medline:auth-artifacts-prune` command for expired personal access tokens and password-reset/email-verification artifacts, while preserving legacy non-expiring tokens for controlled owner review.
- [x] Aligned `api/.env.production.example` and the native release validator with HTTPS enforcement, secure/HTTP-only/SameSite cookies, Sanctum token lifetime, and idempotency recovery timeout requirements.
- [x] Reconciled the debounced catalog search requirement with the `/medicines` and `/medicines/suggestions` APIs, 30-second cached relevance scoring, empty-result suggestions, React's 300 ms debounce, and Flutter's 350 ms generation-guarded debounce.
- [x] Localized shared React pharmacy and warehouse operational queues: inventory placeholders, table headings/states, and approval, fulfillment, delivery, complaint, subscription, and audit actions now use the canonical English/Arabic catalog while preserving RTL/LTR layout behavior.
- [x] Expanded Flutter's shared Arabic/English catalog across medicine details, prescription guidance, approved pharmacies, cart and delivery-address labels, checkout feedback, notifications, language selection, and local-save feedback; corrected Unicode escapes in the added catalog.
- [x] Extended the Flutter catalog to subscription payment/status and partner inventory workflows, including Arabic dialog labels, status fallbacks, inventory navigation, and empty states.
- [x] Extended Flutter operation localization to support request creation/listing, procurement request entry, failed-delivery and delivery-PIN dialogs, prescription-upload feedback, and completed-order rating dialogs.
- [x] Localized Flutter order-detail presentation for title, rating, delivery PIN, invoice summary, subtotal, delivery fee, total, payment, delivery timeline, and empty-timeline state while preserving server-provided order data.
- [x] Localized remaining Flutter dynamic dashboard metrics, driver availability/approval presentation, and patient/partner empty-workspace messages through the shared Arabic/English helpers.
- [x] Added a shared Flutter status-label mapper for common order, delivery, partner, complaint, and review states, and applied it to the operational queue while preserving raw server status values for workflow decisions.
- [x] Added React operational accessibility refinements: notification popovers expose expanded/region semantics, unread indicators are hidden from assistive technology, operational tables expose loading state and live status, search fields receive localized accessible labels, and icon-only search/menu controls are marked appropriately.
- [x] Added React catalog search-generation guards so changing the query immediately invalidates prior medicine and suggestion requests; delayed responses can no longer overwrite newer search results while the 300 ms debounce remains intact.
- [x] Passed the active locale into React medicine, category, and medicine-edit admin surfaces, added locale-aware document titles, and expanded the canonical English/Arabic catalog keys for remaining catalog form/action copy; the visible admin form translation pass remains in progress.
- [x] Localized the visible React medicine catalog administration surface: headings, CSV import/export controls, bilingual medicine fields, prescription state, loading state, and deactivation action now use the shared English/Arabic catalog.
- [x] Localized the remaining visible React category and medicine-edit catalog forms, including headings, field placeholders, selectors, checkbox labels, save/cancel/edit actions, and accessible field labels; added Arabic field-label fallbacks in the translation resolver.
- [x] Localized the React ratings moderation queue, including trust-and-safety guidance, search, table headings, visibility states, hide/restore actions, no-data messaging, hide-reason prompt, and accessible status messaging.
- [x] Localized the React notification-delivery health panel, including health period, operational status, attempt/failure metrics, empty state, provider fallbacks, and accessible failure presentation.
- [x] Localized the React dashboard operational alerts panel, including headings, live-data state, empty state, fallback alert text, severity labels, and accessible status semantics.
- [x] Localized the live React dashboard catalog/search surface and role metrics, including guidance, catalog/search headings, placeholder, loading/empty states, manufacturer/prescription labels, live status, role-metric details, and empty-result suggestions.
- [x] Added root `.editorconfig` and `CONTRIBUTING.md`, documenting native Windows contribution/release conventions, tracker continuation, security boundaries, localization expectations, verification ownership, and definition of done; reconciled the evidence-backed Phase 0 checklist items.
- [x] Added `docs/DESIGN_SYSTEM.md` covering implemented MedLine brand tokens, responsive web/mobile layouts, reusable interaction/state patterns, RTL/LTR and accessibility rules, sensitive-data UI boundaries, and patient/partner/driver/admin workflow composition; reconciled the evidence-backed Phase 2 design checklist items.
- [x] Added `docs/DOMAIN_SPECIFICATION.md` consolidating implemented role permissions, order/procurement/delivery/subscription/complaint/rating state machines, notification event recipients, transaction invariants, and explicit owner/legal/provider decision boundaries; reconciled the evidence-backed Phase 1 checklist items.
- [x] Replaced the authenticated refresh placeholder with hashed single-use refresh-token rotation: login/registration now issue access plus refresh credentials, refresh rotates atomically, logout/password reset/suspension revoke credentials, and web/mobile clients persist and recover sessions.
- [x] Aligned the refresh-token migration/model, pruning command, environment examples, OpenAPI contract, API workflow documentation, and tracker evidence.
- [x] Corrected the Laravel Arabic notification normalization boundary so single- and double-encoded legacy mojibake catalog entries are reversibly converted before persistence and external delivery; retained the event catalog and provider abstraction.
- [x] Added bounded Flutter access-token recovery: JSON, GET, and multipart requests retry once after a successful refresh-token rotation, the refresh request itself is excluded from recovery recursion, refresh failures remain non-recursive, and concurrent unauthorized responses share one rotation future.
- [x] Added secure browser refresh transport: React requests cookie transport, Laravel issues and clears an encrypted HttpOnly refresh cookie, cookie refresh responses omit the body credential, Flutter retains body-token transport, and trusted-origin credentialed CORS is configurable.
- [x] Aligned release handoff and native Windows deployment guidance with secure browser refresh-cookie, credentialed CORS, and trusted-origin requirements.
- [x] Added privacy-scoped live delivery location: active assigned drivers can submit latest coordinates, authorized active-delivery views can read them, completed/failed/cancelled/reassigned deliveries clear them, no location history is retained, and Flutter submits foreground updates with a bounded location rate limit.
- [x] Added delivery-location API contract, retention policy, domain specification, Android location permissions, and Flutter location-provider dependency/client wiring.
- [x] Added the patient order-detail active-location card with an external map handoff, localized location labels, and completed-order location suppression; also completed the existing order-detail rating action implementation.
- [x] Added active-location fields to the partner delivery-monitoring projection with SQL-level terminal-state suppression.
- [x] Added the React operational delivery-detail active-location panel with active-status gating, terminal-state privacy messaging, latest-update display, and an external OpenStreetMap handoff.
- [x] Localized the React operational delivery-detail and active-location panel through the shared English/Arabic catalog and passed the authenticated locale into the detail view.
- [x] Added bounded 30-second refresh polling to the open React delivery-detail view so operational location/status data stays current without retaining location history or requiring a realtime provider.
- [x] Added Flutter API connectivity signaling and a localized reconnect banner on the role home screen; network failures remain non-destructive and mutation replay remains disabled.
- [x] Namespaced Flutter encrypted read-cache keys by authenticated user identity and reset the namespace on sign-out to prevent cross-account cached orders, addresses, or cart data on shared devices.
- [x] Hardened Laravel notification persistence so in-app records and external notification jobs are registered only after an enclosing domain transaction commits; notifications now cannot survive a rolled-back order, delivery, subscription, or approval mutation.
- [x] Added configurable stale-location suppression (`MEDLINE_DELIVERY_LOCATION_STALE_MINUTES`, 10 minutes by default) across patient order/detail, driver, partner, and administrator delivery projections, with API, domain, and retention documentation aligned.
- [x] Added stale-location configuration to the release matrix, native Windows handoff, and release handoff checklist so the freshness window is an explicit owner-controlled production setting.
- [x] Extended the native Windows release validator to require `MEDLINE_DELIVERY_LOCATION_STALE_MINUTES` between 1 and 1440 minutes without displaying protected values or contacting external services.
- [x] Aligned OpenAPI and mobile release documentation with active-delivery stale-coordinate suppression and the owner-controlled freshness window.
- [x] Hardened the production authentication handoff by changing the production template to a 60-minute Sanctum access-token lifetime while retaining rotating refresh credentials, and aligned security/release documentation.
- [x] Added bounded configurable database transaction retries to delivery claim, status, active-location, and PIN-completion row-lock workflows; documented `MEDLINE_DATABASE_TRANSACTION_ATTEMPTS` and intentionally excluded file-storage transactions from blind replay.
- [x] Added structured `medline.database.deadlock_exhausted` logging around those delivery transactions and documented the alert/recovery signal for exhausted retry budgets.
- [x] Added shared React accessibility styling for keyboard focus visibility, reduced motion, coarse-pointer touch target sizing, and high-contrast presentation across the web portal.
- [x] Added Flutter semantic tooltips for role-home notification and reconnect actions so key live-workspace controls are announced by assistive technologies.
- [x] Localized and labeled the Flutter patient order-detail OpenStreetMap action for Arabic/English assistive access.
- [x] Added bounded 30-second foreground polling and lifecycle cleanup to the Flutter administrator operations dashboard so metrics and alerts refresh while the screen is open without background services.

---

# Future Enhancements

## 2026-08-19 Localhost implementation record

- [x] Added Laravel Reverb `ShouldBroadcastNow` notification events on private `users.{id}` channels, authenticated broadcasting routes, and React Echo subscription with polling fallback.
- [x] Kept localhost queue synchronous, cache file-backed, payment providers disabled, and email triggered by Laravel's log mailer. ClamAV remains an explicit production boundary and is disabled for the local test loop.
- [x] Added localhost SYP, zero-tax, 2,500 delivery-fee, annual subscription, and seven-day grace-period defaults; legal/accounting confirmation remains required before production.
- [x] Fixed PHP 8.2 nested ternary parse failures, Laravel query-builder `whereKey()` seeder failure, and the incompatible queued-job `$afterCommit` property.
- [x] Added `NotificationBroadcastTest`; automated backend result: 17 tests and 38 assertions passed. Web `npm run build` passed. PHPUnit coverage command is currently unavailable because the installed PHP has no Xdebug/PCOV driver. Flutter analysis/test was attempted but the installed SDK initialization did not complete within the bounded run.
- [x] Initialized the single root Git repository with `muazmalas@gmail.com` and remote `git@github.com:muazmalas/medline.git`; local `.env` files and toolchain artifacts remain ignored.
- [x] Added Vitest/jsdom/Testing Library UI coverage for notification privacy filtering, login submission/token storage, and password-recovery navigation; added Laravel core workflow coverage for notification access, preferences, plans, and private-channel dispatch.
- [x] Validation result: Laravel `php artisan test` passed 20 tests/50 assertions; API Vite build and React `npm run build` passed; React `npm run test:coverage` reported 5.68% statements, 2.27% branches, 2.79% functions, and 10.67% lines.
- [x] Expanded critical-workflow coverage: prescription-required order gating, approved-driver claim/status transitions, manual subscription proof review, dashboard rendering, and live notification refresh. Latest result: Laravel 23 tests/64 assertions and React 5 tests passed; React coverage is 10.29% statements, 5.45% branches, 7.12% functions, and 17.39% lines. Flutter widget tests are committed but not executable until the local SDK finishes initialization.
- [x] Added the idempotent DemoScenarioSeeder for committee demonstrations. It provisions deterministic users, partner accounts, driver verification, catalog and stock, cart and consent data, pending/prescription/transit/completed/cancelled orders, delivery events and coordinates, procurement, subscription/payment proof, complaint, rating, notifications/email delivery records, and audit history. Re-running php artisan db:seed preserves the same demo record counts. Laravel validation: 24 tests and 73 assertions passed.
- [x] Expanded React workflow coverage to 19 passing UI tests covering administrator 2FA lifecycle, notification read behavior, partner/user/procurement/prescription operations, subscription/consent failure handling, authentication recovery, and telemetry safety. Latest React coverage: 50.26% statements, 37.23% branches, 46.68% functions, and 68.72% lines. React production build and Laravel 24-test/73-assertion suite also pass.
- [x] Fixed duplicate administrator partner/user workspace rendering by placing management panels inside the section router; React validation remains green with 19 tests and 50.11% statement coverage, and the production build passes.
- [x] Split administrator partner management into separate Pharmacies and Warehouses navigation/table views, added backend partner-type filtering, and added company/organization information to role assignments. React validation: 19 tests pass, 49.17% statements and 67.64% lines; targeted Laravel authorization and full 24-test suite pass.
- [x] Added searchable role assignments with server-side user search across name, email, company, and role; shared operational and rating tables retain their existing search controls. React validation: 19 tests pass, 49.24% statements and 67.70% lines; Laravel validation: 24 tests and 73 assertions pass.
- [x] Added shared abbreviated-month date and SYP currency formatters and applied them to the order detail invoice/timeline, with formatter tests. React validation: 19 tests pass and the production build passes.
- [x] Fixed server-backed search for pharmacy/warehouse management and operational order queues, including public ID, status, address, partner name, license, and type matching. Styled role selectors as accessible MedLine dropdowns with native keyboard/mobile behavior and custom visual treatment.
- [x] Redesigned order details with invoice hierarchy, driver assignment card, vehicle/contact details, and responsive stepwise delivery timeline. Validation: 19 React tests pass, 26 Laravel tests/79 assertions pass, and the production build succeeds.
- [x] Added order route mapping with pickup and drop-off coordinates, visual route line, location labels, legend, OpenStreetMap directions link, coordinate fallback state, and demo pharmacy coordinates for committee scenarios. Tests/build intentionally not run per owner instruction.
- [x] Aligned delivery detail with order detail UX: added driver card, assignment/invoice hierarchy, pickup/drop-off route map, live-location panel, and stepwise delivery timeline for active and terminal deliveries. Tests/build intentionally not run per owner instruction.
- [x] Added administrator pharmacy/warehouse detail views with business, license, contact, subscription, address, and OpenStreetMap location details; directory rows now provide a View details action. Tests/build intentionally not run per owner instruction.
- [x] Redesigned operational queue tables as full-width workspaces: removed restrictive card treatment, increased headings/search/table typography, enlarged row spacing and status controls, improved column proportions, and retained a responsive mobile layout. React validation: 19 tests pass and the production build passes.

- [ ] Real-time online payment gateway and webhook reconciliation.
- [ ] SMS verification and delivery notifications.
- [ ] Multiple countries, currencies, and tax configurations.
- [ ] Advanced route optimization.
- [ ] Dispatcher dashboard with automated assignment.
- [ ] Temperature-sensitive medicine logistics.
- [ ] Barcode scanning and warehouse picking workflows.
- [ ] Prescription OCR with pharmacist confirmation.
- [ ] Advanced analytics and demand forecasting.
- [ ] Partner service-level agreements.
