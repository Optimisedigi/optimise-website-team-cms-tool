import { describe, expect, it, vi } from "vitest";
import {
  addDaysUTC,
  addMonthsUTC,
  computeReminderDates,
  normaliseRecipientIds,
  scheduleContractReminders,
} from "@/lib/contract-reminders";

describe("addMonthsUTC", () => {
  it("adds calendar months in UTC", () => {
    const out = addMonthsUTC(new Date("2026-01-15T00:00:00.000Z"), 11);
    expect(out.toISOString()).toBe("2026-12-15T00:00:00.000Z");
  });

  it("wraps day-of-month when target month is shorter", () => {
    const out = addMonthsUTC(new Date("2026-01-31T00:00:00.000Z"), 1);
    // Feb 2026 has 28 days; JS clamps to Mar 3 (31 + 1mo = Feb 31 -> Mar 3).
    expect(out.getUTCMonth()).toBe(2); // March (0-indexed)
  });
});

describe("addDaysUTC", () => {
  it("adds calendar days across month boundaries", () => {
    const out = addDaysUTC(new Date("2026-01-25T00:00:00.000Z"), 15);
    expect(out.toISOString()).toBe("2026-02-09T00:00:00.000Z");
  });
});

describe("computeReminderDates", () => {
  it("computes 11-month + 11.5-month from a contract date", () => {
    const { elevenMonth, elevenAndHalfMonth } = computeReminderDates(
      new Date("2026-05-15T00:00:00.000Z"),
    );
    expect(elevenMonth.toISOString()).toBe("2027-04-15T00:00:00.000Z");
    expect(elevenAndHalfMonth.toISOString()).toBe("2027-04-30T00:00:00.000Z");
  });
});

describe("normaliseRecipientIds", () => {
  it("returns [] for null/undefined/non-array", () => {
    expect(normaliseRecipientIds(null)).toEqual([]);
    expect(normaliseRecipientIds(undefined)).toEqual([]);
  });

  it("unwraps both id-array (depth 0) and object-array (depth 1) shapes", () => {
    expect(normaliseRecipientIds([1, 2, 3])).toEqual([1, 2, 3]);
    expect(normaliseRecipientIds([{ id: 1 }, { id: 2 }])).toEqual([1, 2]);
    expect(normaliseRecipientIds([1, { id: 2 }])).toEqual([1, 2]);
  });

  it("filters falsy entries", () => {
    expect(
      normaliseRecipientIds([1, null as never, { id: 2 }, undefined as never]),
    ).toEqual([1, 2]);
  });
});

/**
 * In-memory mock of the Payload client used by `scheduleContractReminders`.
 * Tracks the contract-reminders collection only; that's the only thing the
 * function touches.
 */
function makeMockPayload(initial: Array<Record<string, unknown>> = []) {
  let nextId = 1;
  const rows: Array<Record<string, unknown>> = initial.map((r) => ({
    id: nextId++,
    ...r,
  }));

  const payload = {
    find: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const conditions = (where.and ?? []) as Array<Record<string, unknown>>;
      const docs = rows.filter((row) =>
        conditions.every((cond) => {
          const [field, op] = Object.entries(cond)[0] as [
            string,
            { equals?: unknown },
          ];
          return row[field] === op.equals;
        }),
      );
      return { docs, totalDocs: docs.length };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = nextId++;
      const row = { id, ...data };
      rows.push(row);
      return row;
    }),
    delete: vi.fn(async ({ id }: { id: number | string }) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    }),
  };
  return { payload, rows };
}

describe("scheduleContractReminders", () => {
  const fixedNow = new Date("2026-05-15T00:00:00.000Z");
  const now = (): Date => fixedNow;

  it("creates two pending rows when enabled with a contract date", async () => {
    const { payload, rows } = makeMockPayload();

    const result = await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1, 2],
    }, { now });

    expect(result.created).toHaveLength(2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind).sort()).toEqual(["11-month", "11.5-month"]);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(rows.every((r) => r.contract === 100)).toBe(true);
    expect(rows.every((r) => Array.isArray(r.recipients))).toBe(true);
  });

  it("creates nothing when reminders are disabled", async () => {
    const { payload, rows } = makeMockPayload();

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: false,
      annualReviewReminderRecipients: [1],
    }, { now });

    expect(rows).toHaveLength(0);
  });

  it("creates nothing when contractDate is missing", async () => {
    const { payload, rows } = makeMockPayload();

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: null,
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1],
    }, { now });

    expect(rows).toHaveLength(0);
  });

  it("is idempotent — calling twice produces the same two pending rows", async () => {
    const { payload, rows } = makeMockPayload();

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1, 2],
    }, { now });

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1, 2],
    }, { now });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind).sort()).toEqual(["11-month", "11.5-month"]);
  });

  it("disabling clears pending rows but preserves history", async () => {
    const { payload, rows } = makeMockPayload([
      // Pre-existing history that must be preserved.
      {
        contract: 100,
        kind: "11-month",
        status: "sent",
        sendAt: "2026-01-01",
      },
      {
        contract: 100,
        kind: "11-month",
        status: "failed",
        sendAt: "2026-02-01",
      },
    ]);

    // First, schedule two pending rows.
    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1],
    }, { now });
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(2);

    // Then disable — pending rows go, sent/failed stay.
    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: false,
      annualReviewReminderRecipients: [1],
    }, { now });

    expect(rows.filter((r) => r.status === "pending")).toHaveLength(0);
    expect(rows.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "failed")).toHaveLength(1);
  });

  it("picks up new recipient list on re-schedule", async () => {
    const { payload, rows } = makeMockPayload();

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1],
    }, { now });

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1, 2, 3],
    }, { now });

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.recipients).toEqual([1, 2, 3]);
    }
  });

  it("with skipPast=true, past sendAts are marked skipped", async () => {
    const { payload, rows } = makeMockPayload();

    // Contract was signed 2 years ago — both reminders are in the past.
    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2024-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1],
    }, { now, skipPast: true });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "skipped")).toBe(true);
    expect(rows.every((r) => r.notes === "backfilled past anniversary")).toBe(
      true,
    );
  });

  it("with skipPast=true, future sendAts stay pending", async () => {
    const { payload, rows } = makeMockPayload();

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [1],
    }, { now, skipPast: true });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("normalises Payload-depth-1 recipient objects to plain ids", async () => {
    const { payload, rows } = makeMockPayload();

    await scheduleContractReminders(payload as never, {
      id: 100,
      contractDate: "2026-05-15",
      annualReviewReminderEnabled: true,
      annualReviewReminderRecipients: [
        { id: 1, name: "Alice" } as never,
        { id: 2, name: "Bob" } as never,
      ],
    }, { now });

    for (const row of rows) {
      expect(row.recipients).toEqual([1, 2]);
    }
  });
});
