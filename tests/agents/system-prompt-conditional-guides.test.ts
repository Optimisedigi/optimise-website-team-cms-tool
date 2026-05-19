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
// One-off Gmail draft guide — always loaded regardless of keywords.
const GMAIL_DRAFT_SIGNATURE = "ONE-OFF Gmail drafts";

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

  it("ALWAYS includes the one-off Gmail draft guide, regardless of recentMessages", () => {
    // No recentMessages (back-compat path).
    expect(buildSystemPromptForAudit(AUDIT, null)).toContain(GMAIL_DRAFT_SIGNATURE);
    // Empty array (conditional path, no triggers).
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [] }),
    ).toContain(GMAIL_DRAFT_SIGNATURE);
    // Generic CPA question (no triggers, no scheduled-task or deck guides).
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, {
        recentMessages: [userMsg("what is our CPA this week")],
      }),
    ).toContain(GMAIL_DRAFT_SIGNATURE);
    // The exact phrasing from the regression case the user reported.
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, {
        recentMessages: [
          userMsg("Create a Gmail draft for the budget management email, and if CPA improved last week add a note on top"),
        ],
      }),
    ).toContain(GMAIL_DRAFT_SIGNATURE);
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

  it("includes the NO DASHES guardrail at the top of hard rules", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("hello")],
    });
    expect(prompt).toContain("NO EM DASHES OR EN DASHES");
  });

  it("includes the NO ARITHMETIC SHOWN guardrail", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("hello")],
    });
    expect(prompt).toContain("NEVER SHOW ARITHMETIC");
  });
});

describe("buildSystemPromptForAudit dash hygiene", () => {
  /**
   * The user's soul rule (and the guardrail we just added) forbids em and en
   * dashes in any user-visible output. To make sure the agent's own system
   * prompt isn't modelling the banned punctuation, we assert that the
   * assembled prompt contains no em/en dashes EXCEPT inside the two rules
   * that legitimately name the chars they're banning.
   *
   * If this fails, look for em— or en– added to a guide block and replace
   * with a comma, period, or rewrite. Hyphens (-) are unaffected.
   */
  it("contains no em or en dashes outside the rules that name them", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("hello")],
    });
    // Strip the no-dash guardrail + the OUTPUT_FORMAT line that legitimately
    // names the banned chars. The substring "NO EM DASHES OR EN DASHES" is
    // the start of the guardrail; "NO em or en dashes" is the OUTPUT_FORMAT
    // mention. We blank both lines out so a real regression in any OTHER
    // block is the only thing the assertion can trip on.
    const lines = prompt.split("\n").map((line) => {
      if (line.includes("NO EM DASHES OR EN DASHES")) return "";
      if (line.includes("NO em or en dashes")) return "";
      return line;
    });
    const sanitised = lines.join("\n");
    // Note: hyphen-minus (-) is U+002D, em dash is U+2014, en dash is U+2013.
    const offendingChar = sanitised.match(/[\u2014\u2013]/);
    expect(
      offendingChar,
      offendingChar
        ? `system prompt contains a stray em/en dash near: ${sanitised.slice(Math.max(0, (sanitised.indexOf(offendingChar[0]) - 60)), sanitised.indexOf(offendingChar[0]) + 60)}`
        : undefined,
    ).toBeNull();
  });
});
