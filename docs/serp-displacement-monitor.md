# SERP Displacement Monitor — Setup & How It Works

The SERP Displacement Monitor tracks Google search results daily for a curated
keyword list per client. It detects when an AI Overview appears, when paid ads
push organic listings off the screen, and when the client's own ranking drops.
Snapshots are stored in Growth Tools and emailed as a daily digest when
thresholds are breached.

## Where to configure

**Clients → [Client] → SERP Monitor tab** in the CMS.

## Field-by-field

| Field | What it does | Notes |
|---|---|---|
| **Enabled** | Toggles the daily capture cron for this client. | Off by default. Turn on once keywords are added. |
| **Domain** | The root domain we track in SERPs. | **Leave empty by default.** The monitor automatically uses the client's `Website URL` from the **Business tab**. Only fill this in when you need to track a different domain or subdomain (e.g. `shop.example.com` instead of `example.com`). |
| **Keywords** | The list of search queries we run each day. Up to 50 per client. | Each row needs a keyword, a location (e.g. `🏄 Sydney`), and a device (desktop or mobile). |
| **Alert recipient emails** | Who receives the daily digest when an alert fires. | One row per email. Leave empty to skip email delivery — snapshots are still recorded and visible in the dashboard. |
| **Alert thresholds → organic drop positions** | Trigger an alert when our organic position drops by this many spots day-over-day. | Default: **3**. |
| **Alert thresholds → pixel offset drop** | Trigger an alert when our estimated vertical pixel offset increases by this many pixels (lower threshold = more sensitive). | Default: **400**. |

## How the domain is resolved

The monitor uses the first non-empty value from this chain:

1. `serpMonitor.domain` (this tab — only if the operator explicitly set it)
2. `seoAuto.siteUrl` (Search Console tab — set automatically when GSC is connected)
3. `websiteUrl` (**Business tab** — the canonical source)

So in practice you should:

- **Set Website URL on the Business tab** when onboarding any client. Every tool
  in the platform reads from this field, including SERP Monitor, Google Ads
  audits, AI Visibility, and the SEO audit.
- **Leave SERP Monitor → Domain empty** unless the SERP tracking target needs
  to differ from the main website.

## How email recipients work

1. The cron runs daily and captures one SERP snapshot per keyword × location ×
   device combination.
2. After capture, every keyword is compared against the previous day's snapshot.
3. If **either** threshold is breached on **any** keyword:
   - **Organic drop** ≥ `organicDropPositions`, or
   - **Pixel offset increase** ≥ `pixelOffsetDrop`,
   …an alert is added to that client's daily digest.
4. If at least one alert fires that day, a single digest email is sent to
   **every address in `alertRecipientEmails`**. The email lists every breached
   keyword, the previous and current state, and a link to the dashboard.
5. If no thresholds are breached, no email is sent (the snapshots are still
   recorded and visible in the dashboard).

If `alertRecipientEmails` is empty, no email is ever sent for that client even
when alerts fire — the data is still captured and visible in the Growth Tools
dashboard.

## What the monitor records

Each daily run captures, per keyword:

- **AI Overview presence** — was there an AI Overview block on the page?
- **Estimated pixel offset** — how far down the page our organic listing is,
  in vertical pixels (accounts for ads, AI Overview, knowledge panel, etc.).
- **Our organic position** — 1-based rank of our domain in organic results, or
  null if not in the top 100.
- **Number of paid ad slots** above the organic listings.
- **Number of organic results** captured for the query.
- **Raw SERP features** — knowledge panels, People Also Ask, image packs, etc.

History is retained for trend analysis on the Growth Tools dashboard.

## When to override the domain

Override the **Domain** field only in these cases:

- The client has a separate ecommerce subdomain (e.g. main site is `acme.com`
  but you want to track rankings for `shop.acme.com`).
- The client has multiple regional sites (e.g. tracking `acme.com.au` separately
  from the global `acme.com`).
- The client recently migrated and the Business tab still has the old URL — in
  that case prefer to fix the Business tab so every other tool benefits.

## Troubleshooting

- **"No domain configured" error** — the Business tab's Website URL is missing
  or invalid. Fix it there; the monitor will pick it up on the next run.
- **No emails arriving** — check that `enabled` is true, at least one keyword
  has been added, at least one recipient email is configured, and that an
  alert threshold has actually been breached today (no breach = no email).
- **Want to test the email path** — temporarily lower the thresholds (e.g.
  `organicDropPositions: 1`, `pixelOffsetDrop: 50`) to force an alert on the
  next run, then revert once verified.
