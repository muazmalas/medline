# MedLine UI Design System

This document records the implemented visual and interaction foundation shared by the React web portal and Flutter mobile client. It is a source reference for future screens and for owner-led visual review; it is not a replacement for final stakeholder prototype approval.

## Brand and color tokens

MedLine uses a calm medical-blue foundation with high-contrast operational states:

| Token | Value | Use |
|---|---|---|
| Deep navy | `#082F49` | Mobile app bars, authentication surfaces, primary brand background |
| Brand blue | `#1689B8` | Primary actions, active states, links, progress, delivery status |
| Accent cyan | `#43B5E7` | Brand mark accents and highlighted interaction affordances |
| Page background | `#F4F7FB` | Mobile and workspace page background |
| Pale blue | `#E8F5FA` | Informational cards, delivery PIN panels, medicine tiles |
| Primary text | `#17384E` / `#102F46` | Headings and high-priority operational data |
| Secondary text | `#527386` / `#7892A1` | Supporting metadata and helper copy |
| Warning | Orange semantic color | Failed deliveries, low stock, critical alerts |
| Success | Green semantic color | Completed, approved, and healthy operational states |
| Review | Violet semantic color | Verification, review, and pending administrative work |

## Layout and responsive behavior

- Web navigation is a keyboard-accessible sidebar with a responsive mobile menu and scrim.
- Operational content uses cards, metric grids, searchable tables, queues, detail panels, and status pills.
- Mobile uses Material 3 surfaces, padded list/card layouts, and role-specific action cards.
- Forms use full-width controls on narrow screens and inline/row layouts when space permits.
- Private or sensitive values are never represented as decorative UI-only state; the API remains authoritative.

## Typography and hierarchy

- Eyebrow labels identify the active operational domain.
- Page headings identify the workspace or workflow.
- Supporting text explains ownership, recovery, and state.
- Status labels remain short and visually distinct; full explanations belong in helper text or detail panels.
- Arabic uses the same hierarchy with RTL layout direction; English uses LTR.

## Reusable interaction patterns

- Primary button: submit or advance a workflow.
- Ghost button: inspect, download, refresh, or take a low-emphasis action.
- Approve/success action: green semantic treatment.
- Reject/destructive action: red/orange semantic treatment and confirmation where appropriate.
- Status pill: compact server-backed state; clients do not invent state transitions.
- Metric card: count plus scope/context, never a substitute for the underlying queue.
- Timeline: chronological server event history for orders and deliveries.
- Empty state: explains what is absent and provides a safe recovery action when available.
- Error state: preserves request/reference context and offers retry for safe reads.
- Loading state: uses visible progress and `aria-live`/status semantics where applicable.

## Accessibility and localization

- React navigation uses semantic buttons, `aria-current`, labels, expanded state, live regions, and keyboard focus styling.
- React operational tables expose loading state and accessible search labels.
- Flutter role actions use semantic containers, localized labels, status mapping, and accessible tooltips for icon actions.
- All user-facing catalog/workflow copy belongs in the shared React or Flutter localization helpers.
- Arabic and English are first-class locales; switching locale updates direction and persisted profile preference.

## Role workflow composition

- Patient: discovery → medicine detail → cart/address → checkout → prescription review → status timeline → PIN/rating/support.
- Pharmacy: dashboard → inventory → patient order/prescription review → procurement → delivery monitoring → subscription/support.
- Warehouse: inventory → procurement queue → fulfillment → dispatch/delivery monitoring → subscription/support.
- Driver: availability → available jobs → claim → pickup → transit → arrival → PIN completion or failure report.
- Administrator: dashboard alerts/health → approvals → document/payment review → intervention/reassignment → complaints/ratings/audit.

## State and motion principles

- State changes are explicit and server-backed.
- Retryable reads may retry or use bounded safe cache; critical mutations use idempotency keys and are never silently queued offline.
- Motion should be brief and informative; reduced-motion preferences must be respected by the web client.
- Sensitive data such as PINs, prescriptions, payment proofs, and private documents must not appear in analytics, logs, or notification previews.
