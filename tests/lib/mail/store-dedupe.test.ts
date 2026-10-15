import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_STORED, storeClientEmail, syncMailbox } from "@/lib/mail/store";

vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: vi.fn(() => { throw new Error("model must not be called during sync"); }) }));

type Row = Record<string, any> & { id: number };

/** Minimal in-memory Payload with a unique gmailMessageId, like the real index. */
function fakePayload(clients: Row[]) {
  const tables: Record<string, Row[]> = { "client-emails": [], "mail-sync-states": [], clients };
  let nextId = 1;
  const matches = (row: Row, where: any): boolean =>
    Object.entries(where ?? {}).every(([field, cond]: [string, any]) => {
      if ("equals" in cond) return row[field] === cond.equals;
      if ("in" in cond) return cond.in.includes(row[field]);
      return true;
    });
  return {
    tables,
    find: vi.fn(async (args: any) => ({ docs: tables[args.collection]!.filter((row) => matches(row, args.where)) })),
    create: vi.fn(async (args: any) => {
      const table = tables[args.collection]!;
      if (args.collection === "client-emails" && table.some((row) => row.gmailMessageId === args.data.gmailMessageId)) {
        throw new Error("UNIQUE constraint failed: client_emails.gmail_message_id");
      }
      const row = { id: nextId++, ...args.data };
      table.push(row);
      return row;
    }),
    update: vi.fn(async (args: any) => {
      const row = tables[args.collection]!.find((r) => r.id === args.id)!;
      Object.assign(row, args.data);
      return row;
    }),
  };
}

const input = (gmailMessageId: string) => ({
  gmailMessageId,
  gmailThreadId: "t1",
  clientId: 1,
  ownerId: 10,
  direction: "inbound" as const,
  matchedBy: "auto" as const,
  matchedOn: "inthepicture.com.au",
  from: "jo@inthepicture.com.au",
  to: "peter@optimisedigital.online",
  cc: "",
  subject: "Hi",
  date: "2026-10-14T00:00:00.000Z",
  body: "Body",
  gmailLink: "https://mail.google.com/mail/u/0/#all/m1",
});

describe("storeClientEmail", () => {
  it("creates once and returns the existing row on repeat", async () => {
    const payload = fakePayload([]);
    expect((await storeClientEmail(payload as never, input("m1"))).created).toBe(true);
    expect((await storeClientEmail(payload as never, input("m1"))).created).toBe(false);
    expect(payload.tables["client-emails"]).toHaveLength(1);
  });

  it("treats a unique-index race as already stored", async () => {
    const payload = fakePayload([]);
    payload.find.mockResolvedValueOnce({ docs: [] }); // both racers see nothing
    await storeClientEmail(payload as never, input("m2"));
    payload.find.mockResolvedValueOnce({ docs: [] });
    expect(await storeClientEmail(payload as never, input("m2"))).toEqual({ created: false, id: null });
    expect(payload.tables["client-emails"]).toHaveLength(1);
  });
});

describe("syncMailbox: oversize and failing emails", () => {
  it("caps long bodies and keeps going when one email fails, so the cursor still advances", async () => {
    const payload = fakePayload([{ id: 1, name: "In The Picture", websiteUrl: "inthepicture.com.au", isActive: true }]);
    const from = "jo@inthepicture.com.au";
    const result = await syncMailbox({
      payload: payload as never,
      userId: 10,
      accessToken: "tok",
      deps: {
        getMailboxProfile: vi.fn(async () => ({ emailAddress: "peter@optimisedigital.online", historyId: "200" })),
        listRecentMessageIds: vi.fn(async () => ["big", "broken", "ok"]),
        listAddedMessageIdsSince: vi.fn(async () => []),
        getMessageHeaders: vi.fn(async (_t: string, ids: string[]) =>
          ids.map((id) => ({ messageId: id, threadId: id, from, to: "peter@optimisedigital.online", cc: "", labelIds: ["INBOX"] })),
        ),
        getFullMessage: vi.fn(async (_t: string, id: string) => {
          if (id === "broken") throw new Error("Gmail hiccup");
          return {
            messageId: id, threadId: id, rfcMessageId: "", from, to: "peter@optimisedigital.online", cc: "",
            subject: "S", date: "", bodyHtml: "", snippet: "", labelIds: [],
            body: id === "big" ? "x".repeat(250_000) : "short",
          };
        }),
      },
    });
    expect(result).toMatchObject({ stored: 2, failed: 1 });
    const big = payload.tables["client-emails"].find((row) => row.gmailMessageId === "big");
    expect(big?.body.length).toBe(MAX_BODY_STORED);
    expect(payload.tables["mail-sync-states"][0]!.historyId).toBe("200");
  });

  it("stops on a Gmail permission error instead of skipping every email", async () => {
    const payload = fakePayload([{ id: 1, name: "ITP", websiteUrl: "inthepicture.com.au", isActive: true }]);
    await expect(
      syncMailbox({
        payload: payload as never,
        userId: 10,
        accessToken: "tok",
        deps: {
          getMailboxProfile: vi.fn(async () => ({ emailAddress: "peter@optimisedigital.online", historyId: "1" })),
          listRecentMessageIds: vi.fn(async () => ["a"]),
          listAddedMessageIdsSince: vi.fn(async () => []),
          getMessageHeaders: vi.fn(async () => [{ messageId: "a", threadId: "a", from: "jo@inthepicture.com.au", to: "", cc: "", labelIds: [] }]),
          getFullMessage: vi.fn(async () => { throw Object.assign(new Error("forbidden"), { code: 403 }); }),
        },
      }),
    ).rejects.toThrow("forbidden");
  });
});

describe("syncMailbox", () => {
  const clients = [{ id: 1, name: "In The Picture", websiteUrl: "www.inthepicture.com.au", isActive: true }];
  const headers: Record<string, { from: string; to: string }> = {
    m1: { from: "Jo <jo@inthepicture.com.au>", to: "peter@optimisedigital.online" },
    m2: { from: "news@random.com", to: "peter@optimisedigital.online" },
    m3: { from: "peter@optimisedigital.online", to: "jo@inthepicture.com.au" },
  };
  const deps = (ids: string[], historyId: string) => ({
    getMailboxProfile: vi.fn(async () => ({ emailAddress: "peter@optimisedigital.online", historyId })),
    listRecentMessageIds: vi.fn(async () => ids),
    listAddedMessageIdsSince: vi.fn(async () => ids),
    getMessageHeaders: vi.fn(async (_t: string, list: string[]) =>
      list.map((id) => ({ messageId: id, threadId: `t-${id}`, cc: "", labelIds: ["INBOX"], ...headers[id]! })),
    ),
    getFullMessage: vi.fn(async (_t: string, id: string) => ({
      messageId: id, threadId: `t-${id}`, rfcMessageId: "", subject: "S", date: "2026-10-14T00:00:00.000Z",
      body: "B", bodyHtml: "", cc: "", snippet: "", labelIds: [], ...headers[id]!,
    })),
  });

  it("stores client emails, skips others, and re-syncing creates no duplicates", async () => {
    const payload = fakePayload(clients);
    const first = deps(["m1", "m2", "m3"], "100");
    const r1 = await syncMailbox({ payload: payload as never, userId: 10, accessToken: "tok", deps: first });
    expect(r1).toMatchObject({ mode: "initial", stored: 2, unmatched: 1 });
    expect(payload.tables["client-emails"].map((r) => r.gmailMessageId).sort()).toEqual(["m1", "m3"]);
    expect(payload.tables["client-emails"].find((r) => r.gmailMessageId === "m3")?.direction).toBe("outbound");

    // Second run: incremental from the saved history id, same ids come back.
    const second = deps(["m1", "m3"], "120");
    const r2 = await syncMailbox({ payload: payload as never, userId: 10, accessToken: "tok", deps: second });
    expect(second.listAddedMessageIdsSince).toHaveBeenCalledWith("tok", "100");
    expect(r2).toMatchObject({ mode: "incremental", stored: 0, alreadyStored: 2 });
    expect(second.getFullMessage).not.toHaveBeenCalled();
    expect(payload.tables["client-emails"]).toHaveLength(2);
    expect(payload.tables["mail-sync-states"]).toHaveLength(1);
    expect(payload.tables["mail-sync-states"][0]!.historyId).toBe("120");
  });
});
