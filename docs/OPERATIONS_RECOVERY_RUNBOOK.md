# MedLine Operations and Recovery Runbook

This runbook is for the deployment owner and authorized operations administrators. It covers recovery of stuck work without bypassing Laravel authorization, audit logging, inventory reservations, or idempotency protections.

## Incident record

For every incident, record the release version, UTC time window, affected public order/delivery/complaint identifiers, actor role, API `X-Request-ID`, queue/job reference, and current database/readiness state. Never place bearer tokens, request bodies, delivery PINs, prescriptions, payment proofs, or raw provider credentials in the incident record.

## Severity and first response

| Severity | Example | First response |
|---|---|---|
| SEV-1 | Unauthorized medical-data access, stock corruption, duplicate settlement, or platform-wide outage | Freeze affected critical mutations, preserve evidence, page the technical and security owners, and gate traffic through readiness until the boundary is understood. |
| SEV-2 | Regional delivery failure, queue backlog, repeated notification-provider failure, or partner-wide ordering outage | Preserve request IDs and queue evidence, pause the affected operational action if needed, and escalate to the technical owner and operations lead. |
| SEV-3 | One stuck order, delivery, complaint, or user workflow with a safe manual recovery path | Open an operational ticket, use the audited administrator workflow, and monitor the next state transition. |

## Stuck patient order

1. Read the order state, reservation rows, inventory movement ledger, delivery record, and audit history together.
2. Confirm whether a prescription review, pharmacy decision, payment review, or delivery transition is awaiting a legitimate actor.
3. If the order is eligible for cancellation, use the authenticated cancellation workflow so reservations are released transactionally.
4. If the order is accepted but has no valid delivery, do not create a second order or manually decrement stock. Escalate for the audited delivery preparation/reassignment workflow.
5. After recovery, reconcile `reserved_quantity`, movement entries, order totals, and notification attempts before closing the incident.

## Stuck driver or procurement delivery

1. Check the delivery status, assigned driver, claim timestamp, transition events, PIN-attempt counters, and source reservation.
2. Allow the scheduled stale-claim command to release abandoned `claimed` work; use the configured timeout rather than changing rows manually.
3. For a failed or PIN-locked delivery, use the administrator reassignment action. Reassignment must reset the lock state and create an audit/event record.
4. Do not disclose exact delivery addresses or patient PINs to unassigned drivers.
5. Verify that a completed delivery has exactly one completion outcome and one corresponding inventory/payment settlement before closing.

## Failed notifications or queue backlog

1. Check queue worker health, failed jobs, readiness, provider attempt status, and the redacted provider response.
2. Check for `medline.database.deadlock_exhausted` events and confirm the affected critical mutation has either rolled back or has an idempotency record before retrying it.
3. Confirm the user-facing in-app notification exists before retrying external delivery.
4. Restore the queue worker or provider configuration, then retry through the queue’s supported mechanism; do not duplicate business mutations to resend a notification.
5. Revoke invalid device tokens through the device-token lifecycle and preserve the notification reference for support.
6. Escalate repeated `medline.notification.delivery_failed` events and review `/api/v1/admin/notification-delivery-health`.

## Payment-proof or subscription review backlog

1. Confirm the private proof remains in protected storage and use the signed download-ticket flow.
2. Review the subscription state, partner type, plan metadata, payment-proof audit event, and reviewer identity.
3. Do not approve a proof by changing a database status directly; use the administrator review workflow so access checks, notifications, and audit records remain consistent.
4. If the proof is unavailable, preserve the record and escalate to storage recovery before requesting a new payment.

## Lost private file or storage incident

1. Gate affected upload/download traffic if private-storage readiness fails.
2. Preserve the database metadata and audit record; do not expose a local path or copy a private file into a public web root.
3. Recover from the approved encrypted object/database backup into an isolated maintenance location first.
4. Restore production storage only after ACL, malware-scanner, signed-URL, and retention review by the owner.

## Rollback boundary

Freeze new critical mutations, preserve the current database and encrypted backup, and record migration/configuration revisions before rollback. Never delete migrations, restore files over an active transaction, or replay an order/payment/delivery mutation with a new idempotency key. A rollback owner must approve schema compatibility and the reconciliation plan.

## Closure checklist

- [ ] Impact, public identifiers, request IDs, and UTC timeline recorded without sensitive payloads.
- [ ] Business state, reservation/ledger state, delivery events, audit events, and notification attempts reconciled.
- [ ] Recovery performed through an authorized workflow or an owner-approved isolated restore.
- [ ] No duplicate order, claim, completion, payment settlement, or inventory movement introduced.
- [ ] Customer/partner communication and escalation outcome recorded.
- [ ] Follow-up action added to the release or maintenance tracker.
