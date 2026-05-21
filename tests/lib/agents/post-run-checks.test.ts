/**
 * post-run-checks tests.
 *
 * Covers both detectors plus the `checkRunForCorrection` wrapper. The
 * detectors are pure functions so the tests stay trivial.
 */

import { describe, it, expect } from "vitest";
import {
  detectZeroToolCallOnAction,
  detectPromisedButNotDelivered,
  checkRunForCorrection,
} from "@/lib/agents/optimate-google-ads/post-run-checks";

describe("detectZeroToolCallOnAction", () => {
  it("fires when the user asked for a draft and the agent made no tool calls", () => {
    const result = detectZeroToolCallOnAction(
      "Create a Gmail draft for the budget management email",
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("zero_tool_call_on_action");
    expect(result!.correctionNote).toContain("no tool calls");
  });

  it("fires on the exact Azores-misfire prompt phrasing", () => {
    const result = detectZeroToolCallOnAction(
      "Create a budget management email for this week. And then look at performance... and then push it to gmail as a draft",
      [],
    );
    expect(result).not.toBeNull();
  });

  it("does NOT fire when the user is asking a question (no action verb)", () => {
    expect(
      detectZeroToolCallOnAction("What's our CPA this week?", []),
    ).toBeNull();
    expect(
      detectZeroToolCallOnAction("Which campaigns are wasting spend?", []),
    ).toBeNull();
    expect(
      detectZeroToolCallOnAction("How did last week compare to the two weeks before?", []),
    ).toBeNull();
  });

  it("does NOT fire when at least one tool was called", () => {
    expect(
      detectZeroToolCallOnAction(
        "Create a Gmail draft for the budget email",
        ["get_budget_management_email"],
      ),
    ).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(
      detectZeroToolCallOnAction("CREATE A GMAIL DRAFT", []),
    ).not.toBeNull();
  });

  it("fires on 'propose' verb (covers restructure/build/negatives requests)", () => {
    expect(
      detectZeroToolCallOnAction("propose some negatives for this account", []),
    ).not.toBeNull();
  });

  it("fires on 'restructure' (long-running pipeline)", () => {
    expect(
      detectZeroToolCallOnAction("restructure these campaigns", []),
    ).not.toBeNull();
  });
});

describe("detectPromisedButNotDelivered", () => {
  it("fires when the reply says 'Building the draft now' and create_gmail_draft was NOT called", () => {
    const result = detectPromisedButNotDelivered(
      "Good data. CPA down 41%. Building the draft now.",
      ["get_budget_management_email", "get_campaign_performance"],
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("promised_but_not_delivered");
    expect(result!.correctionNote).toContain("create_gmail_draft");
  });

  it("does NOT fire when create_gmail_draft WAS called", () => {
    expect(
      detectPromisedButNotDelivered(
        "Good data. CPA down 41%. Building the draft now.",
        ["get_budget_management_email", "create_gmail_draft"],
      ),
    ).toBeNull();
  });

  it("fires on alternative phrasings ('saving to gmail', 'pushing to gmail', etc.)", () => {
    for (const phrase of [
      "Saving to Gmail now.",
      "Pushing to Gmail now.",
      "Pushing it to Gmail now.",
      "I'll draft this and save it.",
      "I will create the draft.",
      "Dropping in Gmail now.",
    ]) {
      const result = detectPromisedButNotDelivered(phrase, ["get_campaign_performance"]);
      expect(result, `Expected '${phrase}' to fire`).not.toBeNull();
    }
  });

  it("fires on future-tense narrations (the real chat-log failure case)", () => {
    // Verbatim from a production OptiMate run that returned text twice in a
    // row without ever calling create_gmail_draft. The user said "push it
    // to Gmail for me" and the agent replied with these phrases instead
    // of just calling the tool. The earlier phrase list only matched
    // present-continuous / mid-action verbs and missed every future-tense
    // narration like this one.
    for (const phrase of [
      "Now I'll build the callout and push to Gmail.",
      "Now I'll build the callout with the four-week trend and push to Gmail.",
      "I'll push it to Gmail for you.",
      "I will push to Gmail once I have the HTML.",
      "I'll save it as a draft in Gmail.",
      "I'll save to Gmail now.",
      "Now I'll create the draft.",
      "Now I'll draft the email.",
      "I'll build the email and save it.",
    ]) {
      const result = detectPromisedButNotDelivered(phrase, [
        "get_budget_management_email",
        "get_campaign_performance",
      ]);
      expect(result, `Expected '${phrase}' to fire`).not.toBeNull();
      expect(result!.correctionNote).toContain("create_gmail_draft");
    }
  });

  it("does NOT fire future-tense narrations when create_gmail_draft was actually called", () => {
    expect(
      detectPromisedButNotDelivered(
        "Now I'll build the callout and push to Gmail.",
        ["get_budget_management_email", "create_gmail_draft"],
      ),
    ).toBeNull();
  });

  it("fires when reply says 'queueing the proposal' but no propose_* tool was called", () => {
    const result = detectPromisedButNotDelivered(
      "Got it. Queueing the proposal now.",
      ["get_search_terms"],
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("promised_but_not_delivered");
  });

  it("does NOT fire when ANY propose_* tool was called and reply mentions queueing", () => {
    expect(
      detectPromisedButNotDelivered(
        "Queueing the proposal for approval.",
        ["propose_negative_keywords"],
      ),
    ).toBeNull();
    expect(
      detectPromisedButNotDelivered(
        "I'll queue this for you.",
        ["propose_campaign_restructure"],
      ),
    ).toBeNull();
  });

  it("fires on 'scheduling the task' without propose_scheduled_task", () => {
    expect(
      detectPromisedButNotDelivered(
        "Scheduling the task for every Monday at 9am.",
        ["get_campaign_performance"],
      ),
    ).not.toBeNull();
  });

  it("does NOT fire when propose_scheduled_task WAS called", () => {
    expect(
      detectPromisedButNotDelivered(
        "Scheduling the task for Monday 9am.",
        ["propose_scheduled_task"],
      ),
    ).toBeNull();
  });

  it("fires on 'I'll remember that' without a remember tool call", () => {
    expect(
      detectPromisedButNotDelivered(
        "Got it. I'll remember that for next time.",
        [],
      ),
    ).not.toBeNull();
  });

  it("does NOT fire when remember WAS called", () => {
    expect(
      detectPromisedButNotDelivered(
        "I'll remember that for next time.",
        ["remember"],
      ),
    ).toBeNull();
  });

  it("does NOT fire on a clean reply with no action claims", () => {
    expect(
      detectPromisedButNotDelivered(
        "CPA improved from $254 to $151, a 41% drop. No action needed this week.",
        ["get_campaign_performance"],
      ),
    ).toBeNull();
  });

  it("returns null for an empty reply", () => {
    expect(detectPromisedButNotDelivered("", [])).toBeNull();
  });

  it("is case-insensitive on the claim phrase", () => {
    expect(
      detectPromisedButNotDelivered("BUILDING THE DRAFT NOW.", []),
    ).not.toBeNull();
  });
});

describe("checkRunForCorrection", () => {
  it("reports the zero-tool-call problem first (Azores scenario)", () => {
    const result = checkRunForCorrection(
      "Create a Gmail draft for the budget management email",
      "The island of Terceira, in the Azores archipelago...",
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("zero_tool_call_on_action");
  });

  it("reports the promised-but-not-delivered problem when at least one tool was called", () => {
    const result = checkRunForCorrection(
      "Create a Gmail draft for the budget management email",
      "Good data. CPA down 41%. Building the draft now.",
      ["get_budget_management_email", "get_campaign_performance"],
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("promised_but_not_delivered");
  });

  it("returns null for a clean run with tools called and no false claims", () => {
    const result = checkRunForCorrection(
      "Create a Gmail draft for the budget email",
      "Draft saved to Gmail. CPA improved from $254 to $151. [Open in Gmail](url).",
      ["get_budget_management_email", "get_campaign_performance", "create_gmail_draft"],
    );
    expect(result).toBeNull();
  });

  it("returns null for a clean question-and-answer run", () => {
    const result = checkRunForCorrection(
      "What is our CPA this week?",
      "CPA this week is $151 (get_campaign_performance, last 7 days).",
      ["get_campaign_performance"],
    );
    expect(result).toBeNull();
  });
});
