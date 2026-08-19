# MedLine Environment Promotion Checklist

This is the owner-controlled promotion record for native Windows development, staging, and production environments. It does not create environments, populate secrets, run migrations, or execute validation by itself. Every promotion must have a named owner and an attached release record.

## Promotion record

| Field | Value |
|---|---|
| Source revision | Owner to complete |
| Target environment | Development / staging / production |
| Promotion date | Owner to complete |
| Promotion owner | Owner to complete |
| Rollback owner | Owner to complete |
| Release manifest | Link to protected `release-manifest.json` |
| Change/release record | Link to approved record |

## Development

- [ ] Install PHP 8.2+, Composer, Node/npm, Flutter, and MySQL 8 natively on the Windows development machine.
- [ ] Create a local `medline` database and use local-only credentials; never copy production secrets or medical data.
- [ ] Copy API and web environment templates and generate a local application key.
- [ ] Configure local queue/cache behavior and private storage paths outside public web roots.
- [ ] Use the documented local API, React, and Flutter launch scripts; do not use Docker or containers.
- [ ] Record any schema, provider, policy, or configuration change that must be promoted.

## Staging promotion

- [ ] Create a restricted staging MySQL account and an isolated staging database.
- [ ] Render staging API/web environment files from the approved secret store; reject placeholders, wildcard CORS, debug mode, root database identity, and insecure URLs.
- [ ] Configure staging HTTPS, trusted origins, private storage ACLs, upload scanning, queues, scheduler, notifications, and map provider values.
- [ ] Apply migrations using the approved deployment procedure and record the migration revision.
- [ ] Seed only anonymized, approved staging data; never import production prescriptions, payment proofs, tokens, or private addresses.
- [ ] If staging seeding is approved, provide `MEDLINE_SEED_PASSWORD` through the protected staging environment; `DatabaseSeeder` refuses production and does not accept the local default outside local/testing environments.
- [ ] Publish the React artifact and configure Laravel queue/scheduler identities with least privilege.
- [ ] Register uptime/readiness monitoring and notification-delivery alerts.
- [ ] Run the owner-triggered CI quality gates, dependency audit, security review, and scripted workflow validation.
- [ ] Generate and archive a protected release manifest and record all findings/dispositions.

## Production promotion

- [ ] Approve legal, commercial, privacy, delivery-zone, currency, subscription, and provider policies.
- [ ] Create restricted production MySQL, storage, queue, monitoring, and backup identities.
- [ ] Render production secrets only on the protected release machine; verify the native release validator output without printing values.
- [ ] Confirm HTTPS certificates, trusted CORS origins, secure cookies, private storage ACLs, upload scanner fail-closed behavior, and IIS security policy.
- [ ] Confirm encrypted backups, separate backup storage, retention, RPO/RTO, and an approved restore procedure.
- [ ] Apply migrations with a reviewed compatibility and rollback plan; record the exact migration revision.
- [ ] Start queue workers and scheduler under restricted Windows identities and confirm notification health alert routing.
- [ ] Publish the approved API/web artifacts and signed Flutter artifacts; archive the release manifest and configuration revision.
- [ ] Complete owner API, security, concurrency, restore, accessibility, RTL/LTR, location-permission, and pilot validation before accepting real orders.
- [ ] Publish support contacts, escalation targets, incident severity, rollback owner, and release notes.

## Rollback and promotion failure

- [ ] Freeze critical mutations and preserve the current database, audit records, private storage, configuration revision, and encrypted backups.
- [ ] Confirm schema compatibility before reverting application artifacts; never delete migrations or restore files over active transactions.
- [ ] Use the operations recovery runbook for stuck orders, deliveries, notifications, payment proofs, and private files.
- [ ] Record the failure, decision owner, remediation, data reconciliation, and re-promotion approval.

No Docker or container step is permitted by this checklist.
