# MedLine Entity Relationship Map

This document is the implementation-level relationship map for the MySQL schema. Foreign keys in `api/database/migrations/` are authoritative.

```text
users
  ├─< partners ─< partner_documents
  │            └─< subscriptions ─< payment_proofs
  ├─< addresses
  ├─< orders ─< order_items >─ medicines >─ medicine_categories
  │     ├─< prescriptions ─< prescription_reviews
  │     ├─< deliveries ─< delivery_events
  │     ├─< complaints ─< complaint_attachments
  │     └─< ratings
  ├─< notifications
  ├─< device_tokens
  ├─< audit_logs
  └─< procurement_orders ─< procurement_items >─ medicines

partners
  ├─< pharmacy_inventory >─ medicines
  └─< procurement_orders (source warehouse / destination pharmacy)

medicines
  ├─< inventory_movements
  └─< inventory_reservations
```

## Ownership boundaries

- A user owns their addresses, notifications, device tokens, consents, and authored ratings.
- A patient owns their orders, prescriptions, complaints, and saved addresses.
- A pharmacy owns pharmacy inventory and fulfills patient orders.
- A warehouse owns warehouse inventory and accepts pharmacy procurement.
- A driver owns delivery claims and delivery status actions through server authorization.
- Administrators moderate partner approvals, documents, subscriptions, complaints, ratings, and audit records.

## Transaction boundaries

- Order creation reserves stock, creates order items, snapshots the delivery address, and records idempotency atomically.
- Procurement creation reserves warehouse stock and creates procurement items atomically.
- Delivery completion converts reservations into inventory movements atomically.
- Subscription proof submission creates the subscription and private proof record atomically.

Public identifiers, monetary precision, retention, and privacy rules are documented in `docs/API_CONTRACT.md`, `docs/PRIVACY_AND_RETENTION.md`, and the migration schema.
