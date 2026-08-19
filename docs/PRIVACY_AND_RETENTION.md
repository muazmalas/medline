# MedLine privacy and retention baseline

This is the implementation baseline pending legal approval for the launch market. The deployment owner must replace the placeholders with the approved policy, consent text, retention periods, and support contact before production.

## Data classes

- Account data: name, email, phone, role, status, locale, and verification timestamps.
- Operational data: orders, procurement, delivery events, inventory movements, complaints, ratings, and audit records.
- Sensitive documents: prescriptions, partner identity/license documents, and payment evidence. These remain private and are accessed only through authorized endpoints.
- Security data: password hashes, encrypted TOTP secrets, encrypted device tokens, hashed delivery PINs, request IDs, and audit metadata.

## Baseline controls

- Do not place passwords, bearer tokens, PINs, prescription contents, or private file paths in logs, notifications, analytics, or support tickets.
- Use least-privilege database and storage credentials; production application connections must not use the local root account.
- Review access to medical documents and payment evidence through audit records.
- Process deletion, correction, and legal hold requests according to the approved policy; do not delete records needed for active disputes, accounting, or safety investigations.
- Define and configure retention periods separately for account data, medical documents, payment evidence, audit logs, notifications, and backups.
- Encrypt backups and restrict backup restoration to an isolated maintenance environment.

## Consent and policy release gate

Before accepting real users, publish the approved privacy policy, terms of service, prescription-handling notice, cash-on-delivery/payment-evidence notice, support contact, and data deletion process. Record the policy version and acceptance timestamp in the account workflow when the legal owner supplies the final wording.
