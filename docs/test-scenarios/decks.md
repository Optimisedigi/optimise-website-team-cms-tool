# Test Scenarios — Decks / Presentations (`DEK`)

Standalone scenarios keyed to FEAT-IDs `DEK-001`…`DEK-010` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

> **No DANGER features in this domain.** All ten DEK features are
> READ / EXTERNAL-SAFE / CMS-WRITE (DEK-010 only). DEK-010 apply is a
> CMS-WRITE that writes into `clients.presentations[]`; the scenario
> stages the proposal to `pending` only, except where explicitly noted for
> the local test client with full teardown.

---

## DEK-001 — Deck registry · READ

### DEK-001-happy — Registry lists both registered templates
- **Entry point:** `src/lib/decks/registry.ts` (`listTemplates()` / `getTemplate(slug)`)
  exercised indirectly via `GET /partners/_preview/google-ads-audit-15-slide`
  (admin auth) which calls `getTemplate()` on the server at request time.
- **Inputs:** admin session (via `loginAdmin()` + `authedFetch()`).
- **Steps:**
  1. `loginAdmin()` to obtain an admin session cookie.
  2. `authedFetch("/partners/_preview/google-ads-audit-15-slide")` — the preview
     route imports the registry and calls `getTemplate("google-ads-audit-15-slide")`.
  3. Assert HTTP 200 and that the HTML body contains the deck component markup
     (look for the slide root element — at minimum the response must not be the
     "Unauthorized" or 404 page).
  4. Repeat for the second registered template:
     `authedFetch("/partners/_preview/stakeholder-recap-5-slide")` → assert 200.
  5. *(Optional unit assertion)* In a vitest/ts-node context import
     `{ listTemplates } from "@/lib/decks/registry"` and assert
     `listTemplates().map(t => t.slug)` contains both
     `"google-ads-audit-15-slide"` and `"stakeholder-recap-5-slide"`.
- **Expected:** Both preview routes return 200 with rendered deck HTML.
  `listTemplates()` returns exactly 2 entries with the correct slugs, sorted
  alphabetically (`google-ads-audit-15-slide`, `stakeholder-recap-5-slide`).
  `getTemplate("nonexistent")` returns `undefined`.
- **Env/service deps:** Payload admin session (`TEST_ADMIN_PASSWORD`); local test
  DB. No external services.
- **Triage:** 401 without session is expected (correct guard). 500 with a valid
  session → PROD-BUG. Registry returning 0 or 1 entries → PROD-BUG (both
  side-effect imports in `registry.ts` must fire).

### DEK-001-edge — Unknown slug returns undefined / 404
- **Entry point:** `GET /partners/_preview/no-such-template` (admin session).
- **Inputs:** `templateSlug = "no-such-template"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/partners/_preview/no-such-template")`.
  3. Assert HTTP 404 (Next.js `notFound()` response).
- **Expected:** 404; no 500; no "Unauthorized" page (admin is authenticated,
  so the auth guard passes before the template lookup).
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 instead of 404 → PROD-BUG. If `getTemplate()` were to return
  a stale/wrong template → PROD-BUG.

---

## DEK-002 — Deck templates collection · READ

### DEK-002-happy — List deck-templates records via Payload REST
- **Entry point:** `GET /api/deck-templates` (Payload REST, admin session).
- **Inputs:** admin session; query params `?limit=50&depth=0`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/deck-templates?limit=50&depth=0")`.
  3. Assert HTTP 200 and JSON body shape `{ docs: [...], totalDocs: N }`.
  4. Assert each doc has fields `templateSlug`, `name`, `category`, `isActive`.
  5. Assert at least the two seeded templates (`google-ads-audit-15-slide`,
     `stakeholder-recap-5-slide`) are present if `seed-deck-templates.ts` has
     been run; otherwise assert `totalDocs >= 0` (empty is valid on a fresh DB).
- **Expected:** 200 with a valid Payload REST list response; each record has
  `templateSlug`, `name`, `category`.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 401 without session → expected. 500 with valid session → PROD-BUG.
  Missing fields on docs → PROD-BUG (collection schema regression).

### DEK-002-edge — Invalid templateSlug rejected on create
- **Entry point:** `POST /api/deck-templates` (admin session).
- **Inputs:**
  ```json
  {
    "templateSlug": "not-in-registry",
    "name": "Bogus Template",
    "category": "custom"
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/deck-templates", { method: "POST", body: JSON.stringify({...}) })`.
  3. Assert HTTP 400/422 with an error referencing the unknown `templateSlug`.
- **Expected:** Payload `beforeChange` hook (`validateTemplateSlug`) throws;
  no record created; error message mentions `not-in-registry`.
- **Env/service deps:** admin session; local DB.
- **Triage:** silent create of an unregistered slug → PROD-BUG (hook not firing).

---

## DEK-003 — Google Ads audit 15-slide template · READ

### DEK-003-happy — Render the 15-slide template with sample payload
- **Entry point:** `GET /partners/_preview/google-ads-audit-15-slide`
  (admin session; sample payload is used by default).
- **Inputs:** admin session; no `?data=` query param (uses built-in
  `samplePayload` from `src/lib/decks/templates/google-ads-audit-15-slide/payload.ts`).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/partners/_preview/google-ads-audit-15-slide")`.
  3. Assert HTTP 200.
  4. Assert response body contains recognisable slide markup — look for the text
     `"google-ads-audit"` or any known fixed string from the sample payload
     (e.g. the client name `"Away Digital"` from the sample, or the slide-root
     class).
  5. Assert the response body does not contain `"Unauthorized"` or
     `"Invalid payload"` or `"notFound"`.
- **Expected:** 200 HTML with the 15-slide deck rendered from the Away Digital
  sample payload. No error banners.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** render crash (500) → PROD-BUG. `"Invalid payload"` error →
  sample payload schema mismatch → PROD-BUG.

### DEK-003-edge — Custom payload via base64 `?data=` overrides sample
- **Entry point:** `GET /partners/_preview/google-ads-audit-15-slide?data=<base64>`.
- **Inputs:** a minimal valid payload JSON (at minimum the required fields of
  `GoogleAdsAudit15SlidePayload`) base64-encoded; e.g.
  `Buffer.from(JSON.stringify(minimalValidPayload)).toString("base64")`.
- **Steps:**
  1. Construct a minimal valid payload object matching the schema (copy required
     fields from `samplePayload`).
  2. Base64-encode it.
  3. `authedFetch("/partners/_preview/google-ads-audit-15-slide?data=<encoded>")`.
  4. Assert 200 (custom payload accepted).
  5. Re-run with `?data=aW52YWxpZA==` (`"invalid"` string, not JSON) and assert
     the "Invalid payload" error banner is shown (not a 500).
- **Expected:** valid custom payload → 200 deck render; invalid payload →
  200 with "Invalid payload" banner and error message (route returns a React
  error node, not a 500).
- **Env/service deps:** admin session.
- **Triage:** 500 on invalid payload → PROD-BUG (error boundary not working).

---

## DEK-004 — Stakeholder recap 5-slide template · READ

### DEK-004-happy — Render the 5-slide template with sample payload
- **Entry point:** `GET /partners/_preview/stakeholder-recap-5-slide`
  (admin session).
- **Inputs:** admin session; no `?data=` override.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/partners/_preview/stakeholder-recap-5-slide")`.
  3. Assert HTTP 200.
  4. Assert body does not contain `"Unauthorized"`, `"notFound"`, or
     `"Invalid payload"`.
  5. Assert body contains recognisable deck content (any fixed string from the
     5-slide `samplePayload`, e.g. the slide heading or client name baked into
     the sample).
- **Expected:** 200 HTML with the 5-slide stakeholder recap rendered correctly.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG. Missing component export → PROD-BUG.

---

## DEK-005 — Template preview route · READ

### DEK-005-happy — Admin-authed preview renders with sample payload
- **Entry point:** `GET /partners/_preview/[templateSlug]`
  (`src/app/(frontend)/partners/_preview/[templateSlug]/page.tsx`).
- **Inputs:** `templateSlug = "google-ads-audit-15-slide"`; admin session cookie.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/partners/_preview/google-ads-audit-15-slide")`.
  3. Assert 200.
  4. Assert the response is full HTML (not the "Sign in to the CMS admin"
     unauthorised message).
- **Expected:** 200; deck HTML rendered; no auth wall.
- **Env/service deps:** Payload admin session; local DB.
- **Triage:** correct-session 401 or auth wall rendered → PROD-BUG (admin gate
  regression).

### DEK-005-edge — Unknown template slug returns 404
- **Entry point:** `GET /partners/_preview/does-not-exist` (admin session).
- **Inputs:** `templateSlug = "does-not-exist"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/partners/_preview/does-not-exist")`.
  3. Assert HTTP 404.
- **Expected:** 404 (Next.js `notFound()`). No 500.
- **Env/service deps:** admin session.
- **Triage:** 500 → PROD-BUG. If a live-rendered template is returned for the
  wrong slug → PROD-BUG (registry lookup bypassed).

### DEK-005-edge — Unauthenticated request returns auth wall
- **Entry point:** `GET /partners/_preview/google-ads-audit-15-slide`
  (no session cookie).
- **Inputs:** No session cookie; unauthenticated plain `fetch`.
- **Steps:**
  1. Plain `fetch("http://localhost:3004/partners/_preview/google-ads-audit-15-slide")`
     with no credentials.
  2. Assert the response body contains `"Sign in to the CMS admin"` or similar
     unauthorised copy (the route returns a 200 HTML page with the auth wall
     message, not a 401 status code).
- **Expected:** 200 HTML with the "Unauthorized" / "Sign in" message; deck not
  rendered.
- **Env/service deps:** local DB (Payload `auth()` call).
- **Triage:** deck rendered without auth → PROD-BUG (security regression).

---

## DEK-006 — Client deck route · READ

### DEK-006-happy — PIN-gated deck renders with correct PIN
- **Entry point:** `GET /partners/zz-test-client/<deckSlug>`
  (`src/app/(frontend)/partners/[clientSlug]/[deckSlug]/page.tsx`).
- **Preconditions:** The `zz-test-client` fixture must have at least one
  `presentations[]` row seeded with `deckSlug` (e.g. `"zz-test-deck"`),
  a valid `templateSlug` relationship pointing to a registered live template,
  and a non-empty `deckPayload`.  If not present, seed one via
  `authedFetch("/api/clients/<id>", { method: "PATCH", body: JSON.stringify({ presentations: [...] }) })`
  before running and log the row to the teardown manifest.
- **Inputs:** `clientSlug = "zz-test-client"`, `deckSlug = "zz-test-deck"` (or
  the actual seeded slug); PIN `4729`.
- **Steps:**
  1. `GET http://localhost:3004/partners/zz-test-client/zz-test-deck` — assert
     200 and that the response body contains the PIN gate (`AuditPasswordGate`)
     UI (look for the PIN input or `"Enter your PIN"` copy).
  2. Submit the correct PIN `4729` by POSTing to `POST /api/audit-auth` with
     `{ slug: "zz-test-client/zz-test-deck", password: "4729" }` and assert
     `{ ok: true }`.
  3. Re-request the deck page with the auth cookie set; assert the deck
     component renders (body does not contain the PIN gate, contains deck markup
     instead).
- **Expected:** unauthenticated GET shows PIN gate; correct PIN accepted; deck
  renders after auth.
- **Env/service deps:** local DB; PIN auth via `/api/audit-auth`.
- **Triage:** correct PIN rejected → PROD-BUG (security). 404 when deck row
  exists → PROD-BUG (slug matching logic).

### DEK-006-edge — Wrong PIN blocked
- **Entry point:** `POST /api/audit-auth`.
- **Inputs:** `{ slug: "zz-test-client/zz-test-deck", password: "0000" }`.
- **Steps:**
  1. POST `{ slug: "zz-test-client/zz-test-deck", password: "0000" }` to
     `/api/audit-auth`.
  2. Assert `{ ok: false }` with HTTP 401.
  3. Repeat 5+ times; assert rate-limiting kicks in (HTTP 429) after the
     threshold.
- **Expected:** wrong PIN returns 401 `{ ok: false }`; repeated failures trigger
  429 rate-limit.
- **Env/service deps:** local DB; rate-limiter state.
- **Triage:** wrong PIN returns `{ ok: true }` → PROD-BUG (security). No
  rate-limit after threshold → PROD-BUG (security).

---

## DEK-007 — Partner account-structure deck · EXTERNAL-SAFE

### DEK-007-happy — Account-structure page renders with live Growth Tools data
- **Entry point:**
  - Page: `GET /partners/zz-test-client/account-structure`
    (`src/app/(frontend)/partners/[clientSlug]/account-structure/page.tsx`)
  - API: `GET /api/partners/zz-test-client/account-structure`
    (`src/app/(frontend)/api/partners/[clientSlug]/account-structure/route.ts`)
- **Inputs:** `clientSlug = "zz-test-client"`; Google Ads customer ID `6591013898`
  (whitelisted read account `659-101-3898`); no auth required on the public page.
- **Steps:**
  1. `GET http://localhost:3004/api/partners/zz-test-client/account-structure`
     (the API proxy; no session needed).
  2. Assert HTTP 200 or a Growth Tools error passthrough (if the whitelisted
     account has no fixtures in Growth Tools, expect a non-500 upstream error
     JSON).
  3. If 200: assert the response body is valid JSON containing at least one of
     `campaigns`, `adGroups`, `keywords`, or a top-level array/object with
     account-structure keys.
  4. `GET http://localhost:3004/partners/zz-test-client/account-structure`.
  5. Assert 200 HTML; assert the page does not crash (no Next.js 500 page);
     the `AccountStructureTree` client component shell renders.
- **Expected:** API proxy returns 200 (or a passthrough error JSON from Growth
  Tools — not a 502/500 originating from the CMS itself). Page shell returns
  200 HTML.
- **Env/service deps:** **Growth Tools** (`GROWTH_TOOLS_URL`, live prod) via the
  account-structure proxy; optionally `INTERNAL_API_KEY`. No admin session
  needed for the public page.
- **Triage:** `GROWTH_TOOLS_URL` not set → 500 with
  `"Server misconfigured: missing GROWTH_TOOLS_URL"` → **DEV-CONFIG**.
  Growth Tools 5xx passthrough → **UNKNOWN** (depends on Railway fixture state).
  CMS itself returning 500 despite `GROWTH_TOOLS_URL` being set → **PROD-BUG**.

### DEK-007-edge — Missing customer ID — Growth Tools still called with slug
- **Entry point:** `GET /api/partners/zz-test-client/account-structure`.
- **Inputs:** `clientSlug = "zz-no-ads-client"` (a slug that does not exist in Growth Tools; no session required).
- **Note:** The proxy always calls Growth Tools using the `clientSlug`; it does
  not validate the presence of `googleAdsCustomerId` before proxying. This edge
  confirms the proxy does not crash when Growth Tools returns an error for an
  unknown slug.
- **Steps:**
  1. Call `GET /api/partners/zz-no-ads-client/account-structure` where
     `zz-no-ads-client` is a slug that does not exist in Growth Tools.
  2. Assert the CMS proxy returns a JSON response (any status); assert it is
     NOT a raw HTML error page (must be JSON).
  3. Assert HTTP status is one of 200, 4xx, or 502 — never an unhandled 500
     with a stack trace.
- **Expected:** proxy returns JSON with an upstream error message; no
  unhandled exception.
- **Env/service deps:** `GROWTH_TOOLS_URL`.
- **Triage:** unhandled 500 with stack trace → PROD-BUG. Missing
  `GROWTH_TOOLS_URL` → DEV-CONFIG.

---

## DEK-008 — Static partner decks · READ

### DEK-008-happy — Static hand-built decks return 200
- **Entry point:** Three static deck routes:
  - `GET /partners/google-ads-audit/team-session-may-2026`
  - `GET /partners/google-ads-proposal/swanson`
  - `GET /partners/away-digital/google-ads-audit`
- **Inputs:** No auth; no PIN (these are public static routes).
- **Steps:**
  1. For each URL, `fetch("http://localhost:3004/<path>")` (no credentials).
  2. Assert HTTP 200 for each.
  3. Assert each response body is HTML (starts with `<!DOCTYPE html>` or
     contains `<html`).
  4. Assert none return the Next.js 404 or 500 error page.
- **Expected:** All three static deck pages return 200 valid HTML.
- **Env/service deps:** None (fully static, no external deps, no auth).
- **Triage:** 404 → route file was deleted or moved → PROD-BUG. 500 → runtime
  crash in static deck component → PROD-BUG.

### DEK-008-edge — Additional static deck variants render
- **Entry point:**
  - `GET /partners/google-ads-audit/team-session-may-2026-berendsen`
  - `GET /partners/google-ads-audit/team-session-may-2026-mtp`
  - `GET /partners/google-ads-proposal/epg-engines`
- **Inputs:** No auth; no PIN; public static routes.
- **Steps:**
  1. `fetch` each URL; assert 200 HTML.
- **Expected:** 200 HTML for all variant routes.
- **Env/service deps:** None.
- **Triage:** 404 → PROD-BUG. 500 → PROD-BUG.

---

## DEK-009 — Presentation link components · READ

### DEK-009-happy — Presentation link UI fields render on client and deck-template records
- **Entry point:**
  - `GET /admin/collections/clients/<zz-test-client id>` (browser / admin page)
    → Presentations array → a row with a `deckUrl` value should render the
    `ClientPresentationLink` "Open Deck ↗" button.
  - `GET /admin/collections/deck-templates/<a seeded record>` → should render
    `DeckTemplatePreviewLink` and `DeckTemplateUsageCount` UI fields.
- **Inputs:** admin session; `zz-test-client` with at least one seeded
  presentation row (see DEK-006 preconditions); a seeded deck-template record
  (created in DEK-002 or via `seed-deck-templates.ts`).
- **Steps:**
  1. `loginAdmin()`.
  2. Open `http://localhost:3004/admin/collections/clients/<zz id>` in a
     headless browser (or via screenshot tool).
  3. Assert the presentations array section renders without a JS crash.
  4. If a row has a non-empty `deckUrl`, assert the "Open Deck ↗" button is
     visible (`ClientPresentationLink`).
  5. If a row has an empty `deckUrl`, assert the "Paste the deck URL to enable"
     placeholder text is shown.
  6. Open `http://localhost:3004/admin/collections/deck-templates/<id>`.
  7. Assert `DeckTemplatePreviewLink` renders — either the "Preview template →"
     link (if `templateSlug` is populated) or the "Save with a templateSlug"
     placeholder.
  8. Assert `DeckTemplateUsageCount` renders — either a count badge or `null`.
- **Expected:** All four components (`ClientPresentationLink`,
  `ClientProposalPresentationLink`, `DeckTemplatePreviewLink`,
  `DeckTemplateUsageCount`) render without React errors. Correct conditional
  branch is shown based on field state.
- **Env/service deps:** admin session; local DB.
- **Triage:** React crash / missing component → PROD-BUG. "Paste the deck URL"
  placeholder when URL is set → PROD-BUG (field path mapping wrong).

### DEK-009-edge — DeckTemplateUsageCount fetches client usage via REST
- **Entry point:** `GET /api/clients?where[presentations.templateSlug][equals]=google-ads-audit-15-slide&limit=0&depth=0`
  (Payload REST; admin session).
- **Inputs:** admin session; query param `templateSlug = "google-ads-audit-15-slide"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/clients?where[presentations.templateSlug][equals]=google-ads-audit-15-slide&limit=0&depth=0")`.
  3. Assert 200 and body shape `{ totalDocs: N }` (N ≥ 0).
- **Expected:** 200 JSON with `totalDocs`; the usage-count component would
  display this value.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 or malformed shape → PROD-BUG. Note: count may be 0 on a
  fresh test DB — that is valid.

---

## DEK-010 — Deck generation apply handler · CMS-WRITE

### DEK-010-happy — Stage a deck proposal via OptiMate (assert pending; skip live apply)

> **Safety note:** `deck-from-template` is CMS-WRITE only (no external
> writes). The apply handler appends a row to `clients.presentations[]`. The
> scenario below stages the proposal to `pending` and asserts it is queued,
> which is the safe default. The optional "apply" step is explicitly labelled
> as a CMS-WRITE against the local test client, guarded by teardown.

- **Entry point:**
  - Agent tool: `propose_deck_from_template`
    (`src/lib/agents/optimate-google-ads/tools/propose-deck-from-template.ts`)
  - Apply handler: `applyDeckFromTemplate`
    (`src/lib/agents/optimate-google-ads/apply-handlers/deck-from-template.ts`)
  - Approval row: `GET /api/agent-approvals/<id>` (admin session).
- **Inputs:**
  - `clientId`: numeric Payload id of `zz-test-client`.
  - `templateSlug`: `"google-ads-audit-15-slide"`.
  - `deckSlug`: `"zz-deck-test-001"` (unique; chosen to be teardown-safe).
  - `title`: `"ZZ Test Deck"`.
  - `payload`: the `samplePayload` from
    `src/lib/decks/templates/google-ads-audit-15-slide/payload.ts`.
  - `summary`: `"Scenario DEK-010 test deck"`.
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve the numeric `clientId` of `zz-test-client` via
     `authedFetch("/api/clients?where[slug][equals]=zz-test-client&limit=1&depth=0")`
     → extract `docs[0].id`.
  3. Assert a `deck-templates` record exists for `templateSlug
     "google-ads-audit-15-slide"` via
     `authedFetch("/api/deck-templates?where[templateSlug][equals]=google-ads-audit-15-slide&limit=1")`;
     if absent, create it:
     ```json
     {
       "templateSlug": "google-ads-audit-15-slide",
       "name": "Google Ads Audit — 15-slide deck",
       "category": "google-ads-audit"
     }
     ```
     Log created id to teardown manifest.
  4. Call the `propose_deck_from_template` tool by POST-ing to the OptiMate
     agent chat endpoint with a tool invocation, **or** call it directly via
     a test harness that invokes the tool's `execute()` function with the
     above args and a stub context (`agentName: "test"`, `agentRunId: "test"`).
  5. Assert the tool returns `{ ok: true, data: { approvalId, approvalUrl, templateSlug, deckSlug } }`.
  6. `authedFetch("/api/agent-approvals/<approvalId>")` → assert HTTP 200;
     assert `{ status: "pending", proposalType: "deck-from-template" }`.
  7. **Stop here** (do not call the apply endpoint). Record `approvalId` in
     the teardown manifest (`agent-approvals`, id, op: `delete`).
- **Expected:** Tool returns `{ ok: true }` with a valid `approvalId`. The
  approval row is `pending`. `clients.presentations[]` is **not** modified
  (apply never called).
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** tool returns `{ ok: false }` → check error message: unknown
  `templateSlug` → PROD-BUG if template was seeded. Missing `clientId` →
  harness bug. 500 on approval creation → PROD-BUG.

### DEK-010-edge — Apply rejected when deckSlug already exists (idempotency guard)

> **CMS-WRITE against `zz-test-client`.** This step writes to the test
> client's `presentations[]` once and then tests the guard. Both the seeded
> row and the failed duplicate attempt must be logged in the teardown manifest.

- **Entry point:** Apply handler `applyDeckFromTemplate` called directly via
  a test harness or the admin approve→apply flow.
- **Inputs:** Same args as the happy path but `deckSlug = "zz-deck-dup-001"`.
- **Steps:**
  1. `loginAdmin()`; resolve `clientId` of `zz-test-client`.
  2. Call `applyDeckFromTemplate` (or trigger approve→apply) with
     `deckSlug = "zz-deck-dup-001"`. Assert the apply succeeds on the first
     call: the handler returns
     `{ message: "Appended deck ..." }` and the client's `presentations[]`
     now contains a row with `deckSlug = "zz-deck-dup-001"`.
  3. Log the modified client to the teardown manifest
     (`clients`, `zz-test-client id`, op: `remove-presentation-row zz-deck-dup-001`).
  4. Attempt to apply a **second time** with the identical `deckSlug`. Assert
     the handler **throws** an error containing
     `"already has a presentation with deckSlug"`.
  5. Re-fetch the client and assert `presentations[]` still contains exactly
     one row with `deckSlug = "zz-deck-dup-001"` (no duplicate was appended).
- **Expected:** First apply writes the row; second apply throws the idempotency
  guard error and leaves the array unchanged.
- **Env/service deps:** admin session; local DB.
- **Triage:** second apply silently appends a duplicate → PROD-BUG (idempotency
  guard bypassed). Handler does not throw on duplicate → PROD-BUG.
