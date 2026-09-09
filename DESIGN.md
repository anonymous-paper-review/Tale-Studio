# Design

## Source of truth
- Status: Active for the pricing and payment-link slice; broader product rules remain in `specs/design.md`.
- Last refreshed: 2026-09-09.
- Primary product surfaces: public `/pricing`, public `/checkout`, existing `/account` billing.
- Evidence reviewed: `specs/design.md`, `specs/design-references.md`, `src/app/pricing/page.tsx`, `src/lib/billing/catalog.ts`, `src/lib/plan-limits.ts`, existing Dialog/Slider/Button primitives and checkout flow.
- Owner decision: three separate family cards; clicking a card opens a popup containing a horizontal stepped slider. The slider does not live on the cards. Existing prices and entitlements do not change.
- This document records the slice contract, not a replacement color/token system. Token values remain in `src/app/globals.css`.

## Brand
- Quiet, dark-first video-production tool; existing single primary accent and typography.
- Trust: explicit recurring versus one-time prices, visible included allowances, Paddle handles card entry.
- Avoid: copying Higgsfield decoration, invented discounts, extra category colors, fake scarcity.

## Product goals
- Reduce thirteen visible product cards to Starter, Production and Take family cards.
- Let buyers compare the selected option's price and benefits without leaving its popup.
- Keep the approved catalog, login requirements, plan-change confirmation and webhook-based entitlements.
- Non-goals: policy section 4, video logic, new prices, annual self-service plans, custom card fields, automatic charging or unrelated production rollout.
- Success: all thirteen existing choices are reachable, slider selection never creates a transaction, selected purchase survives login return.

## Personas and jobs
- Individuals choose a Starter allowance; teams choose a Production allowance; existing users top up Takes.
- A recipient of a Paddle payment or card-update link resumes that existing transaction.

## Information architecture
- `/pricing`: three family cards first, option popup, existing explanation/Studio contact/Take notes below.
- `/checkout`: minimal Paddle payment-link destination, recovery and return navigation; not another catalog.
- `/account`: existing subscription and balance management, unchanged.
- Pricing popup: family and billing cadence, selected amount, horizontal option selector, selected benefits, fixed action area.

## Design principles
- Cards select a family; only the popup selects a billable option.
- One selected catalog option owns displayed price, allowances and purchase identity.
- Explicit purchase action precedes transaction creation; option and payment dialogs do not stack.
- Separate catalog changes from long-lived payment-link behavior.

## Visual language
- Reuse existing semantic colors, Geist/Pretendard typography, border/surface hierarchy and spacing rules.
- Use the primary accent for selected stops and primary actions only.
- Keep the amount and footer stable while values change; no decorative images or new assets required.
- Short, reduced-motion-safe transitions; no automatic carousel.

## Components
- Reuse Dialog, Button, existing slider interaction patterns, Checkout flow, PlanChangeDialog, SiteHeader/Footer and ContactPopover.
- Family cards are accessible buttons with a description and starting price, not individual plan cards.
- Popup slider snaps to the existing four/five/four options; previous/next and labeled stops offer alternatives to dragging.
- Checkout loading, rejected, retry and already-subscribed flows remain explicit.
- Token ownership remains `globals.css`; no changes to shared primitive styling for this slice.

## Accessibility
- Named dialog/description; Escape closes and focus returns to the family trigger.
- Slider supports arrow keys, Home/End and a selected-value label; buttons have accessible names.
- Selected state is not color-only; visible focus and adequately sized touch controls.
- Price/allowance updates use restrained live-region announcements; motion is nonessential.

## Responsive behavior
- Desktop: three family cards across and a centered popup.
- Mobile: stacked cards, viewport-bounded scrollable popup, always reachable purchase/close controls.
- Touch and keyboard can select every tier without precise dragging.

## Interaction states
- Loading: disable repeat purchase while preparing the checkout; do not alter the selected item.
- Empty payment link: show a route back to pricing, never create a fallback transaction.
- Error: explain checkout could not open and offer retry; preserve selection.
- Success: distinguish payment receipt from confirmed account benefits; keep existing webhook confirmation.
- Disabled: missing catalog configuration disables purchase but not reading or selecting options.
- Before live launch: server-owned checkout availability disables purchase with a payment-preparation message, while family cards, sliders and catalog information remain readable. Public payment links do not initialize Paddle while purchases are closed. Sandbox stays testable; cancellation, refunds and non-charging account management remain available.
- Slow network: maintain progress indication and prevent duplicate submission.

## Content voice
- Existing English source strings with Korean translation; sentence-case actions.
- Starter / Production / Take are families, not three new Paddle products.
- Distinguish monthly subscription, included monthly Takes and one-time Take packs valid for twelve months.
- Keep existing product claims and legal policy text unchanged.

## Implementation constraints
- Next.js/React, existing components and dependencies only.
- Prices and benefits come from `catalog.ts` / `plan-limits.ts`; no UI-only price calculation or invented quantities.
- URL choice is validated against the same catalog; new checkout still requires the existing authenticated server flow.
- Paddle.js default link opens the passed transaction without creating one or overriding it with a default item.
- Local/dev stay sandbox; live configuration and deployment are separate verified operations.
- Live purchases open only when the server explicitly sets `PADDLE_LIVE_CHECKOUT_ENABLED=true`; an absent or mistyped switch stays closed. Both public pages receive the same server decision and purchase/immediate-charge endpoints enforce it independently of browser state. This switch records operational launch approval, not an automatic Paddle approval check.
- TDD Korean promises and actual desktop/mobile browser screenshots are required. Preserve concurrent video/policy edits.

## Open questions
- Production release scope remains separate from local UI completion; do not deploy the dirty dev branch wholesale.
- Paddle domain approval and owner identity verification remain external prerequisites.
