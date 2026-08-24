# MedLine Domain Specification

This document is the implemented source of truth for roles, workflow states, pricing snapshots, stock batches, and decision ownership. Laravel remains authoritative for permissions, transitions, quantities, pricing, and ownership.

## Role and permission matrix

| Capability | Patient | Pharmacy | Warehouse | Driver | Admin |
|---|---:|---:|---:|---:|---:|
| Register, authenticate, recover, and edit profile | Yes | Yes | Yes | Yes | Yes |
| Browse the active medicine catalog | Yes | Yes | Yes | Delivery manifest only | Yes |
| Create a patient medicine order | Yes | No | No | No | No |
| Upload an item-specific prescription | Own order | No | No | No | Authorized review only |
| Review patient order quantities | No | Own pharmacy queue | No | No | Read/intervention scope |
| Create a pharmacy procurement request | No | Yes | No | No | Read scope |
| Review procurement quantities and batches | No | No | Own warehouse queue | No | Read/intervention scope |
| Adjust inventory | No | Own pharmacy inventory | Own warehouse inventory and batches | No | Controlled administration |
| Review and claim available deliveries | No | Monitor related jobs | Monitor related jobs | Eligible jobs for own vehicle type | Monitor/reassign |
| Update delivery progress and confirm PIN | No | No | No | Own assigned delivery | Reassignment only |
| Submit subscription payment evidence | No | Own pharmacy | Own warehouse | No | Review and decide |
| Configure vehicle delivery rates | No | No | No | No | Yes |
| Manage users, organizations, and audit data | No | No | No | No | Yes |

Every protected read and mutation is scoped by role and ownership on the server. Client-side navigation is a usability layer and never substitutes for API authorization. Administrator users do not own or belong to a pharmacy or warehouse.

## Current lifecycle state machines

Only the states in this section are part of active workflows.

### Patient order

- Entry: `prescription_required` when any requested medicine requires evidence; otherwise `pending_pharmacy_review`.
- Prescription branch: `prescription_required` -> `prescription_review` -> `pending_pharmacy_review`. A rejected or missing item-specific prescription returns the order to `prescription_required`.
- Full acceptance: `pending_pharmacy_review` -> `accepted`.
- Partial acceptance: `pending_pharmacy_review` -> `partial_approval_required` -> `partially_accepted` or `partial_offer_rejected`.
- Terminal outcomes: `rejected`, `cancelled`, and `completed`.

An `accepted` or `partially_accepted` order owns a separate delivery record. Delivery progress is not duplicated in the order status. The order becomes `completed` only after the two secure handoffs are verified and delivery settlement succeeds.

### Pharmacy procurement

- Entry: `pending_warehouse_review`.
- Full acceptance: `pending_warehouse_review` -> `accepted`.
- Partial acceptance: `pending_warehouse_review` -> `partial_approval_required` -> `partially_accepted` or `partial_offer_rejected`.
- Terminal outcomes: `rejected` and `completed`.

The warehouse must allocate every fulfilled unit to one or more eligible inventory batches. Fulfilled quantities cannot exceed the pharmacy request. Partial approval and rejection require a warehouse comment, and no delivery is created until the pharmacy accepts a partial offer.

### Delivery

`available` -> `claimed` -> `pickup_started` -> `in_transit` -> `arrived` -> `delivered`

`pickup_started` is entered only when the pharmacy (or procurement warehouse) emails a four-digit pickup code to the assigned driver. When the pickup partner enters that code, the handoff is verified and the delivery immediately reaches `in_transit`; the driver does not start the trip in a separate step. At `arrived`, the driver emails a separate four-digit code to the patient (or procurement pharmacy), enters the code supplied in person, and only then reaches `delivered`.

The driver may report `failed` from an active delivery state, and an unclaimed delivery can be `cancelled`. An administrator can reassign a failed delivery back to `available`. Completion requires the server-verified PIN; concurrent claims and completions are serialized.

Available jobs are filtered to the authenticated driver's approved vehicle type. Before claiming, the driver reviews the route, schedule, captured fee, required vehicle, and medicine pickup manifest in the delivery detail screen.

While a delivery is active and assigned, the driver may submit one latest coordinate. It is visible only to authorized participants while fresh under the configured staleness window. Location history is not retained, and the coordinate is cleared when the delivery fails, is reassigned, is cancelled, or is delivered.

### Pharmacy and warehouse verification

Organization review: `pending` -> `approved`, `rejected`, or `correction_required`. An approved organization can also be `suspended` by an administrator.

Subscription review: `payment_under_review` -> `active`, `rejected`, `correction_required`, or `expired`. Active operational access requires an approved organization plus a currently active subscription. Patient and driver accounts do not have subscriptions.

### Complaint and rating

- Complaint: `open` -> `in_review` -> `resolved` or `rejected`.
- Rating: visible after submission, then administratively hidden or restored. Moderation remains audited and reversible.

## Pricing and scheduling snapshots

- Patient orders and pharmacy procurements support `asap` or a specific scheduled date and time.
- Delivery pricing is versioned independently for `bicycle`, `motorcycle`, `car`, and `van`.
- Every order and procurement permanently records its selected vehicle type, distance, per-kilometre rate, and delivery fee. Later administrator rate changes affect only new requests.
- A reason is required for each rate change, and all versions remain in the audit trail.

## Warehouse stock and batch rules

- Only administrators create medicines in the global catalog.
- A warehouse adds an active catalog medicine as a separate batch record instead of overwriting an older batch.
- Each batch records quantity, reserved quantity, unit price, low-stock threshold, batch or lot number, manufactured date, expiry date, received date, storage location, and active state.
- Warehouse approval allocates the exact fulfilled quantity across eligible batches. Completion consumes those reservations and replenishes the pharmacy inventory.
- A warehouse can disable a batch for new pharmacy requests without deleting its history or breaking existing reservations.

## Notification event matrix

| Event | In-app | Push | Email/SMS adapter | Recipients |
|---|---:|---:|---:|---|
| Organization application decision | Yes | Configurable | Configurable | Pharmacy or warehouse |
| Prescription submitted or reviewed | Yes | Configurable | Configurable | Patient and pharmacy |
| Order decision or status change | Yes | Configurable | Configurable | Patient and pharmacy |
| Procurement decision or status change | Yes | Configurable | Configurable | Pharmacy and warehouse |
| Delivery availability, claim, progress, failure, or completion | Yes | Configurable | Configurable | Authorized participants |
| Subscription proof, correction, approval, or expiry | Yes | Configurable | Configurable | Organization and admin |
| Complaint assignment or resolution | Yes | Configurable | Configurable | Participant and admin |
| Security or session event | Yes where applicable | Configurable | Configurable | Account owner and admin |

Notifications are persisted only after the domain transaction succeeds. External delivery is queued and retried separately. Payloads exclude PINs, credentials, private file paths, prescription contents, and payment evidence.

## Owner decision boundaries

The following remain explicit owner, legal, or provider decisions rather than invented application behavior:

- Syrian payment or wallet provider and merchant process.
- Prescription and medication-delivery legal policy.
- Delivery zones, operating hours, currency, tax, and base vehicle rates.
- Subscription prices, grace periods, renewal rules, and legal evidence requirements.
- Production domains, certificates, provider accounts, secrets, Firebase configuration, and signing keys.
