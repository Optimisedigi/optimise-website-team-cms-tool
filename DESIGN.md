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

# Landing performance report

## Scope

`LandingExperimentTab` renders landing A/B and behaviour reporting on three surfaces: `/landing-dashboard/[slug]` (client, PIN-gated), `/landing-pages-dashboard` (internal, cross-client) and the Landing tab of the Google Ads dashboard. The single job is to make the one worst leak in the funnel obvious before anything else, without ever implying a winner the sample cannot support.

## Design read and thesis

- **Surface:** data-dense dashboard, read weekly by a marketer, not a statistician.
- **Direction:** a light card stack on a slate field. One card per question (drop-off, markets, attribution, attention, events); a headline row of four numbers above them. The single dark card, `Biggest leak`, is the memorable device: the only inverted surface on the page is the one finding worth acting on.
- **System:** slate ink for structure, sky for neutral funnel volume, amber for the worst drop-off only, teal for the conversion-rate figure and focus rings. Monospaced small caps mark column headings and badges, so tables read as data. No tinted status cards, hover lifts, icon medallions or emoji.
- **Composition:** every card shares one padding, radius and border; every table shares one heading treatment and a right-aligned numeric column with `tabular-nums`. The page preview keeps its 400px sticky rail beside the section table.
- **Honesty rules preserved from the previous layout:** uplift always ships with its interval and sample size, an underpowered comparison says so instead of showing a colour, truncated scans warn above the numbers they undercount, and the verdict strip reads `No winner yet` rather than picking one.

## Accessibility and resilience

- Cards are `section`s with `aria-labelledby`; the funnel, markets, attribution, variant and dwell data are real tables with `scope`d headers, and the funnel bars are `aria-hidden` decoration beside the numeric cell.
- Device filters are `aria-pressed` buttons; page/range selects have visible labels; loading is `role="status"` and the error card `role="alert"`.
- Muted text is held at slate-500 or darker rather than the mockup's lighter grey, which fails AA at small sizes. Amber and teal are used with text weight, never as the sole signal.
- Verified in Chromium at 1440px and 390px against a full fixture during implementation. Screen-reader, 200% zoom, forced-colors and reduced-motion checks remain release checks.
