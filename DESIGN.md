# SEO topical authority graph

## Scope and design read

- **Surface:** data-dense Payload admin decision tool for internal SEO and content specialists.
- **Single job:** reveal the next article or internal link that improves connected category coverage.
- **Risk:** staff revisit it during planning; misleading scores or hidden gaps create poor content decisions.
- **Content:** category-first taxonomy, shared tags, articles, pages, factual links, suggested links, and explainable counts.
- **Platform:** authenticated desktop admin, with complete narrow-screen, keyboard, reduced-motion, and forced-colors support.
- **Constraints:** Payload theme variables, native React/SVG, deterministic layout, capped data, and no runtime graph dependency.

## Evidence and interaction thesis

Local Payload controls and theme tokens lead. The dashboard archetype sample is small (5/74 documents), but its alignment, separators, keyboard, and visible-filter guidance fits this repeated decision task. Airtable and Sentry are aligned references for dense relationships and evidence; Miro is contrast because an open canvas would weaken scan order. Logseq supports selectable neighborhoods; Strapi and Context+ support typed relationships. CTM, Gensim, and OCTIS inform future weighted-topic boundaries only, not present scientific claims.

The graph is a category atlas: configured categories establish stable regions, shared tags sit between them, articles orbit their evidence, and unknown internal pages form a perimeter. First glance shows category gaps; second glance shows link structure; selection reveals counts and an admin destination. Neutral Payload surfaces carry structure, node shape plus text carries type, solid/dashed strokes distinguish fact from recommendation, and bounded node size reflects degree only. There are no gradients, authority scores, decorative cards, hover lifts, emoji, or ambient motion.

## Components, states, and responsive contract

- Summary text reports coverage, isolated articles, pending suggestions, and truncation without invented quality claims.
- Filters use persistent native labels: category first, topic, publication status, edge type, and isolated visibility.
- The SVG is supplementary; every node is a keyboard-operable button and every visible relationship exists in a synchronized semantic table.
- Selection shows first-degree evidence, health thresholds, direct admin links, gaps, and bridge counts.
- Loading preserves the graph region; failure has retry; first-use empty and filter no-results are distinct.
- Desktop uses graph plus detail rail. Narrow layouts stack summary, controls, graph, details, and table without page overflow.
- Zoom buttons provide the single-pointer and keyboard alternative; no drag or gesture is required.
- Focus uses `:focus-visible`; status never relies on color; motion is limited to named color/stroke properties and disabled under reduced motion.
- Forced colors exposes borders and SVG strokes; labels remain React text, never injected markup.

## Accessibility and release evidence

Scope covers this embedded Client field in loading, empty, error, filtered, selected, dense, desktop, and 320px reflow states. Native labels, buttons, links, headings, status regions, and table semantics define reading order and names. The SVG has a text description and duplicates no essential information unavailable in the table. Keyboard order follows controls, nodes, detail, then relationships; Enter and Space select nodes; zoom preserves selection. Contrast uses Payload theme foreground/background roles plus text/shape distinctions. Manual browser, screen-reader, 200% text, forced-colors, and reduced-motion results are recorded after rendered verification; unavailable checks remain explicitly unverified.

## Render critique and release record

Representative fixture renders were captured at 1440×1000 and 390×844. The first narrow render made SVG labels too small, the weakest responsive criterion. The revision gives the graph an internal horizontal viewport at compact widths while the page itself continues to reflow; the semantic table remains the no-scroll reading alternative. The unnecessary standalone canvas decoration was removed in favor of borders that only express graph, detail, and table containment.

Final rubric: **22/24**. Brief specificity 2, hierarchy 2, composition 2, consistency 2, typography 1, material logic 2, states 2, responsive behavior 2, accessibility evidence 1, motion 2, authentic content 2, visual distinctiveness 2. The category atlas is product-specific and scan order is stable. Typography inherits Payload correctly but was not visually tested in every supported theme. Unit/component tests verify names, loading, retry, empty, filtering, keyboard selection, and semantic table output. Type-check and production build pass.

Changed-scope production checks: semantic controls and table **pass by source and component tests**; keyboard selection **pass by component test**; loading/error/retry/empty/no-results **pass by component test**; 390px composition **pass by render review after revision**; reduced-motion and forced-colors rules **pass by source review**; 200% text, 320px reflow, measured contrast, pointer modality, RTL/localization stress, real Payload dark theme, screen-reader output, and field performance remain **unverified**. No ADA or WCAG conformance claim is made.

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
