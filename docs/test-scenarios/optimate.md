# Test Scenarios — OptiMate agent (`OPT`)

Standalone scenarios keyed to FEAT-IDs `OPT-001`…`OPT-053` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads customer id `6591013898` =
whitelisted read account `659-101-3898`), proposal `zz-test-proposal` (PIN `5836`).

---

## ⚠️ Domain-level safety notes

| Topic | Rule |
|---|---|
| **`propose_*` tools** | Only **queue** an `AgentApprovalQueue` row — `status: pending`. No live change occurs. Side-effect class = CMS-WRITE. Safe to run; assert a pending row exists and **nothing** is applied. |
| **`apply` approval (OPT-042)** | This **is the live push** to Google Ads / Sheets. Scenario must assert only that the endpoint is harness-blocked or, against the test account, that the harness prevents dispatch. Never call apply against a real live account in test. |
| **OpenAI key absent** | `OPENAI_API_KEY` is **not valid** in dev. Any feature backed by OpenAI (OPT-001/002/003/005/006/011/013/015/019) will fail at the model call. Classify as `DEV-CONFIG`, not `PROD-BUG`. |
| **Kimi / Moonshot** | IS wired in dev — used as the primary model in most OptiMate chat routes. |
| **Gmail draft tools** | Draft-only; EXTERNAL-SAFE. The harness blocks any real send. |
| **Growth Tools** | LIVE prod read account `659-101-3898` is whitelisted. Read calls are safe. |
| **GSC / GA4 on test client** | `zz-test-client` has **no GSC/GA4 tokens**. Expect "not connected" or equivalent error — classify as `DEV-CONFIG`. |

---

## OPT-001 — OptiMate chat core · READ

### OPT-001-happy — Chat UI renders and returns a streaming response
- **Entry point:** `src/components/OptiMateChatCore.tsx` — open OptiMate in the
  admin browser (e.g. via the launcher or `/optimate-popout`).
- **Inputs:** message `"Hello, who are you?"`.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the OptiMate page and open the chat panel.
  3. Type `"Hello, who are you?"` and send.
  4. Observe streaming token output in the chat UI.
- **Expected:** chat response streams tokens and renders a complete reply. No tool
  calls expected for this generic greeting. The UI does not crash.
- **Env/service deps:** admin session; OpenAI (`OPENAI_API_KEY`) — **absent in dev**;
  Kimi/Moonshot as fallback if configured.
- **Triage:** model call 401/500 due to missing OpenAI key → **DEV-CONFIG**. UI
  crash unrelated to model → PROD-BUG.

### OPT-001-edge — Chat with no admin session is rejected
- **Entry point:** `POST /api/optimate/google-ads-accounts` (or any OptiMate chat
  streaming endpoint) without an auth cookie.
- **Inputs:** unauthenticated request.
- **Expected:** 401 Unauthorized; no model call made.
- **Triage:** 200 without session → PROD-BUG (security).

---

## OPT-002 — Google Ads chat (audit-scoped) · CMS-WRITE

### OPT-002-happy — Audit-scoped chat streams a response
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/chat` (admin session)
  where `<audit-id>` is any existing Google Ads audit record.
- **Inputs:** `{ messages: [{ role:"user", content:"Summarise this account." }] }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/google-ads-audits/<audit-id>/chat", { method:"POST", body })`.
  3. Read streaming response chunks.
- **Expected:** streaming 200 with model output. A `ChatTurn` may be persisted to
  `OptimateChatTurns`. If a Gmail draft tool is called it creates a draft only.
- **Env/service deps:** admin session; OpenAI (`OPENAI_API_KEY`, **absent in dev**);
  Gmail OAuth (agent credentials).
- **Triage:** model 401 → **DEV-CONFIG**. DB persist failure with a valid model → PROD-BUG.

### OPT-002-edge — Chat against non-existent audit id returns 404
- **Inputs:** `POST /api/google-ads-audits/9999999/chat` (id that does not exist).
- **Expected:** 404 with a clear message; no model call.
- **Triage:** crash/500 → PROD-BUG.

---

## OPT-003 — OptiMate multi-chat · READ

### OPT-003-happy — Multi-chat renders multiple thread slots
- **Entry point:** `src/components/OptiMateMultiChat.tsx` (admin browser).
- **Steps:**
  1. `loginAdmin()`, navigate to the multi-chat page.
  2. Open a second thread tab.
  3. Confirm each thread has its own chat input and message list.
- **Expected:** UI renders multiple chat panels without crash; threads are
  independent (separate `threadId` values visible in requests).
- **Env/service deps:** admin session; OpenAI (**absent in dev** — model calls will fail).
- **Triage:** render crash → PROD-BUG. Model-call failure → **DEV-CONFIG**.

---

## OPT-004 — OptiMate launcher · READ

### OPT-004-happy — Launcher button renders and opens OptiMate
- **Entry point:** `src/components/OptiMateLauncher.tsx` (admin browser, any page).
- **Steps:**
  1. `loginAdmin()`, open any admin page.
  2. Click the OptiMate launcher icon/button in the admin dock.
  3. Confirm the OptiMate panel or popout opens.
- **Expected:** panel opens; no JavaScript errors in console.
- **Env/service deps:** admin session only.
- **Triage:** click handler crashes → PROD-BUG.

---

## OPT-005 — OptiMate popout · READ

### OPT-005-happy — Popout page loads with valid admin session
- **Entry point:** `GET http://localhost:3004/optimate-popout` (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `http://localhost:3004/optimate-popout`.
  3. Confirm the page renders the chat UI shell.
- **Expected:** 200 HTML; chat input visible; no crash before a message is sent.
- **Env/service deps:** admin session; OpenAI (**absent in dev** — sending a message will fail at model call).
- **Triage:** page render crash → PROD-BUG. Model call failure → **DEV-CONFIG**.

### OPT-005-edge — Popout without session redirects to login
- **Entry point:** `GET /optimate-popout` (no cookie).
- **Expected:** redirect to login or 401; no chat UI exposed.
- **Triage:** unauthenticated access to chat → PROD-BUG (security).

---

## OPT-006 — OptiMate voice · READ

### OPT-006-happy — Voice UI renders mic button
- **Entry point:** `src/components/OptiMateVoice.tsx` (admin browser).
- **Steps:**
  1. `loginAdmin()`, open the voice component.
  2. Confirm the mic icon/button is rendered.
  3. Do **not** click; just assert the UI is present.
- **Expected:** mic button renders; no crash on mount.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG.

### OPT-006-edge — Realtime session call fails gracefully without OpenAI key
- **Entry point:** `GET /api/optimate/realtime-session` (admin session).
- **Steps:**
  1. `authedFetch("/api/optimate/realtime-session")`.
  2. Observe the response.
- **Expected:** error response (4xx/5xx) with a clear message about missing credentials;
  no stack trace leaked.
- **Env/service deps:** OpenAI Realtime API (`OPENAI_API_KEY`, **absent in dev**).
- **Triage:** clean error response → **DEV-CONFIG**. Raw stack trace or crash → PROD-BUG.

---

## OPT-007 — Confirm bubble · READ

### OPT-007-happy — Confirm bubble renders from `request_confirm` tool call
- **Entry point:** `src/components/OptiMateConfirmBubble.tsx` (admin browser, via
  OptiMate chat).
- **Inputs:** prompt OptiMate with `"Please ask me to confirm before doing anything."`.
- **Steps:**
  1. `loginAdmin()`, open OptiMate chat.
  2. Send the prompt above.
  3. Wait for the agent to call `request_confirm` and render the confirm bubble.
  4. Observe that a Yes/No control appears.
- **Expected:** confirm bubble rendered with the question text; chat is paused
  awaiting input. No action is taken until explicit confirmation.
- **Env/service deps:** admin session; Kimi/Moonshot (model wired in dev).
- **Triage:** bubble does not appear and action proceeds without confirmation → PROD-BUG.
  Model failure → **DEV-CONFIG**.

### OPT-007-edge — Declining confirm aborts the action
- **Steps:** (continuing from OPT-007-happy) click **No** on the confirm bubble.
- **Expected:** agent acknowledges the decline; no downstream tool call is made;
  no CMS rows are created.
- **Triage:** action proceeds despite "No" → PROD-BUG (safety gate failure).

---

## OPT-008 — Proposal card · READ

### OPT-008-happy — Proposal card renders after a `propose_*` call
- **Entry point:** `src/components/OptiMateProposalCard.tsx` (admin browser, via
  OptiMate chat after a propose tool fires).
- **Inputs:** trigger any `propose_*` tool (e.g. OPT-028 flow — ask OptiMate to
  propose a budget change). See OPT-028 for full steps.
- **Expected:** the chat renders an `OptiMateProposalCard` with the queued
  proposal's type, description, and a link to the approval queue; the card does
  not auto-apply anything.
- **Env/service deps:** admin session; Kimi/Moonshot.
- **Triage:** card absent after a successful `propose_*` call → PROD-BUG.

---

## OPT-009 — Tools help popover · READ

### OPT-009-happy — Tools popover lists all tool categories
- **Entry point:** `src/components/OptiMateToolsHelp.tsx` → `GET /api/agent-tool-catalog`.
- **Steps:**
  1. `loginAdmin()`.
  2. Open OptiMate; click the `"?"` / tools-help button.
  3. Observe the popover content.
- **Expected:** popover renders with tool categories (read, propose, memory, etc.)
  and descriptions for each tool. Matches the catalog returned by
  `GET /api/agent-tool-catalog`.
- **Env/service deps:** admin session.
- **Triage:** popover crash → PROD-BUG. Empty catalog with 200 → PROD-BUG.

---

## OPT-010 — Tool catalog API · READ

### OPT-010-happy — Returns categorised tool list
- **Entry point:** `GET http://localhost:3004/api/agent-tool-catalog` (admin session).
- **Steps:**
  1. `authedFetch("/api/agent-tool-catalog")`.
  2. Assert response shape.
- **Expected:** 200 JSON with an array of tool groups, each containing tool names
  and human-readable descriptions; non-empty.
- **Env/service deps:** admin session.
- **Triage:** 500 or empty array → PROD-BUG.

### OPT-010-edge — Unauthenticated request is rejected
- **Inputs:** no admin cookie.
- **Expected:** 401.
- **Triage:** 200 without auth → PROD-BUG (security).

---

## OPT-011 — Realtime voice session API · EXTERNAL-SAFE

### OPT-011-happy — Endpoint returns structured error for missing OpenAI key
- **Entry point:** `GET /api/optimate/realtime-session` (admin session).
- **Steps:**
  1. `authedFetch("/api/optimate/realtime-session")`.
  2. Capture response.
- **Expected:** given `OPENAI_API_KEY` is absent, returns a 4xx/5xx with a
  descriptive error (e.g. "invalid API key" or "OPENAI_API_KEY not configured");
  **not** a 200 with a garbage token.
- **Env/service deps:** admin session; OpenAI Realtime API (**absent in dev**).
- **Triage:** clean error → **DEV-CONFIG**. Crash / unhandled exception → PROD-BUG.

---

## OPT-012 — Realtime tool bridge API · EXTERNAL-SAFE

### OPT-012-happy — Executes a read tool call from the voice agent
- **Entry point:** `POST /api/optimate/realtime-tool` (admin session).
- **Inputs:**
  ```json
  {
    "tool": "get_account_overview",
    "args": { "customerId": "659-101-3898" }
  }
  ```
- **Steps:**
  1. `authedFetch("/api/optimate/realtime-tool", { method:"POST", body })`.
  2. Assert response contains account overview metrics.
- **Expected:** 200 with account overview JSON from Growth Tools for account
  `659-101-3898`. No writes occur.
- **Env/service deps:** admin session; **Growth Tools** (live, whitelisted account).
- **Triage:** Growth Tools 5xx → UNKNOWN. Route 500 with Growth Tools 200 → PROD-BUG.

### OPT-012-edge — Unknown tool name returns structured error
- **Inputs:** `{ "tool": "does_not_exist", "args": {} }`.
- **Expected:** 400/422 with "unknown tool" message; no Growth Tools call.
- **Triage:** crash → PROD-BUG.

---

## OPT-013 — Email realtime session API · EXTERNAL-SAFE

### OPT-013-happy — Endpoint returns structured error for missing OpenAI key
- **Entry point:** `GET /api/optimate/email-realtime-session` (admin session).
- **Steps:** `authedFetch("/api/optimate/email-realtime-session")`.
- **Expected:** given missing OpenAI key, returns a 4xx/5xx with a descriptive error.
  No crash, no stack-trace leak.
- **Env/service deps:** admin session; OpenAI Realtime + Gmail OAuth (**OpenAI absent**).
- **Triage:** clean error → **DEV-CONFIG**. Crash → PROD-BUG.

---

## OPT-014 — Email realtime tool bridge API · EXTERNAL-SAFE

### OPT-014-happy — `search_gmail_inbox` tool call returns inbox results
- **Entry point:** `POST /api/optimate/email-realtime-tool` (admin session).
- **Inputs:**
  ```json
  {
    "tool": "search_gmail_inbox",
    "args": { "query": "subject:test", "maxResults": 5 }
  }
  ```
- **Steps:**
  1. `authedFetch("/api/optimate/email-realtime-tool", { method:"POST", body })`.
  2. Observe response.
- **Expected:** 200 with an array of matching messages (or an empty array if none);
  EXTERNAL-SAFE (no writes). If agent Gmail credentials are not configured, a
  graceful "not authenticated" error is returned.
- **Env/service deps:** admin session; Gmail OAuth (agent credentials — may be
  absent in dev).
- **Triage:** graceful "not authenticated" → **DEV-CONFIG**. Crash → PROD-BUG.

### OPT-014-edge — `stage_email_reply` creates a draft, not a send
- **Inputs:**
  ```json
  {
    "tool": "stage_email_reply",
    "args": {
      "threadId": "AAAAA",
      "to": "test@example.com",
      "subject": "Re: test",
      "body": "Test draft body"
    }
  }
  ```
- **Expected:** a Gmail **draft** is created (EXTERNAL-SAFE); no email is sent. If
  agent Gmail credentials absent → graceful error.
- **Triage:** email actually sent → PROD-BUG (harness must block). Graceful auth
  error → **DEV-CONFIG**.

---

## OPT-015 — Portfolio chat API · CMS-WRITE

### OPT-015-happy — Portfolio chat streams response (model call expected to fail in dev)
- **Entry point:** `POST /api/optimate/google-ads-portfolio/chat` (admin session).
- **Inputs:** `{ messages: [{ role:"user", content:"Which account spent the most last month?" }] }`.
- **Steps:**
  1. `authedFetch("/api/optimate/google-ads-portfolio/chat", { method:"POST", body })`.
  2. Read streaming response.
- **Expected:** streaming begins; if OpenAI key absent, a clear model-error message
  is streamed. Route should not crash with a 500.
- **Env/service deps:** admin session; OpenAI (**absent in dev**); Growth Tools.
- **Triage:** model error streamed → **DEV-CONFIG**. Route-level 500 before model → PROD-BUG.

---

## OPT-016 — Google Ads accounts list API · READ

### OPT-016-happy — Returns the list of configured accounts
- **Entry point:** `GET /api/optimate/google-ads-accounts` (admin session).
- **Steps:** `authedFetch("/api/optimate/google-ads-accounts")`.
- **Expected:** 200 JSON array of account objects; `zz-test-client` with customer
  id `6591013898` should appear.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG. Empty array when client exists → PROD-BUG.

### OPT-016-edge — Unauthenticated request blocked
- **Expected:** 401.
- **Triage:** 200 without session → PROD-BUG.

---

## OPT-017 — Default model API · READ

### OPT-017-happy — Returns the configured default model name
- **Entry point:** `GET /api/optimate/default-model` (admin session).
- **Steps:** `authedFetch("/api/optimate/default-model")`.
- **Expected:** 200 `{ model: "<model-name>" }` (e.g. Kimi or OpenAI model id);
  non-empty string.
- **Env/service deps:** admin session; Globals → OptiMate Settings.
- **Triage:** 500 or empty model → PROD-BUG.

---

## OPT-018 — Chat history API · READ

### OPT-018-happy — Returns persisted chat turns for a thread
- **Entry point:** `GET /api/optimate-chat-history?threadId=<id>` (admin session).
- **Inputs:** use a `threadId` from a previous chat turn written to `OptimateChatTurns`
  (or use a known fixture if seeded). If no thread exists, use `threadId=zz-test-thread`.
- **Steps:** `authedFetch("/api/optimate-chat-history?threadId=zz-test-thread")`.
- **Expected:** 200 `{ turns: [] }` (empty for a new thread) or array of turn
  objects with `role`, `content`, `createdAt`.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

### OPT-018-edge — Missing threadId param
- **Inputs:** `GET /api/optimate-chat-history` (no query param).
- **Expected:** 400/422 with a clear validation error.
- **Triage:** 500 crash → PROD-BUG.

---

## OPT-019 — Transcribe API · EXTERNAL-SAFE

### OPT-019-happy — Upload audio file returns transcription (or graceful key-missing error)
- **Entry point:** `POST /api/transcribe` (admin session, multipart).
- **Inputs:** a small WAV/MP3 file (e.g. 1-second silence or test tone).
- **Steps:**
  1. Create a minimal valid audio file for the test.
  2. `authedFetch("/api/transcribe", { method:"POST", body: <FormData with audio> })`.
  3. Observe response.
- **Expected:** if `OPENAI_API_KEY` absent → 4xx/5xx with "invalid key" or similar;
  **not** a crash. If key present (prod) → 200 `{ text: "..." }`.
- **Env/service deps:** admin session; OpenAI Whisper (**absent in dev**).
- **Triage:** clean key-error response → **DEV-CONFIG**. Route crash → PROD-BUG.

---

## OPT-020 — Read tools — Google Ads · EXTERNAL-SAFE

### OPT-020-happy — `get_account_overview` returns metrics for whitelisted account
- **Entry point:** OptiMate chat → agent calls `get_account_overview` tool;
  or direct via `POST /api/optimate/realtime-tool` (see OPT-012).
- **Inputs:** prompt `"Give me an account overview for 659-101-3898 for November 2024."`
  sent to OptiMate chat with `clientId` set to `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`, open OptiMate chat, select `zz-test-client` as context.
  2. Send: `"Give me an account overview for account 659-101-3898 for November 2024."`
  3. Wait for the agent response.
  4. Confirm the agent's tool-call trace shows `get_account_overview` was invoked.
  5. Assert the reply contains numeric spend/impression/click figures.
- **Expected:**
  - Agent calls `get_account_overview` with `{ customerId:"659-101-3898", dateRange:"2024-11" }` (or equivalent).
  - Response contains at least: `impressions`, `clicks`, `cost`, `conversions`.
  - No propose tool is called; this is a pure read.
- **Env/service deps:** admin session; **Growth Tools** (live, whitelisted account `659-101-3898`);
  Kimi/Moonshot (wired).
- **Triage:** Growth Tools 5xx → UNKNOWN. Agent never calls the tool → PROD-BUG.
  Numbers returned but model error → **DEV-CONFIG** (if OpenAI model selected).

### OPT-020-edge — `get_campaign_performance` for a specific campaign name
- **Inputs:** prompt `"Show me campaign performance for all campaigns in account 659-101-3898 for the last 30 days."`
- **Expected:**
  - Agent calls `get_campaign_performance`.
  - Response lists campaigns with `impressions`, `clicks`, `cost`, `conversions` per campaign.
- **Triage:** same as happy; empty campaign list → UNKNOWN (account may have no campaigns).

---

## OPT-021 — Read tools — Search/GA4/SERP/AI · EXTERNAL-SAFE

### OPT-021-happy — GSC read tool returns "not connected" for test client
- **Entry point:** OptiMate chat with `zz-test-client` as context.
- **Inputs:** prompt `"What is the GSC overview for this client?"`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt.
  3. Agent calls `get_gsc_overview`.
- **Expected:** agent replies with a message indicating GSC is not connected or
  no data is available for the test client (since `zz-test-client` has no GSC tokens).
  This is the expected outcome → classify as **DEV-CONFIG**, not a bug.
- **Env/service deps:** admin session; GSC OAuth (**disconnected** for test client);
  Kimi/Moonshot.
- **Triage:** agent claims successful GSC data when client is disconnected → PROD-BUG.
  Clean "not connected" → **DEV-CONFIG**.

### OPT-021-edge — GA4 read tool also returns "not connected"
- **Inputs:** prompt `"Show me GA4 sessions for this client last month."`
- **Expected:** agent calls `get_ga4_overview`; response is "not connected" or
  "no GA4 data" for `zz-test-client`. **DEV-CONFIG** as expected.
- **Triage:** same as happy.

---

## OPT-022 — Read tools — Portfolio · EXTERNAL-SAFE

### OPT-022-happy — `get_portfolio_account_inventory` returns account list
- **Entry point:** OptiMate chat (portfolio mode or portfolio chat API).
- **Inputs:** prompt `"List all managed Google Ads accounts in the portfolio."`
- **Steps:**
  1. `loginAdmin()`, open OptiMate in portfolio context (or via
     `POST /api/optimate/google-ads-portfolio/chat`).
  2. Send the prompt.
  3. Agent calls `get_portfolio_account_inventory`.
- **Expected:** agent returns a list of managed accounts including at minimum the
  whitelisted test account `659-101-3898`. Each entry has `customerId` and `name`.
- **Env/service deps:** admin session; **Growth Tools** (live); Kimi/Moonshot.
- **Triage:** Growth Tools 5xx → UNKNOWN. Empty inventory → PROD-BUG if clients exist.

### OPT-022-edge — Portfolio performance summary with a date range
- **Inputs:** prompt `"Give me a portfolio performance summary for October 2024."`
- **Expected:** agent calls `get_portfolio_performance_summary` with the date; returns
  aggregated spend, clicks, and conversions across accounts.
- **Triage:** tool not called / empty data → UNKNOWN (depends on Growth Tools data).

---

## OPT-023 — Read tools — Client/pipeline/scheduled/goals · READ

### OPT-023-happy — `get_client_details` returns test client info
- **Entry point:** OptiMate chat with `zz-test-client` as context.
- **Inputs:** prompt `"What are the details for this client?"`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt.
  3. Agent calls `get_client_details` or `get_selected_client_details`.
- **Expected:** agent returns the client's name (`ZZ Test Client`), website, Google
  Ads customer id (`6591013898`), status (`active`), and assigned services. No
  external calls needed — data from local DB.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** wrong client returned → PROD-BUG. Tool not called → PROD-BUG.

### OPT-023-edge — `list_scheduled_tasks` returns empty or task list
- **Inputs:** prompt `"What scheduled tasks are set up for this client?"`
- **Expected:** agent calls `list_scheduled_tasks`; returns an empty array or
  existing tasks from `ScheduledAgentTasks` for the test client.
- **Triage:** 500 from the tool → PROD-BUG.

---

## OPT-024 — Memory search tool · READ

### OPT-024-happy — Memory search returns a previously stored fact
- **Entry point:** OptiMate chat (after OPT-025 stores a fact first).
- **Pre-condition:** run OPT-025-happy first to store a known fact.
- **Inputs:** prompt `"What do you remember about the ZZ Test Client budget target?"`
- **Steps:**
  1. Ensure a memory note `"ZZ Test Client budget target is $5000 per month"` has been
     stored via OPT-025 (or `remember` tool).
  2. Open OptiMate chat.
  3. Send the prompt.
  4. Agent calls `memory_search` with a relevant query.
- **Expected:** agent retrieves and surfaces the stored memory note containing the
  budget target fact. Recall is accurate and within the reply.
- **Env/service deps:** admin session; local DB (`AgentMemory` collection);
  Kimi/Moonshot.
- **Triage:** memory not returned despite existing → PROD-BUG. Tool not called → PROD-BUG.

### OPT-024-edge — Memory search for non-existent term returns empty
- **Inputs:** prompt `"What do you remember about purple elephants?"`
- **Expected:** agent calls `memory_search`; returns no memories found; agent
  replies accordingly without hallucinating stored facts.
- **Triage:** agent invents a non-existent memory → PROD-BUG (hallucination in recall).

---

## OPT-025 — Remember tool · CMS-WRITE

### OPT-025-happy — Agent stores a memory note in `AgentMemory`
- **Entry point:** OptiMate chat.
- **Inputs:** prompt `"Remember that ZZ Test Client budget target is $5000 per month."`
- **Steps:**
  1. `loginAdmin()`, open OptiMate chat.
  2. Send the prompt.
  3. Agent calls the `remember` tool.
  4. `authedFetch("/api/agent/memory-review-summary")` to confirm a new entry.
  5. Also query `GET /api/collections/agent-memory` (admin) to find the row.
- **Expected:**
  - Agent confirms it has remembered the fact.
  - A new `AgentMemory` record exists in the DB with the content `"ZZ Test Client budget target is $5000 per month"`.
  - Status is `active` or `pending-review`.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** no `AgentMemory` row created after tool call → PROD-BUG. Log new row id
  to teardown manifest.

### OPT-025-edge — Remember with empty content is rejected
- **Inputs:** prompt `"Remember ."` (empty/meaningless content).
- **Expected:** agent either declines to store a trivial note or stores it but
  clearly flags it; no crash.
- **Triage:** crash → PROD-BUG.

---

## OPT-026 — Soul-set tool · CMS-WRITE

### OPT-026-happy — Agent updates the soul configuration
- **Entry point:** OptiMate chat.
- **Inputs:** prompt `"Update your persona: set tone to 'formal' and name to 'OptiMate Test'."`
- **Steps:**
  1. `loginAdmin()`, open OptiMate chat.
  2. Send the prompt.
  3. Agent calls `soul_set` with the new persona values.
  4. Inspect `AgentSoul` global/collection record to confirm the change.
- **Expected:** the `AgentSoul` record is updated with `tone: "formal"` (or equivalent
  field name) and reflects the new name. Agent confirms the update.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** soul record unchanged → PROD-BUG. Log changed field(s) to teardown manifest.

---

## OPT-027 — Request-confirm gate tool · READ

### OPT-027-happy — Confirm gate appears and "yes" proceeds
- **Entry point:** OptiMate chat; engineered to trigger `request_confirm`.
- **Inputs:** prompt `"Ask me to confirm before you proceed with anything."`; then
  follow up with a propose-type request, e.g. `"Propose changing the budget for
  account 659-101-3898 to $100/day, but ask me first."`.
- **Steps:**
  1. Open OptiMate chat, send both prompts in sequence.
  2. Agent calls `request_confirm` — confirm bubble appears (see OPT-007).
  3. Click **Yes** in the UI.
  4. Agent proceeds to call the next tool (e.g. `propose_budget_update`).
- **Expected:**
  - Confirm bubble renders; action paused.
  - "Yes" resumes the flow; agent calls the queued `propose_*` tool.
  - An `AgentApprovalQueue` row with `status: pending` is created (CMS-WRITE, safe).
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** action proceeds without confirm bubble → PROD-BUG (safety gate bypassed).

### OPT-027-edge — "No" on confirm aborts and no side effects occur
- **Steps:** (same setup) Click **No** on the confirm bubble.
- **Expected:** agent acknowledges abort; no `AgentApprovalQueue` row is created;
  no other writes occur.
- **Triage:** approval row created despite "No" → PROD-BUG.

---

## OPT-028 — Propose tools — budgets · CMS-WRITE

### OPT-028-happy — `propose_budget_update` queues a pending approval row
- **Entry point:** OptiMate chat with `zz-test-client` context.
- **Inputs:** prompt `"Propose updating the budget for campaign 'search_cro-audit-tool_au'
  in account 659-101-3898 to $50 per day."`
- **Steps:**
  1. `loginAdmin()`, open OptiMate chat, set context to `zz-test-client`.
  2. Send the prompt (optionally first confirm via OPT-027 gate).
  3. Agent calls `propose_budget_update`.
  4. `authedFetch("/api/agent-approvals")` to list approval queue.
  5. Find the newly created row; assert `status === "pending"`.
- **Expected:**
  - A new `AgentApprovalQueue` record exists with:
    - `type: "budget_update"` (or equivalent),
    - `status: "pending"`,
    - `payload` containing `campaignName`, `newBudget: 50`, `customerId: "659-101-3898"`.
  - **No** budget change has been applied to Google Ads. The live push happens only
    via OPT-042 (`apply`), which is harness-blocked.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** approval row absent → PROD-BUG. Row `status: applied` → PROD-BUG
  (live push happened without approval). Log new row id to teardown manifest.

### OPT-028-edge — `propose_budget_push_live` also only queues (does not push)
- **Inputs:** prompt `"Push all campaign budgets live for account 659-101-3898."`
- **Expected:** agent calls `propose_budget_push_live`; an `AgentApprovalQueue` row
  with `status: pending` is created; no live budget push occurs.
- **Triage:** any live Ads change → PROD-BUG (DANGER bypassed).

---

## OPT-029 — Propose tools — negatives · CMS-WRITE

### OPT-029-happy — `propose_negative_keywords` queues a pending approval row
- **Entry point:** OptiMate chat with `zz-test-client` context.
- **Inputs:** prompt `"Propose adding the negative keywords 'free', 'diy' to the
  broad match in campaign 'search_cro-audit-tool_au' for account 659-101-3898."`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt; agent calls `propose_negative_keywords`.
  3. Query approval queue; find the new row.
- **Expected:**
  - `AgentApprovalQueue` row with `status: pending`.
  - `payload` includes `keywords: ["free","diy"]`, `matchType: "broad"`, campaign reference.
  - Nothing pushed to Google Ads.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** no pending row → PROD-BUG. Live Ads write → PROD-BUG.

### OPT-029-edge — `propose_nkl_push_live` queues but does not push
- **Inputs:** prompt `"Push the NKL live for account 659-101-3898."`
- **Expected:** `propose_nkl_push_live` queues an approval row; no live push.
- **Triage:** live Ads change → PROD-BUG.

---

## OPT-030 — Propose tools — structure · CMS-WRITE

### OPT-030-happy — `propose_campaign_build` queues an approval row
- **Entry point:** OptiMate chat with `zz-test-client` context.
- **Inputs:** prompt `"Propose building a new branded search campaign for account
  659-101-3898 targeting Australia."`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt; agent calls `propose_campaign_build`.
  3. Query approval queue.
- **Expected:**
  - `AgentApprovalQueue` row `status: pending` with `type: "campaign_build"` (or equivalent).
  - `payload` contains campaign structure (name, targeting, match types, keywords).
  - No live campaign created.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** live campaign built → PROD-BUG (DANGER bypassed).

### OPT-030-edge — `propose_ad_group_create` queues without creating live ad group
- **Inputs:** prompt `"Propose creating a new ad group 'Brand Core' in the branded
  campaign in account 659-101-3898."`
- **Expected:** `propose_ad_group_create` queues; no live ad group created.
- **Triage:** live Ads change → PROD-BUG.

---

## OPT-031 — Propose tools — ad copy · CMS-WRITE

### OPT-031-happy — `propose_ad_copy_generate` queues an ad-copy approval row
- **Entry point:** OptiMate chat with `zz-test-client` context.
- **Inputs:** prompt `"Propose generating new ad copy for the branded campaign in
  account 659-101-3898. Focus on the CRO audit tool offering."`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt; agent calls `propose_ad_copy_generate`.
  3. Query approval queue.
- **Expected:**
  - `AgentApprovalQueue` row `status: pending` with `type: "ad_copy_generate"`.
  - `payload` includes draft headline/description variants.
  - No ad copy deployed live.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** live ad copy deployed → PROD-BUG.

### OPT-031-edge — `propose_ad_copy_deploy` queues, does not deploy
- **Inputs:** prompt `"Deploy the approved ad copy now for account 659-101-3898."`
- **Expected:** `propose_ad_copy_deploy` queues an approval row; no live deploy.
- **Triage:** live deployment triggered → PROD-BUG.

---

## OPT-032 — Propose tools — scheduled tasks · CMS-WRITE

### OPT-032-happy — `propose_scheduled_task` queues an approval row
- **Entry point:** OptiMate chat.
- **Inputs:** prompt `"Propose a weekly recurring recap for account 659-101-3898
  every Monday at 9 AM."`
- **Steps:**
  1. Open OptiMate chat.
  2. Send the prompt; agent calls `propose_scheduled_task`.
  3. Query approval queue.
- **Expected:**
  - `AgentApprovalQueue` row `status: pending`.
  - `payload` contains schedule (day: Monday, time: 09:00, recurrence: weekly),
    account reference.
  - No `ScheduledAgentTasks` record created yet (only on apply).
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** scheduled task created without approval → PROD-BUG.

### OPT-032-edge — `propose_scheduled_task_update` also queues
- **Inputs:** prompt `"Update the weekly recap to run on Fridays instead."`
- **Expected:** `propose_scheduled_task_update` queues; existing task unchanged.
- **Triage:** task updated without approval → PROD-BUG.

---

## OPT-033 — Propose tools — decks · CMS-WRITE

### OPT-033-happy — `propose_deck_from_template` queues a deck approval row
- **Entry point:** OptiMate chat with `zz-test-client` context.
- **Inputs:** prompt `"Propose building a monthly performance deck for ZZ Test Client
  from the standard template."`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt; agent calls `propose_deck_from_template`.
  3. Query approval queue.
- **Expected:**
  - `AgentApprovalQueue` row `status: pending` with `type: "deck_from_template"`.
  - `payload` references the template and client.
  - No deck generated or emailed yet.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** deck generated without approval → PROD-BUG.

### OPT-033-edge — `propose_stakeholder_deck` also queues
- **Inputs:** prompt `"Propose a stakeholder deck for ZZ Test Client for Q4 2024."`
- **Expected:** `propose_stakeholder_deck` queues; no deck produced until applied.
- **Triage:** deck generated → PROD-BUG.

---

## OPT-034 — Propose tools — goal runs · CMS-WRITE

### OPT-034-happy — `create_goal_run` queues a goal-run approval row
- **Entry point:** OptiMate chat with `zz-test-client` context.
- **Inputs:** prompt `"Propose starting an account efficiency goal run for account
  659-101-3898."`
- **Steps:**
  1. Open OptiMate chat, context = `zz-test-client`.
  2. Send the prompt; agent calls `create_account_efficiency_goal_run` or `create_goal_run`.
  3. Query approval queue.
- **Expected:**
  - `AgentApprovalQueue` row `status: pending` with `type` referencing the goal run.
  - `payload` includes `customerId: "659-101-3898"` and goal parameters.
  - No autonomous goal agent is started until approval + apply.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** goal agent starts executing without approval → PROD-BUG.

---

## OPT-035 — Gmail draft tool · EXTERNAL-SAFE

### OPT-035-happy — `create_gmail_draft` creates a draft (no send)
- **Entry point:** OptiMate chat.
- **Inputs:** prompt `"Draft an email to test@example.com with subject 'OPT-035 test'
  and body 'This is a test draft for OPT-035.' Do not send it."`
- **Steps:**
  1. Open OptiMate chat.
  2. Send the prompt; agent calls `create_gmail_draft`.
  3. If Gmail credentials are configured: verify via Gmail API or agent confirmation
     that a **draft** (not sent message) exists with that subject.
- **Expected:**
  - Agent confirms draft created.
  - If Gmail OAuth absent for agent → graceful "not authenticated" response.
  - In no case is the email **sent** (EXTERNAL-SAFE).
- **Env/service deps:** admin session; Gmail OAuth for agent (may be absent in dev).
- **Triage:** email actually sent → PROD-BUG (DANGER bypassed). Graceful auth error → **DEV-CONFIG**.

### OPT-035-edge — Draft with missing recipient returns validation error
- **Inputs:** prompt `"Draft an email with subject 'No recipient test'."`  (no `to` field).
- **Expected:** agent reports an error or prompts for the missing recipient; no draft created.
- **Triage:** crash → PROD-BUG.

---

## OPT-036 — Email agent tools · EXTERNAL-SAFE

### OPT-036-happy — `search_gmail_inbox` returns results via email agent
- **Entry point:** email agent (via `POST /api/optimate/email-realtime-tool` or
  typed email chat if available), admin session.
- **Inputs:** `{ "tool": "search_gmail_inbox", "args": { "query": "from:noreply", "maxResults": 3 } }`.
- **Steps:**
  1. `authedFetch("/api/optimate/email-realtime-tool", { method:"POST", body })`.
  2. Observe response.
- **Expected:** 200 with `{ messages: [...] }` (or empty array); EXTERNAL-SAFE; no writes.
  If Gmail credentials absent → graceful error.
- **Env/service deps:** admin session; Gmail OAuth (agent credentials).
- **Triage:** graceful "not authenticated" → **DEV-CONFIG**. Route crash → PROD-BUG.

### OPT-036-edge — `read_gmail_message` for a known message id
- **Inputs:** `{ "tool": "read_gmail_message", "args": { "messageId": "FAKE_ID_OPTTEST" } }`.
- **Expected:** if credentials absent → graceful error. If wired → 404 for unknown id.
- **Triage:** crash → PROD-BUG.

---

## OPT-037 — Approval queue collection · READ

### OPT-037-happy — Approval queue collection renders in admin
- **Entry point:** `/admin/collections/agent-approval-queue` (admin browser).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `Collections → Agent Approval Queue`.
  3. Confirm the list view loads with columns: type, status, risk, createdAt.
- **Expected:** 200; list of approval rows (or empty if none queued); row created in
  OPT-028 is visible with `status: pending`.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## OPT-038 — Approvals list page · READ

### OPT-038-happy — Approvals page renders pending items
- **Entry point:** `GET http://localhost:3004/agent-approvals` (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `http://localhost:3004/agent-approvals`.
  3. Confirm list renders pending approval rows (from OPT-028/029/030 etc.).
- **Expected:** page renders; each row shows type, risk level, created timestamp,
  and a link to the detail page.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG. Empty list when pending rows exist → PROD-BUG.

### OPT-038-edge — Unauthenticated access redirects to login
- **Expected:** redirect to admin login or 401.
- **Triage:** page renders without auth → PROD-BUG (security).

---

## OPT-039 — Approval detail page · READ

### OPT-039-happy — Detail page renders payload diff and decision buttons
- **Entry point:** `GET http://localhost:3004/agent-approvals/<id>` where `<id>` is
  the approval row created in OPT-028.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the approval detail page for the OPT-028 row.
  3. Confirm payload diff and Approve / Reject buttons render.
- **Expected:** page renders with:
  - Proposal type and description.
  - Payload diff showing the proposed change.
  - `Approve` and `Reject` buttons.
  - No `Apply` button visible (or Apply disabled until Approved).
  - `status: pending` displayed.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG. Missing decision buttons → PROD-BUG.

---

## OPT-040 — Approve approval API · CMS-WRITE

### OPT-040-happy — Approve marks row as `approved` and sends notification (harness-blocked)
- **Entry point:** `POST /api/agent-approvals/<id>/approve` (admin session) using
  the OPT-028 approval row.
- **Steps:**
  1. `authedFetch("/api/agent-approvals/<id>/approve", { method:"POST" })`.
  2. `GET /api/agent-approvals/<id>` to verify `status`.
- **Expected:**
  - Response 200.
  - `status` changes from `pending` to `approved`.
  - A notification email is attempted — **harness-blocks** the actual send (expected; not a failure).
  - The underlying Google Ads change is **not applied** (apply is a separate OPT-042 step).
- **Env/service deps:** admin session; local DB; email (Brevo — harness-blocked).
- **Triage:** status not updated → PROD-BUG. Email send not harness-blocked → PROD-BUG (harness failure).
  Log row id to teardown manifest (reset to pending or delete after test).

### OPT-040-edge — Approving an already-applied row returns an error
- **Inputs:** attempt to approve a row that is already `applied`.
- **Expected:** 400/409 "already applied" error; status unchanged.
- **Triage:** silent double-approval → PROD-BUG.

---

## OPT-041 — Reject approval API · CMS-WRITE

### OPT-041-happy — Reject marks row as `rejected` and notifies (harness-blocked)
- **Entry point:** `POST /api/agent-approvals/<id>/reject` (admin session).
- **Inputs:** use a fresh `pending` approval row (create one via OPT-028 if needed).
- **Steps:**
  1. `authedFetch("/api/agent-approvals/<id>/reject", { method:"POST",
     body: JSON.stringify({ reason:"Test rejection" }) })`.
  2. `GET /api/agent-approvals/<id>` to verify `status`.
- **Expected:**
  - 200; `status` = `rejected`; `rejectionReason` = `"Test rejection"`.
  - Notification attempted and harness-blocked.
  - No live Ads change.
- **Env/service deps:** admin session; local DB; email (harness-blocked).
- **Triage:** status not updated → PROD-BUG.

### OPT-041-edge — Reject without a reason still succeeds (or requires one)
- **Inputs:** POST with empty body `{}`.
- **Expected:** either 200 with `rejectionReason: null` (optional field) or 400 if
  reason is required.
- **Triage:** crash → PROD-BUG.

---

## OPT-042 — Apply approval API (the live push) · DANGER

> **⚠️ DANGER — STAGE ONLY.** The apply endpoint dispatches live changes to
> Google Ads / Google Sheets. This scenario tests **only** that the endpoint is
> correctly harness-blocked in the test environment. It must **never** be called
> against a real approval row in a test run without `--allow-live-push` (which
> is reserved for the single opt-in green-tier campaign only).

### OPT-042-happy — Apply is harness-blocked for a non-whitelisted approval
- **Entry point:** `POST /api/agent-approvals/<id>/apply` (admin session).
- **Inputs:** use a `pending` or `approved` approval row from OPT-028 (budget change
  for `659-101-3898` campaign).
- **Steps:**
  1. Confirm the test harness is active (check `HARNESS_MODE=true` env or equivalent).
  2. `authedFetch("/api/agent-approvals/<id>/apply", { method:"POST" })`.
  3. Assert the response and the row status.
- **Expected:**
  - The harness **intercepts** the apply call and returns an error or mock response
    indicating the live push was blocked.
  - `status` on the approval row does **not** change to `applied`.
  - No actual Google Ads API call is made (verify via Growth Tools logs or absence
    of a `mutate` event).
- **Env/service deps:** admin session; Growth Tools → Google Ads (**must be
  harness-blocked**); local DB.
- **Triage:** apply goes through and row becomes `applied` → **STOP** — escalate
  immediately; do not continue testing. If harness block is working → pass.

### OPT-042-edge — Apply on a `rejected` row returns 409/400
- **Inputs:** call apply on a row with `status: rejected`.
- **Expected:** 409/400 "cannot apply a rejected approval"; no live dispatch.
- **Triage:** apply proceeds on a rejected row → PROD-BUG.

---

## OPT-043 — Agent memory collection · READ

### OPT-043-happy — Memory collection list and review panel render
- **Entry point:** `/admin/collections/agent-memory` (admin browser); also
  `src/components/agent/MemoryReviewPanel.tsx`.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `Collections → Agent Memory`.
  3. Confirm list renders with memory entries (including one from OPT-025 if run).
  4. Open a record; confirm content and status fields display.
- **Expected:** list renders; record opens without crash; `MemoryReviewPanel` shows
  content, timestamp, status.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## OPT-044 — Memory review summary API · READ

### OPT-044-happy — Returns count of memories pending review
- **Entry point:** `GET /api/agent/memory-review-summary` (admin session).
- **Steps:** `authedFetch("/api/agent/memory-review-summary")`.
- **Expected:** 200 `{ total: N, pendingReview: M }` (or similar shape); numeric
  values; `pendingReview` ≥ 0.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

### OPT-044-edge — Unauthenticated request blocked
- **Expected:** 401.
- **Triage:** 200 without session → PROD-BUG.

---

## OPT-045 — Memory token usage API · READ

### OPT-045-happy — Returns token usage metrics for the memory store
- **Entry point:** `GET /api/agent/memory-token-usage` (admin session).
- **Steps:** `authedFetch("/api/agent/memory-token-usage")`.
- **Expected:** 200 with fields like `{ totalTokens: N, memoryCount: M, estimatedCost: ... }`;
  numeric values.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

---

## OPT-046 — Agent soul collection · READ

### OPT-046-happy — Soul global/collection record renders and is readable
- **Entry point:** `/admin/collections/agent-soul` or Globals → Agent Soul
  (admin browser).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the Agent Soul collection/global.
  3. Confirm the record renders with persona fields (name, tone, instructions).
- **Expected:** record renders without crash; field values from the default or
  OPT-026 set soul visible.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## OPT-047 — Agent credentials collection · READ

### OPT-047-happy — Credentials collection renders (no secrets exposed)
- **Entry point:** `/admin/collections/agent-credentials` (admin browser).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `Collections → Agent Credentials`.
  3. Open a record (if any).
- **Expected:** list and record views render; sensitive token fields are masked
  or redacted in the UI (not shown in plain text). No auth attempt made by the UI.
- **Env/service deps:** admin session; local DB.
- **Triage:** raw token string visible in UI → PROD-BUG (security). Render crash → PROD-BUG.

---

## OPT-048 — Agent auth flow · CMS-WRITE

### OPT-048-happy — Auth status endpoint returns current state
- **Entry point:** `GET /api/agent-auth/status` (admin session).
- **Steps:** `authedFetch("/api/agent-auth/status")`.
- **Expected:** 200 `{ authenticated: bool, email: "..." | null, scopes: [...] }`;
  reflects current OAuth state of the agent credentials.
- **Env/service deps:** admin session; Google OAuth (`GOOGLE_CLIENT_ID`/`SECRET` — wired);
  Vercel Blob (token storage — wired).
- **Triage:** 500 → PROD-BUG. Missing `authenticated` field → PROD-BUG.

### OPT-048-edge — Begin auth returns OAuth redirect URL
- **Entry point:** `POST /api/agent-auth/begin` (admin session).
- **Inputs:** `{}` (no body needed).
- **Expected:** 200 `{ url: "https://accounts.google.com/..." }` — a valid Google
  OAuth URL. Do **not** follow the redirect in the test (it requires browser interaction).
- **Env/service deps:** admin session; Google OAuth (`GOOGLE_CLIENT_ID` — wired).
- **Triage:** 500 or missing URL → PROD-BUG.

---

## OPT-049 — Chat turns collection · READ

### OPT-049-happy — Chat turns collection lists persisted turns
- **Entry point:** `/admin/collections/optimate-chat-turns` (admin browser).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `Collections → OptiMate Chat Turns`.
  3. Confirm the list renders; if OPT-025 or OPT-027 created turns they are visible.
- **Expected:** list renders without crash; columns include `role`, `content` (truncated),
  `threadId`, `createdAt`.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## OPT-050 — Scheduled agent tasks collection · READ

### OPT-050-happy — Scheduled agent tasks collection renders
- **Entry point:** `/admin/collections/scheduled-agent-tasks` (admin browser).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `Collections → Scheduled Agent Tasks`.
  3. Confirm list renders (may be empty if OPT-032 approval not yet applied).
- **Expected:** list renders without crash; if tasks exist, columns show `type`,
  `schedule`, `status`, `lastRun`, `clientId`.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## OPT-051 — Scheduled tasks tick API · EXTERNAL-SAFE

### OPT-051-happy — Tick with valid `CRON_SECRET` processes due tasks
- **Entry point:** `GET /api/scheduled-tasks/tick` with `Authorization: Bearer <CRON_SECRET>`.
- **Inputs:** `CRON_SECRET` from env; no request body.
- **Steps:**
  1. `fetch("http://localhost:3004/api/scheduled-tasks/tick", {
       headers: { "Authorization": `Bearer ${process.env.CRON_SECRET}` }
     })`.
  2. Observe response.
- **Expected:**
  - 200 with `{ processed: N, skipped: M, errors: [] }` (or similar).
  - Any due tasks are executed. If tasks call Gmail draft → **draft created only**
    (EXTERNAL-SAFE). Any email send attempt is harness-blocked (not a failure).
  - If no tasks are due → `{ processed: 0 }`.
- **Env/service deps:** `CRON_SECRET`; Gmail OAuth (agent); local DB.
- **Triage:** `processed > 0` with Gmail drafts visible → pass. Email send not blocked → PROD-BUG.

### OPT-051-edge — Tick without `CRON_SECRET` returns 401
- **Entry point:** `GET /api/scheduled-tasks/tick` with no auth header.
- **Expected:** 401 Unauthorized.
- **Triage:** 200 without secret → PROD-BUG (security).

---

## OPT-052 — OptiMate settings global · READ

### OPT-052-happy — Settings global renders and is editable
- **Entry point:** Globals → OptiMate Settings in the admin browser.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `Globals → OptiMate Settings`.
  3. Confirm fields render (default model, behaviour flags).
  4. Edit one field (e.g. toggle a behaviour flag); save.
  5. Reload and confirm the value persisted.
- **Expected:** global record renders; edit + save succeeds; value reflected on reload.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG. Edit does not persist → PROD-BUG. Revert the
  test change after; log to teardown manifest.

### OPT-052-edge — Validate via API that `default-model` endpoint reflects settings
- **Steps:** read `GET /api/optimate/default-model` before and after changing the
  model field in the global.
- **Expected:** after saving the global with a new model name, `default-model` API
  returns the new value.
- **Triage:** API returns stale/wrong model → PROD-BUG.

---

## OPT-053 — Agent run detail page · READ

### OPT-053-happy — Agent run detail page renders a run's steps
- **Entry point:** `GET http://localhost:3004/agent-runs/<runId>` (admin session).
- **Inputs:** `<runId>` from an existing `GoalRun` record (or from a run created
  during other scenarios). If none exist, check `GET /api/collections/goal-runs`
  for any record.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `http://localhost:3004/agent-runs/<runId>` for a known run.
  3. Confirm the page renders steps, tool calls, and snapshots.
- **Expected:** page renders without crash; shows the run's steps in chronological
  order with tool name, input args (truncated), and output; status badge visible.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG. 404 for a valid run id → PROD-BUG.

### OPT-053-edge — Unknown run id returns 404
- **Entry point:** `GET /agent-runs/nonexistent-run-id-zz`.
- **Expected:** 404 page rendered; no crash.
- **Triage:** 500 on invalid id → PROD-BUG.

---

# Phase 5 Data-Validation Scenarios (`OPT-V` series)

The **depth set** the swarm plan calls for: 16 end-to-end OptiMate conversations that
capture the **exact prompt**, the **tools the agent should call**, and the **numeric
answer** the agent returns — so a validation worker can compare each number against
ground truth (Phase 5). Unlike the per-FEAT-ID rows above (which check wiring/render),
these drive real reasoning over the **whitelisted live read account `659-101-3898`**
(= ZZ Test Client, Ads customer id `6591013898`) and feed the OptiMate real-data
validation track.

### How to run an `OPT-V` scenario
1. `loginAdmin()`; open OptiMate chat (typed) with **context = `zz-test-client`**
   unless the scenario says portfolio/voice.
2. Send the **exact prompt** verbatim. Use the **fixed date range** stated
   (`MONTH = 2026-05`, the most recent fully-closed calendar month at authoring time;
   substitute the same closed month consistently across a run so ground truth matches).
3. Capture three things into the result record:
   - **`toolCalls`** — every tool the agent invoked with its resolved args.
   - **`numericAnswer`** — the spend/clicks/CTR/etc. numbers in the agent's reply
     (typed text, or the transcribed spoken reply for voice).
   - **`groundTruth`** — call the wrapped Growth Tools endpoint directly for the same
     account + range, recompute derived metrics the same way the tool does, and store it.
4. **Assert** the agent's numbers match ground truth within tolerance: **exact** for raw
   counts and spend; **±0.1 pp** for rounded rates (CTR, conv-rate, IS); **±$0.01** for
   rounded CPA/CPC. Record any mismatch as a **validation failure** with both numbers and
   the date range so a data bug is distinguishable from an agent-reasoning bug.

> The `numericAnswer` / `groundTruth` fields below are **templates to fill at run time**
> (live numbers are not known at authoring). Each scenario states the exact ground-truth
> endpoint + recompute formula so the value is reproducible.

---

## OPT-V-01 — Account overview · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Give me the account overview for 659-101-3898 for May 2026 — spend, impressions, clicks, conversions, CTR and CPA."`
- **Tools the agent should call:** `get_account_overview` with `{ customerId:"659-101-3898", dateRange:"2026-05" }` (or resolved start/end `2026-05-01`…`2026-05-31`).
- **Numeric answer to record:** `{ cost, impressions, clicks, conversions, ctr, cpa }`.
- **Ground truth (Phase 5):** `GET {GROWTH_TOOLS_URL}/api/google-ads/campaign-budgets/get-metrics?customerId=6591013898&start=2026-05-01&end=2026-05-31` (account scope). Recompute `ctr = clicks/impressions`, `cpa = cost/conversions`.
- **Tolerance:** cost/impr/clicks/conv exact; CTR ±0.1 pp; CPA ±$0.01.
- **Side-effect class:** EXTERNAL-SAFE (pure read).
- **Env/service deps:** admin session; **Growth Tools** (live); Kimi/Moonshot (wired).
- **Triage:** agent number ≠ ground truth → validation failure (PROD-BUG candidate). Growth Tools 5xx → UNKNOWN. Agent never calls the tool but answers anyway → PROD-BUG (hallucinated metric).

---

## OPT-V-02 — Per-campaign performance · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Break down performance by campaign for 659-101-3898 in May 2026. For each campaign give spend, clicks, conversions and CPA, and tell me which campaign spent the most."`
- **Tools the agent should call:** `get_campaign_performance` with `{ customerId:"659-101-3898", dateRange:"2026-05" }`.
- **Numeric answer to record:** per-campaign `{ name, cost, clicks, conversions, cpa }` + the named highest-spend campaign.
- **Ground truth (Phase 5):** same `get-metrics` endpoint with campaign-level segmentation. Sort by `cost` desc; the top row is the expected "spent the most" answer. Recompute per-row `cpa = cost/conversions`.
- **Tolerance:** raw values exact; CPA ±$0.01; highest-spend campaign name must match exactly.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot.
- **Triage:** wrong top-spender or per-row mismatch → validation failure. Empty campaign list → UNKNOWN (account may genuinely have none in range).

---

## OPT-V-03 — Search-term waste hunting · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Find wasted spend in 659-101-3898 for May 2026: search terms with at least 50 impressions that cost money but produced zero conversions. List the top 10 by cost and give me the total wasted spend."`
- **Tools the agent should call:** `get_search_terms` with `{ customerId:"659-101-3898", dateRange:"2026-05", minImpressions:50 }` (agent filters zero-conversion rows and sums their cost).
- **Numeric answer to record:** `{ totalWastedSpend, top10:[{ term, cost, impressions, conversions:0 }] }`.
- **Ground truth (Phase 5):** `GET {GROWTH_TOOLS_URL}/api/google-ads/search-terms?customerId=6591013898&start=2026-05-01&end=2026-05-31&minImpressions=50`. Filter `conversions === 0 && cost > 0`; `totalWastedSpend = Σ cost`; top 10 by `cost` desc. This validates the **zero-conversion waste aggregation** transformation specifically.
- **Tolerance:** `totalWastedSpend` ±$0.01; the top-10 term set must match (order ties broken by cost).
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot.
- **Triage:** sum or membership mismatch → validation failure. Agent includes converting terms in "waste" → PROD-BUG (bad aggregation).

---

## OPT-V-04 — Weekly metric table · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Show me a weekly metric table for 659-101-3898 covering the last 8 weeks — spend, clicks, conversions and CPA per week, Monday-anchored."`
- **Tools the agent should call:** `get_weekly_metric_table` with `{ customerId:"659-101-3898", weeks:8 }`.
- **Numeric answer to record:** array of 8 rows `{ weekStart (a Monday), cost, clicks, conversions, cpa }`.
- **Ground truth (Phase 5):** call `get-metrics` per week with `start`=each Monday, `end`=that Sunday for the trailing 8 ISO weeks; recompute `cpa` per week. This validates **weekly Monday-anchored bucketing** specifically — assert every `weekStart` is a Monday and buckets don't overlap or gap.
- **Tolerance:** per-cell raw values exact; CPA ±$0.01; week boundaries must be Monday→Sunday.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot.
- **Triage:** non-Monday anchors or overlapping weeks → PROD-BUG (bucketing). Per-cell mismatch → validation failure.

---

## OPT-V-05 — Budget recap email generation · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Generate the monthly budget management recap email for ZZ Test Client (audit-scoped, account 659-101-3898) for May 2026. Include last-month spend vs budget and pacing."`
- **Tools the agent should call:** `get_budget_management_email` with the resolved `auditId` for ZZ Test Client (the tool internally reads `/api/google-ads-budgets/{auditId}/list` for live campaigns + MTD spend and `/api/google-ads-audits/{auditId}/last-month-recap` for last-month metrics).
- **Numeric answer to record:** `{ lastMonthSpend, monthlyBudget, pacingPct, projectedSpend }` as stated in the generated email body.
- **Ground truth (Phase 5):** independently call `GET /api/google-ads-budgets/{auditId}/list` and `POST /api/google-ads-audits/{auditId}/last-month-recap`; recompute `pacingPct = MTDspend / (monthlyBudget × elapsedDayFraction)`.
- **Tolerance:** spend/budget exact; pacing ±0.1 pp.
- **Side-effect class:** EXTERNAL-SAFE — **generation only; the email is NOT sent.** Any send path (GAD-021) is DANGER and harness-blocked.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot. Requires an existing Google Ads audit record for ZZ Test Client.
- **Triage:** numbers in email ≠ ground truth → validation failure. Any actual email send → **STOP/escalate** (DANGER bypassed).

---

## OPT-V-06 — Branded / non-brand GSC split · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Split this client's Search Console traffic into brand vs non-brand for the last 30 days. Give clicks, impressions, CTR and average position for each side, plus the top 10 non-brand queries."`
- **Tools the agent should call:** `get_gsc_branded_split` with `{ dateRange:"LAST_30_DAYS" }` (uses the client's saved `brandKeywords`).
- **Numeric answer to record:** `{ brand:{clicks,impressions,ctr,position}, nonBrand:{clicks,impressions,ctr,position}, topNonBrand:[…10] }`.
- **Ground truth (Phase 5):** query the same GSC analytics window via `gsc-service` `fetchBrandedAnalytics` with the same `brandTerms`; recompute `ctr = clicks/impressions` per side. Validates the **brand/non-brand split via `brandTerms`** transformation.
- **Tolerance:** clicks/impr exact; CTR ±0.1 pp; position ±0.1.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; **GSC OAuth + saved `brandKeywords`**. ⚠️ `zz-test-client` has **no GSC tokens / no brand keywords** in dev → tool returns `"Client has no brandKeywords set"` or a not-connected error. **Classify as DEV-CONFIG**; run the real validation only against a GSC-connected account.
- **Triage:** clean "not connected"/"no brand keywords" → **DEV-CONFIG**. Numbers returned but split wrong vs ground truth → PROD-BUG. Agent fabricates a split with no GSC connection → PROD-BUG (hallucination).

---

## OPT-V-07 — GA4 overview · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Give me the GA4 overview for this client for the last 30 days — sessions, users, engaged sessions, conversions and engagement rate."`
- **Tools the agent should call:** `get_ga4_overview` with `{ dateRange:"LAST_30_DAYS" }`.
- **Numeric answer to record:** `{ sessions, users, engagedSessions, conversions, engagementRate }`.
- **Ground truth (Phase 5):** call the wrapped GA4 endpoint for the same property + range; recompute `engagementRate = engagedSessions / sessions`.
- **Tolerance:** raw counts exact; engagement rate ±0.1 pp.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; **GA4 connection**. ⚠️ `zz-test-client` has **no GA4 tokens** in dev → "not connected". **DEV-CONFIG**; validate against a GA4-connected account.
- **Triage:** clean "not connected" → **DEV-CONFIG**. Numbers wrong vs ground truth → validation failure. Fabricated GA4 numbers with no connection → PROD-BUG.

---

## OPT-V-08 — AI-visibility · EXTERNAL-SAFE

- **Prompt (verbatim):** `"What's this client's AI visibility right now? Give me the latest snapshot — presence/mention rate and which AI engines they appear in."`
- **Tools the agent should call:** `get_ai_visibility` with `{ limit:1 }` (latest snapshot).
- **Numeric answer to record:** `{ snapshotDate, presenceRate (or mentionRate), perEngine:[{engine, score}] }`.
- **Ground truth (Phase 5):** read the latest AI-visibility snapshot row for the client from its collection / wrapped endpoint; compare the rate and per-engine scores verbatim.
- **Tolerance:** stored values exact (these are persisted snapshots, not recomputed).
- **Side-effect class:** EXTERNAL-SAFE / READ.
- **Env/service deps:** admin session; AI-visibility snapshots present for the client. If none exist for `zz-test-client` → agent should say "no snapshots" → **DEV-CONFIG**.
- **Triage:** agent invents a score with no snapshot → PROD-BUG. Mismatch vs stored snapshot → validation failure.

---

## OPT-V-09 — Client-detail recall · READ

- **Prompt (verbatim):** `"Remind me of the key details for this client — name, website, Google Ads customer id, status and the services we run for them."`
- **Tools the agent should call:** `get_client_details` or `get_selected_client_details` (local DB; no external call).
- **Numeric answer to record:** identity payload — expected `name: "ZZ Test Client"`, `customerId: "6591013898"`, `status: "active"`, plus the services array (count = N).
- **Ground truth (Phase 5):** `GET /api/clients/list` (or the client record directly) for `zz-test-client`; field-by-field match.
- **Tolerance:** exact string/array match on all fields.
- **Side-effect class:** READ.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** wrong client or wrong customer id surfaced → PROD-BUG. Tool not called but answer correct → soft-pass with note (may be from system context).

---

## OPT-V-10 — Memory remember → recall round-trip · CMS-WRITE

- **Prompt 1 (store, verbatim):** `"Remember that ZZ Test Client's monthly Google Ads budget target is $5,000 and their target CPA is $42."`
- **Prompt 2 (recall, verbatim, new turn):** `"What's ZZ Test Client's budget target and target CPA?"`
- **Tools the agent should call:** turn 1 → `remember`; turn 2 → `memory_search`.
- **Numeric answer to record:** recalled `{ budgetTarget: 5000, targetCpa: 42 }`.
- **Ground truth (Phase 5):** after turn 1, assert an `AgentMemory` row exists containing both numbers; after turn 2, assert the agent's recalled numbers equal the stored note **exactly** (`5000` and `42`).
- **Tolerance:** exact — no drift/rounding allowed on recalled stored numbers.
- **Side-effect class:** CMS-WRITE (writes one memory row — log id to teardown manifest).
- **Env/service deps:** admin session; local DB (`AgentMemory`); Kimi/Moonshot.
- **Triage:** number changes between store and recall → PROD-BUG (memory corruption). No row written → PROD-BUG. Agent fabricates a different figure → PROD-BUG (hallucinated recall).

---

## OPT-V-11 — Propose flow stops at the approval queue (reviewed, never applied) · CMS-WRITE

- **Prompt (verbatim):** `"Based on May 2026 performance, the budget on the top-spend campaign in 659-101-3898 looks too high. Propose lowering its daily budget to $40."`
- **Tools the agent should call:** a read (`get_campaign_performance`) to identify the campaign, then `propose_budget_update` with `{ customerId:"659-101-3898", campaignName:<top>, newDailyBudget:40 }`.
- **Numeric answer to record:** the queued `payload.newDailyBudget` (= `40`) and the identified campaign name.
- **Ground truth (Phase 5):** `GET /api/agent-approvals` → find the new row; assert `status === "pending"`, `payload.newDailyBudget === 40`, and that **no `applied` timestamp / apply result exists**. Independently confirm via Growth Tools that the **live campaign budget is unchanged**.
- **Tolerance:** exact on queued value.
- **Side-effect class:** CMS-WRITE — queues an approval only. **The live push (OPT-042 apply) is NOT invoked.**
- **Env/service deps:** admin session; local DB; Growth Tools (for the read + the unchanged-budget check); Kimi/Moonshot.
- **Triage:** row `status: applied` or live budget changed → **STOP/escalate** (DANGER bypassed). No pending row created → PROD-BUG. Log new row id to teardown manifest.

---

## OPT-V-12 — `request_confirm` gate · READ

- **Prompt 1 (verbatim):** `"I want to add three negative keywords to 659-101-3898, but always ask me to confirm before you queue anything."`
- **Prompt 2 (verbatim):** `"Add 'free', 'cheap' and 'jobs' as broad negatives to the top campaign."`
- **Tools the agent should call:** `request_confirm` first (gate), then **only after an explicit "yes"** → `propose_negative_keywords`.
- **Numeric answer to record:** count of negatives staged after confirm (= `3`); and the gate state before confirm (no proposal row yet).
- **Ground truth (Phase 5):** before clicking Yes, `GET /api/agent-approvals` shows **no new row**; after Yes, exactly **one** new `pending` row with `payload.keywords.length === 3`. Run the negative-path twin: decline → assert **zero** new rows.
- **Tolerance:** exact counts (0 before/while gated; 1 row, 3 keywords after yes; 0 on decline).
- **Side-effect class:** READ (gate) → CMS-WRITE only on confirm.
- **Env/service deps:** admin session; local DB; Kimi/Moonshot.
- **Triage:** proposal queued **before** confirmation, or queued **after a decline** → PROD-BUG (safety-gate bypass). Gate never appears → PROD-BUG.

---

## OPT-V-13 — Portfolio cross-account question · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Across all managed Google Ads accounts, which account spent the most in May 2026, and what was total portfolio spend and total conversions for the month?"`
- **Tools the agent should call:** `get_portfolio_account_inventory` (resolve accounts) then `get_portfolio_performance_summary` (or `get_portfolio_monthly_performance_breakdown`) for `2026-05`.
- **Numeric answer to record:** `{ topAccount:{customerId,name,cost}, portfolioTotalSpend, portfolioTotalConversions }`.
- **Ground truth (Phase 5):** for each account in the inventory, call `GET /api/google-ads/campaign-budgets/get-metrics?...&start=2026-05-01&end=2026-05-31`; `portfolioTotalSpend = Σ cost`, `portfolioTotalConversions = Σ conversions`; top account = max `cost`. Validates **cross-account aggregation**.
- **Tolerance:** totals exact; top account customerId must match.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot. Entry via portfolio chat `POST /api/optimate/google-ads-portfolio/chat`.
- **Triage:** wrong top account or off totals → validation failure. Inventory missing the whitelisted account → PROD-BUG.

---

## OPT-V-14 — Voice-vs-typed parity · EXTERNAL-SAFE

- **Typed prompt (verbatim):** `"What was total spend and CPA for 659-101-3898 in May 2026?"` — via typed OptiMate chat.
- **Voice prompt (verbatim, spoken):** same sentence spoken into `OptiMateVoice` (realtime session), executing tools through `POST /api/optimate/realtime-tool`.
- **Tools the agent should call (both paths):** `get_account_overview` with `{ customerId:"659-101-3898", dateRange:"2026-05" }`.
- **Numeric answer to record:** `{ typed:{cost,cpa}, voice:{cost,cpa} }` (transcribe the spoken reply for the voice figure).
- **Ground truth (Phase 5):** the OPT-V-01 ground-truth `get-metrics` call. Assert **both** typed and voice numbers match ground truth **and each other** (different models share tools but reason separately).
- **Tolerance:** cost exact; CPA ±$0.01; typed vs voice must agree within the same tolerance.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); **OpenAI Realtime** for voice (`OPENAI_API_KEY` — **absent in dev**). If voice session can't mint → run typed path, mark voice leg **DEV-CONFIG**, don't fail the scenario.
- **Triage:** typed ≠ voice (both available) → PROD-BUG (path divergence). Either ≠ ground truth → validation failure. Voice session 401 (no OpenAI key) → **DEV-CONFIG** for the voice leg only.

---

## OPT-V-15 — Portfolio search-term wastage · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Across the whole portfolio, where are we wasting the most money on zero-conversion search terms in May 2026? Give the total wasted spend and the worst 5 accounts."`
- **Tools the agent should call:** `get_portfolio_search_term_wastage` for `2026-05` (per-account, min-impression filtered, zero-conversion).
- **Numeric answer to record:** `{ portfolioWastedSpend, worst5:[{customerId, wastedSpend}] }`.
- **Ground truth (Phase 5):** per account call `GET /api/google-ads/search-terms?...&start=2026-05-01&end=2026-05-31`; filter `conversions===0 && cost>0`; sum per account; `portfolioWastedSpend = Σ`; worst 5 by per-account waste. Validates **cross-account zero-conversion aggregation**.
- **Tolerance:** totals ±$0.01; worst-5 account set must match.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot.
- **Triage:** sum or membership mismatch → validation failure. Includes converting terms → PROD-BUG.

---

## OPT-V-16 — Weekly trend note (date-range resolution) · EXTERNAL-SAFE

- **Prompt (verbatim):** `"Give me a short trend note on 659-101-3898: how did last week compare to the week before on spend, conversions and CPA?"`
- **Tools the agent should call:** `get_weekly_trend_note` (resolves "last week" vs "prior week" as Monday-anchored ISO weeks) for `659-101-3898`.
- **Numeric answer to record:** `{ lastWeek:{cost,conversions,cpa}, priorWeek:{cost,conversions,cpa}, deltas:{costPct, convPct, cpaPct} }`.
- **Ground truth (Phase 5):** call `get-metrics` for the two trailing complete ISO weeks (Mon→Sun); recompute each `cpa` and the percentage deltas. Validates **date-range resolution + Monday-anchored bucketing** for relative phrasing.
- **Tolerance:** raw values exact; CPA ±$0.01; delta percentages ±0.1 pp.
- **Side-effect class:** EXTERNAL-SAFE.
- **Env/service deps:** admin session; Growth Tools (live); Kimi/Moonshot.
- **Triage:** wrong week boundaries / mis-resolved "last week" → PROD-BUG (date resolution). Number mismatch → validation failure.
