# Test Scenarios — Content (`CON`)

Standalone scenarios keyed to FEAT-IDs `CON-001`…`CON-017` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`), proposal `zz-test-proposal` (PIN `5836`).

**Gemini wiring:** `GOOGLE_GENERATIVE_AI_API_KEY` is live in dev. Scenarios that call
Gemini (CON-005, CON-006, CON-007, CON-008, CON-009) are EXTERNAL-SAFE and may run
freely. A Gemini failure when the key is confirmed wired → **PROD-BUG**; a transient
rate-limit or 5xx → **UNKNOWN**.

**CON-016 note:** the internal-links approve route writes the CMS and syncs Growth Tools
status — both are safe. Any email triggered by the approve is **harness-blocked** (Brevo
live but blocked by test harness); a blocked send is **not** a test failure.

---

## CON-001 — Blog posts collection · READ

### CON-001-happy — List blog posts in admin
- **Entry point:** `GET /api/blog-posts` (Payload REST, admin session) or
  `/admin/collections/blog-posts` (browser).
- **Inputs:** admin session; optional filter `?where[client][slug][equals]=zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts?limit=10")`.
  3. Assert response shape: `{ docs: [...], totalDocs, page }`.
  4. (Optional) filter by client slug; confirm only matching posts are returned.
- **Expected:** 200 JSON with `docs` array; each doc has `title`, `client`, `status`,
  `coverImage`, `author` fields present (may be null for the test client if no posts
  seeded). No 500.
- **Env/service deps:** admin session (`TEST_ADMIN_PASSWORD`); local test DB. No external services.
- **Triage:** 401 without session is expected; 200 with session but 500 body → PROD-BUG.

---

## CON-002 — Blog prompts collection · READ

### CON-002-happy — List blog prompts in admin
- **Entry point:** `GET /api/blog-prompts` (Payload REST, admin session) or
  `/admin/collections/blog-prompts` (browser).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-prompts?limit=20")`.
  3. Assert shape: `{ docs: [...], totalDocs }`.
- **Expected:** 200 with a `docs` array; each entry has `title`, `keyword`,
  `status` (active/archived), and `client` reference. Archived prompts included in
  the raw Payload response unless filtered by the front-end.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## CON-003 — Blog prompter page · READ

### CON-003-happy — Blog Prompter page renders
- **Entry point:** `/admin/growth-tools/content` or the custom Blog Prompter admin route
  backed by `src/components/BlogPrompterPage.tsx` (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. Open the Blog Prompter admin page in a browser (screenshot or Playwright).
  2. Assert the `BlogPrompterPage` component renders without a crash.
  3. Assert the prompt list (`BlogPrompterListView`) shows rows or an empty state — not
     a blank/error page.
- **Expected:** page renders with a list view of blog prompts (active), a "Generate
  Prompt" button, and a filter/sort bar visible.
- **Env/service deps:** admin session.
- **Triage:** render crash / white screen → PROD-BUG.

---

## CON-004 — Blog prompts CRUD API · CMS-WRITE

### CON-004-happy — Create a blog prompt then archive it
- **Entry point:** `POST /api/blog-prompts` (create), `PATCH /api/blog-prompts/<id>`
  (archive).
- **Inputs:**
  ```json
  {
    "title": "ZZ Test Blog Prompt",
    "keyword": "test automation",
    "client": "<zz-test-client id>",
    "status": "active"
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-prompts", { method: "POST", body })` with the inputs above.
  3. Assert 200/201; capture `id` from the response → append to teardown manifest
     (`{ collection: "blog-prompts", id, op: "delete", timestamp }`).
  4. `authedFetch("/api/blog-prompts/<id>", { method: "PATCH", body: { status: "archived" } })`.
  5. `authedFetch("/api/blog-prompts/<id>")` — assert `status === "archived"`.
- **Expected:** prompt created with status `active`; PATCH succeeds; GET confirms
  `status: "archived"`.
- **Env/service deps:** admin session; local DB.
- **Triage:** creation 4xx → check required-field validation (PROD-BUG if all fields
  supplied); PATCH failure → PROD-BUG. Always log created id for teardown.

### CON-004-edge — Delete non-existent blog prompt returns 404
- **Entry point:** `DELETE /api/blog-prompts/999999999` (a non-existent id).
- **Inputs:** admin session; id `999999999`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-prompts/999999999", { method: "DELETE" })`.
  3. Assert status 404 (or 400 with a clear "not found" error body).
- **Expected:** 404/400; no crash; error body contains a meaningful message.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 instead of 404 → PROD-BUG; 200 on non-existent id → PROD-BUG.

---

## CON-005 — Generate blog prompt API · EXTERNAL-SAFE

### CON-005-happy — Generate a blog brief from a keyword via Gemini
- **Entry point:** `POST /api/blog-posts/generate-prompt`.
- **Inputs:**
  ```json
  {
    "keyword": "local SEO for dentists",
    "clientId": "<zz-test-client id>"
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts/generate-prompt", { method: "POST", body })`.
  3. Assert 200; assert response has a non-empty `prompt` (or `brief` / `content`)
     string field — a Gemini-generated blog brief for the keyword.
- **Expected:** 200 with a generated blog-brief/prompt string; no 500; content is
  semantically relevant to "local SEO for dentists".
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`,
  confirmed wired).
- **Triage:** 500 when key is wired → PROD-BUG; Gemini rate-limit / 429 / transient
  5xx → UNKNOWN; 4xx missing key → DEV-CONFIG.

### CON-005-edge — Missing keyword field returns 400
- **Entry point:** `POST /api/blog-posts/generate-prompt`.
- **Inputs:** `{}` (no `keyword`).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts/generate-prompt", { method: "POST", body: "{}" })`.
  3. Assert 400 with a validation error; no Gemini call made.
- **Expected:** 400 response with an error message indicating `keyword` is required.
- **Env/service deps:** admin session.
- **Triage:** 500 on missing field → PROD-BUG; 200 with empty content → PROD-BUG.

---

## CON-006 — Suggest blog prompt API · EXTERNAL-SAFE

### CON-006-happy — Suggest blog prompt ideas via Gemini
- **Entry point:** `POST /api/blog-prompts/suggest`.
- **Inputs:**
  ```json
  {
    "clientId": "<zz-test-client id>",
    "context": "dental practice in Sydney"
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-prompts/suggest", { method: "POST", body })`.
  3. Assert 200; assert response has a non-empty `suggestions` array (or equivalent
     field) with at least one AI-generated blog topic idea.
- **Expected:** 200 with an array of suggested prompt ideas; each idea has a `title` or
  `keyword` field; no 500.
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`,
  confirmed wired).
- **Triage:** 500 when key wired → PROD-BUG; Gemini rate-limit → UNKNOWN; missing key →
  DEV-CONFIG.

---

## CON-007 — Generate blog API · EXTERNAL-SAFE

### CON-007-happy — Generate full blog content from a prompt via Gemini
- **Entry point:** `POST /api/blog-prompts/generate-blog`.
- **Inputs:**
  ```json
  {
    "promptId": "<id of an existing blog prompt linked to zz-test-client>",
    "clientId": "<zz-test-client id>"
  }
  ```
  If no existing prompt, create one via CON-004-happy first and use its id.
- **Steps:**
  1. `loginAdmin()`.
  2. Ensure a blog prompt exists (re-use or create via `POST /api/blog-prompts`).
  3. `authedFetch("/api/blog-prompts/generate-blog", { method: "POST", body })`.
  4. Assert 200; assert response has a non-empty `content` (markdown/HTML) field; length
     > 200 characters.
- **Expected:** 200 with full blog content (introduction, body, conclusion) generated by
  Gemini; semantically coherent; no 500.
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`,
  confirmed wired).
- **Triage:** 500 when key wired → PROD-BUG; Gemini 429 / transient error → UNKNOWN;
  missing key → DEV-CONFIG.

---

## CON-008 — Generate blog image API · EXTERNAL-SAFE

### CON-008-happy — Generate a cover image for a blog post via Gemini
- **Entry point:** `POST /api/blog-posts/generate-image`.
- **Inputs:**
  ```json
  {
    "prompt": "A professional dental clinic interior with modern equipment",
    "blogPostId": "<id of an existing blog post, or omit if optional>"
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts/generate-image", { method: "POST", body })`.
  3. Assert 200; assert response contains an image URL or base64 blob field (e.g.
     `imageUrl`, `url`, or `data`).
- **Expected:** 200 with a generated cover image URL or blob; no 500.
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`,
  confirmed wired).
- **Triage:** 500 when key wired → PROD-BUG; Gemini rate-limit / image quota → UNKNOWN;
  missing key → DEV-CONFIG.

### CON-008-edge — Missing prompt context returns 400
- **Entry point:** `POST /api/blog-posts/generate-image`.
- **Inputs:** `{}` (no `prompt` or context).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts/generate-image", { method: "POST", body: "{}" })`.
  3. Assert 400 with a validation/missing-field error; no Gemini call attempted.
- **Expected:** 400 with a clear error indicating the prompt/context is required.
- **Env/service deps:** admin session.
- **Triage:** 500 on missing field → PROD-BUG; 200 with empty/null image → PROD-BUG.

---

## CON-009 — Generate blog image button · EXTERNAL-SAFE

### CON-009-happy — GenerateBlogImageButton renders and triggers image generation
- **Entry point:** `/admin/collections/blog-posts/<id>` (browser, admin session) →
  `GenerateBlogImageButton` component.
- **Inputs:** an existing blog-post record (create one via Payload admin if none exists).
- **Steps:**
  1. Open a blog-post admin record in a browser.
  2. Locate the "Generate image" button (rendered by `src/components/GenerateBlogImageButton.tsx`).
  3. Click the button.
  4. Wait for the network call to `POST /api/blog-posts/generate-image` to complete.
  5. Assert the button returns to a non-loading state and a cover image is shown or the
     field updates — no crash dialog.
- **Expected:** button transitions through a loading state; Gemini returns an image;
  cover image field is populated. No unhandled error toast.
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`,
  confirmed wired).
- **Triage:** button renders but click crashes → PROD-BUG; Gemini error shown in UI →
  check triage per CON-008.

---

## CON-010 — Blog topic map API · READ

### CON-010-happy — Fetch topic map for zz-test-client
- **Entry point:** `GET /api/blog-posts/topic-map?clientSlug=zz-test-client` (or
  `?clientId=<id>`; check actual query-param name in route).
- **Inputs:** `clientSlug=zz-test-client`; admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts/topic-map?clientSlug=zz-test-client")`.
  3. Assert 200; assert response has a `topics` array (or equivalent cluster map
     structure) — may be empty if no blog posts are seeded for the test client.
- **Expected:** 200 with a valid topic-map JSON structure (`{ topics: [...] }` or
  `{ clusters: [...] }`); empty array is acceptable (no seeded posts); no 500.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** 500 on a valid client slug → PROD-BUG; 404 for unknown slug → expected.

### CON-010-edge — Unknown client slug returns empty or 404
- **Entry point:** `GET /api/blog-posts/topic-map?clientSlug=zz-does-not-exist`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-posts/topic-map?clientSlug=zz-does-not-exist")`.
  3. Assert either 404 with a clear error, or 200 with an empty topics array.
- **Expected:** graceful response — not a 500 crash.
- **Triage:** 500 on unknown slug → PROD-BUG.

---

## CON-011 — Topic map / posts list components · READ

### CON-011-happy — ClientTopicMap and ClientBlogPostsList render
- **Entry point:** `/admin/collections/clients/<zz-test-client id>` → Content tab (browser,
  admin session). Components: `src/components/ClientTopicMap.tsx`,
  `src/components/ClientBlogPostsList.tsx`.
- **Inputs:** admin session; `zz-test-client`.
- **Steps:**
  1. Open the client admin record for `zz-test-client` in a browser.
  2. Navigate to the Content tab (if tabbed layout) or locate the Topic Map and Blog
     Posts List sections.
  3. Assert both components render without a crash — an empty state ("No blog posts
     yet") is acceptable.
  4. If `BlogPostsClientFilter` and `ClientAuthorSelect` are present, assert they render
     their selects/dropdowns without error.
- **Expected:** both components render; no unhandled component error; author select
  populates (may be empty); filter select renders.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG; empty state on no posts → expected (not a bug).

---

## CON-012 — Blog settings global + API · READ

### CON-012-happy — GET blog settings returns global config
- **Entry point:** `GET /api/blog-settings` (admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/blog-settings")`.
  3. Assert 200; assert response has expected shape: `{ defaultAuthor, authors, ... }`
     (shape defined by `src/globals/BlogSettings.ts`).
- **Expected:** 200 with the global blog settings object; `authors` array present (may
  be empty); no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

### CON-012-edge — Unauthenticated request blocked
- **Entry point:** `GET /api/blog-settings` (no session).
- **Steps:**
  1. Fetch `/api/blog-settings` without an admin session cookie.
  2. Assert 401 or 403.
- **Expected:** access denied without valid session.
- **Triage:** 200 without auth (public leak) → PROD-BUG (if the route is meant to be
  admin-only; skip if the route is intentionally public).

---

## CON-013 — Markdown paste/guide · READ

### CON-013-happy — Markdown paste helper and guide render
- **Entry point:** wherever `src/components/MarkdownPasteFeatureClient.tsx` and
  `src/components/MarkdownGuide.tsx` are embedded — typically inside the Blog Prompter
  admin page or a blog-post edit form (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. Open the Blog Prompter page or a blog-post admin edit page.
  2. Locate the Markdown Paste / Guide section.
  3. Assert the component renders a guide panel or paste textarea without a crash.
  4. (Optional) paste sample markdown; assert it does not crash the component.
- **Expected:** `MarkdownGuide` renders formatting tips; `MarkdownPasteFeatureClient`
  renders a paste input; no crash.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG.

---

## CON-014 — Internal link suggestions collection · READ

### CON-014-happy — List internal link suggestions in admin
- **Entry point:** `GET /api/internal-link-suggestions` (Payload REST, admin session) or
  `/admin/collections/internal-link-suggestions` (browser).
- **Inputs:** admin session; optional `?where[client][slug][equals]=zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/internal-link-suggestions?limit=10")`.
  3. Assert 200 with `{ docs: [...], totalDocs }`.
- **Expected:** 200; each doc has `sourceUrl`, `targetUrl`, `anchorText`, `status`,
  `client` fields; may be empty for test client.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## CON-015 — Internal link suggestions page · READ

### CON-015-happy — InternalLinkSuggestionsPage renders
- **Entry point:** the Internal Link Suggestions admin page (browser, admin session),
  backed by `src/components/InternalLinkSuggestionsPage.tsx` and
  `src/components/InternalLinkSuggestionsListView.tsx`.
- **Inputs:** admin session.
- **Steps:**
  1. Open the Internal Link Suggestions admin page in a browser.
  2. Assert `InternalLinkSuggestionsListView` renders a table or empty-state message
     without crash.
  3. Assert filter controls (by client, status) render.
- **Expected:** page loads with a list view; approve button visible on each suggestion
  row (or an "Approve" column); no render crash.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG; empty list with no seeded data → expected.

---

## CON-016 — Internal links approve API · CMS-WRITE

### CON-016-happy — Approve an internal-link suggestion
- **Entry point:** `POST /api/internal-links/approve`.
- **Inputs:**
  ```json
  { "id": "<id of an InternalLinkSuggestion record with status pending>" }
  ```
  If no pending suggestion exists for `zz-test-client`, first create one via the Payload
  REST API (`POST /api/internal-link-suggestions`) with fields `sourceUrl`,
  `targetUrl`, `anchorText`, `client: <zz-test-client id>`, `status: "pending"`.
  Log any newly created suggestion id to the teardown manifest.
- **Steps:**
  1. `loginAdmin()`.
  2. If needed: create a pending suggestion, log id to teardown manifest
     (`{ collection: "internal-link-suggestions", id, op: "delete", timestamp }`).
  3. `authedFetch("/api/internal-links/approve", { method: "POST",
     body: { id: "<suggestion id>" } })`.
  4. Assert 200; assert response indicates the suggestion status is now `approved` (or
     equivalent success state).
  5. `authedFetch("/api/internal-link-suggestions/<id>")` — confirm `status === "approved"`.
  6. Assert no email was sent (harness-blocked; a blocked send is **not** a failure).
  7. Assert Growth Tools sync call succeeded or was attempted (check response body for
     `syncStatus` field if present).
- **Expected:** 200; CMS record updated to `approved`; Growth Tools status synced (the
  approve route calls Growth Tools — if Growth Tools returns an error, surface it but
  classify per triage); email send path harness-blocked (not a test failure).
- **Env/service deps:** admin session; local DB; **Growth Tools** (`GROWTH_TOOLS_URL`,
  live); **Brevo email** (harness-blocked — blocked send is expected, not a failure).
- **Triage:** 500 on approve → PROD-BUG; Growth Tools 5xx → UNKNOWN; email-blocked ≠
  failure; CMS record not updated after 200 → PROD-BUG.

### CON-016-edge — Approve non-existent suggestion returns 404
- **Entry point:** `POST /api/internal-links/approve`.
- **Inputs:** `{ "id": "999999999" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/internal-links/approve", { method: "POST",
     body: { id: "999999999" } })`.
  3. Assert 404 or 400 with a clear error message.
- **Expected:** 404/400; no crash; no Growth Tools call attempted.
- **Triage:** 500 instead of 404 → PROD-BUG; 200 with no change → PROD-BUG.

---

## CON-017 — Job posts collection · READ

### CON-017-happy — List job posts in admin
- **Entry point:** `GET /api/job-posts` (Payload REST, admin session) or
  `/admin/collections/job-posts` (browser).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/job-posts?limit=10")`.
  3. Assert 200 with `{ docs: [...], totalDocs }`.
- **Expected:** 200; each doc has `title`, `description`, `status` fields; may be empty
  if no job posts seeded. No 500.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** 500 with valid session → PROD-BUG.

### CON-017-edge — Unauthenticated request blocked
- **Entry point:** `GET /api/job-posts` (no session).
- **Steps:**
  1. Fetch `/api/job-posts` without an admin session cookie.
  2. Assert 401 or 403.
- **Expected:** access denied without valid session (if the collection is admin-only).
- **Triage:** 200 public leak (if not intentional) → PROD-BUG.
