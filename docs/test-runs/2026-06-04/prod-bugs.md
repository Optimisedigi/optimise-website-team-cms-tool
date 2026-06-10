# Confirmed PROD-BUG Fix Items

**Run date:** 2026-06-04
**Source:** `docs/test-runs/2026-06-04/results.jsonl` → `report.md` (Phase 6 swarm run).

> **Re-validation note:** the original run produced **58 PROD-BUG candidates**. Each was re-run
> against the live, fully-migrated dev server with a real admin session and resolved fixture IDs.
> **56 were scenario-metadata artifacts** (unresolved `<id>`/`<slug>` placeholders, wrong
> `/api/payload/` REST prefix, wrong param names, admin `hidden:true` collections, and edge cases
> where a 400/404 was the correct behaviour). They have been reclassified to pass/blocked in
> `results.jsonl`. **3 genuine defects** remain/were found. A later pass also resolved all 5 UNKNOWN
> failures — one of which (`NEG-031`) turned out to be defect #1 below.

**Confirmed defects:** 3. **#1 consolidation-candidates auth — ✅ FIXED this session; #2 deck-preview
— OPEN (fix proven but reverted by a Syncthing file-sync daemon); #3 account-structure — upstream
Growth Tools defect (not fixable in this repo).**

---

## 1. Consolidation-candidates API entirely dead — wrong auth pattern — **✅ FIXED**

- **Surfaced from:** `NEG-031-happy` (originally triaged UNKNOWN: a 401 with a valid admin cookie).
- **Surface:** `GET /api/consolidation-candidates`, `POST /api/consolidation-candidates/[id]/approve`,
  `POST /api/consolidation-candidates/[id]/reject`.
- **Observed:** HTTP 401 for **every** caller, including authenticated admins.
- **Root cause:** these custom App-Router routes authenticated via `const user = (req as any).user`.
  Next.js App Router **never populates `req.user`** (that's a Pages-Router/Express-middleware idiom),
  so `user` was always `undefined` and every request 401'd. This is a **production** defect, not
  dev-config — the entire consolidation-candidates feature (list, approve, reject) was unreachable
  for everyone. (It went unnoticed because 401 looks like a normal auth response.)
- **Fix applied:** replaced the broken line in all three routes with the canonical pattern used by
  181 other routes in the codebase: `const { user } = await payload.auth({ headers: req.headers });`
  (`payload` is already instantiated above each call). No other logic changed.
- **Verified live:** `GET /api/consolidation-candidates?limit=10` now returns HTTP 200 with an admin
  cookie and still 401 without one (auth correctly enforced). The two POST mutation routes were
  fixed identically but not triggered live (they push to Google Ads / write NKLs — DANGER class).
- **Risk:** low — one-line-per-file change matching the established, widely-used pattern.
- **Follow-up:** the two POST routes should get an explicit admin-role check too (consistent with the
  collection's `read`/`delete` access which require `role === "admin"`); currently they accept any
  authenticated user. Noted, not changed in this pass.

---

## 2. Deck-preview admin route is unreachable (`_preview` is a Next.js private folder) — **OPEN (fix proven, blocked by file-sync)**

- **Root cause (confirmed):** Next.js (App Router) opts any underscore-prefixed folder (`_preview`)
  and all its subfolders **out of routing** ("private folders", per the Next.js 16 docs). The route
  at `partners/_preview/[templateSlug]/page.tsx` has been unreachable since it was created
  (`abfbd2c`) — it never worked.
- **The fix (proven, not persisted):** rename the folder `partners/_preview/` → `partners/%5Fpreview/`
  (`%5F` = URL-encoded underscore). Next.js then serves it at the **unchanged** URL
  `/partners/_preview/<slug>` — **zero URL strings change**. This was applied and **verified working
  live** via authenticated `curl`: valid templates returned HTTP 200 and rendered the sample-payload
  deck, invalid slug 404'd, and the `?data=`/invalid-payload paths behaved correctly. Screenshot
  `screenshots/DEK-003-fixed.png` (captured *without* an admin cookie) shows the route serving the
  page's **own** “Unauthorized — Sign in to the CMS admin” body rather than a Next route-404 — proof
  the route now resolves to `page.tsx`.
- **Why it's still OPEN — environment blocker:** a **Syncthing file-sync daemon** is running on this
  repo (many `.sync-conflict-*` files from machines `HKCELI7`/`FECY5YY`). Every folder-rename of
  `_preview` is reverted within minutes by a sync conflict + a restoring commit — it happened twice:
  `60b9537` ("restore partner preview route path", undoing a `preview` rename) and `8f0d81e`
  ("restore encoded partner preview path", undoing the `%5Fpreview` rename). HEAD is back to
  `_preview` and the route 404s again.
- **How to actually land it:** on the **authoritative/source machine** (or with Syncthing paused on
  all peers), `git mv "src/app/(frontend)/partners/_preview" "src/app/(frontend)/partners/%5Fpreview"`,
  commit, and let it propagate — so no peer's stale `_preview` copy overwrites it. No code/URL edits
  are needed; verify `/partners/_preview/google-ads-audit-15-slide` returns 200 afterwards.
- **Impact (while OPEN):** the admin "Preview template →" button on `deck-templates` records, and the
  OptiMate deck-proposal approval-card preview iframe, both 404. (Client-facing published decks at
  `/partners/[clientSlug]/[deckSlug]` are **not** affected — separate route.)
- **Scenarios:** `DEK-003-happy`, `DEK-003-edge`, `DEK-004-happy`, `DEK-005-edge` (valid-template row)
- **Surface:** `GET /partners/_preview/<templateSlug>` (admin session)
- **Observed:** HTTP 404 for **valid, registered** live templates
  (`google-ads-audit-15-slide`, `stakeholder-recap-5-slide`).
- **Expected:** the template renders (or returns the page's own "Unauthorized" body when not signed in).
- **Root cause:** Next.js (App Router, v16) treats a folder whose name starts with `_` as a
  **private folder excluded from routing**. The route lives at
  `src/app/(frontend)/partners/_preview/[templateSlug]/page.tsx`, so the whole `_preview` segment
  is opted out of routing. Confirmed: no `_preview` entry exists under
  `.next/server/app/(frontend)/partners/`, and a no-cookie request returns the Next 404 page rather
  than the page's own "Sign in to the CMS admin" body (proving `page.tsx` never executes).
- **Evidence:** `getTemplate("google-ads-audit-15-slide")` is registered with `kind: "live"` in
  `src/lib/decks/registry.ts`; the page exists; yet every slug 404s.
- **Fix:** rename the route folder `_preview` → `preview` (e.g.
  `src/app/(frontend)/partners/preview/[templateSlug]/`) and update the documented URL in
  `CLAUDE.md` and `src/lib/decks/README.md` (`/partners/_preview/<slug>` → `/partners/preview/<slug>`).
  Verify the admin-auth gate and `?data=<base64>` payload path still work after the rename.
- **Risk:** low — pure routing rename; no schema or data change.

---

## 3. `account-structure` returns 500 for clients without data — **upstream Growth Tools bug, NOT content-cms**

- **Scenario:** `DEK-007-edge`
- **Surface:** `GET /api/partners/zz-test-client/account-structure`
- **Observed:** HTTP 500 —
  `ENOENT: no such file or directory, open '/app/scripts/audit-away-digital/data/03_campaign_totals.json'`
- **CORRECTION (on closer inspection):** the content-cms route
  (`src/app/(frontend)/api/partners/[clientSlug]/account-structure/route.ts`) is a **thin proxy** to
  the Growth Tools service — it reads **no** local file. The ENOENT comes from the **Growth Tools
  container** (`/app/scripts/...` is its filesystem, not Vercel's), and the proxy faithfully relays
  the upstream 500. The route even documents this passthrough as intentional.
- **Root cause (in Growth Tools, a separate service/repo):** its
  `GET /api/partners/<slug>/account-structure` reads a hardcoded
  `scripts/audit-away-digital/data/03_campaign_totals.json` that only exists for `away-digital`, so
  any other client slug 500s.
- **Fix:** belongs in the **Growth Tools** codebase — serve per-client account-structure data (or
  return a clean 404 when none exists) instead of reading the hardcoded away-digital JSON. **No
  content-cms change is required.**
- **Optional CMS hardening (not done — would mask a real upstream error):** the proxy could translate
  an upstream 5xx into a 502 with a clearer message. Left as-is deliberately so genuine upstream
  failures stay visible.
- **Status:** filed against Growth Tools; out of scope for this repo.
- **Note:** unrelated to the recent meeting-scheduler / NKL / Google-Ads-dashboard changes.
