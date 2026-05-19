/**
 * keyword-matcher tests.
 *
 * Covers shouldIncludeGuide behaviour: case-insensitive substring matching,
 * the 4-message sliding window (current + 3 prior), and the empty-input
 * fallback.
 */

import { describe, it, expect } from "vitest";
import {
  shouldIncludeGuide,
  SCHEDULED_TASKS_TRIGGERS,
  DECK_TRIGGERS,
} from "@/lib/agents/optimate-google-ads/keyword-matcher";
import type { Message } from "@/lib/agents/_shared/llm/types";

function userMsg(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

function assistantMsg(text: string): Message {
  return { role: "assistant", content: [{ type: "text", text }] };
}

describe("shouldIncludeGuide", () => {
  it("returns true when the current message contains a trigger", () => {
    const messages = [userMsg("send me a weekly summary")];
    expect(shouldIncludeGuide(messages, SCHEDULED_TASKS_TRIGGERS)).toBe(true);
  });

  it("returns true when a trigger appears in one of the last 3 prior messages", () => {
    const messages = [
      userMsg("make me a deck for the owner"),
      assistantMsg("Sure, what launch date?"),
      userMsg("April 10"),
      userMsg("make the leads section bigger"),
    ];
    // "deck" sits in the 4th-from-last message — exactly inside the window.
    expect(shouldIncludeGuide(messages, DECK_TRIGGERS)).toBe(true);
  });

  it("returns false when no message in the 4-message window contains a trigger", () => {
    const messages = [
      userMsg("what is our CPA this week"),
      assistantMsg("$42 across the account"),
      userMsg("which campaigns drove it"),
    ];
    expect(shouldIncludeGuide(messages, SCHEDULED_TASKS_TRIGGERS)).toBe(false);
    expect(shouldIncludeGuide(messages, DECK_TRIGGERS)).toBe(false);
  });

  it("is case-insensitive", () => {
    const messages = [userMsg("Send Me A WEEKLY Recap")];
    expect(shouldIncludeGuide(messages, SCHEDULED_TASKS_TRIGGERS)).toBe(true);
    expect(shouldIncludeGuide(messages, DECK_TRIGGERS)).toBe(true);
  });

  it("matches substrings (so 'schedules' hits 'schedule')", () => {
    const messages = [userMsg("the agency schedules everything in advance")];
    expect(shouldIncludeGuide(messages, SCHEDULED_TASKS_TRIGGERS)).toBe(true);
  });

  it("returns false for empty or undefined messages", () => {
    expect(shouldIncludeGuide([], SCHEDULED_TASKS_TRIGGERS)).toBe(false);
    expect(shouldIncludeGuide(undefined, SCHEDULED_TASKS_TRIGGERS)).toBe(false);
  });

  it("ignores triggers outside the 4-message window", () => {
    const messages = [
      userMsg("make me a deck for the owner"), // trigger here
      assistantMsg("ok"),
      userMsg("a"),
      userMsg("b"),
      userMsg("c"),
      userMsg("d"), // only these 4 are in the window
    ];
    expect(shouldIncludeGuide(messages, DECK_TRIGGERS)).toBe(false);
  });

  it("returns false when the trigger list is empty", () => {
    expect(shouldIncludeGuide([userMsg("anything")], [])).toBe(false);
  });

  it("matches 'every friday' for scheduled tasks", () => {
    expect(
      shouldIncludeGuide([userMsg("can you email me this every friday?")], SCHEDULED_TASKS_TRIGGERS),
    ).toBe(true);
  });

  it("matches 'show the owner' for decks", () => {
    expect(
      shouldIncludeGuide([userMsg("a summary I can show the owner")], DECK_TRIGGERS),
    ).toBe(true);
  });

  it("handles non-text content parts without throwing", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "x", name: "y", input: {} },
          { type: "text", text: "weekly summary please" },
        ],
      },
    ];
    expect(shouldIncludeGuide(messages, SCHEDULED_TASKS_TRIGGERS)).toBe(true);
  });
});
