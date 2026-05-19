/**
 * buildSystemPromptForAudit \u2014 conditional guide inclusion.
 *
 * Covers the windowed keyword check that decides whether to inject
 * SCHEDULED_TASKS_GUIDE and DECK_GUIDE into the system prompt.
 *
 * Back-compat: calling without `recentMessages` keeps the old behaviour
 * (both guides included). Passing an explicit array opts INTO conditional
 * inclusion \u2014 empty array means neither guide loads.
 */

import { describe, it, expect } from "vitest";
import { buildSystemPromptForAudit } from "@/lib/agents/optimate-google-ads/config";
import type { Message } from "@/lib/agents/_shared/llm/types";

// Pull a distinctive sentence from each guide so the assertion can check
// inclusion without relying on the full block.
const SCHEDULED_TASKS_SIGNATURE = "Never fabricate cron expressions";
const DECK_SIGNATURE = "you MUST have:";

const AUDIT = {
  id: 999,
  businessName: "Test Co",
  customerId: "123-456-7890",
  monthlySpend: 5000,
  brandTerms: "",
};

function userMsg(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

describe("buildSystemPromptForAudit conditional guide inclusion", () => {
  it("includes BOTH guides for back-compat when recentMessages is omitted", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null);
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).toContain(DECK_SIGNATURE);
  });

  it("includes BOTH guides when recentMessages is omitted via the options object", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {});
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).toContain(DECK_SIGNATURE);
  });

  it("excludes BOTH guides when recentMessages is an empty array", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [],
    });
    expect(prompt).not.toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).not.toContain(DECK_SIGNATURE);
  });

  it("includes SCHEDULED_TASKS_GUIDE when 'weekly recap' appears in the last message", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("send me a weekly recap every Monday")],
    });
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    // 'recap' is also a deck trigger \u2014 so the deck guide should fire too.
    expect(prompt).toContain(DECK_SIGNATURE);
  });

  it("includes DECK_GUIDE when 'create a deck' appears in turn 1 but later turns are generic", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [
        userMsg("create a deck for the owner"),
        { role: "assistant", content: [{ type: "text", text: "Sure, what launch date?" }] },
        userMsg("April 10"),
        userMsg("make the leads section bigger"),
      ],
    });
    expect(prompt).toContain(DECK_SIGNATURE);
  });

  it("excludes both guides for a generic CPA question", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("what is our CPA this week")],
    });
    expect(prompt).not.toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).not.toContain(DECK_SIGNATURE);
  });

  it("still accepts the legacy 4th-arg string form (pinnedMemoryBlock)", () => {
    const prompt = buildSystemPromptForAudit(
      AUDIT,
      null,
      undefined,
      "PINNED FACT: client hates PMax",
    );
    expect(prompt).toContain("PINNED FACT: client hates PMax");
    // No recentMessages \u2014 back-compat keeps both guides.
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).toContain(DECK_SIGNATURE);
  });

  it("always includes the confirm-gate rule in guardrails", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("hello")],
    });
    expect(prompt).toContain("CONFIRM GATE");
    expect(prompt).toContain("Want me to restructure the campaigns for approval?");
    expect(prompt).toContain("Want me to build the campaigns for approval?");
  });
});
