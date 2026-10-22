import { describe, expect, it, vi } from "vitest";
import { buildTriageRequest, groupBySender, parseTriageAnswer, triageSenders, TRIAGE_SENDERS_PER_CALL } from "@/lib/mail/triage";
import type { MessageSenderSubject } from "@/lib/mail/gmail-mail";

const msg = (id: string, from: string, subject: string, extra: Partial<MessageSenderSubject> = {}): MessageSenderSubject => ({
  messageId: id, threadId: `t${id}`, from, subject, ...extra,
});

describe("groupBySender", () => {
  it("groups by lower-cased address, biggest sender first, and flags bulk mail", () => {
    const groups = groupBySender([
      msg("1", "Jo <jo@x.com>", "Hello"),
      msg("2", "News <News@List.com>", "Issue 1", { listUnsubscribe: "<mailto:u@list.com>" }),
      msg("3", "news@list.com", "Issue 2"),
      msg("4", "news@list.com", "Issue 2"),
    ]);
    expect(groups.map((g) => [g.address, g.count, g.bulk])).toEqual([["news@list.com", 3, true], ["jo@x.com", 1, false]]);
    expect(groups[0]).toMatchObject({ name: "News", subjects: ["Issue 1", "Issue 2"], messageIds: ["2", "3", "4"] });
  });
});

describe("buildTriageRequest", () => {
  it("sends one line per sender with two subjects, never message ids or bodies", () => {
    const [sender] = groupBySender([msg("abc123", "Ann <ann@seo.io>", "Rank #1"), msg("def456", "ann@seo.io", "Bump"), msg("g", "ann@seo.io", "Third")]);
    const request = buildTriageRequest([sender!]);
    const text = request.messages[0]!.text;
    expect(text).toContain("1. Ann <ann@seo.io> | 3 unread | Rank #1 / Bump");
    expect(text).not.toMatch(/Third|abc123|def456/);
    expect(request).toMatchObject({ action: "triage", emailCount: 3, gmailMessageId: null });
    expect(request.system).toContain("never see email bodies");
  });
});

describe("parseTriageAnswer", () => {
  it("reads numbered letters and keeps anything missing or unknown", () => {
    expect(parseTriageAnswer("1 s\n2. n\n3: x\n9 p\nnoise", 4)).toEqual(["sales_pitch", "newsletter", "keep", "keep"]);
  });
});

describe("triageSenders", () => {
  it("keeps clients away from the model, batches senders, and counts emails per category", async () => {
    const senders = groupBySender([
      msg("1", "client@acme.com", "Invoice"),
      ...Array.from({ length: TRIAGE_SENDERS_PER_CALL + 1 }, (_, i) => msg(`m${i}`, `s${String(i).padStart(3, "0")}@pitch.io`, "Grow your SEO")),
    ]);
    const classify = vi.fn(async (request: { messages: Array<{ text: string }> }) => {
      const lines = request.messages[0]!.text.split("\n").filter((line) => /^\d+\./.test(line));
      return lines.map((_, i) => `${i + 1} s`).join("\n");
    });
    const result = await triageSenders({ senders, isClient: (a) => a.endsWith("@acme.com"), classify });
    expect(classify).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(classify.mock.calls)).not.toContain("acme.com");
    expect(result.categories.map((c) => [c.key, c.count, c.defaultSelected])).toEqual([
      ["sales_pitch", TRIAGE_SENDERS_PER_CALL + 1, true],
      ["clients", 1, false],
    ]);
  });

  it("puts a failed batch under keep instead of failing the run", async () => {
    const senders = groupBySender([msg("1", "a@b.com", "x")]);
    const result = await triageSenders({ senders, isClient: () => false, classify: async () => { throw new Error("down"); } });
    expect(result).toMatchObject({ failedBatches: 1, batches: 1, categories: [{ key: "keep", count: 1 }] });
  });
});
