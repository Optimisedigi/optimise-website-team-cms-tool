# Custom Agents — Build Plan (Backwards From Live)

A practical roadmap for building the fleet of custom agents described in `why-custom-ai-agents-are-the-missing-piece.md`. Written **backwards** — we start from the finished state and work back to "tomorrow morning, what do I open first."

---

## The End State (Where We're Heading)

A fleet of small, focused agents, all coordinated through this CMS:

| Agent | Job | Trigger |
|---|---|---|
| **OptiMate** | Google Ads optimisation specialist | Daily cron + on-demand button + chat |
| **MetaMate** | Meta Ads optimisation specialist | Daily cron + on-demand + chat |
| **ProposalAgent** | Drafts proposal content from audit data | On audit completion + on-demand |
| **ContentAgent** | Generates blog drafts in agency tone | Weekly cron + on-demand + chat |
| **AuditCuratorAgent** | Picks the best findings from raw audit data | After audit pipeline finishes |

Each one: tight system prompt, 2–5 tools max, structured JSON output, templated rendering, human-in-the-loop approval queue.

---

## Working Backwards

### Phase 6 — Daily Operations (the finished product)

**What "done" looks like for the team:**
- Open the CMS in the morning. There's a queue of agent recommendations to approve.
- Click ✅ or ✏️ on each one. Approved actions get pushed to Google Ads / Meta / the blog / the proposal.
- One dashboard shows: agent runs today, token cost per run, approval rate, time saved.

**What needs to exist:** approval queue UI, action-execution layer, cost dashboard, audit log of every agent decision.

---

### Phase 5 — The Approval Queue + Action Layer

Before any agent can act on anything live, we need:

1. **`agent_recommendations` collection** — every agent run drops one or more recommendations here.
   - Fields: `agent` (relationship to Agents collection), `client`, `type` (e.g. `add_negative_keyword`, `pause_campaign`), `payload` (JSON), `status` (`pending` / `approved` / `rejected` / `executed`), `confidence`, `reasoning`, `tokenCost`, `executedAt`, `executedBy`.
2. **Action executors** — small, single-purpose functions that actually do the thing once approved:
   - `executeAddNegativeKeyword()` → calls Google Ads API
   - `executePauseCampaign()` → calls Google Ads API
   - `executePublishBlogDraft()` → flips a Payload doc to published
   - …one per recommendation type.
3. **Approval UI** — a single screen at `/admin/collections/agent-recommendations` with bulk approve, inline edit, reject-with-reason.

**Acceptance test:** an agent writes to `agent_recommendations`, a human approves, the action runs, the queue shows "executed."

---

### Phase 4 — The First Real Agent: OptiMate

We pick **OptiMate** first because:
- The Google Ads audit pipeline already exists (`google-ads-audits` collection, NLB builder, MCC access).
- The blog is literally named after it.
- It has the highest immediate ROI for clients.

**Build steps:**
1. **Define the agent record.** New collection `agents` with: `name`, `slug`, `model` (e.g. `gemini-2.5-flash` for cheap, `gpt-4o` for expensive), `systemPrompt` (rich text), `tools` (array of tool slugs), `outputSchema` (JSON), `enabled`, `costPerRun` (rolling avg).
2. **Write OptiMate's system prompt.** ~500 words. Job: "You are a Google Ads optimisation specialist. You analyse a single account's last 30 days of data and produce a list of recommendations as structured JSON."
3. **Wire OptiMate's tools** (3 max):
   - `getCampaignPerformance(customerId, days)` — wraps existing Google Ads audit data
   - `getSearchTermReport(customerId, days)` — wraps existing search term fetch
   - `getCurrentNegatives(customerId)` — wraps existing NKL data
4. **Define output schema** — array of recommendations matching the `agent_recommendations` payload shape.
5. **Build the runner**: `src/lib/agents/run-agent.ts` — generic function that takes an agent record + context, calls the model, validates output against schema, writes to `agent_recommendations`.
6. **Trigger options:**
   - Cron route: `/api/agents/optimate/cron` (daily, hits all enabled clients)
   - On-demand: button on each Client record → "Run OptiMate now"
   - Chat: `/api/agents/optimate/chat` (later, Phase 6)
7. **Cost tracking:** every run logs `inputTokens`, `outputTokens`, `model`, `costAUD` to `usage-reports`.

**Acceptance test:** click "Run OptiMate" on a real client → recommendations appear in the queue within 30s → token cost logged → can approve one and watch it push a negative keyword live.

---

### Phase 3 — The Agent Runner Foundation

This is the reusable engine all agents share. Build once, every future agent slots in.

**Files to create:**
```
src/lib/agents/
  run-agent.ts          # The core runner
  tools/                # Tool implementations (one file each)
    google-ads-tools.ts
    meta-ads-tools.ts
    content-tools.ts
    proposal-tools.ts
  schemas/              # Zod schemas for each agent's output
  registry.ts           # Maps tool slugs to implementations
  cost-tracker.ts       # Logs token usage to usage-reports
src/collections/
  Agents.ts             # The agents collection
  AgentRecommendations.ts
src/app/(frontend)/api/agents/
  [slug]/run/route.ts   # Generic on-demand endpoint
  [slug]/cron/route.ts  # Generic scheduled endpoint
```

**Key design rules** (taken from the blog):
- Small system prompts (~500 words, hard cap 1000).
- Cheap models by default (Gemini Flash, Claude Haiku, GPT-4o-mini). Only escalate when proven necessary.
- Always structured output (Zod schema, no freeform prose).
- Templates render the deliverable — agent only produces variables.
- Every run logs cost, comparable to "old way" cost, so we can prove the savings.

---

### Phase 2 — Templates Before Agents

The blog's core point: **templates lock in quality, agents fill in slots.** So we build the templates **before** the agents that fill them.

For each planned agent, write the deliverable template first:
- **OptiMate** → recommendation card design (already partly exists in the NLB review page — extend it).
- **ProposalAgent** → uses existing proposal page (`/proposals/[slug]`) — just needs slot-mapping.
- **ContentAgent** → blog post layout already exists (`blog-posts` collection) — define which fields the agent fills vs. which are human-set.
- **MetaMate** → mirror OptiMate's recommendation card.

**Output of this phase:** a one-page spec per agent listing every slot the agent must fill, with examples of good/bad content for each slot. This becomes the basis of the system prompt and output schema.

---

### Phase 1 — Foundations (Start Here)

The bits that have to exist before any of the above makes sense.

#### 1.1 Pick the model providers and get keys
- **Google Gemini** — already wired (`GOOGLE_GENERATIVE_AI_API_KEY`). Use Gemini 2.5 Flash as the default cheap model.
- **Anthropic Claude** — add `ANTHROPIC_API_KEY` to `.env` and Vercel. Use Haiku for cheap, Sonnet for harder agents.
- **OpenAI** (optional) — add `OPENAI_API_KEY` if we want GPT-4o-mini as a third option.

→ **Action for you:** create accounts, generate API keys, add them to `.env.local` and Vercel project env vars.

#### 1.2 Pick the agent SDK
**Recommendation: Vercel AI SDK** (`ai` package) — already plays nicely with Next.js, supports tool calling, structured output (Zod), streaming, and lets you swap providers with one line. Avoids lock-in.

→ **Action for you:** sign off on Vercel AI SDK as the standard. (Alternatives: LangChain — too heavy; raw fetch — too much boilerplate. Vercel AI SDK is the sweet spot.)

#### 1.3 Add the cost dashboard scaffolding
- Extend `usage-reports` collection with: `agent` (relationship), `inputTokens`, `outputTokens`, `model`, `costAUD`, `runDurationMs`.
- Add a simple dashboard at `/admin/agents/costs` showing daily/weekly/monthly spend per agent.

#### 1.4 Define the approval-queue UX up front
Sketch the approval screen on paper before writing code. Decide:
- Bulk approve: yes/no?
- Inline edit: yes/no? (recommended yes — humans tweak the agent's negative keyword list before pushing.)
- Auto-approve threshold: any recommendation above X confidence skips the queue? (Recommended: no, not for v1.)

→ **Action for you:** answer those three questions.

#### 1.5 Pick the first client for OptiMate's pilot
One real client, MCC access already granted, who understands they're the test pilot.

→ **Action for you:** name the client.

---

## What You Need to Set Up (Your Side)

A clean checklist of decisions and account-level work only you can do:

### Accounts & Keys
- [ ] Anthropic API key → add `ANTHROPIC_API_KEY` to `.env.local` and Vercel
- [ ] OpenAI API key (optional) → add `OPENAI_API_KEY`
- [ ] Confirm Gemini key has enough quota for daily runs across all clients
- [ ] Set a hard monthly spend cap on each provider's billing dashboard (safety net)

### Decisions
- [ ] Sign off on **Vercel AI SDK** as the agent framework
- [ ] Default cheap model: **Gemini 2.5 Flash**? (or Claude Haiku?)
- [ ] Approval queue: bulk approve yes/no, inline edit yes/no, auto-approve threshold yes/no
- [ ] Pilot client for OptiMate
- [ ] Which agents go in v1? (Recommended: OptiMate only, then everything else)

### Process
- [ ] Decide who on the team reviews the approval queue daily
- [ ] Decide the SLA — how fast does an agent recommendation need to be approved/rejected?
- [ ] Decide what happens when an agent fails (retries? alert? silent skip?)

### Content (for ContentAgent later)
- [ ] Write 3–5 example blog posts that represent "agency tone" — these become the few-shot examples in ContentAgent's system prompt
- [ ] Same for ProposalAgent — 2–3 example proposals in our voice

---

## Suggested Build Order (Weeks)

| Week | Focus |
|---|---|
| **1** | Phase 1 foundations: keys, SDK pick, usage-reports schema, decisions locked |
| **2** | Phase 3 runner: `Agents` collection, `AgentRecommendations` collection, generic runner, cost tracking |
| **3** | Phase 2 + 4: OptiMate template spec → system prompt → tools → output schema → first end-to-end run |
| **4** | Phase 5: approval queue UI + action executors for Google Ads negatives |
| **5** | OptiMate goes live on pilot client. Daily cron on. Watch costs and approval rate. |
| **6** | Iterate based on real data. Then start MetaMate (mirrors OptiMate, faster build). |
| **7+** | ContentAgent, ProposalAgent, AuditCuratorAgent — each one is a few days now the foundation exists. |

---

## Success Metrics

The whole point of the blog is cost + consistency. So we measure:

1. **Cost per run** — target $0.02–$0.12 AUD (vs. $0.60–$2.40 for generalist baseline). Logged automatically.
2. **Approval rate** — what % of agent recommendations get approved without edits? Target >70% by week 4.
3. **Time saved** — how long did the team previously spend on the work this agent now does? Tracked manually for v1.
4. **Output consistency** — pick 5 outputs at random each week, score 1–5 on brand fit. Target avg >4 by week 6.

If any metric drifts below target, the system prompt or schema is wrong — not the model.

---

## Files Referenced

- Blog: `drafts/why-custom-ai-agents-are-the-missing-piece.md`
- This plan: `drafts/custom-agents-build-plan.md`
- Existing Google Ads pipeline: `src/lib/google-ads-*.ts`, `src/collections/GoogleAdsAudits.ts`
- Existing usage tracking: `src/collections/UsageReports.ts`
