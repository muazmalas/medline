# MedLine notification operations

MedLine creates the in-app notification record locally first. External delivery is dispatched to the `notifications` queue so an unavailable provider cannot roll back a successful order, procurement, delivery, or review action.

## Channels

- In-app: stored in `notifications` and controlled by `in_app_enabled`.
- Push: queued through the configured FCM HTTP v1 endpoint and active encrypted device tokens.
- Email: queued through Laravel's configured mail transport.
- SMS: queued through the configured generic HTTP adapter when an approved provider is supplied.

The queue job uses bounded HTTP timeouts, retry/backoff at the queue/provider boundary, revokes invalid push tokens, and records each attempt in `notification_delivery_attempts`. Provider response bodies are truncated before storage and no device token, password, PIN, prescription, or document contents are written to the attempt record.

## Required production configuration

Set the `MEDLINE_*` notification variables from `api/.env.production.example` through the deployment secret manager. Run a dedicated queue worker for the `notifications` queue and monitor failed jobs and the attempt table. Provider credentials are intentionally not committed to the repository.

## Event payload rule

Notification payloads may contain a public record identifier, state, and safe human-readable message. They must not contain prescription contents, private file paths, delivery PINs, access tokens, or payment evidence.
