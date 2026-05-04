# The Optimate Agent Build Plan

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
| Google Ads MCC | One-time agency setup | You (once) | Optimate-Google-Ads |
| Meta Business Manager | One-time agency setup | You (once, new) | Optimate-Meta-Ads |

---

## What You Need To Set Up On Your End

### Immediately (before any agent work)

- [ ] **Anthropic — OAuth path (primary):** Run the OAuth flow once via the admin auth-setup page. The platform impersonates the Claude Code OAuth client, opens a browser to Anthropic's consent page, you log in with the same account that holds your $150/mo Max subscription, the platform stores the access + refresh tokens encrypted in Vercel KV. Subsequent agent calls draw quota from your Max plan rather than billed API.
- [ ] **Anthropic — API key fallback (mandatory):** Create an Anthropic API key at console.anthropic.com, add credit, add to Vercel env as `ANTHROPIC_API_KEY`. **This is not optional.** If Anthropic rotates the Claude Code OAuth client ID (which they can do at any time without notice) the OAuth path stops working overnight; the credential resolver transparently fails over to the API key so agents keep running. You may also exhaust your Max quota on a busy day; same fallback path covers it.
- [ ] Create a Moonshot (Kimi) API key at platform.moonshot.ai, add credit, add to Vercel env as `MOONSHOT_API_KEY`
- [ ] Create a MiniMax API key at minimaxi.com, add credit, add to Vercel env as `MINIMAX_API_KEY`
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

### Already built ✅

- Proposal page (PIN-protected)
- Audit report
- Google Ads audit email
- Client progress update email

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
8. Smoke tests:
   - Confirm the Anthropic OAuth flow completes end-to-end (browser → consent → token stored → next agent call uses OAuth header)
   - Force-revoke the OAuth token in the store, confirm the next call falls back to `ANTHROPIC_API_KEY` transparently and logs `source: 'api-key-fallback'`
   - Confirm Kimi and MiniMax adapters work via API key alone
   - Confirm provider failover (kill one provider's keys, agent walks down its `fallbackModels` chain)

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

