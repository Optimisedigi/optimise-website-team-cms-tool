import { describe, expect, it, vi } from "vitest";

import {
  NODE_INDEX_URL,
  NODE_SCHEDULE_URL,
  findFreshSecurityReleases,
  notificationTitle,
  runNodeSecurityReleasesCron,
} from "@/lib/node-security-releases/check";

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPayload: vi.fn(),
}));

const NOW = new Date("2026-10-23T00:00:00Z");

// Shapes copied from https://nodejs.org/dist/index.json and nodejs/Release schedule.json.
const index = [
  { version: "v26.12.1", date: "2026-10-21", lts: false, security: true },
  { version: "v26.12.0", date: "2026-10-07", lts: false, security: false },
  { version: "v25.9.0", date: "2026-03-31", lts: false, security: false },
  { version: "v24.22.1", date: "2026-10-20", lts: "Krypton", security: true },
  { version: "v24.22.0", date: "2026-10-01", lts: "Krypton", security: false },
  { version: "v22.23.4", date: "2026-10-20", lts: "Jod", security: true },
  { version: "v20.20.2", date: "2026-03-24", lts: "Iron", security: true },
  { version: "not-a-version", date: "x", security: true },
];
const schedule = {
  v20: { start: "2023-04-18", lts: "2023-10-24", end: "2026-04-30" },
  v22: { start: "2024-04-24", lts: "2024-10-29", end: "2027-04-30" },
  v24: { start: "2025-05-06", lts: "2025-10-28", end: "2028-04-30" },
  v25: { start: "2025-10-15", end: "2026-06-01" },
  v26: { start: "2026-04-22", lts: "2026-10-28", end: "2029-04-30" },
};

describe("findFreshSecurityReleases", () => {
  it("returns the newest security release of each supported line, newest first", () => {
    const result = findFreshSecurityReleases(index, schedule, NOW);
    expect(result.map((r) => r.version)).toEqual(["26.12.1", "24.22.1", "22.23.4"]);
    expect(result[1]).toMatchObject({ major: "v24", lts: "Krypton", date: "2026-10-20" });
  });

  it("ignores end-of-life lines even when they had a security release", () => {
    const result = findFreshSecurityReleases(index, schedule, NOW);
    expect(result.some((r) => r.major === "v20")).toBe(false);
  });

  it("ignores releases older than the freshness window", () => {
    expect(findFreshSecurityReleases(index, schedule, new Date("2026-12-31T00:00:00Z"))).toEqual([]);
  });

  it("returns nothing for malformed input instead of throwing", () => {
    expect(findFreshSecurityReleases({ nope: true }, schedule, NOW)).toEqual([]);
    expect(findFreshSecurityReleases(index, null, NOW)).toEqual([]);
  });
});

function fakePayload(previousTitles: string[]) {
  return {
    find: vi.fn(async ({ collection }: { collection: string }) =>
      collection === "users"
        ? { docs: [{ id: 1 }, { id: 2 }] }
        : { docs: previousTitles.map((title) => ({ title })) },
    ),
    create: vi.fn(async () => ({ id: 99 })),
  };
}

const fetchJson = async (url: string) => (url === NODE_INDEX_URL ? index : url === NODE_SCHEDULE_URL ? schedule : null);

describe("runNodeSecurityReleasesCron", () => {
  it("notifies every admin once, naming all new versions and the command to run", async () => {
    const payload = fakePayload([]);
    const summary = await runNodeSecurityReleasesCron({ payload: payload as never, fetchJson, now: NOW });

    expect(summary.notified).toBe(2);
    expect(payload.create).toHaveBeenCalledTimes(2);
    const data = (payload.create.mock.calls[0] as unknown as [{ data: Record<string, string> }])[0].data;
    expect(data.kind).toBe("node-security-release");
    expect(data.title).toBe("Node.js security release: 26.12.1, 24.22.1, 22.23.4");
    expect(data.body).toContain("/node-security-update");
    expect(data.url).toBe("https://nodejs.org/en/blog/release/v26.12.1");
  });

  it("does not raise a version that an earlier notification already named", async () => {
    const payload = fakePayload([notificationTitle([{ version: "26.12.1", major: "v26", date: "", lts: null }, { version: "24.22.1", major: "v24", date: "", lts: null }, { version: "22.23.4", major: "v22", date: "", lts: null }])]);
    const summary = await runNodeSecurityReleasesCron({ payload: payload as never, fetchJson, now: NOW });

    expect(summary.notified).toBe(0);
    expect(summary.alreadyNotified).toEqual(["26.12.1", "24.22.1", "22.23.4"]);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("only raises the versions that are new", async () => {
    const payload = fakePayload(["Node.js security release: 24.22.1"]);
    await runNodeSecurityReleasesCron({ payload: payload as never, fetchJson, now: NOW });
    const data = (payload.create.mock.calls[0] as unknown as [{ data: Record<string, string> }])[0].data;
    expect(data.title).toBe("Node.js security release: 26.12.1, 22.23.4");
  });

  it("does not treat 24.22.1 as already notified because 24.22.10 was", async () => {
    const payload = fakePayload(["Node.js security release: 24.22.10, 26.12.10, 22.23.40"]);
    const summary = await runNodeSecurityReleasesCron({ payload: payload as never, fetchJson, now: NOW });
    expect(summary.alreadyNotified).toEqual([]);
  });

  it("reports a fetch failure without touching the database", async () => {
    const payload = fakePayload([]);
    const summary = await runNodeSecurityReleasesCron({
      payload: payload as never,
      fetchJson: async () => {
        throw new Error("nodejs.org returned 503");
      },
      now: NOW,
    });
    expect(summary.error).toContain("503");
    expect(payload.find).not.toHaveBeenCalled();
  });
});
