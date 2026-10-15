import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_SENDERS_PREF_KEY,
  clientUnreadQuery,
  isClientSender,
  loadClientSenders,
  matchingClientSenderEntries,
  unreadClientThreads,
} from "@/lib/mail/client-senders";

const thread = (from: string, unread: boolean) => ({ threadId: from, from, unread });

describe("unreadClientThreads", () => {
  const list = ["jo@client.com", "@bigbrand.com.au"];

  it("keeps only unread threads from starred client senders", () => {
    const threads = [
      thread("Jo <jo@client.com>", true),
      thread("Jo <jo@client.com>", false), // read
      thread("Sam <sam@client.com>", true), // same domain, but only jo@ is starred
      thread("Ann <ann@shop.bigbrand.com.au>", true), // subdomain of a starred domain
      thread("Spam <x@notbigbrand.com.au>", true), // look-alike domain
      thread('"jo@client.com" <attacker@evil.com>', true), // address only in display name
    ];
    expect(unreadClientThreads(threads, list).map((t) => t.from)).toEqual([
      "Jo <jo@client.com>",
      "Ann <ann@shop.bigbrand.com.au>",
    ]);
  });

  it("returns nothing when no senders are starred", () => {
    expect(unreadClientThreads([thread("jo@client.com", true)], [])).toEqual([]);
  });
});

describe("matchingClientSenderEntries / isClientSender", () => {
  it("reports which stored entries cover a sender", () => {
    expect(matchingClientSenderEntries("jo@client.com", ["jo@client.com", "@client.com", "@other.com"])).toEqual([
      "jo@client.com",
      "@client.com",
    ]);
    expect(isClientSender("Someone <someone@other.com>", ["@client.com"])).toBe(false);
    expect(isClientSender("", ["@client.com"])).toBe(false);
  });
});

describe("clientUnreadQuery", () => {
  it("builds an unread OR-search and drops anything that is not an address or domain", () => {
    expect(clientUnreadQuery(["jo@client.com", "@bigbrand.com.au", "x OR in:spam"])).toBe(
      "is:unread {from:jo@client.com from:bigbrand.com.au}",
    );
    expect(clientUnreadQuery([])).toBe("");
    expect(clientUnreadQuery(["{label:secret}"])).toBe("");
  });
});

describe("loadClientSenders", () => {
  it("reads the client-senders preference for that user only", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ value: { senders: ["Jo <JO@Client.com>", "bad value"] } }] });
    await expect(loadClientSenders({ find } as never, 7)).resolves.toEqual(["jo@client.com"]);
    const where = find.mock.calls[0]?.[0]?.where;
    expect(where.and).toEqual(
      expect.arrayContaining([{ key: { equals: CLIENT_SENDERS_PREF_KEY } }, { "user.value": { equals: 7 } }]),
    );
  });

  it("returns [] when the lookup fails", async () => {
    const find = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(loadClientSenders({ find } as never, 7)).resolves.toEqual([]);
  });
});
