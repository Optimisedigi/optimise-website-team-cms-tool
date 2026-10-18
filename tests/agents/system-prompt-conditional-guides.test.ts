/**
 * buildSystemPromptForAudit \u2014 conditional guide inclusion.
 *
 * Covers the windowed keyword check that decides whether to inject
 * SCHEDULED_TASKS_GUIDE, DECK_GUIDE, and GEO_WALKTHROUGH into the system prompt.
 *
 * Back-compat: calling without `recentMessages` keeps the old behaviour
 * (heavy guides included). Passing an explicit array opts INTO conditional
 * inclusion — empty array means no heavy workflow guide loads.
 */

import { describe, it, expect } from "vitest";
import {
  buildSystemPromptForAudit,
  buildSystemPromptForPortfolio,
  guidanceForRequestedBundles,
} from "@/lib/agents/optimate-google-ads/config";
import type { Message } from "@/lib/agents/_shared/llm/types";

// Pull a distinctive sentence from each guide so the assertion can check
// inclusion without relying on the full block.
const SCHEDULED_TASKS_SIGNATURE = "Never fabricate cron expressions";
const DECK_SIGNATURE = "you MUST have:";
const GEO_SIGNATURE = "INCREMENTAL ADDITIONS";
// One-off Gmail draft guide, loaded on email/draft/budget-report triggers.
const GMAIL_DRAFT_SIGNATURE = "ONE-OFF Gmail drafts";
// Segmentation and memory guides follow the tools they describe.
const SEGMENTATION_SIGNATURE = "segmentationUnavailable";
const MEMORY_SIGNATURE = "When to call/request `remember`";
const ATTACHED_EMAIL_REPLY_SIGNATURE = "Selecting a Google Ads account does not by itself make an attached-email reply request a Google Ads data request";

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
  it("includes heavy guides for back-compat when recentMessages is omitted", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null);
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).toContain(DECK_SIGNATURE);
    expect(prompt).toContain(GEO_SIGNATURE);
  });

  it("loads the Gmail draft guide only when an email, draft or budget-report trigger fires", () => {
    // No recentMessages (back-compat path) keeps every guide.
    expect(buildSystemPromptForAudit(AUDIT, null)).toContain(GMAIL_DRAFT_SIGNATURE);
    // Routine turns no longer carry the ~10K-char guide.
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [] }),
    ).not.toContain(GMAIL_DRAFT_SIGNATURE);
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, {
        recentMessages: [userMsg("what is our CPA this week")],
      }),
    ).not.toContain(GMAIL_DRAFT_SIGNATURE);
    for (const text of [
      // The exact phrasing from the regression case the user reported.
      "Create a Gmail draft for the budget management email, and if CPA improved last week add a note on top",
      "email the monthly budget management report",
      "draft the MTD budget update",
      "give me the monthly budget management report",
      "do the weekly report for this client",
      "respond to this email thanking her for GA4 access",
    ]) {
      expect(
        buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [userMsg(text)] }),
        text,
      ).toContain(GMAIL_DRAFT_SIGNATURE);
    }
  });

  it("loads the segmentation guide only with the bundles whose tools take a segment", () => {
    const withMessages = (text: string) =>
      buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [userMsg(text)] });
    expect(buildSystemPromptForAudit(AUDIT, null)).toContain(SEGMENTATION_SIGNATURE);
    expect(withMessages("hello")).not.toContain(SEGMENTATION_SIGNATURE);
    expect(withMessages("what is our CPA this week")).toContain(SEGMENTATION_SIGNATURE);
    expect(withMessages("which search terms are wasting money")).toContain(SEGMENTATION_SIGNATURE);
  });

  it("loads the memory guide only when memory tools are attached", () => {
    expect(buildSystemPromptForAudit(AUDIT, null)).toContain(MEMORY_SIGNATURE);
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [userMsg("what is our CPA this week")] }),
    ).not.toContain(MEMORY_SIGNATURE);
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, {
        recentMessages: [userMsg("Remember that this client hates PMax")],
      }),
    ).toContain(MEMORY_SIGNATURE);
    expect(buildSystemPromptForPortfolio({ recentMessages: [userMsg("compare spend across accounts")] })).not.toContain(
      MEMORY_SIGNATURE,
    );
    expect(buildSystemPromptForPortfolio({ recentMessages: [userMsg("remember this for next time")] })).toContain(
      MEMORY_SIGNATURE,
    );
  });

  it("sends a left-out guide with a mid-run bundle request, and skips guides already loaded", () => {
    const notLoaded = { segmentation: false, memory: false };
    expect(guidanceForRequestedBundles(["performance"], notLoaded)).toContain(SEGMENTATION_SIGNATURE);
    expect(guidanceForRequestedBundles(["memory"], notLoaded)).toContain(MEMORY_SIGNATURE);
    expect(guidanceForRequestedBundles(["goals"], notLoaded)).toBeUndefined();
    expect(guidanceForRequestedBundles(["performance", "memory"], { segmentation: true, memory: true })).toBeUndefined();
  });

  it("does not load the scheduled-tasks guide for pausing a campaign", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("pause the brand campaign")],
    });
    expect(prompt).not.toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(
      buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [userMsg("pause my weekly report")] }),
    ).toContain(SCHEDULED_TASKS_SIGNATURE);
  });

  it("keeps the Gmail draft guide loaded for the answer to a graph-choice question", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [
        userMsg("put the weekly budget numbers into Gmail"),
        { role: "assistant", content: [{ type: "text", text: "Which graphs: keyword_relevancy, cpa_trend, or both?" }] },
        userMsg("both"),
      ],
    });
    expect(prompt).toContain(GMAIL_DRAFT_SIGNATURE);
  });

  it("includes heavy guides when recentMessages is omitted via the options object", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {});
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).toContain(DECK_SIGNATURE);
    expect(prompt).toContain(GEO_SIGNATURE);
  });

  it("excludes heavy guides when recentMessages is an empty array", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [],
    });
    expect(prompt).not.toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).not.toContain(DECK_SIGNATURE);
    expect(prompt).not.toContain(GEO_SIGNATURE);
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

  it("includes GEO_WALKTHROUGH when campaign structure keywords appear", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("build a new campaign structure based on the website")],
    });
    expect(prompt).toContain(GEO_SIGNATURE);
  });

  it("excludes heavy workflow guides for a generic CPA question", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("what is our CPA this week")],
    });
    expect(prompt).not.toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).not.toContain(DECK_SIGNATURE);
    expect(prompt).not.toContain(GEO_SIGNATURE);
  });

  it("still accepts the legacy 4th-arg string form (pinnedMemoryBlock)", () => {
    const prompt = buildSystemPromptForAudit(
      AUDIT,
      null,
      undefined,
      "PINNED FACT: client hates PMax",
    );
    expect(prompt).toContain("PINNED FACT: client hates PMax");
    // No recentMessages, back-compat keeps heavy guides.
    expect(prompt).toContain(SCHEDULED_TASKS_SIGNATURE);
    expect(prompt).toContain(DECK_SIGNATURE);
    expect(prompt).toContain(GEO_SIGNATURE);
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

  it("includes the attached-email reply rule without requiring Google Ads data", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("respond to this email thanking her for GA4 access")],
    });
    expect(prompt).toContain(ATTACHED_EMAIL_REPLY_SIGNATURE);
    expect(prompt).toContain("produce customer-facing email copy");
    expect(prompt).toContain("Do not fetch or cite Google Ads account data unless the user explicitly asks");
  });

  it("includes the NO ARITHMETIC SHOWN guardrail", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("hello")],
    });
    expect(prompt).toContain("NEVER SHOW ARITHMETIC");
  });
});

describe("buildSystemPromptForAudit size guard", () => {
  // The routine prompt went from 17.3K to under 8K characters by loading
  // guides with their tools and stating each rule once. Raising this budget
  // should be a deliberate choice, not drift.
  it("keeps a routine turn's prompt under 9,000 characters", () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, { recentMessages: [userMsg("hello")] });
    expect(prompt.length).toBeLessThan(9000);
  });

  it("states no long sentence twice, even with every guide loaded", () => {
    const counts = new Map<string, number>();
    for (const sentence of buildSystemPromptForAudit(AUDIT, null)
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter((item) => item.length >= 80)) {
      counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
    }
    expect([...counts].filter(([, count]) => count > 1).map(([sentence]) => sentence)).toEqual([]);
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
    // "draft" loads the Gmail draft guide so this check still covers it now
    // that routine turns leave it out.
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      recentMessages: [userMsg("draft the budget email")],
    });
    expect(prompt).toContain(GMAIL_DRAFT_SIGNATURE);
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
