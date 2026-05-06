# Post-Build Optimisation / QBR Presentation Template

Canonical template for client-facing decks that follow the post-build-optimisation or Quarterly Business Review (QBR) pattern. The reference live instance is `(frontend)/partners/google-ads-audit/team-session-may-2026/`.

## Why it lives here

The folder name starts with `_` so Next.js treats it as a private folder and does not expose it as a live route. The template never publishes; only copies of it do.

## How to start a new deck

1. Copy this whole folder to `(frontend)/partners/<area>/<slug>/`.
   Example: `(frontend)/partners/google-ads-audit/acme-aug-2026/`.
2. Update the `SLIDES` array near the top of `page.tsx` to match the slides you keep.
3. Replace the data in each `<Slide ...>` block. Numbers come from real sources:
   - GA4 (sessions by landing page, channel, region)
   - Google Ads `landing_page_view` (top spend, search terms, conversions)
   - CMS audits + search-term reports
   - Any client-provided cash sales or CRM data
   Do not invent numbers.
4. Update the timeline + agenda copy on slides 1 and 2.
5. Run locally (`npm run dev`, port 3004) and review every slide before sharing.

## Structure

| Section | Purpose |
|---|---|
| 1 | Title + agenda |
| 2 | Paid Search 101 (educational, optional) |
| 3 | What we shipped in month one |
| 4 | Historical traffic + paid CPC charts per business |
| 5 | Conversion mix + business-validation slide |
| 6 | Cash-sales / revenue cross-check (if data available) |
| 7 | Optimisations identified (LP, structural, brand, budget) |
| 8 | How we track progress + tracking caveats |
| 9 | 90-day target + Q&A |

## Conventions

- No en-dashes or em-dashes in slide copy. Use commas, colons, separate sentences.
- Slide primitives live inline at the top of `page.tsx`: `Slide`, `SlideHeading`, `SlideSubtext`, `Card`, `DataTable`, `StatCard`, `Pill`, `LineChart`, `DualAxisLineChart`, `HorizontalBarChart`.
- Alternate `dark` and `light` props on slides for visual rhythm.
- Print stylesheet uses `zoom: 0.85` so long slides fit on one A4 landscape page.
- Bottom-right of every slide shows `N / total` for in-room reference.
- First slide carries the Download PDF button (browser print).

## Hosting

Decks built from this template should sit under `(frontend)/partners/...` in the CMS app and are served from `cms.optimisedigital.online`. The CMS layout already enforces `noindex, nofollow` on every route, so client decks stay out of search indexes by default.
