import { describe, expect, it, vi } from "vitest";

import {
  collapseToClicks,
  pickClickId,
  runLandingConversionSync,
  transactionIdForClick,
  type LeadEventRow,
  type PropertyTarget,
  type Uploader,
} from "@/lib/landing-conversions/sync";

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPayload: vi.fn(),
}));

const row = (over: Partial<LeadEventRow> & { eventId: string }): LeadEventRow => ({
  occurredAt: "2026-10-03T22:24:13.000Z",
  sessionId: "sess-1",
  gclid: null,
  gbraid: null,
  wbraid: null,
  ...over,
});

describe("pickClickId", () => {
  it("prefers gclid, then gbraid, then wbraid, and ignores blanks", () => {
    expect(pickClickId({ gclid: " G1 ", gbraid: "B1", wbraid: "W1" })).toEqual({ key: "gclid", value: "G1" });
    expect(pickClickId({ gclid: "", gbraid: "B1", wbraid: "W1" })).toEqual({ key: "gbraid", value: "B1" });
    expect(pickClickId({ gclid: null, gbraid: null, wbraid: "W1" })).toEqual({ key: "wbraid", value: "W1" });
    expect(pickClickId({ gclid: null, gbraid: null, wbraid: "  " })).toBeNull();
  });
});

describe("transactionIdForClick", () => {
  it("is deterministic, prefixed, and never contains the click ID", () => {
    const a = transactionIdForClick("CjwKCAjw-abc");
    expect(a).toBe(transactionIdForClick("CjwKCAjw-abc"));
    expect(a).toMatch(/^lp-qual-[0-9a-f]{32}$/);
    expect(a).not.toContain("CjwKCAjw");
    expect(transactionIdForClick("other")).not.toBe(a);
  });
});

describe("collapseToClicks", () => {
  it("counts form + booking from the same click once, keeping the earliest moment", () => {
    // The 4 Oct lead: form accepted, then booked 7 seconds later, same click.
    const { candidates, noClickId } = collapseToClicks([
      row({ eventId: "booking", occurredAt: "2026-10-03T22:24:20.000Z", gclid: "G1", gbraid: "B1" }),
      row({ eventId: "form", occurredAt: "2026-10-03T22:24:13.000Z", gclid: "G1", gbraid: "B1" }),
    ]);
    expect(noClickId).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].occurredAt).toBe("2026-10-03T22:24:13.000Z");
    expect(candidates[0].eventIds).toEqual(["form", "booking"]);
    expect(candidates[0].gclid).toBe("G1");
    expect(candidates[0].gbraid).toBe("B1");
  });

  it("keeps separate clicks separate and reports rows with no click ID", () => {
    const { candidates, noClickId } = collapseToClicks([
      row({ eventId: "a", gclid: "G1" }),
      row({ eventId: "b", gclid: "G2" }),
      row({ eventId: "direct" }),
    ]);
    expect(candidates.map((c) => c.gclid)).toEqual(["G1", "G2"]);
    expect(noClickId.map((r) => r.eventId)).toEqual(["direct"]);
  });
});

function fakePayload(existing: Array<{ transactionId: string; status: string }>) {
  const created: Array<Record<string, unknown>> = [];
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "landing-conversion-uploads") return { docs: existing.filter((d) => ["sent", "skipped"].includes(d.status)) };
      throw new Error(`unexpected find ${collection}`);
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; }),
  };
  return { payload, created };
}

const target: PropertyTarget = { propertyId: 1, propertyName: "Away LP", clientId: 6, customerId: "3425353766", conversionActionId: "7814286222" };

describe("runLandingConversionSync", () => {
  it("sends one event per click, records the ledger, and skips clickless leads without calling Google", async () => {
    const { payload, created } = fakePayload([]);
    const uploader: Uploader = vi.fn(async ({ events }) => ({ ok: true, requestId: "req-1", accepted: events.length, warnings: [], skipped: [] }));
    const summary = await runLandingConversionSync({
      payload: payload as never,
      now: () => new Date("2026-10-05T04:30:00.000Z"),
      targets: [target],
      uploader,
      readLeads: async () => [
        row({ eventId: "form", gclid: "G1" }),
        row({ eventId: "booking", occurredAt: "2026-10-03T22:24:20.000Z", gclid: "G1" }),
        row({ eventId: "direct-booking", occurredAt: "2026-09-18T09:12:00.000Z" }),
      ],
    });
    expect(uploader).toHaveBeenCalledTimes(1);
    const sent = (uploader as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.customerId).toBe("3425353766");
    expect(sent.conversionActionId).toBe("7814286222");
    expect(sent.events).toHaveLength(1);
    expect(sent.events[0].gclid).toBe("G1");
    expect(JSON.stringify(sent)).not.toMatch(/email|phone|name/i);

    const p = summary.properties[0];
    expect(p).toMatchObject({ leadEvents: 3, candidates: 1, alreadySent: 0, sent: 1, skipped: 1 });
    expect(created.map((c) => c.status).sort()).toEqual(["sent", "skipped"]);
    expect(created.find((c) => c.status === "sent")).toMatchObject({ requestId: "req-1", clickIdType: "gclid", transactionId: transactionIdForClick("G1") });
    expect(created.find((c) => c.status === "skipped")).toMatchObject({ clickIdType: "none", detail: "no_click_id" });
  });

  it("never re-sends a click already in the ledger, and makes no request when nothing is new", async () => {
    const { payload, created } = fakePayload([{ transactionId: transactionIdForClick("G1"), status: "sent" }]);
    const uploader = vi.fn();
    const summary = await runLandingConversionSync({
      payload: payload as never,
      now: () => new Date("2026-10-05T04:30:00.000Z"),
      targets: [target],
      uploader: uploader as unknown as Uploader,
      readLeads: async () => [row({ eventId: "form", gclid: "G1" })],
    });
    expect(uploader).not.toHaveBeenCalled();
    expect(created).toEqual([]);
    expect(summary.properties[0]).toMatchObject({ candidates: 1, alreadySent: 1, sent: 0 });
  });

  it("records a failed upload without marking leads as sent, so the next run retries", async () => {
    const { payload, created } = fakePayload([]);
    const summary = await runLandingConversionSync({
      payload: payload as never,
      now: () => new Date("2026-10-05T04:30:00.000Z"),
      targets: [target],
      uploader: async () => ({ ok: false, error: "Data Manager token refresh failed: invalid_grant" }),
      readLeads: async () => [row({ eventId: "form", gclid: "G1" })],
    });
    expect(summary.properties[0]).toMatchObject({ sent: 0, error: expect.stringContaining("invalid_grant") });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "failed" });
  });

  it("validateOnly records 'validated' rows that still block nothing on the next real run", async () => {
    const { payload, created } = fakePayload([]);
    const summary = await runLandingConversionSync({
      payload: payload as never,
      now: () => new Date("2026-10-05T04:30:00.000Z"),
      targets: [target],
      validateOnly: true,
      uploader: async ({ events }) => ({ ok: true, requestId: null, accepted: events.length, warnings: [], skipped: [] }),
      readLeads: async () => [row({ eventId: "form", gclid: "G1" })],
    });
    expect(summary.validateOnly).toBe(true);
    expect(created[0]).toMatchObject({ status: "validated" });
    // Only 'sent' blocks a resend.
    const { payload: payload2 } = fakePayload([{ transactionId: transactionIdForClick("G1"), status: "validated" }]);
    const uploader = vi.fn(async ({ events }: { events: unknown[] }) => ({ ok: true, requestId: "r", accepted: events.length, warnings: [], skipped: [] }));
    await runLandingConversionSync({ payload: payload2 as never, now: () => new Date("2026-10-05T04:30:00.000Z"), targets: [target], uploader: uploader as unknown as Uploader, readLeads: async () => [row({ eventId: "form", gclid: "G1" })] });
    expect(uploader).toHaveBeenCalledTimes(1);
  });

  it("isolates one property's failure from the rest", async () => {
    const { payload } = fakePayload([]);
    const other: PropertyTarget = { ...target, propertyId: 2, propertyName: "Other" };
    const summary = await runLandingConversionSync({
      payload: payload as never,
      now: () => new Date("2026-10-05T04:30:00.000Z"),
      targets: [target, other],
      uploader: async ({ events }) => ({ ok: true, requestId: "r", accepted: events.length, warnings: [], skipped: [] }),
      readLeads: async (_p, t) => { if (t.propertyId === 1) throw new Error("db offline"); return [row({ eventId: "x", gclid: "G9" })]; },
    });
    expect(summary.properties[0].error).toContain("db offline");
    expect(summary.properties[1]).toMatchObject({ sent: 1 });
  });
});
