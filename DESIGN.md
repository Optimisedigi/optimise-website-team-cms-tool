# Hosting billing surfaces

## Scope
The internal Client Billing field and public `/hosting-pay/[token]` review page form the hosting subscription flow. The public page is intentionally minimal: review the selected billing cadence with all recurring costs visible before Stripe Checkout. The admin flow is data-dense and uses existing Payload controls.

## Design read and thesis
Audience: finance staff issuing offers and clients choosing a recurring card charge. Error cost is high, so financial totals, recipient, renewal, and capacity terms are plain text before the action. Existing Payload form controls and typography are reused. Public pages use semantic headings, descriptions, definition lists, forms, and buttons instead of custom widgets.

## Accessibility and resilience
- The semantic offer article collapses naturally at 320px; there are no fixed heights or visual-only statuses.
- Forms use native POST buttons and live status in the admin component.
- Payment links are noindex and do not include social payment metadata.
- Keyboard, screen-reader, 200% text, forced-colors, reduced-motion and representative browser verification remain release checks; they have not been manually verified in this implementation.
