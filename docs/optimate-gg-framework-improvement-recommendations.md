# OptiMate and Google Ads Goal Agents: GG Framework Improvement Recommendations

Date: 26 May 2026

This document summarises what we can learn from Ken Kai's `gg-framework`, especially `gg-agent`, `ggcoder`, and the durable `/goal` system, and how those ideas can be applied to OptiMate, the Google Ads agent, and CMS goal agents.

## Executive summary

OptiMate already has strong foundations:

- A custom agent loop in `src/lib/agents/_shared/base-agent.ts`
- Canonical tool definitions in `src/lib/agents/_shared/tool.ts`
- Human approval queue safety for Google Ads changes
- Goal-agent scheduler and state machine in `src/lib/goal-agents/**`
- Post-run correction checks
- Tool catalog UI
- Memory tools
- Provider fallback

The biggest opportunities are to make the agent more modular, typed, event-driven, dynamically scoped, and durable.

The main lesson from `gg-framework` is:

> Keep the model's live context lean, make tools strongly typed, make critical safety rules code-enforced, and make long-running work durable with evidence, verifiers, and resumable state.

For OptiMate, that means:

- Fewer tools per turn
- Smaller prompts per turn
- Richer tool metadata
- Stricter proposal gates
- Better streaming/progress events
- More durable goal-agent evidence
- Stronger scheduler locking
- Clearer verification commands

---

## 1. Make OptiMate's tool loading dynamic

### Current state

`getTools()` in `src/lib/agents/optimate-google-ads/index.ts` loads every tool every chat turn:

- Google Ads read tools
- GA4, GSC, SERP, and AI visibility tools
- Proposal tools
- Scheduled task tools
- Deck tools
- Memory tools
- Goal-run tools
- Confirm tools

This is powerful, but it increases tool-selection noise and prompt size.

### Recommendation

Add a tool routing layer:

```ts
getToolsForIntent({
  message,
  connectionFlags,
  client,
  audit,
})
```

Possible tool groups:

- `coreDiagnostics`: account overview, campaign performance, search terms
- `budgetEmail`: budget email, weekly metric table, Gmail draft
- `negativeKeywords`: search terms, propose NKL tools
- `campaignStructure`: campaign status, restructure, build, ad group, keyword tools, request confirm
- `searchAndAi`: GSC, GA4, SERP, AI visibility
- `memory`: memory search, remember, soul set
- `scheduledTasks`: scheduled task tools
- `goalRuns`: list, create, and get goal runs

### Benefits

- Better tool choice
- Lower token cost
- Fewer accidental proposal/tool calls
- Easier intent-to-tool tests
- Faster LLM responses

---

## 2. Split the giant prompt into always-on core plus lazy guides

### Current state

`src/lib/agents/optimate-google-ads/config.ts` contains a large prompt with role, guardrails, full tool inventory, date guide, segmentation guide, Gmail guide, scheduled task guide, deck guide, memory guide, and campaign restructure guide.

Some guides are already conditionally included, which is good, but the tool inventory and core prompt can still become large.

### Recommendation

Move to a `ggcoder`-style lean prompt.

Always-on core:

- Identity
- Ground numeric claims in tools
- Never apply live changes, queue approvals
- Concise reply style
- Customer ID privacy
- No em dash or en dash rule
- Proposal safety requirements

Lazy injected guides:

- Date/segmentation guide only for date-window intent
- Gmail guide only for draft/email intent
- Scheduled task guide only for recurring report intent
- Deck guide only for deck/presentation intent
- Campaign restructure guide only for rebuild/build intent
- Negative keyword guide only for negative keyword intent

### Benefits

- Lower prompt size
- Better instruction following
- Easier prompt audits
- Easier feature additions without prompt bloat

---

## 3. Add streaming-style agent events internally

`gg-agent` exposes events such as:

- `text_delta`
- `thinking_delta`
- `tool_call_start`
- `tool_call_update`
- `tool_call_end`
- `turn_end`
- `agent_done`
- `retry`
- `error`

OptiMate currently returns a final result and logs steps, but it could expose progress events.

### Recommendation

Add an optional event callback to `runAgent`:

```ts
onEvent?: (event: AgentEvent) => void
```

Useful event types:

```ts
type OptiMateAgentEvent =
  | { type: 'reasoning_started'; turn: number }
  | { type: 'tool_call_start'; toolName: string; input: unknown }
  | { type: 'tool_call_end'; toolName: string; ok: boolean; durationMs: number }
  | { type: 'proposal_queued'; approvalId: number; proposalType: string }
  | { type: 'provider_failover'; from: string; to: string }
  | { type: 'retry'; reason: string; attempt: number }
  | { type: 'done'; usage: Usage }
```

### Benefits

- Chat UI can show “Pulling search terms…”
- Operators can see stuck tool calls
- Activity logs become richer
- Easier debugging for failed Gmail drafts, Growth Tools calls, and campaign builds
- Goal-agent cron can record meaningful progress

---

## 4. Add `ToolContext.signal` and `onUpdate`

`gg-agent` tools receive a context with `signal`, `toolCallId`, and `onUpdate`.

Current OptiMate tool context is smaller:

```ts
{
  agentName,
  agentRunId,
  context,
  log,
}
```

### Recommendation

Extend it:

```ts
export interface ToolContext {
  agentName: string
  agentRunId: string
  context: Record<string, unknown>
  signal?: AbortSignal
  toolCallId?: string
  log: (msg: string, meta?: Record<string, unknown>) => void
  onUpdate?: (update: unknown) => void
}
```

Then pass the signal into Growth Tools fetches and long-running operations.

### Benefits

- Cancel long Growth Tools requests
- Emit partial progress for slow operations
- Avoid zombie agent turns
- Safer scheduled and goal-agent runs under cron limits

---

## 5. Add per-tool execution modes

`gg-agent` supports:

```ts
executionMode?: 'parallel' | 'sequential'
```

OptiMate currently executes tool calls sequentially.

### Recommendation

Add execution modes to tools.

Safe to run in parallel:

- Read-only tools
- Account overview
- Campaign performance
- Search terms
- GA4/GSC reads
- Memory search

Must stay sequential:

- Proposal tools
- Gmail draft creation
- Memory writes
- Goal-run creation
- Confirm gate
- Anything creating approvals

### Benefits

If the model requests account overview, campaign performance, and search terms in one turn, those can run concurrently and make the chat noticeably faster.

---

## 6. Standardise structured tool results

Current tools return:

```ts
{
  ok,
  data,
  error,
}
```

This works, but a richer shape would improve both LLM grounding and UI rendering.

### Recommendation

Use a standard result shape:

```ts
interface OptiMateToolResult<TDetails = unknown> {
  ok: boolean
  summary: string
  data?: TDetails
  error?: string
  display?: {
    title?: string
    metrics?: Array<{ label: string; value: string }>
    links?: Array<{ label: string; href: string }>
  }
}
```

Example for `get_search_terms`:

```json
{
  "ok": true,
  "summary": "Found 23 search terms over LAST_30_DAYS. Top waste: $412 across 9 zero-conversion terms.",
  "data": {
    "rows": []
  }
}
```

### Benefits

- LLM sees a compact, useful summary
- UI can render cards/tables from `display`
- Full data remains available for grounding
- Less chance the model misreads giant JSON payloads

---

## 7. Add automatic tool-result truncation and summarisation

Large Google Ads payloads can crowd out instructions and cause slower or less reliable model calls.

### Recommendation

Add agent-level `maxToolResultChars`, but avoid blindly cutting JSON. Prefer per-tool summaries:

- Top 20 search terms by spend
- Top 20 campaigns by spend or conversions
- Totals
- Omitted row count
- `resultTruncated: true`

### Benefits

- Smaller context
- Better model focus
- Lower provider error risk
- Lower cost

---

## 8. Add context transformation and compaction

`gg-agent` supports:

```ts
transformContext(messages, { force })
```

OptiMate currently appends every assistant/tool turn and passes history forward.

### Recommendation

Add `transformContext` to the base agent.

Use it to:

- Compact old chat turns
- Preserve latest tool results
- Preserve approval IDs
- Preserve client/audit facts
- Remove huge stale tool outputs
- Repair problematic tool-use/tool-result history

### Benefits

- Prevents context overflow
- Reduces “lost in the middle”
- Makes long OptiMate chats more reliable

---

## 9. Borrow `/goal`'s durable evidence model for Google Ads goal agents

The `ggcoder` `/goal` system uses:

- Success criteria
- Prerequisites
- Evidence plan
- Harness/verifier
- Worker tasks
- Durable evidence
- Final completion audit
- Verifier pass is not enough, final audit required

### Recommendation

For Google Ads goal agents, add concepts like:

```ts
successCriteria
evidencePlan
verifierCommandOrCheck
lastVerifierResult
completionAudit
blockers
attempts
```

Example for `search-term-waste-reducer`:

Success criteria:

- Identify waste terms above configured spend threshold
- Queue NKL approval, not live push, unless tier allows
- No brand/protected terms included
- Approval row includes supporting spend/click/conversion numbers

Evidence plan:

- Growth Tools search term pull completed
- Protected term filter ran
- Approval row created, or “no action needed” recorded
- Snapshot contains proposed payload and risk tier

Verifier:

- Check latest snapshot has non-empty proposedPayload
- Check every proposed keyword has reason and supporting metrics
- Check no protected terms are included

Final audit:

- Compare queued approval against original goal and risk rules

### Benefits

- Safer autonomous Google Ads work
- Better human trust
- Easier audits and debugging
- Stronger completion criteria

---

## 10. Add goal setup mode from OptiMate chat

OptiMate already has tools such as:

- `create_goal_run`
- `create_account_efficiency_goal_run`
- `list_goal_runs`
- `get_goal_run`

### Recommendation

Add a workflow like:

> “Set up a goal to reduce wasted search-term spend for this client.”

The agent should:

1. Define the objective
2. Define success criteria
3. Check prerequisites:
   - client has Google Ads customer ID
   - Growth Tools is reachable
   - audit/client relation exists
   - approval system is available
4. Create the goal run
5. Define evidence plan
6. Schedule first check
7. Tell the user exactly what will happen and when

### UI idea

Add a “Create Goal” guided panel in the audit chat:

- Goal type
- Spend threshold
- Brand/protected terms
- Approval mode
- Cadence
- Max actions per run
- Measurement window

---

## 11. Add a controller decision engine for CMS goal agents

`ggcoder` uses a central `decideGoalNextAction` function.

Your scheduler currently dispatches due rows and lets handlers do most gating.

### Recommendation

Create:

```ts
decideGoogleAdsGoalNextAction(goalRun)
```

Possible decisions:

```ts
type GoalDecision =
  | { kind: 'blocked'; reason: string }
  | { kind: 'wait'; until: string; reason: string }
  | { kind: 'run_analysis' }
  | { kind: 'queue_approval' }
  | { kind: 'wait_for_approval' }
  | { kind: 'apply_approved_action' }
  | { kind: 'measure' }
  | { kind: 'complete' }
  | { kind: 'failed'; reason: string }
```

### Benefits

- One place to test lifecycle logic
- Less duplicated handler branching
- Easier to add new goal types
- Stronger observability

---

## 12. Emit synthetic events after goal-agent milestones

`ggcoder` emits synthetic events when workers or verifiers complete.

### Recommendation

When a goal-agent tick does something important, emit a structured event:

```ts
{
  type: 'goal_agent_tick_complete',
  goalRunId,
  goal,
  fromStatus,
  toStatus,
  actionTaken,
  approvalId,
  evidence,
  nextCheckAt,
}
```

OptiMate chat can then explain:

> “The waste reducer checked Berendsen this morning. It found $218 of zero-conversion search-term spend and queued approval #123.”

### Benefits

- Bridges background automation and chat
- Makes autonomous work visible
- Better activity feed and notifications

---

## 13. Add first-class worker/tick summaries

`gg-boss` workers report:

- Changed
- Skipped
- Verified
- Notes
- Status

### Recommendation

Every Google Ads goal-agent tick should produce:

```ts
interface GoalAgentTickReport {
  changed: string[]
  skipped: string[]
  verified: string[]
  notes: string[]
  status: 'DONE' | 'WAITING' | 'BLOCKED' | 'FAILED' | 'NEEDS_APPROVAL'
}
```

### Benefits

- Better admin UI
- Easier debugging
- Better notifications
- Clearer client/account history

---

## 14. Add prompt size budget tests

`ggcoder` explicitly optimises prompt size. OptiMate should do the same.

### Recommendation

Add tests like:

```ts
expect(tokenEstimate(buildSystemPromptForAudit(...))).toBeLessThan(8000)
```

Also test conditional guide inclusion:

- Gmail guide included only for Gmail intent
- Deck guide included only for deck intent
- Scheduled guide included only for recurring report intent
- Date guide included only for date intent
- Memory block capped

### Benefits

- Prevents prompt bloat
- Catches accidental always-on guide additions
- Keeps OptiMate fast and reliable

---

## 15. Make tool schema validation stricter and consistent

`gg-agent` standardises Zod schemas as the source of truth.

### Recommendation

Make every tool use one helper:

```ts
defineOptiMateTool({
  name,
  description,
  schema,
  execute,
  executionMode,
  category,
  riskTier,
})
```

The helper should generate:

- JSON schema
- runtime validator
- catalog metadata
- risk metadata
- prompt/tool description

### Benefits

- Less duplicate boilerplate
- Fewer invalid tool calls
- Easier tool catalog generation
- Easier safety gating

---

## 16. Add tool risk metadata

Google Ads actions need explicit risk levels.

### Recommendation

Add metadata like:

```ts
risk: 'read' | 'cms-write' | 'approval-only' | 'external-write' | 'gmail-draft'
requiresConfirmation: boolean
requiresApproval: boolean
```

Examples:

- `get_search_terms`: `read`
- `remember`: `cms-write`
- `create_gmail_draft`: `gmail-draft`
- `propose_budget_push_live`: `approval-only`
- future direct apply tools: `external-write`

### Benefits

- UI can show risk badges
- Agent loop can enforce confirmation
- Tests can assert no live mutation tools are exposed without approval
- Goal agents can block black-tier actions

---

## 17. Move confirm gates from prompt-only to code-enforced

Current prompt rule:

> Before `propose_campaign_restructure` or `propose_campaign_build`, call `request_confirm`.

This is important, but prompt-only safety can fail.

### Recommendation

Enforce in code:

- `propose_campaign_restructure` requires a valid `confirmId`
- `propose_campaign_build` requires a valid `confirmId`
- Confirmation expires after one turn or a short time window
- Confirmed settings must match proposed settings

### Benefits

- Critical safety rule no longer depends only on model compliance
- Prevents accidental heavy proposal creation
- Easier to test

---

## 18. Add automatic “status first” for goal-run tools

`ggcoder` found that relying on the model to call `goals status` first is a weakness.

### Recommendation

For goal-run tools:

- Auto-load latest goal state before synthetic goal events
- Mutating goal tools should internally fetch current state first
- Optionally reject updates if caller lacks latest `updatedAt` or version

### Benefits

- Prevents stale-state mistakes
- Makes background goal work safer
- Reduces model dependence

---

## 19. Add single-flight locks around goal-agent transitions

Scheduler overlap can happen through cron retries, manual triggers, or concurrent execution.

### Recommendation

Add a per-goal-run lease:

```ts
leaseOwner
leaseExpiresAt
```

Scheduler flow:

1. Find due unlocked runs
2. Claim lease if expired
3. Process run
4. Clear lease

### Benefits

- Avoids duplicate approvals
- Avoids duplicate Growth Tools calls
- Avoids conflicting status transitions

---

## 20. Add timeout and retry classification for goal-agent ticks

`gg-agent` has strong error classification for provider and transport failures.

### Recommendation

Create shared error utilities:

```ts
classifyAgentError(err):
  | 'growth_tools_unavailable'
  | 'google_ads_auth'
  | 'rate_limit'
  | 'provider_overloaded'
  | 'validation'
  | 'timeout'
  | 'billing'
  | 'unknown'
```

Use this in:

- OptiMate chat
- Scheduled tasks
- Goal-agent scheduler
- Growth Tools connector
- Gmail draft tool

### Benefits

- Better retries
- Better user messages
- Better escalation
- Cleaner activity logs

---

## 21. Add provider/model profiles by task type

`ggcoder` and `gg-boss` support model switching. OptiMate can route model choice by task.

### Recommendation

Add model profiles:

```ts
modelProfile:
  | 'fast-diagnostic'
  | 'deep-strategy'
  | 'client-copy'
  | 'scheduled-report'
```

Suggested routing:

- Fast/cheap model for summarising tool results
- Strong model for campaign restructure reasoning
- Strong model for client-facing email/deck copy
- Deterministic/no LLM for pure filtering and budget calculations
- Fallback chain for provider errors

### Benefits

- Better cost control
- Lower latency
- Strong models used only where they matter

---

## 22. Add reusable agency workflow skills

`ggcoder` has reusable skills. OptiMate could have CMS-managed workflow recipes.

### Examples

- Budget update email
- Search-term waste review
- Monthly client performance summary
- Campaign restructure preflight
- Landing page issue diagnosis
- Stakeholder deck
- Account efficiency goal setup
- Gmail draft house style

### Implementation idea

Create a collection:

```ts
agent-skills
```

Fields:

- name
- trigger phrases
- prompt block
- required tools
- example workflow
- active
- client-specific override

Then inject only matching skills into the prompt.

### Benefits

- Team can improve workflows without editing code
- Keeps core prompt smaller
- Makes OptiMate more agency-specific over time

---

## 23. Add custom slash commands in OptiMate chat

Inspired by `ggcoder` slash commands.

### Examples

```txt
/budget-email
/waste-review
/build-goal
/weekly-report
/deck
/status
/memory
/tools
```

Each command can:

- Preselect an intent
- Load the right tools
- Inject the right guide
- Render a form if needed
- Reduce ambiguity

### Benefits

- Faster internal workflows
- Less prompt ambiguity
- More product-like agent experience

---

## 24. Add a Goal pane/dashboard inspired by `ggcoder` Ctrl+G

The CMS already has goal agents, but a dedicated UX would make them easier to trust and control.

### Recommended panel contents

- Active goal runs
- Status
- Next check time
- Latest evidence
- Pending approvals
- Blockers
- Last measurement
- Risk tier
- Pause/resume buttons
- Run now
- View snapshots
- Verifier result

### Benefits

- Team can manage autonomous work without digging through collections
- Clearer human-in-the-loop control center
- Easier operator trust

---

## 25. Add canonical verification scripts for agent quality

`ggcoder` has canonical verifier commands for `/goal`.

### Recommendation

Add scripts such as:

```bash
npm run verify:agents
npm run verify:google-ads-agent
npm run verify:goal-agents
```

Possible command contents:

```bash
npx tsc --noEmit
npm test -- tests/agents tests/lib/agents tests/lib/goal-agents tests/api/goal-agents
```

Plus prompt/tool inventory tests.

### Benefits

- Repeatable verification
- Easier regression checks
- Less need to remember individual test files

---

## 26. Add agent system-map documentation

`ggcoder` has a source-backed `goal-system-map.md`, which is very useful.

### Recommendation

Create:

```txt
docs/optimate-google-ads-agent-system-map.md
docs/google-ads-goal-agents-system-map.md
```

Include:

- Entry points
- Routes
- Tools
- Approval flow
- Growth Tools dependencies
- Gmail dependencies
- Goal-agent lifecycle
- Scheduler lifecycle
- Tests
- Known risks
- Verification commands

### Benefits

- Safer future changes
- Easier onboarding
- Easier audits
- Better architecture visibility

---

## 27. Improve the tool catalog into a true source of truth

Current file:

```ts
src/lib/agents/optimate-google-ads/tool-catalog.ts
```

This is already helpful, but category metadata is separate from the tool definitions.

### Recommendation

Move metadata closer to each tool definition:

```ts
defineOptiMateTool({
  name,
  category,
  risk,
  description,
  schema,
  guide,
  execute,
})
```

Generate from this:

- LLM tool defs
- UI catalog
- Prompt inventory
- Tests
- Safety rules

### Benefits

- Prevents drift between implementation, prompt, and UI
- Easier to add tools safely
- Easier to audit exposed capabilities

---

## 28. Add approval quality verification before creating approval rows

Every `propose_*` tool should run a preflight verifier.

### Recommendation

Add:

```ts
verifyApprovalProposal({
  type,
  payload,
  supportingNumbers,
  sourceToolResults,
  riskTier,
})
```

Checks:

- Summary present
- Supporting numbers present
- No raw customer ID
- No em/en dashes in client-facing copy
- No protected terms
- No missing campaign IDs
- Budget math is sane
- Proposal type matches payload
- Confirm gate satisfied if needed

### Benefits

- Moves prompt rules into code
- Reduces bad approval rows
- Improves human reviewer trust

---

## 29. Add background agent run replay/debugging

Because agent runs are logged as steps, add a debug view showing:

- Prompt
- Model requested and model used
- Tool calls
- Tool inputs
- Tool outputs
- Approval IDs
- Errors
- Usage and cost estimate
- Retry/fallback events

### Benefits

- Easier debugging
- Easier audits
- Faster fixes when the agent behaves unexpectedly

---

## 30. Recommended implementation sequence

### Phase 1: Low-risk, high-impact

1. Add `defineOptiMateTool()` helper with schema/category/risk metadata
2. Add prompt size tests and conditional guide tests
3. Add dynamic tool groups by intent
4. Add tool result truncation/summarisation
5. Add code-enforced confirm gates for restructure/build

### Phase 2: Observability and reliability

6. Add agent event emitter
7. Add `ToolContext.signal` and `onUpdate`
8. Add retry/error classification
9. Add agent run debug UI
10. Add canonical `verify:agents` command

### Phase 3: Goal-agent hardening

11. Add leases/single-flight locks for goal runs
12. Add goal evidence plan/verifier/final audit fields
13. Add controller decision engine
14. Add structured tick reports
15. Add Goal pane/admin UX

### Phase 4: Workflow and product polish

16. Add OptiMate slash commands
17. Add CMS-managed agent skills
18. Add model profiles
19. Add synthetic goal-agent events into chat
20. Add system-map docs

---

## Highest-value first projects

If we want the quickest practical improvement, start with these five:

1. **Dynamic tool groups by intent**  
   Reduces prompt/tool noise immediately.

2. **Code-enforced confirm gates**  
   Makes heavy campaign build/restructure flows safer.

3. **Tool result summaries/truncation**  
   Prevents large Google Ads payloads from polluting context.

4. **Agent event emitter**  
   Gives the UI and logs real progress visibility.

5. **Goal-agent leases and evidence plans**  
   Makes autonomous background work safer and more auditable.
