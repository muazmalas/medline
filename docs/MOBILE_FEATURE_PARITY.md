# MedLine Mobile Feature Parity

This document is the implementation map for the Flutter application. It covers the current production workflow only; retired order, procurement, and delivery states are not exposed by the mobile client.

The Laravel API remains authoritative for authorization, ownership, workflow transitions, pricing, stock reservations, private files, delivery PIN verification, and audit history. Hiding a mobile menu item is never treated as an authorization boundary.

## Shared mobile foundation

- Role-specific authenticated workspaces for patient, pharmacy, warehouse, driver, and administrator accounts.
- Encrypted bearer and refresh-token storage, session restoration, token rotation, logout, and role mismatch rejection.
- Password recovery, profile and phone editing, password changes, persisted locale choice, notification preferences, privacy consents, complaints, and evidence uploads.
- Administrator authenticator setup, confirmation, disable, and enforced six-digit code at subsequent sign-in.
- Material 3 design tokens shared across cards, forms, status pills, empty/error/loading states, dialogs, touch targets, and semantic labels.
- Reusable mobile record list with debounced search, status filtering, sort direction, server pagination, rows-per-page selection, pull-to-refresh, and whole-record navigation.
- Styled file selection for prescriptions, payment receipts, verification documents, complaint evidence, medicine images, and spreadsheet imports.
- OpenStreetMap maps with pharmacy, warehouse, driver, pickup, and destination pins. Selected pickup/drop-off pairs show the requested dotted red route indicator.
- Unread notification badge animation, searchable notification history, read/delete actions, and push-token registration.
- Pharmacy and warehouse operational access is restricted until both application and subscription reviews are active. The restricted shell exposes only account, notifications, subscription review/correction, and verification documents.

## Authentication and registration

| Screen / feature | Patient | Pharmacy | Warehouse | Driver | Admin |
|---|---:|---:|---:|---:|---:|
| Sign in, secure session, recovery | Yes | Yes | Yes | Yes | Yes |
| Registration | Basic account | Organization, license, map location, exact plan payment and receipt | Organization, license, map location, exact plan payment and receipt | Identity, vehicle type and plate; no subscription | Provisioned account |
| Verification documents | — | Yes | Yes | Yes | Review queue |
| Organization correction | — | Business, license, address and map pin | Business, license, address and map pin | — | Approve, reject, request correction |
| Subscription | None | Status, start/end dates, plan and corrected receipt | Status, start/end dates, plan and corrected receipt | None | Consolidated payment and application review hub |

Patient and driver registration never creates a subscription. Pharmacy and warehouse registration submits the exact configured plan amount with private payment evidence. An administrator may approve, reject, or request correction; approved subscriptions expose their immutable activation start and end dates.

## Medicine catalog

- Search active medicines by English/Arabic name, manufacturer, code, and form.
- Open a dedicated medicine screen with image, ingredient, strength, form, route, pack, manufacturer, description, indications, directions, side effects, warnings, contraindications, interactions, storage instructions, prescription rule, availability, quantity, and price.
- Medicine links open a dedicated mobile route from catalogs, orders, procurement, inventory, and delivery manifests.
- Only administrators create and edit master medicine records, import Excel/CSV, download an import template, export the catalog, manage categories, and activate/deactivate a medicine.
- Disabled medicines remain recorded but cannot be selected for new warehouse stock, pharmacy procurement, or patient ordering.

## Patient ordering

1. Open Orders and choose **Create order**.
2. Search approved pharmacies with autocomplete and zoom to the selected pharmacy pin.
3. Search one field for medicines, add multiple medicines, choose quantities, and attach one private prescription to every medicine that requires it.
4. Pin a delivery address, add its readable label, select ASAP or an exact future date/time, and choose bicycle, motorcycle, car, or van.
5. Review medicine subtotal, distance, captured per-vehicle rate, delivery fee, tax, and total before submission.
6. On success the draft is discarded, the app returns to Orders, and the new order appears first by creation time.

The order detail screen includes every requested and accepted medicine, per-item price and prescription decision, pharmacist notes, partial-offer explanation, cost snapshot, delivery route, driver, scheduled time, secure PIN, timeline, cancellation eligibility, and rating action.

## Pharmacy order and prescription review

- Search/filter/sort/page the pharmacy-owned order queue and open the whole record.
- View and download each prescription separately for its medicine.
- Approve or reject each prescription with a required rejection note.
- Accept the complete order, reject with patient-facing text, or reduce one or more item quantities and submit a partial offer.
- A partial offer is unavailable until an original quantity has actually been reduced; accepted quantity is always from zero through the requested quantity.
- Partial/rejected decisions require explanatory text. A partial delivery is not created until the patient approves it; excluded medicines and quantities remain recorded.

## Pharmacy procurement and warehouse fulfillment

The pharmacy replenishment builder is a three-step mobile flow:

1. Search and select an eligible warehouse.
2. Search that warehouse's available active stock, add multiple medicines, and choose quantities.
3. Confirm the pharmacy destination, ASAP or scheduled time, vehicle type, captured distance/rate/fee, subtotal, and total.

Every warehouse restock is a separate traceable batch with lot number, manufactured date, expiry date, received date, storage location, quantity, reserved quantity, unit price, low-stock threshold, and active state. Warehouses can add only administrator-created active medicines and may deactivate a batch so it is hidden from new pharmacy requests.

For each procurement request the warehouse can:

- Allocate the fulfilled quantity across one or more eligible batches.
- Accept all only when every requested unit is allocated.
- Partially approve only after reducing at least one quantity, never exceeding the request, and supplying a comment.
- Reject with a comment and release reservations.

The pharmacy must approve a partial warehouse offer before delivery is created. The procurement detail retains requested/accepted quantities, comments, batch-backed price, scheduled delivery, permanently captured rate/distance/fee, total, status, timeline, and pharmacy-only delivery PIN.

## Deliveries and drivers

- Patients, pharmacies, and warehouses see their owned delivery histories.
- Approved available drivers see only open jobs matching their vehicle type, including delivery fee, destination, schedule, and related order.
- A job opens to a complete detail screen before acceptance: dotted route map, pickup/drop-off, schedule, required vehicle, captured price, manifest, quantities, order/procurement reference, driver and event history.
- The driver claims from the detail screen, then records pickup started, picked up, in transit, arrived, delivered with the recipient PIN, or failed with a reason.
- Driver location updates use Android location permission and are accepted only during eligible active states.
- Administrators see all deliveries and can reassign an eligible non-terminal delivery.
- Bicycle, motorcycle, car, and van rates have independent append-only versions. Each order and procurement permanently snapshots the rate version, distance, and fee used at creation.

## Inventory

- Pharmacy, warehouse, and administrator inventory uses the same searchable/filterable/sortable/paginated record pattern as Orders.
- Pharmacy inventory shows available/reserved units, price, owner, and stock health.
- Warehouse inventory additionally exposes every batch and its traceability metadata, low/expired health, and activate/deactivate control.
- Inventory record details link to the dedicated medicine screen.
- Reservations, partial releases, batch replacement, and delivery completion consumption remain transactional server operations.

## Administration

- Mobile dashboard metrics and operational alerts.
- Consolidated **Subscription reviews** tabs for payments, pharmacy applications, and warehouse applications, with proof/document downloads and correction comments.
- Searchable, filterable, sortable, paginated, clickable queues for users, pharmacies, warehouses, subscriptions, verification documents, complaints, ratings, audit log, inventory, orders, procurement, deliveries, medicines, and notifications.
- User role assignment with matching-profile safeguards; suspend/reactivate users and linked pharmacy, warehouse, or driver access.
- Approve/reject/request correction for applications, documents, and subscription payment evidence.
- Complaint workflow from open to review and resolved/rejected with resolution text; rating hide/restore; audit CSV export.
- Medicine/category/import/export lifecycle described above.
- Per-vehicle delivery pricing changes require a reason and display the complete audit trail.
- Notification delivery health shows 24-hour totals by status/channel and recent provider failures.

## Account, settings, and support

- The avatar menu closes when dismissed and exposes profile and logout.
- Profile supports name, phone, language, and password changes.
- Patients manage multiple named map-pinned addresses.
- Pharmacies manage multiple non-overlapping working shifts on the same day.
- All roles manage notification channels, privacy consents, complaints, evidence, and notification history.
- Pharmacy, warehouse, and driver accounts upload and review private verification documents.

## Security and release acceptance

- Direct API links are protected by role middleware and controller ownership checks even when a menu item is absent.
- Prescription, payment, verification, complaint, and delivery PIN data are private; encrypted PIN columns are never returned to mobile clients.
- The pharmacy receives a procurement delivery PIN only through its owned secure procurement detail response. Warehouses and administrators never receive it.
- All critical actions use API idempotency keys and server-side validation; the mobile UI never manufactures workflow state.
- Required Android coarse/fine location permissions are declared.
- Automated acceptance executed on 20 August 2026: Flutter analysis, Flutter widget tests, all-flavor Android debug assembly, Laravel workflow tests, React UI tests, and React production build.

Interactive device acceptance still requires signed-in test accounts for all five roles, real map/network access, camera/file providers, notification provider credentials, and final release signing.
