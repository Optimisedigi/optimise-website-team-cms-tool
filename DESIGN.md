# Hosting billing surfaces

## Scope

The internal Client Billing field, public `/hosting-pay/[token]` review page and `/hosting-pay/cancel` recovery page form the hosting subscription flow. The public pages are payment/recovery surfaces, not marketing pages: the single job is to make the selected recurring charge, its terms, and the Stripe hand-off or return path clear before the client acts.

## Design read and thesis

- **Surface:** low-friction commerce/payment review.
- **Audience:** a client deciding whether to authorise a recurring hosting charge. Financial error and trust cost are high.
- **Direction:** a white, document-like payment sheet with the animated Optimise Digital logo as the single brand moment. The plan, recurring total and Stripe hand-off form one visual sequence; supporting terms follow in a quieter section.
- **System:** dark ink (`#14202b`) supplies hierarchy and action contrast; slate text supports explanatory copy; neutral borders define structure. There are no gradients, tinted status cards, payment badges, generic hover lifts, or decorative icons.
- **Composition:** all content uses one 680px rail. The review card uses aligned plan, pricing, total and action bands; the cancel page repeats the same logo, grey-card and terms anatomy, with a single return action. At narrow widths the same source order remains single-column without fixed content heights.

## Accessibility and resilience

- The page uses a semantic `main`, heading hierarchy, article, definition list, native POST form and native button. The payment action includes a visible label and a decorative lock SVG; the logo has an alternative text label and destination.
- Total, hosting fee and card surcharge remain visible before the button. No payment card data is collected on this page; the client is sent to Stripe.
- Button keyboard focus uses a high-contrast visible outline. Forced-colors gets native system button/border colors. The layout reflows at 320px without horizontal scrolling or fixed-height content.
- The animated GIF contains no required information; the written Optimise Digital alternative text remains available if it does not load or animation is reduced.
- Verified manually in Chromium desktop (1440px) and mobile (390px) during implementation. Screen-reader, 200% text, browser matrix, forced-colors and reduced-motion verification remain release checks.
