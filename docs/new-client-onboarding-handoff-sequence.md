# New Client Onboarding → Goal Agent Handoff Sequence

> Standard sequence for taking on a new client and transitioning from manual expert optimisation to autonomous goal-agent management.
> Source: design conversation, May 2026.

---

## The Core Principle

**Goal agents do not replace your strategic work — they do the ongoing tactical work you'd otherwise let slip.**

| What humans do | What goal agents do |
|---|---|
| Strategic moves: restructures, launches, audit-driven optimisations | Tactical moves: weekly negative keyword hygiene, slow CTR grind |
| Respond to seasonality, creative refreshes | Constant small bid modifier adjustments |
| Apply low-hanging fruit from audits | Watchdog vigilance 24/7 |
| Handle account anomalies | Never-forgetting follow-through across portfolio |

The first 30–60 days with a new client are the **worst possible environment** for an autonomous agent because:

- Conversion tracking might be wrong (not yet fully audited)
- Budget allocations might be miscalibrated
- Client's actual goals might differ from what they said
- Seasonality patterns are unknown
- Account history has anomalies you haven't seen yet

Goal agents work well in **steady-state accounts where the baseline is understood**. They work badly when the ground is shifting.

---

## Why Not Run the Agent from Day 1?

Three problems if you do:

### 1. Attribution problem
If you make 12 manual changes on day 1 and start a goal agent the same day, the agent will:
- See improvements in its target metric and **claim credit** for things you did
- Or see degradation from one of your changes and **respond by undoing the wrong thing**
- Or pollute its own learning data — "I added negatives and CPA improved" when actually you restructured ad groups the same day

Once the agent learns the wrong cause-and-effect, it keeps repeating the wrong action expecting the same result.

### 2. Wrong tool for the job
Low-hanging fruit from a fresh audit is **one-time strategic work where a human expert has already identified the answer**. The agent won't do it better, faster, or cheaper. Using a goal agent here is like using `/goal` to type out code you already have in your head.

### 3. Contaminated baseline
The agent's "baseline" should be the account in its stable post-cleanup state, not a moving target. Otherwise success/failure measurements are meaningless.

---

## The Recommended Sequence

### 📅 Days 1–14: Manual Reset Phase

**Your expert hand on the account. No agent activity.**

Activities:
- Apply all changes from the audit (the low-hanging fruit you identified)
- Fix conversion tracking if needed
- Establish proper account structure
- Set up brand campaign protection in the CMS (`protected: true` flag)
- Document brand campaign IDs and brand terms in client record
- **Document what you changed and when** (you'll need this for the health contract and for future training data)
- Identify which campaigns and ad groups are off-limits to future agents

Deliverables at end of Days 1–14:
- Audit changes deployed
- Account stable, no further planned changes
- Initial change log written (markdown file in client folder)
- Brand protection flags set in CMS

---

### 📅 Days 14–28: Stabilisation & Measurement Phase

**Hands off the account. Only monitor.**

Activities:
- Don't touch the account except to monitor
- Let Smart Bidding (if used) exit learning phase from your changes
- Observe the actual post-optimisation performance
- Establish realistic baselines for any future goal targets
- **Set up the Account Health Contract** (only possible now, after seeing the post-cleanup baseline):
  - Monthly spend commitment + tolerance band (e.g. 90–105% of $50k)
  - Impression share floor
  - Conversion volume floor (7-day rolling average)
  - Minimum active campaign count
  - Minimum active ad groups per campaign
  - List of protected campaigns/ad groups
  - Brand campaign IDs (untouchable)

Deliverables at end of Days 14–28:
- Baseline metrics documented
- Account Health Contract fully populated in CMS
- Decision made about which goal types are appropriate for this client

---

### 📅 Day 28+: Goal Agent Handoff Phase

**Now you decide what the agent does. Framing changes:**

> *"I've stabilised the account. Now I want the agent to do the ongoing maintenance work that I'd otherwise forget about or deprioritise."*

#### Recommended handoff order

Don't enable all goal types at once. Stagger them so each can be observed in isolation:

**Day 28:** Enable Spend Pacer + Watchdog (passive — no actions, only monitoring/alerts)
- Run for 7 days alone to confirm tripwires aren't false-positiving on normal account variance

**Day 35:** Enable first active goal — **Search Term Waste Reducer**
- Lowest blast radius
- Fastest feedback loop
- Easiest to measure success
- Run for full 14-day cycle, observe results

**Day 49:** If waste reducer succeeded, enable **Ad CTR Improver**
- Different action family (ad copy, not negatives) — no scheduler conflict
- Longer cycle (~3 weeks) but proven actions

**Day 70:** If both prior goals stable, enable **Budget Reallocation**
- Now touching budgets — higher stakes
- Requires solid spend pacer + watchdog already proven

**Day 90+:** Consider more ambitious goals (ad group restructure proposals, ROAS goals)

#### What the agent should NOT do for this client

Even after handoff, keep these as human-only for the first 90 days:

- Any changes to brand campaigns
- Bidding strategy *type* changes
- Campaign-level pause/enable
- Budget changes >10% in a single move
- New campaign launches

---

## Goal Types Appropriate for Steady-State Handoff

The right framing for what to hand off:

| Goal type | Why this is right for an agent |
|---|---|
| Weekly search term hygiene | You'll forget. The agent won't. |
| Monthly ad copy CTR improvement | Slow, iterative, benefits from never-ending experimentation |
| Continuous spend pacing watchdog | Needs 24/7 attention; humans don't provide it |
| Bid modifier tuning (device, time-of-day) | Tiny, frequent adjustments — death-by-papercuts work |
| Quarterly ad group restructure proposals | Agent surfaces candidates; you approve |

**None of these are "achieve the low-hanging fruit from the audit."** That's your job.

---

## Bonus: Turn Manual Audit Work into Future Training Data

When you make the manual changes during Days 1–14, document in a structured format:

```yaml
client: acme-bakery
audit_date: 2026-06-01
findings:
  - id: 1
    pattern: "high-spend zero-conversion search terms"
    evidence: "47 terms with >$50 spend, 0 conversions in last 30 days"
    hypothesis: "adding as negatives will reduce wasted spend by ~$2,800/mo"
    action_taken: "added 47 negatives to campaign X"
    applied_at: 2026-06-02
    
  - id: 2
    pattern: "missing ad extensions on top-performing campaign"
    evidence: "campaign Y has 0 sitelinks, 0 callouts"
    hypothesis: "adding 4 sitelinks + 6 callouts will lift CTR ~15%"
    action_taken: "added 4 sitelinks + 6 callouts"
    applied_at: 2026-06-03

post_30_day_results:
  - finding_id: 1
    actual_impact: "$2,400/mo wasted spend reduction (-86% on identified terms)"
    matched_hypothesis: true
  - finding_id: 2
    actual_impact: "CTR up 11% (slightly below hypothesis)"
    matched_hypothesis: partial
```

**Why this matters:** if you find that 80% of your audits identify the same five patterns, those five patterns become **future goal templates**. Your manual expert work today becomes the playbook agents execute autonomously in 12 months.

Nothing is wasted. You're not "missing the chance to let the agent do it" — you're generating the pattern library future agents will be built from.

---

## Quick Reference: The 90-Day Timeline

```
Day 0          Day 14         Day 28          Day 35         Day 49         Day 70         Day 90+
  │              │              │               │              │              │              │
  ├──Manual─────►│              │               │              │              │              │
  │   Reset      │              │               │              │              │              │
  │              │              │               │              │              │              │
  │              ├──Stabilise──►│               │              │              │              │
  │              │  & Measure   │               │              │              │              │
  │              │              │               │              │              │              │
  │              │              ├──Pacer +─────►│              │              │              │
  │              │              │  Watchdog     │              │              │              │
  │              │              │  (passive)    │              │              │              │
  │              │              │               │              │              │              │
  │              │              │               ├──Search─────►│              │              │
  │              │              │               │  Term Waste  │              │              │
  │              │              │               │  Reducer     │              │              │
  │              │              │               │              │              │              │
  │              │              │               │              ├──CTR────────►│              │
  │              │              │               │              │  Improver    │              │
  │              │              │               │              │              │              │
  │              │              │               │              │              ├──Budget─────►│
  │              │              │               │              │              │  Realloc     │
  │              │              │               │              │              │              │
  │              │              │               │              │              │              ├──Advanced
  │              │              │               │              │              │              │  (restructure,
  │              │              │               │              │              │              │   ROAS)
```

---

## TL;DR

1. **Days 1–14**: You apply the audit findings manually. No agent activity.
2. **Days 14–28**: Hands off. Observe. Set the account health contract using the stable baseline.
3. **Day 28**: Enable passive monitoring (pacer + watchdog) only.
4. **Day 35**: Enable first active goal (search term waste reducer).
5. **Day 49 onward**: Stagger additional goal types every 2 weeks if prior ones are stable.

The agent's job starts where your strategic work ends, not in place of it.

---

*End of onboarding sequence document.*
