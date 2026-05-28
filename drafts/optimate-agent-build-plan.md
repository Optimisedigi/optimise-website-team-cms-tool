# The Optimate Agent Build Plan

> **Status: planning document only — no code has been built.**
> Nothing in `src/lib/agents/` exists yet (the directory itself is not yet created). This file is the specification a developer (or coding agent) reads *before* writing any agent code. When implementation begins, build steps follow the order in `## Recommended Build Order (Working Backwards)` below. The existing `OptiMate` Google Ads chat in `src/components/GoogleAdsChat.tsx` and `website-growth-tools/server/routes.ts` is **separate, pre-existing infrastructure** and is documented under `## Pre-Build Inventory: What Already Exists` purely so the migration path is clear; it is not part of the new agent fleet until explicitly migrated per Phase 3.

A working-backwards roadmap for building the Optimate AI agent fleet on top of the Content CMS platform.

This document maps out:

1. The agent fleet and naming
2. What each agent does
3. What CLI/API connections are needed (user-connected vs. agency-level)
4. What templates need to exist
5. What collections need to exist
6. What you (the user) need to set up
7. The recommended build order, working backwards from agent capability
8. The architecture we're borrowing from gg-coder (multi-provider LLM routing, agent loop, tool definitions, prompt caching)

---

## The Optimate Fleet (Locked)

| # | Agent Name | File / Code Name | Domain |
|---|---|---|---|
| 1 | Optimate-Proposal | `optimate-proposal` | New business, proposals now, prospecting later |
| 2 | Optimate-Accounting | `optimate-accounting` | Finance ops, invoicing, expense reconciliation |
| 3 | Optimate-Google-Ads | `optimate-google-ads` | Google Ads optimisation |
| 4 | Optimate-Legal | `optimate-legal` | Contracts and legal docs |
| 5 | Optimate-Meta-Ads | `optimate-meta-ads` | Meta Ads optimisation |

Five specialists. One brand. Each excellent at one job.

---

## Core Principle: User-Connected vs. Agency-Level

A connection is **user-connected** when each client must grant access to their own private data (GSC, their Google Ads account, their Meta ad account).

A connection is **agency-level** when you, as the agency owner, set it up once and all clients flow through it (your MCC, your Business Manager, your Postmark, your Anthropic API).

Keep onboarding for new clients minimal. They only connect their own private accounts. Everything else is plumbed in once, by you.

---

## 1. Optimate-Proposal

### What it does

Lead comes in, runs full audit pipeline, curates findings, drafts on-brand proposal email, generates PIN-protected proposal page, drops in approval queue.

Phase 2 (later): also handles prospecting, finding new leads matching a profile.

### Connections needed

**User-connected (per client):**

- Google Search Console (OAuth), client connects their own GSC so the agent can pull real ranking data. Required because GSC data is private and OAuth is the only legitimate way in.
- Google Ads (MCC link grant), optional, only if the proposal includes a Google Ads audit. Required because ad account access needs explicit grant from the client.

**Agency-level (you set up once):**

- Growth Tools API (already integrated)
- Scrapling service (already integrated)
- PageSpeed Insights API (already integrated)
- Vercel Blob (already integrated)
- Postmark (already integrated)
- Anthropic API (needs adding)

### Templates needed

- ✅ Proposal page template (already built)
- ✅ Audit report template (already built)
- 🟡 Proposal email template, needs polishing in your house tone
- 🟡 Curated findings template, structured way to render selected insights

### Collections needed

- ✅ All exist (`clients`, `client-proposals`, audit collections)
- 🔴 New: `agent-approval-queue` (shared across all agents)

---

## 2. Optimate-Accounting

### What it does

Categorises expenses, reconciles invoices, flags anomalies, prepares financial summaries, tracks client billing health.

### Connections needed

**User-connected (you, the agency owner):**

- Xero / QuickBooks / MYOB (pick one, Xero recommended for AU). OAuth into your accounting software so the agent can read invoices, expenses, payments.
- Stripe / payment processor. OAuth to read incoming payments.

**Agency-level:**

- Existing cost categorisation AI via Growth Tools (already integrated)
- Anthropic API (needs adding)

### Templates needed

- 🔴 Monthly financial summary template (for your own review)
- 🔴 Anomaly alert template (for flagged issues)
- 🔴 Client billing health report (overdue invoices, payment patterns)
- 🔴 Profit and loss snapshot template (quick agency health view)

### Collections needed

- ✅ `business-costs`, `cost-categories`, `cost-rules` (exist)
- 🔴 New: `invoices`, track issued/paid/overdue invoices per client
- 🔴 New: `financial-snapshots`, periodic summaries the agent produces
- 🔴 New: `accounting-anomalies`, flagged issues for your review

---

## 3. Optimate-Google-Ads

### What it does

Weekly campaign analysis, finds wasted spend, proposes negative keywords, surfaces optimisation opportunities, drafts client recommendations.

### Connections needed

**User-connected (per client):**

- Google Ads account, client grants access to your MCC (Manager) account. Required by Google's policy.

**Agency-level:**

- Google Ads API via your MCC (already partially integrated via Growth Tools). One-time agency setup with developer token.
- Anthropic API (needs adding)

### Templates needed

- ✅ Google Ads audit email template (already built, see `google-ads-email-generator.ts`)
- 🟡 Weekly review report template, recurring, simpler than the one-off audit, focused on changes since last week
- 🟡 Negative keyword recommendation template (already partially built via the NLB feature)
- 🔴 Optimisation recommendation template (bid changes, budget shifts)

### Collections needed

- ✅ `google-ads-audits`, `negative-keyword-lists` (exist)
- 🔴 New: `google-ads-weekly-reviews`, stores recurring review snapshots
- 🔴 New: `optimisation-recommendations`, pending agent suggestions awaiting approval

---

## 4. Optimate-Legal

### What it does

Drafts contracts from approved templates by filling in client/scope variables, summarises contract terms, flags unusual variations.

### Connections needed

**User-connected (you, optional, later phase):**

- DocuSign / SignNow / similar, your agency's e-signature account. Phase 2: start by generating contracts as PDFs, add signature workflow later.

**Agency-level:**

- Anthropic API (needs adding)
- PDF generation library (Puppeteer or react-pdf), to render contracts to PDF
- ✅ Vercel Blob, for storing contract PDFs

### Templates needed

- 🔴 Contract templates (written/approved by you or your lawyer with variable slots):
  - Standard SEO retainer
  - Standard Google Ads management
  - Standard Meta Ads management
  - Combined services
  - Project-based (one-off) agreement
- 🔴 Contract summary template (plain-English breakdown for clients)
- 🔴 Contract variation alert template (when agent flags something non-standard)

### Collections needed

- 🔴 New: `contract-templates`, your approved templates with variable definitions
- 🔴 New: `contracts`, actual contracts generated for clients (status: draft / sent / signed / cancelled)
- 🔴 New: `contract-clauses` (optional), reusable clauses for modular templates

**Important guardrail:** Optimate-Legal must never invent legal language. It only fills variables in templates you (or your lawyer) have written and signed off. It does not write new clauses. That is how you avoid liability and keep contracts defensible.

**This is the biggest platform-build prerequisite.** Optimate-Legal cannot do anything until the contract templates collection and at least one approved template exist.

---

## 5. Optimate-Meta-Ads

### What it does

Mirrors Optimate-Google-Ads but for Meta. Weekly campaign analysis, creative fatigue detection, audience performance, attribution issues.

### Connections needed

**User-connected (per client):**

- Meta Business Manager / Ad Account, client grants access to your agency's Business Manager. Required by Meta's policy.

**Agency-level:**

- Meta Marketing API via your agency's Business Manager system user / app (not yet integrated, this is new build work)
- Meta Ad Library API (optional, public, no auth needed) for competitor analysis
- Anthropic API (needs adding)

### Templates needed

- 🔴 Meta Ads audit email template (equivalent to your Google Ads one)
- 🔴 Weekly review report template (same pattern as Google)
- 🔴 Creative fatigue alert template
- 🔴 Audience performance report template

### Collections needed

- 🔴 New: `meta-ads-audits` (mirror of `google-ads-audits`)
- 🔴 New: `meta-ads-weekly-reviews`
- 🔴 New: `optimisation-recommendations` (shared with Google version)

---

## Connections At A Glance

| Connection | Type | Who connects | Used by |
|---|---|---|---|
| Google Search Console | OAuth | Client (per client) | Optimate-Proposal |
| Google Ads | MCC link grant | Client (per client) | Optimate-Proposal, Optimate-Google-Ads |
| Meta Ad Account | Business Manager grant | Client (per client) | Optimate-Meta-Ads |
| Xero / QuickBooks | OAuth | You (once) | Optimate-Accounting |
| Stripe | OAuth | You (once) | Optimate-Accounting |
| DocuSign | OAuth | You (once, later phase) | Optimate-Legal |
| Growth Tools | API key | You (already done) | Optimate-Proposal, Optimate-Google-Ads |
| Scrapling | API key | You (already done) | Optimate-Proposal |
| Postmark | API key | You (already done) | All agents (email delivery) |
| Vercel Blob | API key | You (already done) | All agents (file storage) |
| Anthropic | OAuth (Claude Code client impersonation) + API key fallback | You (one-time browser login + API key as backup) | All agents — primary for Proposal, Google-Ads, Legal |
| Moonshot (Kimi) | API key | You (needs adding) | Primary for Optimate-Accounting; failover for analysis agents |
| MiniMax | API key | You (needs adding) | Primary for Optimate-Meta-Ads; failover across the fleet |
| OpenAI (Whisper API only) | API key | You (needs adding for Phase 1) | Mobile voice button on CMS chat (Phase 1) and Telegram voice notes (Phase 7) — **transcription only, not LLM inference** |
| Telegram Bot API | Bot token | You (Phase 6/7 only) | Channel-agnostic alerts (Phase 6) and Telegram conversational mode (Phase 7) |
| Twilio (SMS, optional) | Account SID + auth token | You (optional, Phase 6+) | SMS channel for channel-agnostic alerts — only if you want SMS as an alert channel |
| Google Ads MCC | One-time agency setup | You (once) | Optimate-Google-Ads |
| Meta Business Manager | One-time agency setup | You (once, new) | Optimate-Meta-Ads |

---

## What You Need To Set Up On Your End

### Immediately (before any agent work)

- [ ] **Anthropic — OAuth path (primary):** Run the OAuth flow once via the admin auth-setup page. The platform impersonates the Claude Code OAuth client, opens a browser to Anthropic's consent page, you log in with the same account that holds your $150/mo Max subscription, the platform stores the access + refresh tokens encrypted in Vercel KV. Subsequent agent calls draw quota from your Max plan rather than billed API.
- [ ] **Anthropic — API key fallback (mandatory):** Create an Anthropic API key at console.anthropic.com, add credit, add to Vercel env as `ANTHROPIC_API_KEY`. **This is not optional.** If Anthropic rotates the Claude Code OAuth client ID (which they can do at any time without notice) the OAuth path stops working overnight; the credential resolver transparently fails over to the API key so agents keep running. You may also exhaust your Max quota on a busy day; same fallback path covers it.
- [ ] Create a Moonshot (Kimi) API key at platform.moonshot.ai, add credit, add to Vercel env as `MOONSHOT_API_KEY`
- [ ] Create a MiniMax API key at minimaxi.com, add credit, add to Vercel env as `MINIMAX_API_KEY`
- [ ] **Create an OpenAI API key for Whisper transcription** at platform.openai.com, add a small credit balance ($5–10 covers months at agency volume), add to Vercel env as `OPENAI_API_KEY`. Used only for the `/api/transcribe` route on mobile CMS chat (Phase 1) and Telegram voice notes (Phase 7); not used for LLM inference.
- [ ] Decide on accounting platform (Xero recommended for AU)
- [ ] Confirm Postmark template designs are finalised for client-facing emails

**Operational risk note (Anthropic OAuth path):** Using OAuth tokens from the Claude Code client to power server-side agents is outside the spirit of Anthropic's Max plan terms (which describe "individual use through Anthropic's apps"). The legal status is grey rather than clearly prohibited, but Anthropic can revoke tokens, rotate the OAuth client ID, or rate-limit suspected agent traffic at any time. The credential layer is built so that any of those events causes a transparent failover to billed API and the fleet keeps running. The cost saving is real (your $150/mo absorbs Proposal/Google-Ads/Legal usage rather than that going to billed API) but it is not guaranteed and should not be load-bearing for the business case. Treat OAuth as opportunistic cost reduction, not infrastructure.

**Cost expectation:** With OAuth working and your Max plan absorbing Anthropic-side traffic, expect $20–70/month in Kimi + MiniMax API spend at modest fleet volume. With OAuth disabled or failing over, expect $50–150/month all-in. Prompt caching reduces both numbers by 3–5x on the system-prompt portion.

### Before Optimate-Proposal

- [ ] Polish the proposal email template in your tone of voice
- [ ] Build the curated findings template
- [ ] Add `agent-approval-queue` collection
- [ ] Add Anthropic key to env

### Before Optimate-Accounting

- [ ] Connect Xero (OAuth setup, app registration)
- [ ] Connect Stripe (OAuth setup)
- [ ] Build financial summary, anomaly, billing health, P&L templates
- [ ] Add `invoices`, `financial-snapshots`, `accounting-anomalies` collections

### Before Optimate-Google-Ads

- [ ] Build Google Ads weekly review report template
- [ ] Build optimisation recommendation template
- [ ] Add `google-ads-weekly-reviews`, `optimisation-recommendations` collections
- [ ] Confirm Google Ads MCC + developer token are set up at agency level

### Before Optimate-Legal

- [ ] Have your lawyer review and sign off on standard contract templates (×5)
- [ ] Add `contract-templates` and `contracts` collections
- [ ] Choose PDF generation approach (Puppeteer vs. react-pdf)
- [ ] (Optional) Set up DocuSign account if doing signature workflow in v1

### Before Optimate-Meta-Ads

- [ ] Set up agency Meta Business Manager (if not already)
- [ ] Register a Meta App for system user access
- [ ] Build Meta Ads templates (audit email, weekly review, creative fatigue, audience performance)
- [ ] Add `meta-ads-audits`, `meta-ads-weekly-reviews` collections

---

## Templates Master List

> **Central location, single source of truth:**
> All UI / page / deck templates live under `src/app/(frontend)/_templates/<slug>/` in the CMS app. The leading underscore is a Next.js convention that keeps the folder out of the route table, so templates never publish as live pages. Each template folder has at minimum: `page.tsx` (or the relevant React/TSX file), any per-template CSS (e.g. `globals.css`), and a `README.md` documenting structure, conventions, and how to clone for a new client instance. Agents that produce client-facing artifacts MUST resolve their template by reading from this directory rather than re-implementing the layout. The registry of available templates is at `src/app/(frontend)/_templates/INDEX.md` and is the canonical list agents should consult before generating output.
>
> Email/copy templates live alongside their generators (e.g. `server/google-ads-email-generator.ts`) until they get migrated into the same `_templates/` tree.

### Already built ✅

- Proposal page (PIN-protected)
- Audit report
- Google Ads audit email
- Client progress update email
- Post-build-optimisation / QBR presentation deck — `(frontend)/_templates/post-build-optimisation-qbr/` (first live instance: `partners/google-ads-audit/team-session-may-2026/`)

### Need finishing 🟡

- Proposal email (your tone of voice)
- Curated findings template

### Need building 🔴

- Monthly financial summary
- Anomaly alert
- Client billing health report
- P&L snapshot
- Google Ads weekly review report
- Optimisation recommendation (bid/budget changes)
- Contract templates (×5: SEO, Google Ads, Meta Ads, combined, project)
- Contract summary
- Contract variation alert
- Meta Ads audit email
- Meta Ads weekly review report
- Creative fatigue alert
- Audience performance report

### Convention for new templates

When adding a new template:

1. Create the folder under `src/app/(frontend)/_templates/<kebab-case-slug>/`.
2. Include `page.tsx` (for page/deck templates) or the relevant generator file, plus a `README.md` describing structure, sections, conventions, and how to clone for a new client instance.
3. Add an entry to `src/app/(frontend)/_templates/INDEX.md` so agents can discover it.
4. Append a row to the "Already built ✅" list above with the slug + path + first live instance.

---

## Recommended Build Order (Working Backwards)

### Phase 0: Foundation (no agents yet)

1. Add `ANTHROPIC_API_KEY`, `MOONSHOT_API_KEY`, `MINIMAX_API_KEY` to Vercel environment variables (these become the API key fallback for all three providers)
2. **Build the auth layer** (`src/lib/agents/_shared/llm/auth/`):
   - Credential types (`types.ts`) — `Credential = ApiKeyCredential | OAuthCredential`
   - Credential store (`store.ts`) — wraps Vercel KV (or a CMS collection) for encrypted credential persistence; per-credential refresh lock
   - Credential resolver (`resolver.ts`) — `resolveCredential(provider) → { authHeader, source }`, OAuth-first when available, transparent fallback to env-var API key on OAuth failure
   - PKCE helper (`pkce.ts`) — `generateChallenge()`, `exchangeCode()`, modelled directly on gg-coder's `core/oauth/pkce.js`
   - Anthropic OAuth implementation (`oauth/anthropic.ts`) — Claude Code client impersonation, browser-redirect flow, refresh-token rotation; modelled directly on gg-coder's `core/oauth/anthropic.js`
   - Admin auth-setup page (`/admin/agent-auth`) — "Connect Anthropic via OAuth" button kicks off the PKCE flow; status panel shows OAuth health, last refresh, current source (oauth/api-key), and a "force fallback to API key" toggle for emergencies
3. Build the LLM layer (`src/lib/agents/_shared/llm/`):
   - Canonical types (`types.ts`)
   - Provider registry with fallback chains (`registry.ts`)
   - Retry/backoff helper (`retry.ts`)
   - Anthropic adapter (`providers/anthropic.ts`) + transformers — calls `resolveCredential('anthropic')` for every request, so OAuth/API-key choice is invisible to the adapter logic
   - OpenAI-compatible adapter (`providers/openai-compatible.ts`) + transformers — covers Kimi + MiniMax + OpenAI; calls `resolveCredential('moonshot' | 'minimax' | 'openai')` for the API key
   - `callLLM()` entry point (`index.ts`)
4. Build the agent loop (`src/lib/agents/_shared/base-agent.ts`) on top of `callLLM()`
5. Build shared helpers: `tone-of-voice.md`, `system-prompt-builder.ts`, `approval-queue.ts`, `activity-log.ts`
6. Add `agent-approval-queue` collection (shared across all agents)
7. Add `agent-credentials` collection (or use Vercel KV) for storing OAuth tokens encrypted at rest
8. **Add `hasValidApiKey` fallback to the four budget management endpoints** so the agent can read and write through them with `x-api-key: AUDIT_API_KEY`. Required by the Budget Re-allocation tool (see deep dive at the end of this document for full context). Concrete change is one auth-check replacement at the top of each route:
   - `src/app/(frontend)/api/google-ads-budgets/[id]/list/route.ts`
   - `src/app/(frontend)/api/google-ads-budgets/[id]/update/route.ts`
   - `src/app/(frontend)/api/google-ads-budgets/[id]/push/route.ts`
   - `src/app/(frontend)/api/google-ads-budgets/[id]/refresh-metrics/route.ts`

   Replace the existing `if (!user) return 401` block with:

   ```ts
   import { hasValidApiKey } from '@/collections/api-key-access'

   const { user } = await payload.auth({ headers: req.headers });
   if (!user && !hasValidApiKey(req)) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```

   Matches the existing access pattern on the `GoogleAdsCampaignBudgets` collection itself.
9. Smoke tests:
   - Confirm the Anthropic OAuth flow completes end-to-end (browser → consent → token stored → next agent call uses OAuth header)
   - Force-revoke the OAuth token in the store, confirm the next call falls back to `ANTHROPIC_API_KEY` transparently and logs `source: 'api-key-fallback'`
   - Confirm Kimi and MiniMax adapters work via API key alone
   - Confirm provider failover (kill one provider's keys, agent walks down its `fallbackModels` chain)
   - Confirm the four budget endpoints accept `x-api-key: AUDIT_API_KEY` after the fallback change

### Phase 1: Unblock Optimate-Proposal

4. Polish proposal email template
5. Build curated findings template
6. Build Optimate-Proposal agent

### Phase 2: Unblock Optimate-Accounting

7. Connect Xero (or chosen accounting platform)
8. Connect Stripe
9. Build financial summary, anomaly alert, billing health, P&L templates
10. Add `invoices`, `financial-snapshots`, `accounting-anomalies` collections
11. Build Optimate-Accounting agent

### Phase 3: Unblock Optimate-Google-Ads

12. Build Google Ads weekly review template
13. Build optimisation recommendation template
14. Add `google-ads-weekly-reviews`, `optimisation-recommendations` collections
15. Build Optimate-Google-Ads agent

### Phase 4: Unblock Optimate-Legal

16. Lawyer-approved contract templates (×5)
17. Add `contract-templates` and `contracts` collections
18. PDF generation setup
19. Contract summary and variation alert templates
20. Build Optimate-Legal agent

### Phase 5: Unblock Optimate-Meta-Ads

21. Agency Meta Business Manager + App setup
22. Meta Marketing API integration into platform
23. Meta Ads templates (audit, weekly review, creative fatigue, audience performance)
24. Add `meta-ads-audits`, `meta-ads-weekly-reviews` collections
25. Build Optimate-Meta-Ads agent

---

## Architecture: What We're Stealing From gg-coder

We are not installing `@kenkaiiii/gg-agent` or `@kenkaiiii/gg-ai` as npm dependencies. We are borrowing the **patterns** from gg-coder's three-layer architecture and writing our own focused, in-house version inside the CMS. This gives us provider freedom, full code ownership, and no third-party release-cycle risk.

### gg-coder's three-layer architecture, miniaturised

The gg-coder framework splits its codebase into three layers:

```
Layer 1: gg-ai      → talks to LLM providers (Anthropic, OpenAI, Kimi, MiniMax, …)
Layer 2: gg-agent   → the agent loop (turns, tool execution, retries, compaction)
Layer 3: ggcoder    → the product shell (terminal UI, modes, sessions)
```

We mirror this exactly, scaled down for our needs:

```
Layer 1: src/lib/agents/_shared/llm/        → provider router + adapters
Layer 2: src/lib/agents/_shared/base-agent.ts  → agent loop
Layer 3: src/lib/agents/optimate-*.ts       → individual agents (the product)
```

Each Optimate agent only ever touches Layer 2's `runAgent()` function. It doesn't know which provider is serving it. Switching Optimate-Accounting from Claude to Kimi is a one-line change in its config.

### Why we're stealing this specifically

- **Provider freedom.** If Anthropic goes down, has a price hike, or rate-limits us, we route to Kimi or MiniMax that minute — no rewrite, just a router change.
- **Right-tool-for-the-job per agent.** Optimate-Proposal stays on Claude Sonnet (brand voice critical). Optimate-Accounting runs on Kimi (cheap, long context for transaction history). Same fleet, different engines.
- **Future-proofing.** When the next better/cheaper model ships, adding it is one new file in `llm/providers/` plus an entry in the registry. No agent code changes.
- **Fault tolerance baked into the loop.** Provider overloads, stream stalls, context overflows, broken tool pairings — gg-coder's agent loop has named recoveries for each. We steal the patterns we'll actually hit (retry on overload, retry on transient errors, hard-cap turns).

### The canonical-types insight (the key architectural decision)

Different providers speak different dialects:

- Anthropic: `messages.create()` with `tool_use` / `tool_result` content blocks
- OpenAI / Kimi / MiniMax: `chat.completions.create()` with `tool_calls` / `role: "tool"` messages
- Tool schemas: Anthropic uses `input_schema`, OpenAI uses `function.parameters`
- Errors: "overloaded" (Anthropic) vs "rate_limit" (OpenAI) vs "insufficient_quota" (others)

We define **our own canonical shapes** for `Message`, `ContentPart`, `Tool`, `ToolCall`, `ToolResult`, `Response`, `Usage` in `_shared/llm/types.ts`. The agents only ever see canonical types. The provider adapters translate canonical → provider format on the way out and provider → canonical on the way back.

This is exactly what gg-coder's `gg-ai` does. Without this, every agent would need provider-specific branches everywhere. With it, agents are provider-agnostic and provider adapters are isolated translation layers.

### One adapter covers Kimi + MiniMax + OpenAI

Kimi (Moonshot), MiniMax, OpenAI, and DeepSeek all expose **OpenAI-compatible APIs** — same endpoints, same request/response shapes, only `baseUrl` and `apiKey` differ. We write **one** `openai-compatible.ts` adapter and parameterise it. That single adapter handles three providers today and any future OpenAI-compatible provider with no new code.

### How model selection works

Each Optimate agent declares its preferred model in its config. Any of the three providers — Anthropic, Moonshot (Kimi), or MiniMax — can be the primary for an agent. Failover chains can mix providers freely.

```ts
// optimate-accounting.ts
export async function runOptimateAccounting(opts: { ... }) {
  return await runAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools,
    initialMessage: '...',
    model: 'kimi-k2',                                       // <-- primary: Kimi
    fallbackModels: ['minimax-text-01', 'claude-haiku-4.5'], // <-- tries MiniMax, then Claude Haiku
    agentName: 'optimate-accounting',
    context: { ... },
  })
}
```

`runAgent()` looks up the model in the provider registry, gets the right adapter, makes the call. If the primary model fails (overload, outage, quota, transient error), it walks down `fallbackModels` until one works. The agent code itself doesn't know or care which one served the response — it only sees canonical types coming back.

### Provider registry (the model → provider map)

In `_shared/llm/registry.ts`, each model name resolves to a provider config. Adding a new MiniMax model later is one line in this file — no agent code changes.

```ts
export const MODEL_REGISTRY = {
  // Anthropic (native API)
  'claude-sonnet-4.5':   { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  'claude-haiku-4.5':    { provider: 'anthropic', model: 'claude-haiku-4-5' },
  'claude-opus-4':       { provider: 'anthropic', model: 'claude-opus-4-1' },

  // Moonshot / Kimi (OpenAI-compatible)
  'kimi-k2':             { provider: 'moonshot',  model: 'kimi-k2-0905-preview' },
  'kimi-k2-turbo':       { provider: 'moonshot',  model: 'kimi-k2-turbo-preview' },

  // MiniMax (OpenAI-compatible)
  'minimax-text-01':     { provider: 'minimax',   model: 'MiniMax-Text-01' },
  'minimax-m1':          { provider: 'minimax',   model: 'MiniMax-M1' },
} as const

export const PROVIDER_CONFIG = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    handler: callAnthropic,
  },
  moonshot: {
    apiKey: process.env.MOONSHOT_API_KEY!,
    baseUrl: 'https://api.moonshot.ai/v1',
    handler: callOpenAICompatible,
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY!,
    baseUrl: 'https://api.minimaxi.chat/v1',
    handler: callOpenAICompatible,
  },
}
```

Note: MiniMax's official base URL changes occasionally and differs between their international and China-only platforms. The registry centralises this so it's a single config change if it moves.

### Default model assignment per agent

| Agent | Primary model | Provider | Fallback chain | Why |
|---|---|---|---|---|
| Optimate-Proposal | `claude-sonnet-4.5` | Anthropic | `kimi-k2` → `minimax-text-01` | Customer-facing, brand voice critical; falls back through Kimi then MiniMax if Anthropic is down |
| Optimate-Accounting | `kimi-k2` | Moonshot | `minimax-text-01` → `claude-haiku-4.5` | High volume, cost-sensitive, long context for transactions |
| Optimate-Google-Ads | `claude-sonnet-4.5` | Anthropic | `kimi-k2` → `minimax-m1` | Analytical judgement; both fallbacks are capable analysis models |
| Optimate-Legal | `claude-haiku-4.5` | Anthropic | `claude-sonnet-4.5` only | Strict rule-following, contract text must be reproducible on a known Anthropic model. **No cross-provider failover.** If Anthropic is fully down, Legal pauses. |
| Optimate-Meta-Ads | `minimax-m1` | MiniMax | `kimi-k2` → `claude-sonnet-4.5` | Long context for analysing many ad creatives; cheaper than Sonnet at high volume |

Legal deliberately does **not** failover to a non-Anthropic provider. Contracts must be reproducible against a known model. If Anthropic is down, Optimate-Legal pauses rather than producing a contract on a different provider.

Every other agent has at least one fallback per *other* provider, so a single-provider outage never stops the fleet.

### Reliability patterns we're stealing

From gg-coder's `agentLoop`, we take a focused subset of the failure-mode handling:

| Pattern | Why we keep it | Why gg-coder has more than we need |
|---|---|---|
| **Exponential backoff on overload (429/529)** | Will hit this regularly | Same |
| **Retry on transient errors** | Network blips, brief outages | Same |
| **Hard cap on turns** (default 20) | Prevents runaway loops on bugs | gg-coder runs 200-turn coding sessions; ours are short transactional |
| **Tool pairing repair** | Cancellation mid-tool can break the next call | Same |
| **Provider failover (`fallbackModels`)** | Anthropic outage = use Kimi | gg-coder doesn't do automatic failover, it's a user choice |
| **Prompt caching on system prompt** | 3–5x cost reduction on repeat calls | Same — we set `cache_control: ephemeral` on the system prompt block |
| ~~Streaming + non-streaming fallback~~ | Skip — our agents are batch, not interactive | gg-coder needs this for the terminal UI |
| ~~Plan mode~~ | Skip — not relevant for transactional agents | gg-coder is interactive |
| ~~Sub-agent recursion (`--json` mode)~~ | Skip — agent-to-agent is just function calls in our case | gg-coder shells out to a child process |
| ~~Session DAGs (JSONL with parentId)~~ | Skip — we have the `activity-log` collection | gg-coder needs branching for resumable interactive sessions |
| ~~Multi-turn conversation memory beyond one run~~ | Skip — each agent run is stateless | gg-coder is conversational |

### Tool definition shape (stolen verbatim)

We use gg-coder's tool shape unchanged because it's the cleanest version going:

```ts
export interface CanonicalTool<T extends z.ZodType = z.ZodType> {
  name: string
  description: string         // shown to the LLM
  parameters: T               // Zod schema, auto-converted to JSON Schema per provider
  execute: (args: z.infer<T>, ctx: ToolContext) => Promise<ToolResult>
}
```

Zod schemas validate inputs at runtime and generate the JSON Schema the LLM sees. One source of truth, no drift between validation and documentation.

### Shared tone-of-voice

All five agents share a `_shared/tone-of-voice.md` that's injected into every system prompt. When the brand voice changes, all five agents update at once. Same logic as the shared base-agent — write once, reuse.

---

## Authentication: Stealing gg-coder's Credential Layer

gg-coder's auth design is the cleverest single piece of the framework, and we steal it wholesale — with one critical adaptation. The pattern works because it cleanly separates *how a credential is obtained* from *how a credential is used*. Adapters never know or care which kind of credential they got. The resolver hands them an auth header, they make the call. That separation is what lets us run Anthropic via OAuth (impersonating Claude Code) and Kimi/MiniMax via API key without writing two adapters.

### Per-provider auth strategy

| Provider | Primary auth | Fallback auth | Why |
|---|---|---|---|
| **Anthropic** | OAuth (Claude Code client impersonation) | API key (env var) | OAuth draws from the $150/mo Max plan rather than billed API — effectively free at fleet volume. API key is mandatory backup because the OAuth path is provider-controlled and can break without notice. |
| **Moonshot (Kimi)** | API key | (none — the API key *is* the auth) | Moonshot does not offer OAuth for third-party API access. API key is the only auth Moonshot publicly issues. |
| **MiniMax** | API key | (none — the API key *is* the auth) | Same as Moonshot. MiniMax does not currently offer OAuth for third-party API access. |

The credential resolver returns the *same shape* (`{ authHeader, source }`) regardless of which auth type was used, so the adapters stay simple.

### What gg-coder does (reference)

For Anthropic, gg-coder's `core/oauth/anthropic.js` (~150 lines) does this:

1. Generates a PKCE `code_verifier` + `code_challenge` (gg-coder's `core/oauth/pkce.js`)
2. Opens a browser to Anthropic's OAuth consent URL with the Claude Code OAuth client ID and the challenge
3. Spins up a tiny localhost listener on a random port to catch the redirect with the auth code
4. Exchanges the auth code + code_verifier for an access token + refresh token
5. Stores both in `~/.gg/auth.json` with file-locking via `core/file-lock.js`
6. On every API call, the Anthropic adapter calls `getCredentials('anthropic')` which auto-refreshes the access token if it's within 60 seconds of expiry (using the refresh token)
7. Per-provider in-memory `Map<provider, Promise>` lock prevents concurrent refresh races when multiple agent runs hit the same expiring token

We reproduce all seven steps almost verbatim. The only differences are:
- **Storage** — instead of `~/.gg/auth.json` on a developer's laptop, we store in Vercel KV (or a small CMS collection) encrypted at rest, because Vercel functions are stateless and can't share filesystem state
- **Browser-redirect target** — instead of `http://localhost:port`, we redirect to a fixed admin route on our deployed CMS (`/admin/agent-auth/callback`) so it works in production, not just on a developer's machine
- **Initiator** — instead of being triggered automatically on first run, OAuth is initiated explicitly from a "Connect Anthropic via OAuth" button on the admin auth-setup page

### The credential resolver (the linchpin)

Every provider adapter starts every API call with one line:

```ts
const { authHeader, source } = await resolveCredential('anthropic')
```

The resolver does, in order:

1. **Try OAuth.** If the provider has an OAuth implementation registered (today: just Anthropic) and a stored credential exists, refresh it if needed, return its access token as the auth header. Mark `source: 'oauth'`.
2. **OAuth failed?** If the OAuth attempt threw (token revoked, refresh failed, OAuth client ID rotated by Anthropic, network error specifically against Anthropic's OAuth endpoint, etc.) the resolver catches the error, logs it to the activity log with `source: 'oauth-failure-fallback'`, and proceeds to step 3.
3. **Fall back to API key.** Read `process.env.<PROVIDER>_API_KEY` (e.g. `ANTHROPIC_API_KEY`, `MOONSHOT_API_KEY`, `MINIMAX_API_KEY`), wrap as the appropriate auth header, return with `source: 'api-key'` (or `'api-key-fallback'` if we got here from an OAuth failure).
4. **No credential available?** Throw `NoCredentialError(provider)`. The agent loop classifies this as a non-retryable error and walks down its `fallbackModels` chain to a different provider.

For Kimi and MiniMax, step 1 is skipped (no OAuth implementation registered). They go straight to step 3 every time. **The adapter doesn't know or care.**

### Refresh lock pattern (concurrency safety)

gg-coder's `AuthStorage` keeps an in-memory `Map<provider, Promise<void>>` of in-flight refresh operations. When two agent runs simultaneously hit an expiring token, only one actually refreshes — the second awaits the first's promise. Without this, two refreshes race and one of them invalidates the other's new token (Anthropic only honours the most recent refresh-token exchange).

We steal this pattern verbatim. In a Vercel multi-instance environment we go one step further and add a Vercel KV-backed lock with a 30-second timeout (`SETNX` pattern), because the in-memory map only protects within a single function instance. Cross-instance races are rare but real on a busy fleet.

### Forced-fallback toggle

The admin auth-setup page exposes a "Force API key (disable OAuth)" toggle. When on, the resolver skips step 1 entirely and uses API key for all calls. Use cases:

- Anthropic suspends or rate-limits the Max account, agents start failing intermittently — flip the toggle, all traffic goes to billed API immediately
- Testing the fallback path before it's needed in anger
- Debugging "is OAuth or the API key the broken one?"

The toggle is stored in the same auth store, checked on every `resolveCredential('anthropic')` call. Setting it does not require a redeploy.

### Storage shape (canonical credential)

```ts
type Credential =
  | {
      kind: 'oauth'
      provider: 'anthropic'
      accessToken: string
      refreshToken: string
      expiresAt: number          // unix ms
      clientId: string           // Claude Code client id, stored so we can detect rotation
      scope: string
      obtainedAt: number
    }
  | {
      kind: 'api-key'
      provider: 'anthropic' | 'moonshot' | 'minimax'
      apiKey: string             // mirrors env var, allows per-client override later
      label?: string             // 'primary' | 'rotation-2' | etc.
    }
```

The `kind` discriminator means future credential types (per-client OAuth, signed-JWT, mTLS) drop in without disturbing existing code. This is the part of the gg-coder architecture that makes it future-proof — the resolver and adapter contract don't change when a new auth method appears, only the credential resolver gains a new branch.

### What this gives us beyond "just OAuth"

Once the resolver layer exists, three things become easy that would otherwise require refactors:

- **Multiple API keys per provider.** Add a second Kimi key labelled `rotation-2`, the resolver round-robins per-call. Doubles your effective rate limit at zero code cost.
- **Per-client billing keys.** A big client wants their LLM cost passed through. Store their key with `clientId: 'acme-corp'`, the resolver picks it when `context.clientId === 'acme-corp'`.
- **OAuth for Kimi/MiniMax later.** If Moonshot or MiniMax ever launch OAuth, register a new OAuth implementation under `auth/oauth/moonshot.ts`. Adapters and agents don't change.

### What we deliberately don't reproduce

gg-coder's auth layer also includes a few things we skip because they don't apply on Vercel:

- File-system locks (we use KV-backed locks instead; Vercel functions don't share a filesystem)
- Multi-account support per provider in a single ggcoder install (one Max account is enough for an agency)
- The `gemini` OAuth scaffolding (gg-coder has the file but it's not wired up; we skip it entirely)

---

## Communication Surfaces: How You (And Your Team) Talk To The Agents

The agents need a way for humans to talk to them and for them to talk back. There are several plausible surfaces (in-CMS chat, Telegram bot, email/SMS alerts, voice notes from mobile, etc.). Building all of them at once is a mistake; building only one would constrain the workflow. The plan: **one rich primary surface (CMS chat) plus a thin mobile-friendly secondary surface (Telegram), with a channel-agnostic alert layer underneath both**, built in three explicit phases.

### The 85/15 split (deliberate)

Real usage on this product splits roughly:

- **85% “substantial review” work** — reading drafts, approving proposals, reviewing contracts, evaluating diagnostic reports, walking through restructure recommendations. This needs tables, diff views, multi-section layouts, embedded approval buttons, side-by-side comparisons. Lives in the **CMS chat surface**.
- **15% “mobile-while-out” work** — quick judgement calls ("pause that ad set"), receiving urgent alerts (spend anomalies at 11pm), forwarding screenshots, dictating a thought before it disappears. Lives on **Telegram**.

Both surfaces use the **same agent runtime underneath**. The agent doesn't know or care whether its input came from CMS chat or Telegram; it sees text in, emits structured events out. The surfaces are thin transport layers, not separate products.

This ratio is the reason CMS chat is built first and gets full UX investment, and Telegram is added later as a focused mobile escape hatch — not the reverse.

### Surface 1: CMS chat (Phase 1, primary)

A rich in-admin chat interface, embedded in the relevant client/agent admin page. Built once as a shared component, every agent inherits the same surface.

**Capabilities:**

- Tables, diff views, charts, inline approval buttons rendered directly in agent responses
- Context-aware: if you're on a client's admin page, the chat already knows it's about that client
- Approval queue items surface inside the same conversation thread that produced them
- Activity log with collapsible reasoning panel (per Build Decision 4)
- Multi-user-ready from day one (your team in 6 months gets logins, role-based permissions, attributed actions)
- Rich Markdown, image upload, file attachment
- Suggested-question chips per agent (lifted from the existing OptiMate chat pattern)

**Voice input on CMS chat:**

Users dictate using their existing tools, not anything the CMS provides. Specifically:

- **Desktop**: users have their own dictation tool (Whisper-grade transcribers like SuperWhisper, MacWhisper, Wispr Flow, etc.). They dictate into the normal text input. The CMS does nothing special on desktop — a text input is enough, because dictation is happening at the OS layer, not the app layer.
- **Mobile**: a mobile-only mic button in the chat input area uses MediaRecorder + OpenAI Whisper API for transcription. Mobile keyboard mics (iOS native dictation, Gboard voice) are noticeably worse quality than desktop Whisper-grade tools, so the CMS provides its own. **This is the only surface-specific voice integration we build for CMS chat.**

#### Mobile voice button: how it works

```
User on mobile (iPhone or Android) taps mic button in chat input area
  → browser asks for microphone permission (once, ever)
  → user speaks
  → user taps stop (or auto-stops on 2-second silence)
  → audio blob uploaded to /api/transcribe
  → server forwards audio to OpenAI Whisper API (whisper-1 model)
  → transcribed text returns in 2–3 seconds
  → text fills the chat input
  → user reviews / edits / sends as normal
```

**Why MediaRecorder + Whisper API instead of browser SpeechRecognition API:**

- Whisper-large-v3 quality matches what users have on desktop — no quality regression switching to mobile
- Works identically on iOS Safari, mobile Chrome, mobile Firefox, Android Chrome
- No quirks: no 60-second cutoffs, no permission popup roulette, no "sometimes works" failure modes
- Same transcription pipeline gets reused for the Telegram bot in Phase 7 — build once, two consumers

**Cost expectation (OpenAI Whisper API):**

- $0.006 per minute of audio
- Average voice note is 10–30 seconds (≈$0.001–$0.003 per note)
- At realistic volume (30% of ≈20 daily interactions = 6 voice notes/day on mobile), monthly cost is **~$0.20–1.00**
- At 10x scale (full team using mobile heavily), still **<$5/month**
- For practical purposes, free at agency volume

**Mobile-only by feature detection:** the `<MobileVoiceButton />` component renders only when `window.innerWidth < 768` AND the device reports as mobile via UA. On desktop the button doesn't appear, because users have better tools.

**Files:**

- `src/components/agent-chat/MobileVoiceButton.tsx` (~80 lines)
- `src/app/(frontend)/api/transcribe/route.ts` (~25 lines, accepts audio blob, forwards to Whisper, returns text)

### Surface 2: Channel-agnostic alerts (Phase 6, push notifications)

One-way push notifications when an agent detects something that needs human attention outside of an active chat session. **Not conversational — just "FYI, here's what happened, click to act".**

**Use cases:**

- Optimate-Google-Ads detects a spend anomaly at 11pm (>150% pacing for 2+ days)
- Optimate-Legal has a contract draft awaiting your review
- Optimate-Accounting flags an unusual expense or overdue invoice
- Optimate-Meta-Ads detects creative fatigue across multiple ad sets
- Weekly review run completes with `status: 'red'`

**Channel-agnostic design:** every alert goes through one dispatcher that fans out to the configured channels for the alert's urgency. Alerts can be sent via Telegram, email (Postmark, already integrated), or SMS (Twilio, optional add). Channel selection is per-alert-type and per-user, configured in the CMS settings.

**Dispatcher API (one shape, multiple transports):**

```ts
await sendAlert({
  urgency: 'urgent' | 'warn' | 'info',
  summary: string,                  // one-line headline
  detail?: string,                  // optional additional context, plain text
  link: string,                     // "Open in CMS" deep link
  channels: ('telegram' | 'email' | 'sms')[],   // explicit per call
  recipients: string[],             // user IDs from CMS
})
```

**Why channel-agnostic from day one:**

- Telegram outage on a Wednesday shouldn't mean missing a spend-anomaly alert — same alert goes via email, you still see it
- Different users on the future team might prefer different channels (e.g. operations on Telegram, you on email)
- Adding SMS later is a one-line registry change, not a refactor
- Mirrors the same architectural principle as the LLM provider layer: abstract behind a registry, swap implementations freely

**Files:**

- `src/lib/agents/_shared/alerts/dispatcher.ts` (~40 lines, the `sendAlert()` entry point and channel registry)
- `src/lib/agents/_shared/alerts/channels/telegram.ts`
- `src/lib/agents/_shared/alerts/channels/email.ts` (wraps existing Postmark integration)
- `src/lib/agents/_shared/alerts/channels/sms.ts` (stub initially, optional Twilio add later)
- `agent-alert-preferences` collection (or extend Users collection) — per-user channel preferences and quiet hours

**Telegram setup at this stage:** create a bot via BotFather, store the token, configure webhook to point at the CMS. The webhook only handles outbound (sending alerts to known chat IDs); it doesn't yet listen for inbound messages. That's Phase 7.

### Surface 3: Telegram conversational mode (Phase 7, mobile chat)

Full two-way Telegram bot with voice notes, multi-turn conversation, inline keyboards for quick approvals. Mirrors gg-coder's `serve-mode` pattern but adapted for Vercel.

**When to build this:** after all 5 agents are live and stable in CMS for 2–3 months. By then you'll know exactly which conversations you actually want to have on Telegram (probably fewer than expected upfront), and the agent runtime will be hardened. Telegram becomes a thin wrapper, not a co-equal product.

**Capabilities:**

- Send a text message to the bot → routed to the right agent based on chat-ID-to-agent mapping (same pattern as gg-coder's `~/.gg/serve.json`)
- Send a voice note → OpenAI Whisper transcribes → routed as text
- Inline keyboards for quick approvals ("Approve / Reject / Open in CMS")
- Long agent responses split across messages with the 4096-character Telegram limit
- Group chat support: multiple team members on the same client thread, agent posts updates, anyone with permission replies
- Non-blocking: while an agent run is in progress, the bot acknowledges and works in the background, posting the result when ready

**Webhook, not long-polling.** Vercel functions are stateless and ephemeral, so we use Telegram's webhook mode — Telegram POSTs to our endpoint when a message arrives. No polling loop, no daemon, no cost when idle.

**Voice transcription:** reuses the **same `/api/transcribe` route** built for the mobile CMS voice button in Phase 1. Audio bytes are audio bytes regardless of source. Build once, two consumers.

**The hard guardrail:** any approval involving more than 5 items, any contract review, any agent draft over 200 words — the bot replies with a one-line summary plus an "Open in CMS" deep link. Telegram never becomes the surface for substantial review work, even when technically possible. This preserves the 85/15 split deliberately.

**Chat-ID-to-agent mapping:** stored as a CMS collection (`telegram-chat-bindings`), editable in admin. Mirrors gg-coder's `~/.gg/serve.json` structure but persisted in the database instead of a flat file:

```ts
{
  chatId: number,                   // Telegram chat ID
  agentName: string,                // 'optimate-google-ads' etc.
  clientId?: string,                // optional default client context
  allowedUserIds: number[],         // Telegram user IDs allowed to use this chat
  permissions: ('chat' | 'approve')[]
}
```

**Files:**

- `src/lib/agents/_shared/telegram/bot.ts` (~250 lines, mirrors gg-coder's `core/telegram.js`: webhook handler, message splitting, inline keyboards, send/reply)
- `src/app/(frontend)/api/telegram/webhook/route.ts` (~30 lines, the Vercel webhook endpoint Telegram POSTs to)
- `telegram-chat-bindings` collection in the CMS

### Build order (the explicit ordering)

Built in this order to match the 85/15 reality and avoid double-investment in surfaces:

| Phase | Surface | What gets built | Cost (rough effort) |
|---|---|---|---|
| 1 | CMS chat | Rich chat surface, agent integration, mobile voice button via Whisper API | ~5–7 days |
| 6 | Channel-agnostic alerts | Alert dispatcher, Telegram outbound only, email/SMS channels, per-user preferences | ~2–3 days |
| 7 | Telegram conversational | Webhook handler, chat-ID-to-agent mapping, voice notes via shared `/api/transcribe`, inline approvals, group chat | ~3–4 days |

Notice the *total* Telegram investment (Phases 6 + 7 combined) is ~5–7 days — about the same as the CMS chat — but it's spent later, on a foundation that's already solid, not in parallel competing for attention.

### Why this is the right shape

- **The 85% surface gets the product investment.** Tables, diffs, approvals, multi-user, rich UI — all in CMS where you'll actually use them.
- **The 15% surface gets a focused mobile escape hatch.** Voice notes, push alerts, quick approvals — the things Telegram is genuinely better at, nothing more.
- **One agent runtime under everything.** Same `runAgent()` calls. Same approval queue. Same activity log. Same credentials. Two transports, one product.
- **One transcription pipeline serves both surfaces.** The `/api/transcribe` route built for mobile CMS in Phase 1 is the same one Telegram uses in Phase 7. No duplicate Whisper integration.
- **Channel-agnostic alerts mean no single point of failure.** Telegram down? Email still works. Email blocked? SMS still works. The dispatcher abstracts the transport.
- **No premature complexity.** Telegram conversational comes after the agent runtime has been hardened in CMS for months. By then, Telegram is genuinely thin (a few hundred lines of bot wrapper) rather than "build the runtime *and* a complex Telegram surface at the same time".

---

## File Structure (Locked)

```
src/lib/agents/
  optimate-proposal.ts
  optimate-accounting.ts
  optimate-google-ads.ts
  optimate-legal.ts
  optimate-meta-ads.ts

  _shared/
    base-agent.ts              # the agent loop (Layer 2)
    types.ts                   # AgentResult, AgentConfig, ToolContext
    approval-queue.ts          # shared approval queue helpers
    activity-log.ts            # shared logging helpers
    tone-of-voice.md           # brand voice, imported into every system prompt
    system-prompt-builder.ts   # composes per-agent prompts with shared tone

    alerts/                    # channel-agnostic push notifications (Phase 6)
      dispatcher.ts            # sendAlert() — the one entry point, fans out to channels
      channels/
        telegram.ts            # outbound Telegram messages (uses Bot API)
        email.ts               # wraps existing Postmark integration
        sms.ts                 # Twilio (optional)

    telegram/                  # Telegram bot transport (Phase 7)
      bot.ts                   # webhook handler, message splitting, inline keyboards (modelled on gg-coder's core/telegram.js)
      chat-bindings.ts         # chat-ID-to-agent routing (mirrors gg-coder's serve.json)

    llm/                       # Layer 1 — provider abstraction (our gg-ai)
      index.ts                 # exports callLLM(), the one entry point
      types.ts                 # canonical Message, ContentPart, Tool, Response, Usage
      registry.ts              # model → provider mapping, fallback chains
      retry.ts                 # exponential backoff, error classification
      auth/                    # credential abstraction (our version of gg-coder's auth-storage + oauth/)
        types.ts               # Credential = ApiKeyCredential | OAuthCredential
        store.ts               # encrypted persistence (Vercel KV or CMS collection); per-credential refresh lock
        resolver.ts            # resolveCredential(provider) — OAuth-first, transparent fallback to env-var API key
        pkce.ts                # PKCE helpers — modelled on gg-coder's core/oauth/pkce.js
        oauth/
          anthropic.ts         # Claude Code client impersonation flow; modelled on gg-coder's core/oauth/anthropic.js
      providers/
        anthropic.ts           # Anthropic adapter — calls resolveCredential('anthropic')
        openai-compatible.ts   # ONE adapter for OpenAI / Kimi / MiniMax / DeepSeek — calls resolveCredential(provider)
      transformers/
        to-anthropic.ts        # canonical → Anthropic format
        to-openai.ts           # canonical → OpenAI-compatible format
        from-anthropic.ts      # Anthropic response → canonical
        from-openai.ts         # OpenAI-compatible response → canonical

src/components/agent-chat/    # CMS chat surface (Phase 1) — shared by every agent
  AgentChat.tsx               # the chat surface, drops into any client/agent admin page
  ChatMessage.tsx              # renders a single message (Markdown, tables, diff views, approval buttons)
  ChatInput.tsx                # text input + send button + mic button (mobile only)
  MobileVoiceButton.tsx        # mobile-only mic, MediaRecorder → /api/transcribe (Phase 1)
  ApprovalInline.tsx           # inline approve/reject UI for items in the approval queue
  SuggestedQuestions.tsx       # per-agent suggested-question chips

src/app/(frontend)/api/
  transcribe/route.ts          # POST audio blob → OpenAI Whisper → text (Phase 1, reused in Phase 7)
  agents/[agent-name]/chat/route.ts   # POST message → runAgent() → streamed response (Phase 1)
  telegram/webhook/route.ts    # Telegram POSTs here when a bot message arrives (Phase 7)
```

Each agent file holds:

- Its system prompt
- Its tool definitions
- Its output schema
- Its primary model + fallback chain
- Its trigger handlers (cron, button, chat, agent-to-agent)

Agents never import from `_shared/llm/` directly. They go through `base-agent.ts → callLLM()`. The provider abstraction is invisible to them.

Everything shared lives in `_shared/`. Write the skeleton once, every Optimate agent slots into the same pattern.

---

## Standard Skeleton Every Agent Will Follow

Each Optimate agent has the same shape:

- **Focused system prompt** (500 to 2,000 words, domain-specific, not generalist), composed via `system-prompt-builder.ts` so the shared tone-of-voice block is included automatically
- **Curated tool set** (3 to 6 tools, only what is needed for the job), defined as `CanonicalTool` objects with Zod parameter schemas
- **Structured output schema** (JSON conforming to a defined shape, not freeform prose)
- **Primary model + fallback chain** (e.g. Sonnet → Kimi for analysis agents; Haiku for simple agents; Legal stays Anthropic-only)
- **Provider-agnostic** — the agent never references Anthropic or Kimi directly; `runAgent()` and `callLLM()` handle routing
- **Template-rendered output** (agent fills slots, your code renders the branded template)
- **Approval queue integration** (drafts go to your queue, you approve before client-facing actions)
- **Activity log integration** (every action logged via existing `activity-log` collection, including which provider/model actually served the response)
- **Multiple trigger modes** (cron, admin button, chat via Pocket Agent, agent-to-agent)

---

## Where This Is Heading

Once these five agents are in place, you have built a digital agency operations layer. Not "AI features bolted onto a CMS," but a coordinated team of specialists that handles new business, ad operations, finance, and contracts, with you as the human-in-the-loop approving outputs.

That is genuinely differentiated. Most agencies have generic AI bolted on. You would have a fleet working in concert, all on-brand, all templated, all approved by you, all running cheaply because each one is focused.

---

## Companion Document

For the philosophical/educational background on why custom agents matter and why this architecture works, see:

`drafts/why-custom-ai-agents-are-the-missing-piece.md`

---

# Optimate-Google-Ads: Deep Dive (First Agent Build)

This is the first agent we're building end to end. The reasons it goes first:

1. **Live use cases right now.** Berendsen and MTP have both raised lead-volume concerns this fortnight. The investigation flow we used (cross-referencing Google Ads platform data, GA4 by state, GA4 by channel, identifying coverage gaps from the campaign restructure, applying the phrase-match fix) is the exact flow this agent should run.
2. **It validates the architecture on real work.** If the agent can do this analysis as well as we've been doing it manually, the rest of the fleet follows the same pattern with different tools.
3. **Two modes, both needed.** Clients want a chat interface to ask "what's happening with my campaigns this month" without a meeting. The agency wants an autonomous weekly review that catches problems early. Same agent, two trigger modes.

The rest of this section is the build spec.

## The Two Operating Modes

### Mode 1: Chat (interactive)

A client (or you) opens the Pocket Agent or in-CMS chat and asks an open question. Examples:

- "Why have my leads dropped this month?"
- "Are we covering all the keywords we used to before the restructure?"
- "How does April compare to March across paid, organic and direct?"
- "What's wasted spend look like this week?"

The agent runs the relevant tools, surfaces the data, and answers in your tone of voice with concrete numbers. If the question implies an action (e.g. "should we re-add some broad keywords"), the agent proposes the action and routes it to the approval queue rather than taking it.

### Mode 2: Autonomous (scheduled)

Runs on a cron (default: weekly Monday 7am AEST per active client). Goes through a deterministic checklist:

1. Pull last 7 days of campaign performance vs the prior 7 days
2. Pull last 7 days of GA4 sessions by channel
3. Run the standard health checks (see "Diagnostic playbook" below)
4. If nothing material, post a one-line summary into the activity log and stop
5. If anything material is detected, generate a draft client report or alert and route to the approval queue

The same agent. Same tools. Same rules. Different trigger.

## Use Cases (Proven, From Real Client Work)

These are the exact flows the agent must handle, lifted from the Berendsen and MTP investigations:

### A. "Leads have dropped — what's going on?"

The flow we ran for Berendsen and MTP this fortnight:

1. Pull total Australian sessions by month for the last 16 months from GA4 (state breakdown)
2. Pull sessions by default channel group from GA4 (national, plus per-state if the client is concentrated in one)
3. Pull google/cpc sessions by month and state from GA4
4. Pull Google Ads spend, clicks, impressions, average CPC by month from the Google Ads API (last 6 months)
5. Look for a single month where every channel and every state collapses simultaneously, that's a site-wide event signature, almost always a website migration without an SEO migration plan, recoverable but slow
6. Compare matched 20-day windows pre-restructure (21 days before the restructure date) vs post-restructure (the 21 days following) at the keyword level via the Google Ads API
7. Identify gap keywords: terms with ≥1 click in pre that have <50% per-day click rate in post
8. Filter out brand keywords and competitor brand terms
9. Recommend phrase-match additions to the appropriate enabled ad groups
10. Quantify recovery target as "X clicks per 20 days" (Google Ads platform-side, not GA4)
11. Cross-check Google Ads click totals vs GA4 google/cpc sessions for the same period — if the ratio is wildly off (e.g. less than 50% of clicks landing as cpc sessions in GA4), surface the attribution health issue
12. Generate the diagnostic report with a six-section structure:
   - The headline finding
   - The site-wide event (if detected)
   - Channel-level recovery picture
   - Google Ads paid trajectory under the new structure
   - The exact-match coverage gap (with the like-for-like 20-day table) plus what's been actioned
   - Standard questions for the client (lead/sales numbers by month, branch breakdown, CRM/lead routing check)

### B. "Have we lost coverage on any keywords since the restructure?"

A subset of A, focused on keyword coverage only:

1. Pull keyword performance for matched 20-day windows pre and post restructure
2. Identify keywords where the per-day click rate dropped >50%
3. For each gap keyword, check if it exists in the new structure and what match types are enabled
4. Categorise: (a) not in any ad group, (b) in account but only as exact match, (c) in account but the broad/phrase version is paused
5. Recommend phrase-match additions, mapped to the right ad group based on intent (product → product ad group, service → service ad group, location-modifier → location ad group)
6. Surface as a proposal in the approval queue. On approval, the agent applies the additions via the Google Ads API.

### C. "Weekly review — anything I should know?"

Autonomous mode, deterministic checklist:

1. Spend pacing vs target (>130% flagged, >150% with auto-pause if `auto_apply` mode and client opts in)
2. Week-over-week movement on CTR, CPA, conversions, impressions (>20% drops flagged)
3. Spend anomaly (>150% of daily average for 2+ consecutive days)
4. Coverage check: any new search terms appearing in the search-term report with >X clicks that aren't covered by an enabled keyword
5. Negative keyword candidates: search terms with high cost and low conversion rate
6. Quality Score regressions
7. Ad disapprovals or policy issues

Output: either a short "all clear" log entry, or a draft client email/slack message routed to approval queue.

### D. "Propose a campaign restructure for [new client]"

The campaign-proposal flow we already have in `server/campaign-proposal-service.ts`, but with the lessons learned from Berendsen and MTP baked in (see "Pre-flight checks" below).

---

## Exploratory Mode (Secondary — Phase 3.5, Build After Standard Mode Is Stable)

> **Status: secondary feature. Do not build until standard chat + autonomous modes have been in production for at least 3–4 weeks and the standard tool surface has stabilised.** This section is captured upfront so that standard-mode tools are designed to compose cleanly into exploratory mode later. It is not part of the initial Phase 3 build.

### Why this exists

Standard mode (chat + autonomous) covers the recurring, productised work: weekly reviews, the diagnostic playbook for "leads dropped", restructure proposals, negative keyword sweeps. Shape known, tools bounded, output schemas fixed.

There is a separate class of work where the shape isn't known upfront: deep-dive investigations, ad-hoc "something looks off in March, find why" questions, custom presentations that don't fit any existing template. Today this work happens in Claude Code on the agency owner's laptop. That works but doesn't scale to a team and doesn't produce artefacts that land in the CMS for review/approval/sharing.

Exploratory mode is the answer: **same agent, same data access, different posture and a wider tool surface**, unlocked on request via an explicit toggle. It does not replace Claude Code for codebase work, building agents themselves, or general one-off scripting; it replaces Claude Code only for the specific niche of *freeform Google Ads / GA4 investigation that should produce a CMS-resident artefact a teammate can review.*

### Core principle: one agent, two gears

```
Optimate-Google-Ads (one agent file, one system prompt skeleton, one credential layer)
├── Standard mode (default — Phase 3)
│   └── Tools: get_*, propose_*, apply_*, draft_* (the inventory in the section below)
│   └── System prompt nudge: "Produce the structured deliverable. Stay within the framework.
│       If you find something unusual outside the framework, flag it and recommend an exploratory follow-up."
│
└── Exploratory mode (Phase 3.5 — opt-in via /explore or toggle)
    └── All standard tools PLUS the freeform tool surface below
    └── System prompt nudge: "Investigate freely. Form a hypothesis, test it with data,
        share findings as you go. Don't commit to a final structure until you've explored
        enough to know what the deliverable should be."
```

Mode is a parameter passed into `runOptimateGoogleAds()`. Standard mode is the default; exploratory unlocks additional tools and swaps in an exploratory-mode addendum to the system prompt. Everything else (credential layer, approval queue, activity log, multi-provider fallback chain, prompt caching, hardcoded guardrails) is identical.

### The freeform tool surface (added on top of standard tools)

| Tool name | Purpose |
|---|---|
| `run_gaql_query` | Execute an arbitrary GAQL query against the client's Google Ads account. Returns raw rows + column metadata. The agent decides what to query and how to reason over the results. |
| `run_ga4_query` | Execute an arbitrary GA4 Data API `runReport` call (metrics, dimensions, filters, dateRange). Returns raw rows. |
| `compare_dimensions` | Quick crosstab helper — `dimensionA × dimensionB` by `metric` over `dateRange`. Wraps a common GAQL/GA4 pattern so the agent doesn't burn turns reconstructing it from primitives every time. |
| `draft_freeform_section` | Render a single section of an eventual deliverable in the agency's house style. Returns an HTML fragment. The agent calls this multiple times as it builds up an artefact. |
| `save_analysis_artefact` | Assemble HTML fragments into a final artefact, write to Vercel Blob, create a record in the new `analysis-artefacts` collection. Returns the URL plus the artefact ID. |
| `revise_analysis_artefact` | Re-read an existing artefact from Blob, apply a scoped revision (e.g. "rewrite section 3 with the new finding"), write a new version. Versioned, never destructive. |

The split between standard and exploratory tools is deliberate: standard mode hands the agent **finished workflows** (`generate_weekly_review`, `propose_phrase_match_additions`); exploratory mode hands it **primitives** (`run_gaql_query`, `draft_freeform_section`, `save_analysis_artefact`). The model decides the shape of the deliverable in exploratory mode.

### How users invoke it

Inside CMS chat, on the Optimate-Google-Ads admin page (already client-context-aware via Phase 1 chat surface), two ways to trigger:

- **Explicit prefix:** `/explore Acme Q1 — CPA jumped 40% in March, find why`. The chat handler detects the prefix, sets `mode: 'exploratory'` on the `runAgent()` call.
- **UI toggle:** a Standard / Exploratory toggle in the chat input area. Sticky for the session, resets on new conversation.

Intent detection (running a tiny classifier to auto-switch on natural language like "dig into this") is **deliberately not built**. It's fancy and usually wrong in ways that erode trust. Explicit invocation only.

### Conversation shape (illustrative)

```
User: /explore Acme Q1 — CPA jumped 40% in March, find why

Agent: Switching to exploratory mode. I'll start by pulling Q1 campaign
       performance segmented by month.
       [tool: run_gaql_query]
       The CPA jump concentrates in Search-Brand and Performance Max.
       Investigating search terms and Pmax asset groups next.
       [tool: run_gaql_query]
       Found it — Performance Max picked up 3 new asset groups on March 8th.
       Their CPA is 3x the account average. Cross-checking GA4 to rule out
       a tracking artefact.
       [tool: run_ga4_query]
       Conversion quality is normal in GA4, so this is a Pmax targeting/asset
       issue, not attribution.

       Want me to:
       (a) draft a client-facing presentation section on this finding, or
       (b) keep digging — I haven't checked Shopping or Display yet?

User: keep digging, then draft

Agent: [tool: run_gaql_query]  ...Shopping clean.
       [tool: run_gaql_query]  ...Display clean.
       [tool: draft_freeform_section]  Section 1: headline finding
       [tool: draft_freeform_section]  Section 2: the Pmax asset groups in detail
       [tool: draft_freeform_section]  Section 3: recommended actions
       [tool: save_analysis_artefact]
       Done. Draft saved: "Acme Q1 Deep Dive" — 3 sections, 2 charts.
       Open in CMS to review, edit, and approve before sending.
```

Key UX points (all reuse Phase 1 chat surface infrastructure, no new components):

- **Streaming reasoning panel** (per Build Decision 4) — tool calls and intermediate findings stream in as they happen.
- **Mid-run interruption** — user can interject ("focus on Pmax, skip Shopping") and the agent reroutes on the next turn.
- **Approval still applies** — final artefact lands in `agent-approval-queue`, never auto-published.
- **Same chat thread, mid-session mode flip** — user can run a standard weekly review, see something odd, `/explore` it as a follow-up against the same client context, then return to standard mode.

### System prompt difference

Standard mode addendum (already in the main system prompt):

> Produce the structured deliverable for the active task type. Sections, schema, and tone are fixed by the framework. If you find something unusual that's outside the framework, flag it in your output but don't pursue it — recommend an exploratory follow-up session.

Exploratory mode addendum (swapped in when `mode: 'exploratory'`):

> Investigate freely. Form a hypothesis, test it with data, and share findings as you go. Don't produce a finished deliverable until you've explored enough to know what the deliverable should be. Ask the user before committing to a final structure. Show your reasoning.

Same model, same data access, same hardcoded guardrails (the seven pre-flight checks and the no-destructive-action rule still apply — exploratory mode does not unlock `apply_*` tools without approval). The only difference is the posture and the additional freeform tools.

### Why one agent, not two

- **One codebase, one credential layer, one approval queue, one activity log.** Maintenance is linear, not 2x.
- **Mode mixing in one session** — start with the weekly review, see something odd, `/explore` it, come back. With two agents, this is a context switch between two threads.
- **Tools are additive, not duplicated.** Standard tools like `generate_weekly_review` can themselves call `run_gaql_query` under the hood. No code duplication.
- **Discovery becomes signal.** Every `/explore` session is a candidate future productised tool. After a quarter of usage, look at the top 5 patterns asked of exploratory mode and promote them to standard tools (e.g. `pmax_asset_group_breakdown`, `monthly_cpa_decomposition`). Exploratory mode is the tool-discovery mechanism for the productised side.

### Why not build a separate freeform agent

Considered and rejected. A separate "Optimate-Investigator" agent would duplicate the credential layer, the approval queue routing, the activity log integration, the system prompt skeleton, and the data-fetch tools — all to deliver a different *posture* on the same data access. The cost-benefit doesn't justify it. One agent with a mode flag is the right shape.

Claude Code (on the agency owner's laptop) remains the right tool for: building the agents themselves, codebase exploration, one-off scripts, scraping competitors, anything where the next step is genuinely unknown and might involve filesystem or shell access. Exploratory mode does not try to replace that.

### Phase 3.5 build checklist

Deferred until standard mode is stable. Do not start until **all** of these are true:

- [ ] Phase 3 standard mode (chat + autonomous + weekly review) has been in production use for ≥3–4 weeks
- [ ] Standard mode tool surface is no longer churning week-to-week
- [ ] At least one specific recurring use case (e.g. "deep dive on a specific client's Q[N]") has been logged ≥3 times as something Claude Code is currently doing that the team wants to bring into the CMS

Then build:

1. Add `mode: 'standard' | 'exploratory'` parameter to `runOptimateGoogleAds()` and the chat API route at `src/app/(frontend)/api/agents/google-ads/chat/route.ts`.
2. Build the six freeform tools listed above as `CanonicalTool` definitions. `run_gaql_query` and `run_ga4_query` are thin wrappers around the existing service methods with relaxed input schemas (the agent supplies the query directly).
3. Add the exploratory-mode system prompt addendum to `system-prompt-builder.ts`.
4. Add `analysis-artefacts` collection to the CMS (fields: `clientId`, `agentRun`, `title`, `htmlSections`, `blobUrl`, `version`, `status: draft | approved | sent`, `createdAt`, `createdBy: agent`, `versionHistory`).
5. Add the `/explore` prefix handler to the chat API route + the Standard / Exploratory toggle to `AgentChat.tsx`.
6. Smoke test on a recent real investigation (a Berendsen or MTP follow-up question is the natural choice) — does the exploratory run produce something equivalent to what Claude Code produced for the same prompt? Calibration period before the mode is opened to the team.

No new external integrations, no new providers, no new credential paths. Everything compounds on the Phase 0–3 foundation.

### What standard-mode design must preserve so this is buildable later

The one design decision to make in Phase 3 that affects exploratory mode: **standard mode's `get_*` tools should be designed as thin wrappers over the underlying service methods, not as bundled "playbook" tools.** If `get_google_ads_keyword_performance` is a thin wrapper, exploratory mode can compose it freely. If it's bundled inside a higher-level `run_diagnostic_playbook` macro, exploratory mode would have to re-implement the primitive.

This is already the direction in the tool inventory below — `get_*` tools are atomic, composite operations sit one layer above as `compare_*` and `detect_*` tools, playbooks sit one layer above that as `draft_*` workflows. As long as that layering is preserved through Phase 3, exploratory mode in Phase 3.5 is a small additive build, not a refactor.

---

## Recommendation: Where the Rules Live (Hybrid)

The user asked: should we improve the CMS-stored campaign proposal rules and have the agent call them, or build the rules directly into the agent?

**Recommendation: hybrid. Rules live in the CMS, guardrails live in the agent.**

**CMS-stored rules (human-editable, version-controlled, agent reads on every run):**

- Campaign proposal naming convention (e.g. `Brand_Product`, `Generic_Services_Location`)
- Match-type policy (default phrase + exact, when to use broad, etc.)
- Keyword classification rules (brand vs competitor brand vs generic, geo modifier list, generic brand words)
- Service-splitting thresholds (when to split a service into its own ad group)
- Budget allocation defaults
- Industry-specific configurations (the existing `engineConfig` per business type)
- Standard client questions for diagnostic reports
- Tone-of-voice and report structure templates

**Agent-hardcoded guardrails (never overridden, even if CMS says otherwise):**

- "Never propose an exact-match-only restructure for keywords with ≥10 historical clicks/month, those need phrase-match alongside or they will under-serve for 2-4 weeks while exact builds history."
- "Never auto-apply a destructive change (pause campaign, remove keyword, change bid strategy) without approval-queue routing, regardless of `auto_apply` setting in CMS, except for the spend-anomaly auto-pause case which has its own dedicated path."
- "Never propose bidding on a competitor's brand without explicit human approval per term."
- "Always cross-check Google Ads platform clicks vs GA4 google/cpc sessions for the period when reporting numbers to a client; if the gap is >30% surface it as an attribution health issue."
- "Never quote a 'recovery target' in GA4 sessions if the source is Google Ads platform clicks; quote one or the other and label which it is."

### Why this split

- **CMS rules are the recipe.** They're the things you (or a future hire) want to be able to edit without a code deploy, and they're the things that vary by industry or client.
- **Hardcoded guardrails are the safety rails.** They are lessons learned from real incidents (Berendsen + MTP exact-match cold start, attribution mismatch, etc.). If they were CMS-editable, they could be turned off accidentally and the same mistake would recur.
- **The agent reads CMS rules at the start of every run.** It treats them as the current source of truth but never violates a guardrail even if a CMS rule conflicts. On conflict, it surfaces the conflict to the approval queue rather than silently picking one.

This means the existing `campaign-proposal-service.ts` doesn't get thrown away. It becomes the rules engine the agent calls.

## Pre-flight Checks Before Any Campaign Restructure

The agent runs these before generating any restructure proposal. They are non-negotiable. Each is a hardcoded guardrail.

1. **Historical click pull.** For every keyword that had ≥1 click in the last 90 days, the agent records click count, match type, current ad group placement, and current criterion status. This is the baseline.
2. **Match-type policy enforcement.** Any keyword with ≥10 clicks/month in the last 90 days must appear in the new structure with at least PHRASE match, not exact-only. Lower-volume keywords can be exact-only.
3. **Coverage delta projection.** Before generating the proposal output, the agent simulates: "If I deployed this structure, which historical keywords would lose >50% of their per-day click rate?" If any do, the proposal is amended to add phrase-match versions of those keywords to appropriate ad groups before the proposal is finalised.
4. **Brand-defence policy.** If the client has organic ranking >position 3 for their brand terms (check via Serper or DataForSEO), the agent can recommend pausing brand-keyword bidding, but must surface the trade-off explicitly: "You'll save $X/month in paid brand clicks, but a portion of branded queries that were paid clicks will now flow through Direct/Organic, which is cheaper but means the paid revenue line will look smaller until non-brand spend scales up to compensate."
5. **State-level coverage check.** If GA4 shows the client's traffic is concentrated >50% in one state, recommend state-level geo-targeting on the new campaigns, even if the old campaigns were Australia-wide. Tradeoffs noted in the proposal.
6. **Conversion tracking precondition.** If the client doesn't have GA4 + Google Ads conversion tracking already set up (phone calls + form submissions at minimum), the agent must propose setting these up as Step 0 of the restructure, not as an afterthought, and pause the rest of the proposal until they're live. The Berendsen learning: without conversion tracking on the *previous* account, we can't compare new vs old performance on conversions, only clicks.
7. **Attribution baseline.** Pull the last 60 days' Google Ads platform clicks vs GA4 google/cpc sessions ratio. If <70%, the agent flags this in the proposal: "Your GA4 attribution to paid search is currently capturing only X% of actual ad clicks. This needs an attribution health check before we can confidently report on paid performance via GA4."

## Diagnostic Playbook for "Leads Dropped"

A reusable, deterministic playbook the agent runs when a client (in chat) or alert (autonomous mode) raises "leads have dropped". This is a stripped-down Use Case A.

1. **Establish the timeline.** What month did they first notice? When did the drop start in the data? Use GA4 sessions by month and lead conversion data to anchor the start date.
2. **Check for a site-wide event.** Look for any month in the last 18 months where total sessions dropped >50% with all states and all channels collapsing in the same month. Flag this as the highest-priority finding if present, almost certainly a website migration without an SEO migration plan.
3. **Compare the new campaign structure window vs the prior equivalent window.** Matched 20-day or matched 30-day windows. Use Google Ads platform data, not GA4 (because of the attribution issue).
4. **Check for coverage gaps from the restructure.** Use Case B flow.
5. **Check the Paid Search recovery shape.** Is paid search recovering MoM at the GA4 level, even if total traffic is still below baseline? If yes, that's a positive narrative even when the absolute numbers look bad.
6. **Cross-reference paid spend vs total traffic recovery.** If total traffic is recovering while paid spend is flat or down, the recovery is organic/direct, which is the strongest possible signal that the SEO/site recovery is taking hold. Surface this as a "good news" finding.
7. **Generate the diagnostic report** (see "Output schemas" below) with:
   - The site-wide event finding (if any) as the dominant story
   - The campaign restructure coverage gap (if any) as a secondary finding
   - The current trajectory, with the matched-window comparison
   - What's already been actioned
   - Standard questions for the client to validate

The playbook is the same for every client. The numbers and the conclusions vary.

## Standard Client Questions Framework

Every diagnostic report ends with a "What we'd like from you" section. The agent generates 3 to 5 questions from this question library, picking the ones relevant to the findings:

| Question | When to include |
|---|---|
| Lead/sales numbers by month from [month] to [month] | Always, for any "leads dropped" investigation. The minimum window is 16 months, to span the typical site-event timeline. |
| Are the lead drops happening evenly across all branches/regions, or are some harder hit? | Any client with multiple branches or regions. Helps separate national SEO issues from local market issues. |
| Have phone calls / form submissions / quote enquiries been received and actioned by your sales team in [month]? | Always, when conversion tracking has been set up on the new structure. Catches CRM/routing gaps. |
| Was there a website migration, redesign, CMS change or major site update around [month] [year]? | Only if a site-wide event signature has been detected in the data. Don't ask if you already know the answer. |
| What was the [previous channel] platform that delivered [N] sessions/month before the [event date]? | Only if a non-Google paid channel disappeared and we don't have visibility into what it was. |
| Are you happy to scale paid search spend back up to $[X]/month to capture more new (non-branded) demand? | Only when the agent has detected that paid spend was reduced post-restructure and the client is recovering organically. |

Each generated question must reference specific numbers or dates from the actual report, not vague language. "Lead numbers by month from January 2025 to April 2026" not "Can you share lead data?"

## Agent Tools (CanonicalTool inventory)

Every tool below is a `CanonicalTool` with a Zod input schema. Each one wraps an existing function in either Growth Tools or the GA4 Data API. **No new external integrations are required.**

### Read-only diagnostic tools (no approval needed)

| Tool name | Purpose | Wraps |
|---|---|---|
| `get_google_ads_monthly_summary` | Pull spend, clicks, impressions, avg CPC by month for the last N months | Google Ads API `customer` query, `segments.month` |
| `get_google_ads_keyword_performance` | Pull keyword-level clicks, impressions, cost for a date range | Google Ads API `keyword_view` |
| `get_google_ads_search_terms` | Pull what users actually typed, by date range | Google Ads API `search_term_view` |
| `get_google_ads_active_structure` | List all enabled campaigns and ad groups with their IDs | Google Ads API `ad_group` |
| `get_ga4_sessions_by_state_by_month` | GA4 monthly sessions by Australian region | GA4 Data API `runReport` |
| `get_ga4_sessions_by_channel_by_month` | GA4 monthly sessions by `sessionDefaultChannelGroup` | GA4 Data API `runReport` |
| `get_ga4_sessions_by_source_medium` | GA4 monthly sessions by `sessionSourceMedium` | GA4 Data API `runReport` |
| `get_ga4_google_cpc_by_state` | GA4 monthly google/cpc sessions, AU only, by state | GA4 Data API `runReport` |
| `compare_matched_windows` | Run the like-for-like 20-day or 30-day comparison on keywords | Composite of `get_google_ads_keyword_performance` |
| `detect_site_wide_event` | Look for the uniform-drop-across-all-channels-and-states month signature | Composite of GA4 channel + state queries |
| `compare_google_ads_to_ga4_attribution` | Cross-check Google Ads platform clicks vs GA4 google/cpc sessions | Composite |
| `get_keyword_placement` | Given a keyword, find every ad group it sits in across enabled campaigns | Google Ads API `ad_group_criterion` |
| `read_campaign_proposal_rules` | Read the CMS-stored campaign proposal rules collection | CMS API |

### Action tools (always go through approval queue, except where noted)

| Tool name | Purpose | Approval-queue routing |
|---|---|---|
| `propose_phrase_match_additions` | Generate a list of phrase-match keyword additions to specific ad groups | Always |
| `apply_phrase_match_additions` | Apply approved phrase-match additions via Google Ads API | After approval |
| `propose_negative_keywords` | Generate negative keyword recommendations from search-term report | Always |
| `apply_negative_keywords` | Apply approved negatives via Google Ads API | After approval |
| `propose_campaign_restructure` | Generate a full campaign restructure proposal (uses existing `campaign-proposal-service.ts` plus the pre-flight checks) | Always |
| `propose_bid_adjustment` | Suggest bid changes per ad group or keyword | Always |
| `auto_pause_overspending_campaign` | Pause a campaign that's >150% over budget pacing for 2+ days | **Only** if client has explicitly opted into `auto_apply` mode in CMS, otherwise routes to approval queue |
| `draft_client_diagnostic_report` | Render the diagnostic report HTML using the standard six-section template | Always (you approve before send) |
| `draft_weekly_review_email` | Render the weekly review HTML | Always |

### Tool naming convention

`get_*` for read-only queries. `propose_*` for analysis that suggests an action but doesn't take it. `apply_*` for tools that mutate state via the Google Ads API. `draft_*` for tools that generate client-facing content (emails, reports). `detect_*` for diagnostic checks that return a finding.

This makes the system prompt simpler ("Never call an `apply_*` tool unless the corresponding `propose_*` has been approved by the human") and makes the activity log easier to scan.

## Output Schemas

### Diagnostic report (the Berendsen / MTP style)

```ts
{
  client: { name: string; customerId: string; ga4PropertyId: string }
  reportingWindow: { startDate: string; endDate: string }
  headline: string                       // one-paragraph executive summary
  findings: {
    siteWideEvent?: {                    // optional, only if detected
      detectedMonth: string              // YYYY-MM
      severityPct: number                // % drop
      affectedChannels: string[]
      affectedStates: string[]
      likelyCause: 'website-migration' | 'tagging' | 'other'
      explanation: string
    }
    coverageGap?: {                      // optional, only if detected
      preWindow: { start: string; end: string; days: number; gapClicks: number }
      postWindow: { start: string; end: string; days: number; gapClicks: number }
      gapKeywords: Array<{ keyword: string; preClicks: number; postClicks: number; placementSummary: string }>
      proposedFix: { adGroupAdditions: Array<{ keyword: string; adGroupId: string; matchType: 'PHRASE' | 'BROAD' }> }
      alreadyApplied: boolean
    }
    paidTrajectory: {
      currentMonthSessions: number
      previousMonthSessions: number
      momChangePct: number
      spendDirection: 'up' | 'down' | 'flat'
      narrative: string                  // e.g. "Traffic doubled with $1.6k less spend"
    }
    organicTrajectory: { ... }
    directTrajectory: { ... }
  }
  tables: {
    monthlyTrafficByState: Array<...>
    monthlyChannelBreakdown: Array<...>
    monthlyGoogleCpcByState: Array<...>
  }
  questions: Array<{ id: string; question: string; rationale: string }>
  whatWeDoNext: string[]
  attributionHealthFlag?: { gapPct: number; recommendation: string }
}
```

The agent fills this schema. Your code renders the HTML using the existing template style (Verdana, blue h2s, blue-headed tables, alternating gray rows, no en-dashes).

### Restructure proposal

Same shape as the existing `campaign-proposal-service.ts` output, plus:

```ts
{
  preflightChecks: {
    historicalClickPullCompleted: boolean
    matchTypePolicyEnforced: boolean
    coverageDeltaProjection: { atRiskKeywords: number; mitigated: boolean }
    brandDefencePolicyApplied: boolean
    stateLevelCoverageCheck: { recommendedGeo?: string }
    conversionTrackingPrecondition: { satisfied: boolean; blockers: string[] }
    attributionBaseline: { paidToGa4Ratio: number; flag?: string }
  }
}
```

If `conversionTrackingPrecondition.satisfied` is false, the proposal is held until tracking is fixed. The agent never lets a client go live with a restructure on an account that has no conversion tracking.

### Weekly review

```ts
{
  client: { ... }
  week: { start: string; end: string }
  status: 'green' | 'amber' | 'red'    // green = nothing to report
  alerts: Array<{
    severity: 'info' | 'warn' | 'urgent'
    type: 'spend-pacing' | 'wow-drop' | 'spend-anomaly' | 'coverage-gap' | 'quality-score' | 'disapproval' | 'attribution-health'
    summary: string
    details: object
    proposedAction?: { tool: string; args: object }
  }>
  metrics: { ... }
}
```

If `status` is `green`, no email is sent, just a one-line activity log entry. Avoids alert fatigue.

## System Prompt Sketch

The system prompt is composed by `system-prompt-builder.ts` from:

1. The shared tone-of-voice block (`_shared/tone-of-voice.md`)
2. Agent-specific role: "You are Optimate-Google-Ads. You diagnose campaign performance, propose restructure changes, and draft client-facing reports. You never make a destructive change without human approval."
3. The CMS-stored campaign proposal rules (read at runtime)
4. The hardcoded guardrails block (the same six points listed above, verbatim)
5. The available tools and their purposes
6. Output format expectations: "Always respond with structured JSON conforming to the schema in the active task type. Always reference specific numbers and dates rather than vague language."
7. The standard questions framework

Target length: ~1,500 to 2,000 words. The shared tone-of-voice block is `cache_control: ephemeral` so prompt caching kicks in across the fleet.

## Build Order Specific to This Agent

Building on the existing Phase 0 foundation work in the recommended build order earlier in this document:

1. **Wrap existing analytics services as CanonicalTool definitions.** The diagnostic tools above are all thin wrappers around things that already exist in `server/google-ads-service.ts`, `server/ga4-reporting-service.ts`, etc. This is a one-day exercise.
2. **Add the `read_campaign_proposal_rules` CMS API tool.** Reads the existing `Clients > Google Ads Auto Settings` group plus a new `campaign-proposal-rules` global config (one new collection or one new global with structured fields).
3. **Build the diagnostic playbook tool composer.** A meta-tool that, given a client and a date range, runs the right sequence of read-only tools and assembles the diagnostic JSON. This is the "smart workflow" the agent leans on for the Berendsen / MTP type investigation.
4. **Bake the seven hardcoded guardrails into the system prompt.** Verbatim. Plus add unit tests for "given a draft restructure proposal, does it pass each guardrail check".
5. **Build the report renderer.** Takes the diagnostic JSON output schema and renders the HTML email using the template style established with Berendsen / MTP. Every table cell renders without en-dashes (commas/colons/separate sentences instead, per global writing rule).
6. **Build the approval queue routing.** Every `propose_*` tool output goes to `agent-approval-queue` with the proposed action serialised. On approval, the corresponding `apply_*` tool runs.
7. **Wire up chat mode** via Pocket Agent or in-CMS chat. Same agent, just triggered by a message rather than a cron.
8. **Wire up autonomous mode** via the existing scheduler in `server/index.ts` (the OptiMate scheduler already runs every 12 hours; weekly review can hook into the same path with a different cron).
9. **Run shadow mode for two weeks.** The agent generates reports and proposed actions but every action is held in the approval queue and you compare its output against what you would have done manually. Calibration period.
10. **Promote to production.** Auto-actions enabled for clients who opt in (auto-pause for spend anomalies only, in the first phase). All other actions remain approval-gated.

## What This Agent Inherits From Existing Growth Tools Code

To avoid building the same thing twice, here's the existing-code map:

| What the agent needs | Already exists in |
|---|---|
| Pull keyword performance | `server/google-ads-service.ts` `query()` method |
| Pull search terms | `server/google-ads-service.ts` |
| Pull active campaign/ad-group structure | `server/google-ads-service.ts` |
| GA4 region / channel / source-medium queries | `server/ga4-reporting-service.ts` (uses GA4 Data API) |
| Apply phrase-match keyword additions | New, but the pattern matches `addNegativeKeywords` in `google-ads-service.ts` (mutate API via `googleAds:mutate`) |
| Apply negative keywords | `server/google-ads-negatives-service.ts` |
| Pause campaigns | `server/google-ads-service.ts` (already has `pauseCampaigns`) |
| Generate the campaign proposal output | `server/campaign-proposal-service.ts` (~3,000 lines, business-type engine, naming convention, keyword classification, geo modifiers, ad-group consolidation) |
| Render diagnostic email HTML | New, but mirrors the email-generator pattern in `server/google-ads-email-generator.ts` |
| Approval queue | `agent-approval-queue` collection (to be added in Phase 0) |
| Activity log | Existing `activity-log` collection in CMS |
| Run via cron | Existing scheduler in `server/index.ts` |

The new code is mostly the agent loop, the tool wrappers, the diagnostic playbook composer, the guardrail layer, and the report renderer. Everything else is calling code that's already shipped.

## Pre-Build Inventory: What Already Exists

Before writing a line of new code we need to be honest about what's already shipped, because a lot is. There is **already a working "OptiMate" Google Ads chat feature** in production. It does not match the agent architecture in this plan, but its UI and most of its data-fetching wrappers are reusable. Confronting this upfront avoids building two parallel systems that drift.

### What's already deployed today

**In `content-cms` (the CMS, on Vercel):**

- `src/components/GoogleAdsChat.tsx` (~250 lines) — a polished React chat surface embedded in the Google Ads audit admin page. Renders markdown, suggested questions ("How is my budget pacing this month?"), message history, typing states.
- `src/app/(frontend)/api/google-ads-audits/[id]/chat/route.ts` (~100 lines) — a thin proxy that takes the chat request, looks up the audit's `customerId` from Payload, forwards to Growth Tools.

**In `website-growth-tools` (separate Express service):**

- `server/routes.ts` lines ~9429–9600 — the actual chat brain. Builds a context block by fetching campaigns, MTD spend, last-MTD spend, monthly performance, conversion breakdown, and (optionally, by regex match on the message) keywords + search terms. Stuffs it into a system prompt that introduces itself as **"OptiMate, a Google Ads specialist at Optimise Digital"**. Calls Moonshot's `moonshot-v1-32k` model with the bundle and the user's question. Returns the reply.
- A 5-minute in-memory context cache keyed by `{customerId}:{sessionId}` so follow-up questions don't re-fetch.
- Custom date-range detection that runs on every message regardless of cache state.

### What this is, architecturally

**It is RAG, not an agent.** One LLM call per question. The server pre-decides what data to fetch (using regex on the message), packs it all into the system prompt upfront, and the model reasons over a static context block. The model has no tools, cannot iterate, cannot say "I need search terms now, then keywords next" — the server made those decisions before the model ran.

This works fine for one-shot questions like "how's my pacing" or "which campaigns are spending the most". It cannot do multi-step diagnostics like the Berendsen / MTP investigation flow described earlier in this document, because that flow requires the model to look at the data, decide what to look at next, look at *that*, and so on. RAG can't do conditional fetching mid-thought.

### Overlap matrix: existing OptiMate vs planned Optimate-Google-Ads

| Plan calls for | Already have | Reusable | Action |
|---|---|---|---|
| Chat mode (Mode 1) UI | `GoogleAdsChat.tsx` | ✅ As-is | Keep, repoint its fetch URL |
| Chat mode (Mode 1) brain | `routes.ts` 9429–9600 (RAG, single call, Moonshot only) | ❌ Architecture mismatch | Replace with agent loop |
| Autonomous mode (Mode 2, weekly cron) | Nothing | — | Build new |
| Tool wrapper: `get_google_ads_monthly_summary` | `googleAdsService.getCampaignMetricsByDate` | ✅ Direct | Wrap as `CanonicalTool` |
| Tool wrapper: `get_google_ads_keyword_performance` | `googleAdsService.getKeywords` | ✅ Direct | Wrap as `CanonicalTool` |
| Tool wrapper: `get_google_ads_search_terms` | `googleAdsService.getSearchTerms` | ✅ Direct | Wrap as `CanonicalTool` |
| Tool wrapper: `get_google_ads_active_structure` | `googleAdsService.getCampaigns` | ✅ Direct | Wrap as `CanonicalTool` |
| Tool wrapper: `compare_matched_windows` | None (we run this manually in chat threads) | ⚠️ Logic exists in our heads | Build composite tool |
| Tool wrapper: `get_ga4_*` (4 tools) | `ga4-reporting-service.ts` | ✅ Direct | Wrap each as `CanonicalTool` |
| Tool wrapper: `propose_phrase_match_additions` | `campaign-proposal-service.ts` | ✅ Strong | Wrap, plus add pre-flight checks |
| Tool wrapper: `apply_phrase_match_additions` | Pattern in `addNegativeKeywords` | ✅ Pattern | New tool, follow the pattern |
| Tool wrapper: `apply_negative_keywords` | `google-ads-negatives-service.ts` | ✅ Direct | Wrap as `CanonicalTool` |
| Multi-provider auth (OAuth Anthropic + API key Kimi/MiniMax) | Hardcoded Moonshot key, single provider, no fallback | ❌ None | Build per Phase 0 |
| Approval queue routing | None | — | Build new |
| Activity log entries with reasoning panel | None (just `console.log`) | — | Build new |
| System prompt with shared tone-of-voice | Inline hardcoded string in `routes.ts` | ⚠️ Exists, isolated | Replace with `system-prompt-builder.ts` |
| Diagnostic report renderer (Berendsen six-section style) | `google-ads-email-generator.ts` (audit format only) | 🟡 Pattern exists | New renderer for diagnostic schema |
| 5-minute context cache | In-memory `chatContextCache` map | 🟡 Conceptually right, wrong layer | Move to per-tool caching at the `CanonicalTool` level |
| Custom date-range detection (`detectChatDateRange`) | Implemented in `routes.ts` | ✅ Useful | Promote to a shared utility, agent picks it up via tool |
| Suggested questions in chat UI | Hardcoded in `GoogleAdsChat.tsx` | ✅ Reusable | Keep; agent doesn't need to change anything |

### The two architectural mismatches that matter

1. **RAG vs agent loop.** The current OptiMate fetches a fixed bundle, calls the LLM once, returns. The planned Optimate-Google-Ads has a `runAgent()` loop where the LLM calls tools iteratively and decides its own path. This is a fundamental shape change; you cannot incrementally upgrade RAG into an agent. The new agent has to be built fresh, then the existing chat surface is repointed at it.
2. **Brain location.** The OptiMate brain lives in `website-growth-tools` (separate Express service on Replit/its own infra). The plan puts the agent in `content-cms/src/lib/agents/`, calling the LLM from inside the CMS where it sits next to the credential layer, the approval queue, and the activity log. After migration, Growth Tools' `/api/google-ads/chat` endpoint becomes deprecated and gets deleted.

### Migration path (recommended): repoint the chat surface, replace the brain

This is the cleanest of the three options I considered (the others were "keep both, run in parallel" — wasteful, and "rip everything and start over" — unnecessary).

**Phase 3a — Build the new brain in the CMS:**

1. Wrap the data-fetching services as `CanonicalTool` definitions per the inventory above (mostly mechanical — each tool is a Zod schema + a thin function call wrapping an existing service method).
2. Build `runOptimateGoogleAds({ mode: 'chat' | 'autonomous', ... })` per the plan, using the Phase 0 agent loop.
3. Build a new CMS API route `src/app/(frontend)/api/agents/google-ads/chat/route.ts` that calls `runOptimateGoogleAds({ mode: 'chat', message, history, customerId })` and streams or returns the response.

**Phase 3b — Repoint the existing UI:**

4. In `GoogleAdsChat.tsx` line 205, change the fetch URL from `/api/google-ads-audits/${id}/chat` to `/api/agents/google-ads/chat` (passing `customerId` directly rather than relying on the audit-doc lookup, since the new agent is audit-agnostic).
5. Run both endpoints in parallel for two weeks under feature flag, comparing answers on the same questions to validate the new agent matches or beats the old chat. This is the "shadow mode" already specified in the agent build order — the chat migration is the natural way to do it.

**Phase 3c — Deprecate the old code:**

6. Delete `src/app/(frontend)/api/google-ads-audits/[id]/chat/route.ts` (the CMS proxy).
7. Delete the chat route in `website-growth-tools/server/routes.ts` lines ~9429–9600 (about 250 lines including the schema and helpers). Keep `googleAdsService.*` methods because the new agent's tool wrappers call them remotely via Growth Tools' existing data endpoints — *unless* we also migrate the Google Ads service into the CMS, which is a separate decision (see below).
8. Remove `MOONSHOT_API_KEY` from Growth Tools' env if it's not used anywhere else.
9. Update `serve.json` and any docs referencing the old chat endpoint.

### Open architectural decision: where do the Google Ads service methods live long-term

Today's split is: CMS owns the user-facing surface; Growth Tools owns the Google Ads API integration (`googleAdsService.*`, `campaignProposalService.*`, etc.). The new agent in the CMS will call those service methods over HTTP from inside its tool wrappers. That works, but adds one extra network hop on every tool call.

Three options for resolving this, in order of effort:

- **Option A (do today): leave the services in Growth Tools.** Tool wrappers in the CMS call Growth Tools endpoints. Adds latency but minimises change. Likely correct for now — those services are 3,000+ lines and have their own ecosystem of routes, tests, and CSV exports that aren't agent-related.
- **Option B (3–6 months out): extract the Google Ads service as a shared package.** Either as a private npm package or a workspace package in a monorepo. Both Growth Tools and the CMS import it. No HTTP hop, but introduces a build/publish step.
- **Option C (1+ years out): consolidate Growth Tools into the CMS.** Bring the relevant services across. Drastic but cleanest. Only worth doing if Growth Tools as a separate product stops making sense.

My recommendation: **Option A for the agent build**. Don't let architectural perfection block agent delivery. Revisit when the agent is in production for 2–3 months and we have data on whether the network hop matters in practice.

### Pieces of the existing OptiMate worth keeping verbatim

Not everything in the existing chat is wrong-shaped. These specific pieces should be preserved (and lifted into the new code rather than re-derived):

- **The system-prompt rules block.** Lines like "ONLY use data explicitly provided below. Never extrapolate, estimate, or infer numbers for date ranges not covered by the data" and "If the data shows 0 or no rows for a period, say so clearly — the account may not have been active." These are battle-tested, hallucination-preventing instructions. Lift them verbatim into `_shared/tone-of-voice.md` (or a Google-Ads-specific addendum) so the new agent inherits them.
- **`detectChatDateRange()`.** The function that parses "last month", "April vs March", "week of X", etc. into start/end/compare windows. Used by every diagnostic flow. Promote to a shared utility under `src/lib/agents/_shared/date-range-parser.ts` (or similar). Re-used by the agent's date-aware tools.
- **The data-source labelling.** The existing chat returns a `dataSources: string[]` array (e.g. `["budget_audit", "monthly_comparison", "keywords"]`) so the UI can show "answered from: budget audit + keywords". Keep this. The new agent should populate it from which tool calls actually executed in the run.
- **The 5-minute context cache concept.** Don't keep its current implementation (an in-memory map in a long-running Node process — doesn't fit Vercel's stateless functions), but the *concept* of caching per-customer baseline data for 5 minutes across follow-up questions in a chat session is correct. Reimplement in Vercel KV keyed by `customerId:sessionId`, expire after 5 minutes, populated by the read-only diagnostic tools when the agent calls them.

### Naming and branding

The existing chat already calls itself **OptiMate** (no hyphen, capital M). The build plan uses **Optimate** (no hyphen, lowercase 'm') and **Optimate-Google-Ads** for the agent file/code name.

Recommendation: **standardise on "Optimate"** going forward (all lowercase except first letter), with the fleet members named `Optimate-Proposal`, `Optimate-Accounting`, `Optimate-Google-Ads`, etc. Update the existing chat's system prompt during the migration so the user-facing name aligns. The rename is invisible to clients (chat is internal-only per Build Decision 3) so there's no comms cost.

### What this means for the build order

The Phase 3 (Optimate-Google-Ads) build steps in the main "Recommended Build Order" section above stay the same in spirit but should be read with this overlay:

- Step 12 ("Build Google Ads weekly review template") — net new, no overlap.
- Step 13 ("Build optimisation recommendation template") — net new.
- Step 14 ("Add `google-ads-weekly-reviews`, `optimisation-recommendations` collections") — net new.
- Step 15 ("Build Optimate-Google-Ads agent") — substitute "build the new agent and migrate the existing OptiMate chat to use it (Phase 3a/3b/3c above)" for what was previously a single bullet. The migration is part of the build, not an afterthought.

## Build Decisions (Resolved)

### 1. CMS rules collection structure: single config global, modelled on existing CMS patterns

A single config global holds the campaign proposal rules. **Re-use the existing CMS collection patterns rather than inventing a new shape.** The grouped-field structure already used in `Clients > gadsAuto` and the tabbed structure already used in `GoogleAdsAudits` are the templates the agent's rules global should follow.

Specifically:
- **Use the existing `Clients > gadsAuto` field group as the pattern** for per-client overrides (e.g. an individual client can override the default match-type policy for their account).
- **Add a new global** called `campaign-proposal-config` (or extend an appropriate existing global if one fits, see below) with grouped fields mirroring the section structure of `campaign-proposal-service.ts`:
  - Naming Convention
  - Match-Type Policy (defaults + per-volume thresholds)
  - Keyword Classification (brand words, generic brand words, geo modifiers)
  - Industry Engine Configs (the array of business-type configs)
  - Service-Splitting Thresholds
  - Budget Allocation Defaults
  - Standard Client-Questions Library
- **Tabs, not separate collections,** so the whole rule set is editable in one admin page.
- **Do not duplicate fields** between this global and `Clients > gadsAuto`. The global holds defaults; the per-client group holds overrides only.

The agent's `read_campaign_proposal_rules` tool reads the global on every run and merges in any client-specific override from `Clients > gadsAuto`. Write the merge logic once in `_shared/campaign-proposal-rules.ts`.

If `industry-engine-configs` outgrows one tab in 6 to 12 months, split it out into a dedicated `industry-engine-configs` collection at that point. Don't pre-emptively split.

### 2. Industry-specific engine configs: agent drafts, human approves (raise to review)

When the agent encounters a vertical it doesn't have a config for:

1. The agent crawls the site and drafts a proposed engine config (brand words, industry companions regex, geo modifiers, business-type inference).
2. The draft is routed to the `agent-approval-queue` with the proposed config and a summary of how the agent inferred each part.
3. You review, tweak, approve. The approved config is written to the `industry-engine-configs` field group of the campaign proposal global.
4. From that point on, every future client in the same vertical re-uses the approved config without re-review.

So the human-review cost is paid **once per vertical, not once per client**. Approve hydraulics once and every future hydraulics client uses it.

Revisit in 6 months: once 10+ vertical configs exist, the agent likely has enough examples to infer new configs autonomously with high confidence. At that point flip to "auto-draft, auto-apply if the agent's confidence score is above 0.85, else raise for review."

### 3. Chat mode access: internal-only

Only you and your team can chat with the agent. Clients receive the outputs (diagnostic reports, weekly reviews, recommendation emails) but cannot directly query the agent.

Implications:
- No PIN-gated client chat to build, no per-client rate limiting, no prompt-injection defence specifically for client-facing input.
- The chat surface is internal-only (likely Pocket Agent in the CMS, or an admin-only chat page).
- Saves significant build time. Removes a class of security risks. Lets us calibrate the agent's chat behaviour without the audience pressure of a client on the other end.

Revisit once the agent has been stable internally for 2 to 3 months. If at that point you want to give one friendly client beta access, the build cost is incremental rather than upfront.

### 4. Audit trail: log tool calls AND reasoning

Every activity-log entry includes both:
- The structured tool call (tool name, input args, output, timestamp, model that served it)
- A collapsible "Show reasoning" panel with the LLM's natural-language thinking between tool calls

UI rules:
- Reasoning is **collapsed by default** so the activity log stays scannable.
- Reasoning is **internal-only**, never rendered to a client surface, even if chat mode opens to clients later.
- Storage cost is trivial; the value when debugging "why did the agent propose this" is large.

Specifically, each activity-log entry shape:

```ts
{
  agentRun: string                    // run id
  step: number
  type: 'tool-call' | 'reasoning' | 'final-output'
  toolName?: string
  input?: object
  output?: object
  reasoning?: string                  // hidden by default in admin UI
  model: string                       // which provider/model served this step
  timestamp: string
}
```

Reasoning entries get a separate `type` so they can be toggled on/off in the admin view independently of tool calls.

### 5. Two report templates: similar visual identity, different tone

Two renderers, both consuming the same structured JSON output from the agent:

- **`diagnostic-report-client.html`**: the Berendsen / MTP style. Verdana, blue h2s, blue-headed tables, alternating gray rows, six numbered sections, brand-toned prose. Goes to clients.
- **`weekly-review-internal.md`** or **`weekly-review-internal.html`**: shares the same visual identity (same fonts, same table styling, same colour palette so it doesn't look like a different system) but **a different copy register**: terser, more direct, more bullet-pointed, less preamble, no "thanks for flagging this", no rhetorical bridges. Reads like an internal memo, not a client-facing report.

The reason for keeping the visual identity similar but the writing different: when you eventually want to forward an internal weekly review on to a client (or repurpose one for client reporting), the visual continuity makes the conversion seamless, but the prose still needs polishing because it's intentionally written terser. This avoids the failure mode where every report feels template-filled and robotic to read.

Same agent, same JSON output, two renderers, two prose styles. The agent's `draft_*` tools take a `template: 'client' | 'internal'` parameter that selects the renderer.

---

That resolves all five upfront decisions. The remaining items in the build order can now be specified concretely without further blocking input.

---

## Optimisation Patterns Library (Seeded From Real Account Work)

Every pattern below was identified by analysing live client accounts (Berendsen and MTP, May 2026). They are the rules the agent should encode into its diagnostic playbook. Each pattern has the same shape:

- **Detect:** the data signal that surfaces the pattern
- **Example:** what we found in real accounts
- **Recommendation:** what the agent proposes when it finds this

The agent runs all of these on every diagnostic run. It surfaces only the ones that hit a threshold, ranked by either total spend at risk or potential conversion uplift.

### Category A: Landing Page Quality Patterns

#### A1. LP receiving high spend with zero conversions

- **Detect:** any landing page with cost over a threshold (default $200 in 25 days) AND zero conversions in the same window. Soft threshold scales with the account's overall spend.
- **Example:** Berendsen `/service-repair/` spent $1,889 in 25 days with 0 conversions. The single biggest cost-no-return page in the account.
- **Recommendation:** propose a CRO audit on the page. Specifically check: above-fold CTA presence, mobile click-to-call button, form length and friction, trust signals (reviews, accreditations), page load speed, and whether the page actually addresses the search intent of the keywords driving traffic to it (see A2).

#### A2. LP-to-search-intent semantic mismatch

- **Detect:** for each top LP, pull the top 10 search terms that drove traffic. Compare the noun phrases in the search terms against the headline copy of the page. Flag terms that represent a clear semantic gap.
- **Example:** Berendsen `/hard-chrome-plating/` had 41 clicks across "chrome plating", "re-chroming", "chrome dipping", "chrome platers", "electroplating chrome", "chrome repairs", but the page is titled "Hard Chrome Plating" only. Users searching for re-chroming or electroplating may not see themselves in the copy.
- **Recommendation:** propose synonym expansion in page copy. Add a short FAQ-style block "What's re-chroming? Can I get chrome repairs?" that uses the searcher's vocabulary explicitly. Mention the variant terms in the H2s and meta description.

#### A3. Geo-modified queries landing on a non-geo page

- **Detect:** for each top LP, count search terms with city/state modifiers (Sydney, Perth, Melbourne, Adelaide, Newcastle, Brisbane, Toowoomba, Bundaberg, Gold Coast, etc.) or "near me". If geo-modified queries make up over 30% of the LP's traffic but the LP is not geo-specific, flag it.
- **Example:** Berendsen `/service-repair/` (national service page) received "hydraulic repairs near me" (40 clicks), "hydraulic ram repairs near me" (23), "hydraulic cylinder repairs near me" (20), "hydraulic cylinder repair near me" (7) - combined ~90 "near me" clicks with no city-specific response on the page.
- **Recommendation:** either (a) add a prominent branch-locator widget to the page that uses the visitor's IP/location to surface the nearest branch, or (b) split the campaign so geo-modified queries route to dedicated city LPs (`/service-repair-sydney/` etc.). Both, ideally.

#### A4. Adjacent-service vocabulary leaking into a single-service page

- **Detect:** search terms for related but distinct services hitting one page that doesn't mention them.
- **Example:** Berendsen `/hydraulic-system-design/` getting "hydraulic engineer" (5 across cities), "hydraulic consultants" (1), "hydraulic drafting" (1), "hydraulic design engineers" (1), all related to engineering services, but the page only talks about "system design".
- **Recommendation:** broaden the page copy to cover the adjacent service vocabulary (engineering, consulting, drafting), or split into separate pages if the services are genuinely distinct.

#### A5. Underutilised high-converting LP (capacity to scale)

- **Detect:** LP with high conversion rate (over 10%) but low click volume (under 50 in the window).
- **Example:** Berendsen `/product-category/valves/`, 16.7% CvR, $12 CPA, only 12 clicks. Underutilised.
- **Recommendation:** check the feeding ad group's `search_budget_lost_impression_share`. If high, recommend bumping campaign budget. If low, recommend bid uplift on the relevant keywords. Either way, scale this page's traffic.

#### A6. Branded query landing on a non-brand page

- **Detect:** own-brand search terms (the client's own business name and variants) firing ads in non-brand ad groups.
- **Example:** Berendsen, 142 own-brand clicks in 25 days fired in non-brand ad groups across Generic_Products_Hydraulic-Components and beyond. The brand search "berendsen fluid power" alone landed on `/product-category/cylinders/`, `/service-repair/`, `/brand/danfoss-power-solutions/`, `/product-category/valves/`, `/product-category/motors/`, and `/product-category/accessories/` depending on auction.
- **Recommendation:** see B3 (brand-defence structural fix). Beyond the structure fix, decide whether the brand should land on a single dedicated LP (homepage, about page, or new brand LP) and route there explicitly.

### Category B: Campaign Structure Patterns

#### B1. Country-targeted campaign serving "near me" queries

- **Detect:** a country-targeted campaign (geo target = Australia) serving "near me" or city-modified queries. The user is in one specific city, but the ad and LP they receive are nationally generic.
- **Example:** Berendsen has all campaigns targeting "Australia". A user in Perth searching "hydraulic ram repairs near me" gets the same ad as a user in Sydney, served against the same generic `/service-repair/` page.
- **Recommendation:** restructure to **state-level campaigns** (NSW, VIC, QLD, WA, SA) for service categories where local relevance matters. Phrase-match keywords with "near me" plus the state's cities should sit in the corresponding state campaign, with a state-specific LP and ad copy that mentions the city. National generic campaigns should add **negative phrase-match for "near me"** to prevent overlap.

#### B2. Geo-modified queries captured by wrong-intent ad group

- **Detect:** geo-modified service queries firing in product-category or unrelated ad groups because no dedicated location campaign covers that geo.
- **Example:** Berendsen's "hydraulic repairs gold coast" fired in `Generic_Products_Hydraulic-Components > Hydraulic-Motors` because there's no Gold Coast / QLD service campaign. The user lands on `/product-category/motors/` instead of a service LP.
- **Recommendation:** create state-level service campaigns and add the city/region modifiers as keywords there. Add the same modifiers as negatives in the product-category campaigns so they don't pick up service-intent geo queries.

#### B3. Branded queries firing in non-brand ad groups (structural)

- **Detect:** combination of (a) own-brand terms appearing as top search terms in non-brand ad groups, AND (b) the account having no dedicated own-brand ad group / campaign with positive exact-match on those terms, AND (c) no shared negative list applied to non-brand campaigns containing those terms.
- **Example:** Berendsen has the third-party `Brand_Product` campaign (Parker, Danfoss, etc.) but no own-brand ad group. Own-brand terms ("berendsen", "berendsen fluid power", etc.) leak across all other ad groups.
- **Recommendation:** create a dedicated own-brand ad group inside the brand campaign with positive exact + phrase on the business name and known variants, point to a dedicated brand LP. Then create a shared negative list with those exact terms and subscribe only the non-brand campaigns to it.

#### B4. High rank-lost impression share = bid or QS issue, not budget

- **Detect:** campaigns with `search_rank_lost_impression_share` over 20% AND budget headroom (low budget-lost share).
- **Example:** Berendsen `Generic_Services_Location` 22.7% rank-lost; `Generic_Services_Hydraulics` 54.9%; `Generic_Services_Manufacturing` 65.2%; `Generic_Services_Repair-Maintenance` 42.1%.
- **Recommendation:** these don't need budget bumps; they need bid increases, ad copy improvements, or Quality Score work (relevance, expected CTR, landing page experience). Surface QS by component.

#### B5. Campaigns spending heavily with zero conversions

- **Detect:** any campaign with cost over a threshold AND zero conversions over the analysis window. Different from A1 (page-level), this is campaign-level.
- **Example:** Berendsen `Generic_Services_Repair-Maintenance` ($95/day, $2,020 spent in 25 days, 0 conversions) and `Display_remarketing_ga4-all-users` ($42/day, $521 spent, 0 conversions).
- **Recommendation:** for the search campaign, run a combined LP-and-keyword audit. For Display, evaluate view-through and assist-conversion contribution; if neither is meaningful, propose pausing or significantly reducing spend.

### Category C: Negative Keyword and List Hygiene Patterns

#### C1. Brand-defence list contains misspellings only

- **Detect:** the existence of a "brand defence" or similarly-named negative list, with content limited to misspellings or variants of the brand name (i.e. it does NOT contain the correct-spelling primary brand term).
- **Example:** Berendsen has a list called `[OD] Brand Campaign Negative list` containing 10 misspellings (berensen, brendsen, berendson, etc.) but not "berendsen" or "berendsen fluid power" themselves.
- **Recommendation:** the misspellings list is half-built. Add a separate shared list (`Own-Brand Phrase Negatives`) containing the correct-spelling brand terms as phrase-match negatives. Subscribe only non-brand campaigns to it. Confirm the own-brand ad group has positive bids on the same terms (see B3) so the brand campaign can still serve them.

#### C2. Campaigns missing subscription to mandatory shared lists

- **Detect:** any enabled campaign that doesn't subscribe to the agency-wide standard list set (account-wide negatives, brand defence list).
- **Example:** Berendsen `Display_remarketing_ga4-all-users` subscribed to no shared lists.
- **Recommendation:** add the campaign to the standard list set. Consider a CMS-stored "mandatory subscriptions" rule that the agent enforces on every weekly review.

#### C3. Competitor brand leakage

- **Detect:** known competitor brand names firing as search terms (clicks over 1, cost over $5 in the window).
- **Example:** Berendsen had `hare and forbes`, `hare & forbes`, `hare and forbes machinery` (a competing manufacturing supplier brand) firing in the manufacturing ad group.
- **Recommendation:** add the competitor brand as exact and phrase-match negative at the campaign level (or to a "Competitor Brand Negatives" shared list). Maintain a per-vertical competitor-brand list in the CMS so the agent can flag new ones automatically.

#### C4. Generic terms appearing as expensive non-converting search terms

- **Detect:** any single search term over a cost threshold (default $30) with zero conversions over the window, that isn't already in the negatives list.
- **Recommendation:** review for negative-keyword candidacy. The agent can propose with rationale: "Search term `X` cost $Y across N clicks with 0 conversions; recommend adding as phrase negative."

### Category D: Budget and Spend Allocation Patterns

#### D1. Budget-constrained converting campaign (the gain side of a re-allocation)

- **Detect:** campaigns where ALL of the following are true:
  - `metrics.conversions > minConvThreshold` (default 5 in window)
  - `search_budget_lost_impression_share > minBudgetLostPct` (default 0.10)
  - `search_rank_lost_impression_share < maxRankLostPct` (default 0.20), to exclude rank-bound disguised as budget-bound
  - Campaign age > 30 days, to exclude immature campaigns where conversion data isn't trustworthy
  - Campaign is enabled in CMS budget management (not paused or excluded)
- **Example:** Berendsen `Generic_Products_Hydraulic-Components` ($27/day budget, $20 CPA, 18 conversions in 25 days, 79.2% impression share lost to budget).
- **Recommendation:** D1 is **not** a standalone "uplift this campaign" recommendation. It's the **gain side** of a re-allocation. The agent pairs every D1 hit with one or more loss candidates from B5 (campaigns spending heavily with zero conversions) and proposes a zero-sum re-allocation within the client's CMS-stored monthly budget cap. The gain campaign's allocation percentage goes up, the loss campaign(s) come down, the total stays inside the cap. See "Agent Tool Deep Dive: Budget Re-allocation" below for the full sizing logic, guardrails, and CMS integration.

#### D2. Spend spike with no proportionate conversion lift

- **Detect:** week-over-week spend up over 30% but conversions flat or down. Catches campaigns that shift to broader matching or experiment with a new strategy that's burning money.
- **Recommendation:** revert the change, or surface the underlying search terms that absorbed the new spend so the team can decide.

#### D3. Underspending campaign with capacity

- **Detect:** campaign spending under 50% of its daily budget AND impression share under 80% AND has historic conversion data.
- **Recommendation:** check bid strategy. Often this is "Maximise Conversions" undersaturated against a low conversion volume, and needs either bid uplift or strategy change.

#### D4. Mid-month overspend pace (the silent budget killer)

- **Detect:** at any point during the month, MTD spend exceeds expected pace by more than `paceOverThresholdPct` (default 20%). Expected pace = `daysElapsed / daysInMonth × monthlyCap`. If actual MTD > expected × 1.20, the account will overshoot the monthly cap unless daily budgets are recalibrated.
- **Example:** Berendsen / MTP, May 2026: $5,000 monthly cap, 5 days elapsed → expected pace $806 → actual MTD $2,437 (3x over). Even after pushing the standard `monthlyCap × pct / 30.4` daily budgets, end-of-month would have overshot by $108. The CMS budget-management UI does correctly compute `(monthlyCap - mtdSpend) × pct / daysRemaining` via its `calculateSmartDailyBudget` helper, but only if a human opens the UI and clicks Push to Google Ads. Without that, daily budgets in Google Ads stay at whatever was last pushed and continue overspending.
- **Recommendation:** the agent owns this entirely. Three actions:
  1. **Daily check** during the month. When MTD pace exceeds the threshold, compute the corrected daily budgets per `(monthlyCap - mtdSpend) × pct / daysRemaining` and route to approval queue (or auto-apply if the client has opted in).
  2. **Month-boundary push on the 1st of every month**. Recalculate daily budgets from a fresh full-month view, push to Google Ads. No human needs to remember.
  3. **Mid-month cap change handler.** When a human changes the monthly cap mid-month, the agent recomputes the right remaining-days daily budgets and pushes immediately.

This is paired with a separate hardcoded guardrail: the agent's Push tool ALWAYS uses the smart-sizing formula (`remainingBudget / daysRemaining`), never the naive `monthlyCap / 30.4`. So even when triggered manually mid-month, the push respects MTD spend automatically.

### Category E: Conversion Tracking Health Patterns

#### E1. Google Ads vs GA4 attribution gap

- **Detect:** Google Ads platform clicks vs GA4 google/cpc sessions over the same period. If GA4 captures less than 70% of Google Ads clicks as `google / cpc`, flag it.
- **Example:** MTP recorded 1,485 paid clicks via the Google Ads API across Jan to early April; GA4 recorded only 279 google/cpc sessions across the same period. Roughly 1 in 5 capture rate.
- **Recommendation:** GCLID auto-tagging health check. Verify the GA4 to Google Ads link, verify the site isn't stripping the `gclid` parameter on redirects, verify the gtag fires on all landing pages.

#### E2. Conversion tracking absent on previous account before restructure

- **Detect:** the account being restructured has no conversion tracking enabled prior to the restructure.
- **Example:** Berendsen had no conversion tracking before 10 April; we set it up as part of the restructure. This means we cannot compare new vs old conversion performance, only clicks.
- **Recommendation:** flag this caveat in every diagnostic for the first 90 days post-restructure. After 90 days, the new-structure data is mature enough to stand on its own.

### Category F: Account Site-Wide Patterns

#### F1. Uniform multi-channel multi-state traffic collapse in a single month

- **Detect:** look across the last 18 months of GA4 data for any month where total sessions dropped over 50% AND every state collapsed AND every default channel group collapsed simultaneously.
- **Example:** Berendsen August 2025 (NSW down 72%, every state similar, every channel down 60% to 80%). MTP August 2025 (total down 99.6% to 8 sessions). Site-wide event signature.
- **Recommendation:** this is a website migration without an SEO migration plan, until proven otherwise. Surface as the highest-priority finding because it dominates any campaign-level recommendation.

### How These Patterns Drive the Agent

The agent's diagnostic run is the union of these patterns. On any given account, it executes all detection rules in parallel, surfaces only the patterns that hit thresholds, ranks by either spend at risk or conversion uplift, and packages the findings into the diagnostic JSON output. The recommendations sit in the structured output unbundled so the renderer (client report or internal weekly review) can include or exclude them by category as appropriate.

New patterns are added to this library whenever the team identifies one in real-world client work. Each pattern, once added, is automatically applied to every future client diagnostic. The library grows as the agency's diagnostic vocabulary grows.

---

## Agent Tool Deep Dive: Landing Page Relevance Audit

This is the first concrete agent tool we're specifying in detail, derived from the Berendsen optimisation work in May 2026. It became clear during that work that recommendations made without actually reading the live landing page are guesswork; the agent must fetch and inspect each page before recommending changes. This tool wraps that flow.

### When the tool runs

- **Monthly cadence** per active client, after at least 30 days of post-restructure data has accumulated. Earlier runs produce noisy recommendations because exact-match keywords haven't built impression history yet.
- **On-demand** via chat mode when an internal user asks "audit the top landing pages for [client]" or similar.
- **Triggered by other agent runs** when the diagnostic playbook detects pattern A1 (landing page receiving high spend with zero conversions).

### What the tool does, end to end

For a given Google Ads customer ID and analysis window:

1. **Pull the top N landing pages by spend** (default N = 5) over the window via the Google Ads `landing_page_view` resource. Default window is 25 to 30 days.
2. **For each landing page**, in parallel:
   1. **Fetch the live page** via WebFetch (or Scrapling for harder targets), extracting structured signals: H1 text, hero subheading, all H2/H3 headings, presence and field-list of any forms, presence and href of any phone numbers (specifically `tel:` links), presence of branch locator widgets, presence of part catalogues or similar, count of links, evidence of broken sections (loading placeholders, "currently not available" messages, non-functional reset buttons).
   2. **Pull the ad copy** (Responsive Search Ad headlines + descriptions + final URLs) from every enabled ad group whose ads point to this landing page, via `ad_group_ad` query.
   3. **Pull the top 10 search terms** that drove traffic to this landing page in the window, via `search_term_view` aggregated by ad group, then traced to landing page via the ad's final URL.
3. **Cross-reference the three data sources** to find:
   - **Vocabulary mismatch**: search-term noun phrases not present in page headings or body
   - **Geo mismatch**: city or "near me" search terms with no city/locator response on the page
   - **Form mismatch**: ad copy promising "Get a Free Quote" / "Request Quote" with no quote form on the destination page
   - **CTA mismatch**: ad copy promising click-to-call but the landing page has no `tel:` link near the fold
   - **URL typo**: any ad final URL that doesn't resolve, returns 4xx, or differs from the same ad group's other final URLs by more than a Levenshtein distance of 2 characters (catches typos like "rexroth" vs "rexorth")
   - **Broken page elements**: empty product loaders, "currently unavailable" copy, non-functional buttons surfaced by the page-fetch step
   - **Geo-irrelevant H1**: H1 mentions a single city ("...in Melbourne") but the URL is national (i.e. no city in the path)
4. **Generate a per-page recommendation block** for each landing page, in the structured output schema (see below).

### Tool definition (CanonicalTool shape)

```ts
const landingPageRelevanceAudit: CanonicalTool = {
  name: 'audit_landing_page_relevance',
  description: 'For a given Google Ads customer, audits the top N landing pages by spend by fetching each page, comparing its content against the ad copy serving it and the search terms users typed, and producing per-page recommendations for copy, forms, CTAs, and ad/URL fixes.',
  parameters: z.object({
    customerId: z.string(),
    startDate: z.string(),     // YYYY-MM-DD
    endDate: z.string(),       // YYYY-MM-DD
    topN: z.number().default(5),
    minSpendForAudit: z.number().default(100),
    template: z.enum(['client', 'internal']).default('internal'),
  }),
  execute: async (args, ctx) => {
    // 1. Top-N LPs by spend (Google Ads API)
    const topLps = await getTopLandingPagesBySpend(args.customerId, args.startDate, args.endDate, args.topN, args.minSpendForAudit)
    // 2 + 3. For each LP: fetch page + ad copy + search terms in parallel
    const audits = await Promise.all(topLps.map(lp => auditLandingPage(args.customerId, lp, args.startDate, args.endDate)))
    // 4. Findings + recommendations
    const findings = audits.map(generateFindings)
    return { audits, findings, summary: summariseFindings(findings) }
  },
}
```

The page-fetch sub-step uses WebFetch with a structured prompt template that asks for the same eight signals every time. This consistency is what lets the cross-reference step work programmatically rather than agent-by-agent.

### Output schema

```ts
interface LandingPageAudit {
  url: string
  metrics: { clicks: number; cost: number; conversions: number; cvr: number; cpa: number | null }
  pageContent: {
    h1: string
    heroSubheading: string | null
    headings: string[]                       // H2 + H3 in document order
    formsFound: Array<{ fieldNames: string[] }>
    phoneNumbersFound: Array<{ display: string; isClickToCall: boolean }>
    branchLocator: 'present' | 'static-list' | 'absent'
    productCatalogue: 'present' | 'broken' | 'absent'
    visibleBrokenSections: string[]          // e.g. "empty product loader", "non-functional reset button"
  }
  adCopy: Array<{
    adGroup: string
    campaign: string
    headlines: string[]
    descriptions: string[]
    finalUrls: string[]
    adsCount: number
  }>
  topSearchTerms: Array<{ term: string; clicks: number; cost: number; conversions: number }>
  findings: {
    vocabularyMismatch: Array<{ searchTermPhrase: string; missingFromPage: boolean }>
    geoMismatch: { geoIntentClicks: number; pageHasGeoResponse: boolean }
    formMismatch: { adCopyPromisesQuote: boolean; pageHasForm: boolean }
    ctaMismatch: { adCopyPromisesCall: boolean; pageHasClickToCall: boolean }
    urlTypos: Array<{ adGroup: string; suspectedTypoUrl: string }>
    brokenElements: string[]
    geoIrrelevantH1: { h1: string; urlIsNational: boolean; cityInH1: string | null }
  }
  recommendations: Array<{
    severity: 'critical' | 'high' | 'medium'
    category: 'copy' | 'form' | 'cta' | 'page-bug' | 'ad-config' | 'geo'
    summary: string
    detail: string
  }>
}
```

### Severity rules

- **critical**: a typo'd ad URL, a broken page element on a paid landing page, an ad-promise-to-page mismatch (ad promises quote form, page has no form). Surface for immediate action.
- **high**: vocabulary mismatch where a single search term has over 10 clicks and is not present in page copy; geo-mismatch on a national page receiving over 30% geo-modified queries.
- **medium**: minor copy expansion opportunities, "could also mention X".

### Pre-flight, what the tool will not do

- **Will not auto-edit the client's website.** Page changes are always recommendations, never actions. The agent's actionable side is restricted to Google Ads platform changes (pausing typo'd ads, adding negatives, etc.).
- **Will not auto-pause an entire ad group on the basis of LP issues.** It can pause a single ad with a typo'd URL (after approval), but ad-group-level decisions stay manual.
- **Will not assume page content based on URL.** Every recommendation is grounded in a successful page fetch. If the fetch fails (timeout, robots.txt, 404), the audit for that page is flagged as "could not audit" rather than fabricated.
- **Will not surface findings from paused or removed structures.** Every Google Ads query underlying this tool must filter to ENABLED at all three levels: `campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'`. Old ad groups, paused campaigns, and legacy structures from previous agencies often contain typo'd URLs, broken ad copy, or zombie keywords that are not actually serving impressions. Flagging them creates noise and damages trust in the agent's findings. The agent must surface only what's currently in market.

### Enabled-only filter, the precise guardrail

When the agent fetches:
- **Landing pages by spend**: filter `campaign.status = 'ENABLED'` on the `landing_page_view` query. (`ad_group` and `ad_group_ad` aren't directly addressable from `landing_page_view`, but the campaign filter eliminates 95% of zombie data.)
- **Ad copy per ad group**: filter all three (`ad_group_ad.status`, `ad_group.status`, `campaign.status`) to ENABLED.
- **Search terms**: filter `campaign.status` and `ad_group.status` to ENABLED, otherwise paused-ad-group history pollutes the analysis.
- **Keyword performance**: same triple ENABLED filter.

The guardrail is documented in the tool's source code as a top-level constant (e.g. `ENABLED_FILTER_CLAUSE`) imported by every query so it can never be forgotten. New tools added to the agent reuse the same constant.

### Stronger guardrail, the "actually serving" filter

ENABLED status is necessary but not sufficient. An ad can be marked ENABLED in Google Ads while receiving zero impressions because:
- It's a deprecated ad format (e.g. EXPANDED_TEXT_AD, sunset by Google in 2022) that still appears in the account but is being phased out by the auction in favour of newer RSAs in the same ad group.
- It has a sufficiently low Quality Score that Google never serves it.
- A newer ad in the same ad group is winning every auction.
- The keywords feeding it have all been paused or have rank-lost the entire impression share.

Before the agent generates any finding tied to a specific ad (e.g. "this ad has a typo'd URL"), it must also verify that ad has `metrics.impressions > 0` over the analysis window. Zero-impression ads are functionally zombies, even if the status field says ENABLED. Flagging them in client reports creates noise and damages trust in the agent's findings.

This rule was learned from a real Berendsen finding in May 2026: 3 legacy EXPANDED_TEXT_AD ads in the active Bosch-Rexroth ad group had typo'd final URLs ("rexorth" instead of "rexroth"). The status check returned them as ENABLED, but the impressions check returned 0 over 25 days. Surfacing the typo'd-URL finding in the client report would have been embarrassing because the ads weren't actually reaching anyone.

So in code:

```ts
const ENABLED_AND_SERVING_FILTER = `
  campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND ad_group_ad.status = 'ENABLED'
  AND metrics.impressions > 0
`
```

For ad-level findings (typo'd URLs, ad-copy-to-LP mismatches, headline copy issues), use `ENABLED_AND_SERVING_FILTER`. For account-structure-level findings (e.g. "this ad group exists in the account"), `ENABLED_FILTER_CLAUSE` alone is sufficient.

### Why this is the right first tool to build

Three reasons:

1. **It uses every layer of the agent we've designed.** Pulls Google Ads data, pulls GA4 data adjacency, fetches external web content, runs a structured cross-reference, generates structured recommendations, routes some recommendations to the approval queue (e.g. pausing typo'd ads), feeds others into a client-facing report. If we can build this tool well, the rest of the diagnostic playbook is variations on the same pattern.
2. **It's directly tied to the use case the agency runs most.** Berendsen and MTP both needed this. Every future client will need it. A monthly cadence per client gives the team a recurring, useful, defensible deliverable.
3. **It's measurable.** Every recommendation either produces a page change (the agency or client implements it) or it doesn't. Conversion rate on the audited pages 30 days later is the success metric. Closes the feedback loop, turns recommendations into accountable predictions.

### What gets built specifically

- `src/lib/agents/optimate-google-ads/tools/audit-landing-page-relevance.ts` (the CanonicalTool)
- `src/lib/agents/optimate-google-ads/page-fetch-prompt.md` (the WebFetch prompt template, identical across runs so output is structured)
- `src/lib/agents/optimate-google-ads/cross-reference.ts` (the deterministic cross-reference logic, no LLM needed)
- `src/lib/agents/optimate-google-ads/recommendation-generator.ts` (turns findings into the recommendations array, light LLM use for prose only)
- Two renderers (per Build Decision 5): `templates/landing-page-audit-client.html` (verbose) and `templates/landing-page-audit-internal.md` (terse bullet form)

### Cadence integration

- Add to the existing scheduler in `server/index.ts` (or the CMS-side scheduler) as a monthly cron per active Google Ads client.
- Output routes to the `agent-approval-queue` collection. Approved recommendations either trigger ad changes (typo'd URL pauses) automatically, or get rendered as a client email draft awaiting your sign-off.

---

## Templatisation Path: From Scripts to Repeatable Diagnostic Tool

After running the Optimisation Patterns Library manually for two clients (Berendsen and MTP, May 2026), the work has produced ~15 client-specific scripts with roughly 90% identical logic and 10% client-specific values. This section defines the path from that script-pile to a single client-parameterised diagnostic tool that can be run on any new client, then promoted into the agent once stable.

The order matters: templatise first, validate on a third client, iterate, then promote. Skipping straight from manual scripts to a fully autonomous agent skips the iteration round that catches edge cases.

### Three layers to separate

The current scripts mix three concerns that must be separated before the template is useful:

1. **Client-specific config** (customer IDs, GA4 property, vertical keywords, brand terms, branch list). Varies per client.
2. **Diagnostic logic** (the 24 patterns from the library, the LP audit flow, the keyword gap detection, the matched-window comparisons). Same for every client.
3. **Presentation** (HTML email, internal markdown report). Same renderers, different data fed in.

The templatisation work is to pull these apart so the only thing that changes per client is the config object.

### Recommended file structure

The template lives in the existing `website-growth-tools` repo until it's ready to promote to the agent (which sits inside `content-cms`):

```
website-growth-tools/
  scripts/diagnostic/
    run-client-diagnostic.ts          # entry point: tsx run-client-diagnostic.ts --client=<slug>
    clients/
      clients.ts                      # registry, exports an array of ClientConfig
      berendsen.ts                    # one ClientConfig per client
      mtp.ts
      <new-client>.ts                 # added per new client
    patterns/                         # one file per pattern from the library
      a1-high-spend-no-conversion.ts
      a2-lp-intent-mismatch.ts
      a3-geo-modified-on-non-geo.ts
      a4-adjacent-vocab-leakage.ts
      a5-underutilised-high-cvr.ts
      a6-branded-on-non-brand-page.ts
      b1-country-targeted-near-me.ts
      ... (one per Category A through F pattern)
    data/                             # data-fetch helpers
      google-ads-data.ts              # all enabled-only Google Ads queries
      ga4-data.ts                     # all GA4 queries
      page-fetch.ts                   # WebFetch wrapper with consistent prompt
    cross-reference/
      lp-audit-cross-ref.ts           # the deterministic cross-reference logic for the LP audit tool
    types.ts                          # ClientConfig, DiagnosticResult, Finding shapes
    renderers/
      client-email.ts                 # HTML renderer (Verdana, blue-headed tables, no en/em dashes)
      internal-review.ts              # Markdown renderer (terse, internal use)
```

When the template is promoted to the agent, the same shape moves into `src/lib/agents/optimate-google-ads/`, the pattern files become CanonicalTool definitions, and the renderers stay as renderers.

### The ClientConfig schema (the only thing that varies per client)

A locked-down shape so adding a new client is filling out one object:

```ts
interface ClientConfig {
  // Identity
  slug: string                          // "berendsen", "mtp"
  businessName: string                  // "Berendsen Fluid Power"
  websiteUrl: string                    // "https://berendsen.com.au"

  // Account IDs
  googleAdsCustomerId: string           // dashless
  ga4PropertyId: string

  // Brand identity (for brand defence patterns: A6, B3, C1)
  ownBrandTerms: string[]               // ["berendsen", "berendsen fluid power"]
  competitorBrands: string[]            // ["pirtek", "enzed", "hare and forbes"]

  // Vertical keyword universe (for the keyword gap filter and pattern A2)
  verticalKeywordRoots: string[]        // hydraulic-relevant for Berendsen, pump-relevant for MTP, etc.
  excludedNonVerticalRoots: string[]    // ["fabrication", "machine shop", "welding"]

  // Geography (for B1, B2, A3)
  serviceCountries: string[]            // ["Australia"]
  branchCities: string[]                // ["Sydney", "Wetherill Park", "Melbourne", ...]
  branchStates: string[]                // ["NSW", "VIC", "QLD", "WA", "SA"]
  geoModifierTerms: string[]            // ["near me", "nearby", "local"]

  // Restructure context (for matched-window comparisons)
  restructureDate: string | null        // "2026-04-10" or null if no restructure
  conversionTrackingEnabledFrom: string

  // Threshold overrides (optional; scale with account size)
  thresholds?: {
    lpSpendNoConvDollars?: number       // default 200
    keywordGapMinPreClicks?: number     // default 2
    impressionShareLossBudgetPct?: number  // default 0.10
    impressionShareLossRankPct?: number    // default 0.20
    attributionGapWarnPct?: number      // default 0.30
  }

  notes?: string                        // free-text context the agent should know
}
```

Each existing client config is one file in `clients/`. New clients are a single new file. Eventually the config moves into the CMS Clients collection (per the existing `gadsAuto` group), but for the template-test phase a TypeScript file is fine.

### The orchestrator

`run-client-diagnostic.ts` stays short, all heavy lifting in the patterns:

```ts
const args = parseArgs()
const client = await loadClient(args.client)              // from clients/<slug>.ts
const window = resolveAnalysisWindow(client, args.window) // default: last 25 days

// Fetch data once, share across all patterns
const data = await Promise.all([
  fetchGoogleAdsData(client, window),
  fetchGA4Data(client, window),
  fetchTopLandingPages(client, window),
])

// Run every pattern against the shared data
const findings = await Promise.all([
  detectA1HighSpendNoConv(client, data),
  detectA2LpIntentMismatch(client, data),
  detectA3GeoModifiedOnNonGeo(client, data),
  // ... all 24 patterns
])

// Rank findings by spend at risk or conversion uplift
const rankedFindings = rankFindings(findings.flat())

// Persist the structured result
const result: DiagnosticResult = { client, window, data, findings: rankedFindings }
writeJson(`output/${client.slug}-${window.endDate}.json`, result)

// Render
if (args.render === 'client') renderClientEmail(result, `output/${client.slug}-${window.endDate}.html`)
if (args.render === 'internal') renderInternalReview(result, `output/${client.slug}-${window.endDate}.md`)
```

Adding a new pattern is one new file in `patterns/`. The orchestrator imports and calls it. No other plumbing changes.

### How to test the template on a third client

The template is only valuable once it has been validated against a client different from the two it was extracted from. Candidates from existing agency-level access:

| Client | GA4 property | Vertical | Why it's useful as a third test |
|---|---|---|---|
| Profiterole Patisserie | 422453341 | Food / retail / B2C | Different vertical entirely; tests vertical-keyword config flexibility; lower spend so smaller numbers tune thresholds |
| Pickleball Studio | 530839425 | E-commerce / retail | Tests product-feed-style accounts where landing pages are PDPs |
| Trover Tax | 343554729 | Professional services | No physical branches, no geo modifiers in the same sense, tests how geo patterns behave when they shouldn't fire |

**Recommended first test: Profiterole.** Reasons:
1. Agency-level access already in place
2. Different vertical from Berendsen/MTP, so it stresses the vertical-keyword config rather than just re-running similar logic
3. Still has retail / B2C foot-traffic intent, so geo patterns are relevant in a different way
4. Lower stakes: if the template produces noise on a Profiterole run, no client deliverable depends on it yet

Run it. Compare the JSON output and the rendered email to what you would have produced manually. The gaps tell you what's still hard-coded that should be config, and what's missing as a pattern.

### The iteration loop

Three explicit stages, each with a feedback path back to the patterns library:

1. **Run the template on a new client.** Read the JSON output. Diff it against what a human would produce manually for the same account.
2. **Capture every "the template missed this" or "the template flagged something irrelevant" as a feedback item.** Each becomes either a new entry in the patterns library OR a tightening of an existing pattern's threshold or detection rule. Never silent removal.
3. **Promote stable patterns into the agent** once they've fired correctly across three or more clients without manual correction. Below that threshold, keep iterating manually inside the template.

The patterns library in this document is the source of truth for what patterns exist. Every iteration round either (a) adds a new pattern, (b) tightens an existing one's detection rule, or (c) moves a pattern's status from "experimental" to "stable, agent-ready".

After roughly five client runs, the template should produce around 80% of the recommendations a human would, with under 10% noise. That's the threshold to start moving the orchestrator into the agent proper. Below that, the template is still in calibration and should not be exposed as an automated agent run.

### Concrete first slice (week 1 of templatisation)

Ranked by leverage, lowest-risk-first:

1. **Build `scripts/diagnostic/clients/clients.ts` and add the Berendsen + MTP configs as data only**, no logic. This is reversible and demonstrates the config shape.
2. **Refactor `berendsen-add-phrase-keywords.ts` and `mtp-add-phrase-keywords.ts` into a single `apply-phrase-match-keywords.ts`** that takes `--client=<slug>` and reads the keyword plan from a JSON input file. This is the lowest-risk piece (we already know it works on two clients) and proves the templatisation pattern end to end.
3. **Refactor the LP-enrichment diagnostic** (top landing pages with ad copy and search terms, the audit we ran on Berendsen) into a parameterised pattern in `patterns/a1-high-spend-no-conversion.ts` plus the underlying data fetchers. Run it against both Berendsen and MTP, confirm the output matches what was manually produced.
4. **Add Profiterole as the third client.** Run the same pattern. Compare to what would be written manually. Capture deltas as feedback items. Iterate.

This first slice is a 2 to 3 day exercise and produces a working template that can be run on any client by adding one config file.

### What stays manual until the agent is built

Until Phase 0 of the agent build is complete (provider router, agent loop, approval queue collection), the template is invoked from the CLI by a human. The diagnostic JSON is generated, the rendered email is reviewed by a human, and any actions (keyword additions, ad pauses) are still applied via individual `apply-*` scripts approved by a human.

Once the agent infrastructure exists, the orchestrator in `run-client-diagnostic.ts` becomes the body of the agent's monthly cron handler, the JSON output gets persisted to the `agent-approval-queue` collection, and the renderers run as part of the rendering layer per Build Decision 5. Almost no rewriting because the structure already matches.

---

## Patterns Library Changelog

A running record of every pattern added, tightened, retired, or threshold-tuned. Update this every time the patterns library changes, regardless of whether the change came from a client diagnostic, a false-flag review, or a code change in `patterns/*.ts`.

Purpose:
- Audit trail of *why* the diagnostic logic looks the way it does
- Onboarding context for whoever picks this up later
- Catches duplicate work (if the same pattern was tightened twice in different directions, the changelog surfaces it)

Not loaded into agent runtime context. Design-time documentation only.

### How to log an entry

Add a row to the table below for each change. Keep entries terse, one line each. Date is the day the change ships (or the day the decision is made if implementation lags). For the "Source" column use the client slug if a specific client run surfaced the need; use "design review" if it came from a planning conversation; use "false flag" if it came from a logged false flag.

| Date | Pattern ID | Change type | What changed | Why | Source |
|---|---|---|---|---|---|
| 2026-05-04 | C1 (Brand-defence list contains misspellings only) | Pattern added | New pattern surfaced when Berendsen brand-defence list was found to contain only misspellings without the correct-spelling brand term | 142 brand clicks per month leaking into non-brand ad groups despite the list looking complete on the surface | berendsen |
| 2026-05-04 | C3 (Competitor brand leakage) | Pattern added | New pattern surfaced when "hare and forbes" competitor terms were found firing in the manufacturing ad group | 8 clicks at ~$37 leaking on competitor brand search terms in 25 days | berendsen |
| 2026-05-04 | A2 (LP-to-search-intent semantic mismatch) | Pattern added | Vocabulary mismatch detection added to the LP audit (e.g. "re-chroming" search terms hitting a "hard chrome plating" page) | LP copy uses one set of terms, customers search with another; without explicit detection this gap is invisible in standard reporting | berendsen |
| 2026-05-04 | LP audit tool | Guardrail tightened | Added `metrics.impressions > 0` filter on top of the triple-ENABLED status filter | 3 legacy EXPANDED_TEXT_AD ads in Bosch-Rexroth ad group showed as ENABLED but had 0 impressions over 25 days; would have surfaced as a false positive | berendsen / false flag |
| 2026-05-05 | B5 (Heavy spend, zero conversions) | Pattern strengthened | Added `severity: 'high' \| 'medium'` field. High severity when rank-lost share ≥ 30% AND zero conversions; eligible for deeper per-cycle reduction (default 70% vs standard 50%) | High rank-lost + zero conv = bid/QS-bound, more budget will not fix it; surface as priority loss | mtp |
| 2026-05-05 | Re-allocation tool | Logic added | Fallback redistribution: when no D1 strict gain candidate qualifies, freed budget from loss campaigns is redistributed to non-loss campaigns weighted by recent CvR (or proportional fallback). Configurable per client via `fallbackRedistribution: 'cvr' \| 'proportional' \| 'none'` | Without this, accounts with no clear D1 winner held onto wasteful spend even when the loss signal was strong. Now re-allocations are always actionable when there's clear waste | mtp |
| 2026-05-05 | D4 (Mid-month overspend pace) | Pattern added | New pattern: detect MTD pace > 20% over expected and propose / auto-apply corrected daily budgets sized for remaining days only. Plus hardcoded guardrail that the agent's Push tool ALWAYS uses smart sizing (never naive monthlyCap/30.4) | MTP was at 49% spend on day 5 of a 30-day month due to push silently failing for two weeks (CMS schema bug). Daily budgets in Google Ads stayed at over-pace values. Need agent-side daily check + month-boundary push to prevent recurrence | mtp |

### Status taxonomy (for pattern lifecycle)

Each pattern in the library has one of three lifecycle statuses, recorded in the pattern file itself:

- **`experimental`**: pattern recently added, observed on fewer than three clients. Findings reviewed manually, not auto-actioned.
- **`stable`**: pattern fired correctly on three or more clients without manual correction. Eligible for auto-action via the approval queue.
- **`retired`**: pattern superseded or disproved. Kept in the codebase as an archived file with a note pointing to its replacement, removed from the active orchestrator run.

When a status changes, log a changelog entry of type "Status changed".

---

## False Flags Log

A running record of every time the diagnostic surfaced a finding that turned out to be wrong, irrelevant, or already-paused-and-not-serving. The log is the input to the next round of guardrail tightening.

Purpose:
- Surface repeated false positives so the same wrong finding doesn't recur three times before being caught
- Generate the next set of `ENABLED_AND_SERVING_FILTER`-style guardrails
- Honest record of what the diagnostic gets wrong, not just what it gets right

Not loaded into agent runtime context. Reviewed during iteration rounds, the takeaways feed pattern code changes that the agent then picks up.

### How to log an entry

Each false flag gets one row. Keep the description short. The "Rule that should have caught it" column is what you and I discuss after logging, it becomes the next changelog entry.

| Date | Client | Finding the diagnostic produced | Why it was wrong | Rule that should have caught it | Status |
|---|---|---|---|---|---|
| 2026-05-04 | berendsen | "Three legacy EXPANDED_TEXT_AD ads in Bosch-Rexroth ad group have typo'd final URL (rexorth instead of rexroth)" | Ads were marked ENABLED at the criterion level but had 0 impressions, 0 clicks, 0 cost over the 25-day window. Google's auction had effectively phased them out behind the newer RSA in the same ad group. Not actually reaching customers, so not a real client-facing issue. | Filter every ad-level finding to `ENABLED at all three levels AND metrics.impressions > 0 in the analysis window`. ENABLED status is necessary but not sufficient. | Fixed (LP audit guardrail tightened, see changelog 2026-05-04) |
| 2026-05-05 | mtp | "No re-allocation actioned this cycle" returned despite Generic - Industry Verticals being a clear loss candidate ($488 spent, 0 conv, 49% rank-lost) | The script held the loss reduction because no D1 strict gain candidate paired with it. But the loss signal was strong on its own — pouring more budget into a rank-bound non-converting campaign is never useful regardless of whether a D1 winner exists. | When loss candidates exist but no D1 gain pair qualifies, redistribute the freed budget to non-loss campaigns weighted by recent CvR (fallback to proportional if zero CvR everywhere). Don't hold actionable waste reductions waiting for a perfect pair. | Fixed (re-allocation tool fallback added, see changelog 2026-05-05) |
| 2026-05-05 | mtp | MTP was at 49% MTD spend on day 5 (3x over pace) despite the CMS having `calculateSmartDailyBudget` helper that does correct remaining-days sizing | Smart sizing only takes effect when a human opens the CMS UI and clicks Push to Google Ads. The push had been failing silently for an unknown number of weeks due to a Payload schema bug (`negative_sweep_candidates_id` column missing from `payload_locked_documents_rels`), so daily budgets in Google Ads stayed at the over-pace values. | (1) The agent's daily check should detect MTD pace > 20% over expected and propose corrected daily budgets; (2) the agent's Push tool always uses smart sizing, never naive `monthlyCap/30.4`; (3) month-boundary auto-push on the 1st of every month so this can never silently drift again. | Fixed (D4 pattern added, see changelog 2026-05-05; CMS migration applied 2026-05-05) |

### Status values

- **Open**: false flag logged, no fix yet
- **In design**: a fix is being scoped (changelog entry pending)
- **Fixed**: a guardrail or pattern change has shipped (referenced changelog entry should exist)
- **Won't fix**: surfaced false flag was a one-off and not worth a guardrail (rare, but valid; document the reasoning)

### What gets logged here vs the changelog

A false flag goes here first. The fix that resolves it goes in the changelog. Two separate records of the same incident, deliberately, because the false-flag log is for "what the diagnostic got wrong" and the changelog is for "what we changed in response". Reading the false-flags log alone tells you the failure modes; reading the changelog alone tells you the trajectory of improvement.

---

## Agent Tool Deep Dive: Budget Re-allocation

The second concrete agent tool, derived from the Berendsen optimisation work in May 2026 and the discovery that the CMS already holds the per-campaign budget allocation as a percentage split against a monthly cap. This tool's job is to optimise that allocation continuously, moving spend from underperforming campaigns into budget-constrained converting ones, all within the existing monthly cap. Zero-sum within the envelope the client has already approved.

### Why it's the second tool to build

1. **High-leverage and low-blast-radius.** The maximum the tool can do is re-allocate within the client's pre-approved monthly cap. There's no scenario where it accidentally over-spends.
2. **It uses two of the agent's most reliable patterns at once.** D1 (budget-constrained converting) and B5 (heavy spend, zero conversions) become two halves of one action.
3. **The CMS infrastructure already exists.** The `GoogleAdsCampaignBudgets` collection, the `audit.monthlyBudget` field, and the four `/api/google-ads-budgets/[auditId]/...` endpoints are already built and in production use through the CMS UI. The agent reuses them all.
4. **Verifiable.** Every re-allocation has a measurable outcome 25 days later. The tool's predictions get compared to actuals, the tool learns, the sizing gets tuned.

### When it runs

- **Monthly cadence** per active client, immediately after the Landing Page Relevance Audit run so the agent has fresh metrics.
- **On-demand** via chat mode when an internal user asks "should we re-balance the budget for [client]?"
- **Triggered by a B5 alert** if a campaign crosses the "high spend, zero conversion" threshold mid-cycle. Doesn't auto-action, just flags for review.

### What the tool does, end to end

1. **Read the current state** from the CMS:
   - Monthly cap from `GoogleAdsAudits.monthlyBudget`
   - Per-campaign allocation from `GoogleAdsCampaignBudgets` rows linked to that audit
   - 30-day metrics already attached to those rows (refreshed by the existing `refresh-metrics` flow)
   Single API call: `GET /api/google-ads-budgets/[auditId]/list` returns all of the above.
2. **Run the gain-candidate detector** (D1) and the **loss-candidate detector** (B5) against the metrics.
3. **Compute a proposed re-allocation** as a zero-sum operation:
   - Sum of new percentages must equal sum of old percentages (i.e. 100%, give or take rounding)
   - Each campaign's individual percentage change capped at +/-50% per cycle
   - Per-campaign minimums respected (e.g. brand-defence campaigns can't drop below a CMS-stored floor)
   - Per-campaign maximums respected (e.g. no single campaign over X% of the cap, default 40%)
4. **Render the proposal** with side-by-side before/after, projected conversion deltas per campaign, and explicit rationale per change.
5. **Route to the approval queue** unless the client has CMS-configured `autoApplyBudgetReallocation: true` and the proposed change falls within the auto-apply ceiling.
6. **On approval**:
   - `POST /api/google-ads-budgets/[auditId]/update` with the new percentages (writes to the CMS collection)
   - `POST /api/google-ads-budgets/[auditId]/push` (pushes calculated daily budgets to Google Ads)
7. **Schedule a verification check** 25 days later. The check pulls fresh metrics, compares actual conversion deltas against the projection, logs the result. Predictions consistently off by more than 30% trigger a sizing-formula review.

### CMS data contract (the read/write interface)

The tool reads and writes only through the CMS endpoints. It never writes directly to the Payload collection.

**Read:**
- `GET /api/google-ads-budgets/[auditId]/list`
  - Returns `{ monthlyBudget: number, campaigns: [{ campaignId, campaignName, enabled, budgetPercentage, calculatedDailyBudget, actualDailyBudget, lastPushedAt, bidStrategy, impressions, clicks, avgCpc, conversions, ... }] }`
  - Combines saved CMS allocation with live Google Ads metrics

**Write (after approval):**
- `POST /api/google-ads-budgets/[auditId]/update` with body `{ _saveCampaigns: true, campaigns: [{ campaignId, budgetPercentage }] }` to persist new allocation
- `POST /api/google-ads-budgets/[auditId]/push` with body `{ campaigns: [{ campaignId, dailyBudget }] }` to push to Google Ads

**Auth:**
- `x-api-key: <AUDIT_API_KEY>` header (pending Phase 0 prerequisite — see below)

### Tool definition

```ts
const reAllocateBudget: CanonicalTool = {
  name: 'reallocate_campaign_budget',
  description: 'Reads the current monthly cap and per-campaign allocation from CMS, identifies gain candidates (D1) and loss candidates (B5), proposes a zero-sum re-allocation within the cap, routes to approval queue. On approval, updates the CMS allocation and pushes new daily budgets to Google Ads. Always paired with a verification check scheduled 25 days later.',
  parameters: z.object({
    customerId: z.string(),
    auditId: z.number(),                // for the CMS endpoints
    startDate: z.string(),              // analysis window
    endDate: z.string(),
    autoApply: z.boolean().default(false), // overridden by CMS config; surfaced here for explicit calls
  }),
  execute: async (args, ctx) => {
    const current = await readCmsBudgetState(args.auditId)
    const gainCandidates = detectD1(current, args.startDate, args.endDate)
    const lossCandidates = detectB5(current, args.startDate, args.endDate)
    const proposal = computeZeroSumReallocation(current, gainCandidates, lossCandidates, args)
    if (!proposal.changes.length) return { status: 'no-changes', reason: 'No qualifying gain/loss candidates' }
    if (proposal.requiresApproval) {
      await queueForApproval(proposal)
      return { status: 'queued', proposalId: proposal.id }
    }
    await applyProposal(args.auditId, proposal)
    await scheduleVerification(args.auditId, proposal, 25)
    return { status: 'applied', proposal }
  },
}
```

### Sizing logic, the layered formula

For each gain candidate:

```ts
const proposedPctIncrease = Math.min(
  (currentPct * budgetLostShare * 0.7),                 // 70% of theoretical capture (diminishing returns)
  (currentPct * 0.5),                                   // hard cap at +50% per cycle
  (maxPctPerCampaign - currentPct),                     // CMS-stored per-campaign maximum
)
const newPct = currentPct + proposedPctIncrease
```

For each loss candidate, mirror logic in reverse: how much percentage to remove, capped at -50% per cycle and the CMS-stored per-campaign minimum.

The total percentage points removed from loss candidates must equal the total added to gain candidates. If gain side wants more than loss side can supply, the tool only takes what's available and surfaces "additional gain capacity blocked by no available loss candidates" in the proposal notes.

### Output schema

```ts
interface ReallocationProposal {
  auditId: number
  customerId: string
  monthlyCap: number
  beforeState: Array<{ campaignId: string; campaignName: string; pct: number; dailyBudget: number; conv30d: number; cpa: number | null }>
  changes: Array<{
    campaignId: string
    campaignName: string
    oldPct: number
    newPct: number
    oldDaily: number
    newDaily: number
    role: 'gain' | 'loss' | 'hold'
    rationale: string                  // human-readable, e.g. "18 conv at $20 CPA, 79% IS lost to budget; scaling"
    projectedConvDelta30d: number      // positive for gains, negative tolerable for losses
  }>
  totalPctRemoved: number              // must equal totalPctAdded
  totalPctAdded: number
  withinCap: boolean
  requiresApproval: boolean
  guardrailFlags: string[]             // e.g. ["max single bump capped at +50% on Generic_Products_Hydraulic-Components"]
  predictionAccuracyTarget: number     // default 0.7 — agent expects actuals within 70% of projection
}
```

### Hardcoded guardrails

1. **Zero-sum by construction.** Sum of percentages must remain at the value it was before re-allocation (rounded to 0.5%). The compute step refuses to return a non-zero-sum result.
2. **Per-campaign change cap of +/-50% per cycle.** Forces staged re-allocations on big imbalances.
3. **Per-campaign minimum and maximum from CMS.** The agent reads minimums (e.g. brand-defence floor) and maximums (e.g. concentration cap) from `GoogleAdsCampaignBudgets` config or a dedicated min/max field set, and respects both.
4. **Cooldown of 14 days per campaign.** No campaign's percentage can change twice within 14 days. Prevents recursive re-balancing.
5. **Conversion threshold of 5 in window** to qualify as a gain candidate. Below that, conversions could be noise.
6. **Maturity threshold of 30 days** for gain candidates. New campaigns don't have enough data.
7. **Rank-lost exclusion.** If `search_rank_lost_impression_share > 20%`, the campaign is excluded as a gain candidate — bid/QS issue, not budget issue. Adding budget won't help.
8. **Verification mandatory.** Every applied re-allocation schedules a 25-day verification. Agent cannot skip this step.

### CMS-configurable per client

Stored as additional fields on the existing `Clients > gadsAuto` group or per-campaign on `GoogleAdsCampaignBudgets`:

- `autoApplyBudgetReallocation` (default `false`)
- `autoApplyMaxSingleChangePct` (default `0.20`)
- `bumpCooldownDays` (default `14`)
- `minMaturityDays` (default `30`)
- `minConvThresholdInWindow` (default `5`)
- `perCampaignMinPct` (per-row on GoogleAdsCampaignBudgets, default 0)
- `perCampaignMaxPct` (per-row, default 40)

For the first 6 months of any client running this tool, recommend `autoApplyBudgetReallocation: false`. Every proposal goes to approval queue. After 10+ verifications come back with high accuracy on that client, flip the flag.

### Pre-flight, what the tool will not do

- **Will not propose increasing the monthly cap.** That's a separate client conversation, not an agent action. If gain candidates can't be funded by available loss candidates within the cap, the proposal note flags the blocked opportunity but stops there.
- **Will not write to the Payload collection directly.** All writes go through CMS HTTP endpoints, so the CMS UI sees changes consistently with the agent's changes.
- **Will not bypass approval queue routing** for changes outside the client's auto-apply ceiling, regardless of confidence.
- **Will not act on a campaign in cooldown.** Even if it qualifies as a gain or loss candidate again, the agent skips and notes "in cooldown until [date]".
- **Will not act if the audit's `monthlyBudget` is not set.** Surfaces a "monthly budget cap not configured for this client, agent cannot run re-allocation" flag and stops.

### Phase 0 prerequisite

Before this tool can run, one code change must ship in the CMS:

**Add `hasValidApiKey` fallback to the four budget endpoints**, matching the pattern already used in `GoogleAdsCampaignBudgets.access`:

- `/api/google-ads-budgets/[id]/list/route.ts`
- `/api/google-ads-budgets/[id]/update/route.ts`
- `/api/google-ads-budgets/[id]/push/route.ts`
- `/api/google-ads-budgets/[id]/refresh-metrics/route.ts`

Pattern (one-line replacement of the existing auth check at the top of each route):

```ts
import { hasValidApiKey } from '@/collections/api-key-access'

const { user } = await payload.auth({ headers: req.headers });
if (!user && !hasValidApiKey(req)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

The agent then calls these endpoints with `x-api-key: <AUDIT_API_KEY>`, the same auth pattern Growth Tools already uses for every other CMS interaction.

### What gets built specifically

- `src/lib/agents/optimate-google-ads/tools/reallocate-campaign-budget.ts` (the CanonicalTool)
- `src/lib/agents/optimate-google-ads/lib/cms-budget-client.ts` (typed wrapper around the four CMS endpoints)
- `src/lib/agents/optimate-google-ads/lib/zero-sum-optimisation.ts` (the deterministic re-allocation logic)
- `src/lib/agents/optimate-google-ads/lib/verification-scheduler.ts` (schedules the 25-day verification check)
- Two renderers: `templates/budget-reallocation-client.html` (verbose, brand-toned) and `templates/budget-reallocation-internal.md` (terse)
- CMS migration: add `autoApplyBudgetReallocation`, `autoApplyMaxSingleChangePct`, `bumpCooldownDays`, `minMaturityDays`, `minConvThresholdInWindow` to `Clients > gadsAuto`. Add `perCampaignMinPct` and `perCampaignMaxPct` to `GoogleAdsCampaignBudgets`.

### Cadence integration

- Add to the existing scheduler in `server/index.ts` (or the CMS-side scheduler) as a monthly cron per active Google Ads client, immediately after the Landing Page Relevance Audit cron.
- 25-day verification scheduled per applied proposal (one-shot delayed task, not recurring).
- Verification results route to the agent's `activity-log` collection plus the False Flags Log if a verification falls outside the 70% prediction accuracy target.


---

## Codex OAuth (Option C) — GPT-5.5 on a ChatGPT subscription

A second, free credential path for the GPT models: serve GPT-5.5 from a
flat-rate ChatGPT plan via Codex OAuth ("Sign in with ChatGPT") instead of a
billed `OPENAI_API_KEY`. This reuses the Codex CLI OAuth client + the private
`chatgpt.com/backend-api/codex/responses` endpoint — the same subscription-reuse
pattern Anthropic banned for Claude. OpenAI has not (as of 2026-05) banned it.

### How it's wired

- **New provider `openai-codex`** (distinct from the API-key `openai` provider;
  both coexist). OAuth-only — there is no API key for this path.
- **Two models, one model id, two efforts:** `gpt-5.5-codex-medium` (default,
  balanced) and `gpt-5.5-codex-low` (faster/cheaper). Both route to `gpt-5.5`
  over Codex and differ only by the per-request `reasoning.effort` field.
- **Device-code auth, not localhost-callback** (the CLI's browser flow can't
  work on Vercel): `deviceauth/usercode` → operator enters code at
  `auth.openai.com/codex/device` → poll `deviceauth/token` → exchange at
  `oauth/token`. Account id extracted from the id_token JWT
  (`https://api.openai.com/auth`.chatgpt_account_id).
- **Responses-API request shape** with the mandatory Codex `instructions`
  prefix ("You are Codex, based on GPT-5. …"); the agent's real system prompt
  rides as a leading `developer` input message. Codex CLI headers
  (`OpenAI-Beta: responses=experimental`, `originator`, `chatgpt-account-id`,
  `User-Agent: codex_cli_rs/…`). SSE response assembled to a single
  `LLMResponse`.

### Risks & mitigations (user-acknowledged)

- **ToS grey area + fragility:** depends on mimicking the Codex CLI request
  shape and a private endpoint; OpenAI can break it without notice.
- **Fallback chain:** any Codex-OAuth failure throws and the `callLLM` chain
  walks down `fallbackModels` (Kimi → MiniMax → Claude) automatically — strict
  no-silent-fallback semantics, same as the Anthropic OAuth path.
- **Two off switches:** the DB `forceFallback` flag (per-provider; for a
  Codex-only provider this means "disable" → `NoCredentialError`), and the
  infra-level env kill-switch `CODEX_OAUTH_DISABLED=1` (skips OAuth entirely,
  fleet-wide, no code change).

### Files

- `auth/oauth/openai-codex.ts` — device-code begin/poll/exchange, refresh,
  JWT account-id extraction, expiry helper, header builder.
- `transformers/to-codex.ts` / `from-codex.ts` — Responses request/response.
- `providers/openai-codex.ts` — adapter (resolve cred → headers + body → POST →
  consume SSE → map errors to `HttpError`).
- Resolver, registry, `callLLM`, `agent-auth` routes + page updated.

### Default model

OptiMate's default is **not** changed by this work. Switching the autonomous
default to `gpt-5.5-codex-medium` is a one-line registry change to do as a
follow-up once a live probe confirms the path works end-to-end.
