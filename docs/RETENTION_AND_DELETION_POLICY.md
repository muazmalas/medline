# MedLine retention and deletion policy

## Purpose

This policy defines the default retention boundary for MedLine accounts, medical documents, operational records, notifications, audit records, and private files. It is the implementation baseline until the deployment owner obtains legal approval for the launch jurisdiction. A legal hold, regulatory requirement, dispute, investigation, or unresolved financial reconciliation always overrides normal expiry.

The policy is deliberately conservative: a user request to delete an account does not silently remove records needed to prove a prescription decision, stock movement, payment review, delivery, complaint resolution, or administrator action.

## Retention classes

| Data class | Default retention | Deletion or access rule |
|---|---:|---|
| Unverified registration and password-reset tokens | 24 hours or token expiry | Delete during scheduled maintenance; never export in logs. |
| Device tokens and notification delivery attempts | 90 days after last activity/attempt | Revoke immediately on logout or account suspension; prune historical delivery diagnostics after the window. |
| Idempotency records | 7 days | Prune after the retry/replay window has elapsed. |
| User account profile | Until deletion request, closure, or legal hold | Disable access first, revoke tokens, then anonymize non-required profile fields after approval. |
| Addresses and other convenience data | Until removed by the user or account closure | Remove when no longer referenced by an active workflow; preserve only immutable order/procurement snapshots. |
| Prescription files and review metadata | Default 7 years after the related order is closed | Keep private, encrypted where configured, and accessible only to the patient, authorized pharmacy, and approved administrators. Delete the file after retention expiry unless a hold applies; retain only the minimum audit event required by law/policy. |
| Verification documents and payment proofs | Default 7 years after the partner relationship or payment review closes | Keep private and access-audited; delete the private file after expiry while retaining a non-sensitive decision/audit record when required. |
| Complaint attachments | Default 2 years after complaint resolution | Delete private attachments after expiry; retain complaint outcome and non-sensitive audit metadata as required. |
| Orders, procurement, inventory movements, deliveries, invoices, ratings, and complaint outcomes | Default 7 years after closure | Preserve the immutable operational history needed for reconciliation, safety, support, and audit; remove unnecessary direct identifiers after approved anonymization. |
| Latest active-delivery location | Until the delivery becomes failed, reassigned, completed, or cancelled, with stale views suppressed after the configured freshness window | Store only the latest driver coordinate and accuracy; suppress stale coordinates after `MEDLINE_DELIVERY_LOCATION_STALE_MINUTES` (10 minutes by default), clear them when the active delivery ends or is reassigned, and never retain a location history by default. |
| Security and administrator audit logs | Default 2 years | Restrict access to administrators and security operators; preserve longer where an incident or legal hold requires it. |
| Crash/API telemetry | 30 days by default, only when explicitly enabled | Filter sensitive fields before storage; disable the endpoint when owner approval or retention configuration is absent. |
| Backups | As defined by the approved backup schedule and legal hold | Apply the same deletion schedule to backup expiration; do not restore an expired record into production without a documented recovery reason. |

The deployment owner must confirm or replace the default periods with jurisdiction-specific legal, accounting, medical-record, and contractual requirements before production launch. The values above are policy defaults, not legal advice.

## Account deletion workflow

1. Authenticate the request and create an auditable deletion-request record outside the user-visible payload.
2. Check for legal hold, active order/delivery, unresolved complaint, payment review, partner obligations, safety investigation, or other retention reason.
3. If a hold exists, disable optional access and explain that deletion is pending the hold; do not delete evidence.
4. Revoke active access tokens, device tokens, reset/verification tokens, and optional notification channels.
5. Remove convenience data such as saved addresses when it is not needed by an active workflow.
6. Anonymize direct identifiers in retained business records only after the related workflow is closed and the owner has approved the operation. Preserve public IDs, totals, status history, inventory movements, and audit references needed for reconciliation.
7. Delete private files only through an auditable, idempotent retention job that records the object identifier, reason, outcome, and operator/job request ID without recording file contents.
8. Record completion, partial completion, or deferral. A failed file deletion is an operational alert and must be retried; it must not be reported as complete.

## Operational safeguards

- Retention jobs must be scheduled under a restricted service identity and must process bounded batches.
- Every destructive file operation must be preceded by an eligibility check and a legal-hold check.
- Jobs must be safe to retry and must never delete by an unresolved wildcard or user-supplied path.
- Private storage must remain outside public web roots, and signed download URLs must remain short-lived.
- Backups, replicas, exports, queue payloads, and support tickets must be included in deletion and legal-hold reviews.
- The owner must document the approved periods, legal basis, data controller/processor responsibilities, and support escalation before enabling automated private-file expiry.

## Owner release gate

Before production, the owner must approve the retention periods, deletion request channel, legal-hold process, backup expiry behavior, and responsible operator. Until that approval is recorded, MedLine may retain records according to the conservative defaults above, but must not enable an automated job that permanently deletes medical or financial evidence.
