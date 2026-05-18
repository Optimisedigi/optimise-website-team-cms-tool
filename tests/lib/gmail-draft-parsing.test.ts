/**
 * Email-header extraction + agent sign-off stripping for the
 * /api/gmail/draft route. These two helpers are what hoist OptiMate's
 * `Subject:` / `To:` lines out of the message body into the Gmail draft's
 * subject + recipient fields, and remove the model's habitual closing
 * prompts so client-facing email doesn't leak agent chatter.
 *
 * Both helpers are pure string transforms with no IO — fast, no mocks.
 */

import { describe, it, expect } from "vitest";
import {
  extractEmailHeaders,
  stripAgentSignOff,
} from "@/lib/gmail-draft-parsing";

describe("extractEmailHeaders", () => {
  it("returns body unchanged when there's no header block", () => {
    const input = "Hi team,\n\nQuick update on the campaign.";
    const out = extractEmailHeaders(input);
    expect(out).toEqual({ body: input });
  });

  it("hoists Subject: and To: out of a leading header block", () => {
    const input = [
      "Subject: April budget update",
      "To: client@example.com",
      "",
      "Hi Jane,",
      "",
      "Quick update on April.",
    ].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.subject).toBe("April budget update");
    expect(out.to).toBe("client@example.com");
    expect(out.body).toBe("Hi Jane,\n\nQuick update on April.");
  });

  it("handles headers in any order", () => {
    const input = [
      "To: a@b.com",
      "Subject: hello",
      "",
      "Body line.",
    ].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.subject).toBe("hello");
    expect(out.to).toBe("a@b.com");
    expect(out.body).toBe("Body line.");
  });

  it("includes Cc / Bcc when present", () => {
    const input = [
      "Subject: hi",
      "To: a@b.com",
      "Cc: c@d.com",
      "Bcc: e@f.com",
      "",
      "Body.",
    ].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.cc).toBe("c@d.com");
    expect(out.bcc).toBe("e@f.com");
    expect(out.body).toBe("Body.");
  });

  it("skips a leading blank line before the header block", () => {
    const input = ["", "Subject: hi", "", "Body."].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.subject).toBe("hi");
    expect(out.body).toBe("Body.");
  });

  it("does NOT hoist Subject: that appears deeper in the prose", () => {
    const input = [
      "Hi team,",
      "",
      "Subject: this is a discussion of the subject",
      "",
      "etc.",
    ].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.subject).toBeUndefined();
    expect(out.body).toBe(input);
  });

  it("ignores trailing whitespace on header values", () => {
    const input = "Subject:   trimmed   \n\nBody.";
    const out = extractEmailHeaders(input);
    expect(out.subject).toBe("trimmed");
  });

  it("handles a header block with no blank line before the body", () => {
    // Some models skip the separator. We stop at the first non-header line.
    const input = ["Subject: x", "To: a@b.com", "Body line."].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.subject).toBe("x");
    expect(out.to).toBe("a@b.com");
    expect(out.body).toBe("Body line.");
  });

  it("returns later occurrences of repeated headers (last one wins)", () => {
    const input = [
      "To: first@example.com",
      "Subject: hi",
      "To: second@example.com",
      "",
      "Body.",
    ].join("\n");
    const out = extractEmailHeaders(input);
    expect(out.to).toBe("second@example.com");
  });
});

describe("stripAgentSignOff", () => {
  it("removes the exact 'Want me to tweak the tone...' sign-off after a --- separator", () => {
    const input = [
      "Hi Jane,",
      "",
      "Quick note about the campaign.",
      "",
      "---",
      "Want me to tweak the tone or add anything before you send it?",
    ].join("\n");
    const out = stripAgentSignOff(input);
    expect(out).toBe("Hi Jane,\n\nQuick note about the campaign.");
  });

  it("removes 'Want me to adjust...' variants", () => {
    const input = [
      "Body.",
      "",
      "Want me to adjust the tone before sending?",
    ].join("\n");
    expect(stripAgentSignOff(input)).toBe("Body.");
  });

  it("removes a trailing 'Let me know if you'd like...' line", () => {
    const input = ["Body.", "", "Let me know if you'd like a shorter version."].join("\n");
    expect(stripAgentSignOff(input)).toBe("Body.");
  });

  it("removes a dangling --- separator if the sign-off followed it", () => {
    const input = [
      "Body.",
      "",
      "---",
      "Want me to polish anything before sending?",
    ].join("\n");
    expect(stripAgentSignOff(input)).toBe("Body.");
  });

  it("leaves the body alone when there is no agent sign-off", () => {
    const input = "Just a plain message body.\n\nNo trailing agent chatter.";
    expect(stripAgentSignOff(input)).toBe(input);
  });

  it("does NOT strip the user's own 'Let me know if...' that's NOT at the end", () => {
    const input = [
      "Let me know if this works:",
      "",
      "1. Step one",
      "2. Step two",
    ].join("\n");
    // The "Let me know if..." is at the top, not the trailing tail.
    expect(stripAgentSignOff(input)).toBe(input);
  });

  it("trims trailing whitespace", () => {
    expect(stripAgentSignOff("Body.\n\n  \n")).toBe("Body.");
  });
});
