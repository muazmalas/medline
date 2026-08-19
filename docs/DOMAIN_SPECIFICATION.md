# MedLine Domain Specification

This document consolidates the implemented role matrix, lifecycle states, notification events, and owner decision boundaries. Laravel remains the authority for permissions, transitions, quantities, pricing, and ownership.

## Role and permission matrix

| Capability | Patient | Pharmacy | Warehouse | Driver | Admin |
|---|---:|---:|---:|---:|---:|
| Register/login/recovery/profile | Yes | Yes | Yes | Yes | Yes |
| Browse approved catalog/partners | Yes | Yes | Yes | Scoped | Yes |
| Cart and patient order creation | Yes | No | No | No | Support/read scope |
| Prescription upload | Yes, own order | No | No | No | Authorized review scope |
| Patient order review | Own history | Own pharmacy queue | No | No | Operational read/intervention |
| Procurement creation | No | Yes | No | No | Operational read |
| Procurement decision | No | No | Own warehouse queue | No | Operational read/intervention |
| Inventory adjustment | No | Own pharmacy inventory | Own warehouse inventory | No | Controlled administration |
| Delivery claim/status/PIN completion | No | Scoped monitoring | Scoped monitoring | Own eligible deliveries | Monitoring/reassignment |
| Subscription/payment proof | No | Own partner | Own partner | No | Plan/proof approval |
| Complaints/ratings | Create own | Create own | Create own | Create own | Assignment, reports, moderation |
| Audit/role management | No | No | No | No | Yes |

Every protected read is ownership- or role-scoped server-side. Client navigation is convenience only and never substitutes for authorization.

## Lifecycle state machines

### Patient order

`pending_pharmacy_review` → `prescription_required` → `prescription_review` → `accepted` / `partially_accepted` → `ready_for_delivery` → `in_delivery` → `completed`

Allowed terminal/recovery states include `rejected`, `cancelled`, and `failed`. Prescription-required orders cannot enter pharmacy decision states until an approved prescription is attached and reviewed.

### Procurement

`pending_warehouse_review` → `accepted` / `partially_accepted` → `ready_for_delivery` → `in_delivery` → `completed`

Warehouse rejection and cancellation are explicit terminal outcomes. Line quantities, inventory availability, ownership, subscription eligibility, and transitions are checked in locked transactions.

### Delivery

`available` → `claimed` → `pickup_started` → `picked_up` → `in_transit` → `arrived` → `completed`

The driver may report `failed` from an active delivery state. A failed delivery can be reassigned by authorized operations. Completion requires the server-verified patient PIN; concurrent claims and completions are serialized.

While a delivery is active and assigned, the driver may submit one latest coordinate. The coordinate is visible only to authorized delivery participants while fresh under the configured staleness window, is not written to the event timeline, and is cleared when the delivery fails, is reassigned, is cancelled, or completes.

### Partner and subscription

Partner approval: `pending` → `approved` / `rejected` / `correction_required` / `suspended`.

Subscription review: `payment_under_review` → `active` / `rejected` / `expired`. Active partner access requires approval plus an active subscription. Plan amount and duration are deployment/legal-owner configuration, while approval time determines the active period.

### Complaint and rating

Complaint: `open` → `in_review` → `resolved` (with authorized reassignment and private evidence access controls).

Rating: submitted for a completed order, then visible or administratively hidden. Hide/restore decisions are audited and reversible.

## Notification event matrix

| Event | In-app | Push | Email/SMS adapter | Recipients |
|---|---:|---:|---:|---|
| Partner application decision | Yes | Configurable | Configurable | Partner |
| Prescription submitted/reviewed | Yes | Configurable | Configurable | Patient/pharmacy |
| Order decision/status change | Yes | Configurable | Configurable | Patient/pharmacy |
| Procurement decision/status change | Yes | Configurable | Configurable | Pharmacy/warehouse |
| Delivery claim/status/failure/completion | Yes | Configurable | Configurable | Patient/driver/partner |
| Subscription proof/approval/expiry | Yes | Configurable | Configurable | Partner/admin |
| Complaint assignment/resolution | Yes | Configurable | Configurable | Participant/admin |
| Security/session event | Yes where applicable | Configurable | Configurable | Account owner/admin |

In-app notification persistence occurs after the successful domain transaction. External delivery is queued separately, retried at the provider boundary, and recorded without rolling back the business transaction. Payloads exclude PINs, credentials, private paths, prescription contents, and payment evidence.

## Owner decision boundaries

The following remain explicit owner/legal/provider decisions and are not invented by the implementation:

- Syrian payment/wallet provider and merchant process.
- Prescription and medication-delivery legal policy.
- Delivery zones, service hours, fees, currency, and tax rules.
- Annual subscription price, grace period, and renewal policy.
- Production domains, DNS, certificates, provider accounts, secrets, Firebase values, and signing keys.

These decisions are represented as configuration or release gates where possible and are tracked in `MEDLINE_IMPLEMENTATION_TRACKER.md`.
