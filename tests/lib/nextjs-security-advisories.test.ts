import { describe, expect, it, vi } from "vitest";

import {
  findFreshAdvisories,
  notificationBody,
  notificationTitle,
  runNextjsSecurityAdvisoriesCron,
} from "@/lib/nextjs-security-advisories/check";

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPayload: vi.fn(),
}));

const NOW = new Date("2026-10-24T00:05:00Z");

const next = (range: string, fixed: string | null) => ({
  package: { ecosystem: "npm", name: "next" },
  vulnerable_version_range: range,
  first_patched_version: fixed,
});

// Shape copied from https://api.github.com/advisories?ecosystem=npm&affects=next
const advisories = [
  {
    ghsa_id: "GHSA-673q-mjm6-r5xr",
    severity: "critical",
    summary: "Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays",
    published_at: "2026-10-22T16:42:31Z",
    withdrawn_at: null,
    vulnerabilities: [next(">= 16.0.0, <= 16.4.0", "16.4.1")],
  },
  {
    ghsa_id: "GHSA-h694-7cp9-m8p3",
    severity: "medium",
    summary: "next.js cache leak across root param values",
    published_at: "2026-10-22T16:08:40Z",
    withdrawn_at: null,
    vulnerabilities: [next(">= 16.3.0, < 16.3.8", "16.3.8")],
  },
  {
    ghsa_id: "GHSA-2464-fhr4-w9xw",
    severity: "critical",
    summary: "Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used",
    published_at: "2026-10-22T15:52:53Z",
    withdrawn_at: null,
    vulnerabilities: [next(">= 10.0.0, <= 15.5.27", "15.5.28"), next(">= 16.0.0, <= 16.4.0", "16.4.1")],
  },
  {
    ghsa_id: "GHSA-p3m5-59mp-jv5r",
    severity: "high",
    summary: "Next.js: Denial of Service in App Router using Server Actions",
    published_at: "2026-10-22T15:50:34Z",
    withdrawn_at: null,
    vulnerabilities: [next(">= 13.0.0, <= 15.5.27", "15.5.28"), next(">= 16.0.0, <= 16.4.0", "16.4.1")],
  },
  {
    ghsa_id: "GHSA-wwww-xxxx-yyyy",
    severity: "critical",
    summary: "Withdrawn duplicate",
    published_at: "2026-10-22T15:00:00Z",
    withdrawn_at: "2026-10-23T00:00:00Z",
    vulnerabilities: [next("< 16.4.1", "16.4.1")],
  },
  {
    ghsa_id: "GHSA-old0-old0-old0",
    severity: "critical",
    summary: "Old advisory",
    published_at: "2026-08-01T00:00:00Z",
    withdrawn_at: null,
    vulnerabilities: [next("< 16.0.0", "16.0.0")],
  },
  {
    ghsa_id: "GHSA-othr-othr-othr",
    severity: "critical",
    summary: "Other package that only mentions next",
    published_at: "2026-10-22T10:00:00Z",
    withdrawn_at: null,
    vulnerabilities: [{ package: { ecosystem: "npm", name: "next-auth" }, first_patched_version: "5.0.1" }],
  },
];

describe("findFreshAdvisories", () => {
  it("keeps recent high and critical Next.js advisories, critical first", () => {
    const result = findFreshAdvisories(advisories, NOW);
    expect(result.map((a) => a.ghsaId)).toEqual([
      "GHSA-673q-mjm6-r5xr",
      "GHSA-2464-fhr4-w9xw",
      "GHSA-p3m5-59mp-jv5r",
    ]);
  });

  it("drops medium, withdrawn, old and other-package advisories", () => {
    const ids = findFreshAdvisories(advisories, NOW).map((a) => a.ghsaId);
    expect(ids).not.toContain("GHSA-h694-7cp9-m8p3");
    expect(ids).not.toContain("GHSA-wwww-xxxx-yyyy");
    expect(ids).not.toContain("GHSA-old0-old0-old0");
    expect(ids).not.toContain("GHSA-othr-othr-othr");
  });

  it("collects the patched version for every affected release line", () => {
    const image = findFreshAdvisories(advisories, NOW).find((a) => a.ghsaId === "GHSA-2464-fhr4-w9xw");
    expect(image?.patchedVersions).toEqual(["16.4.1", "15.5.28"]);
    expect(image?.url).toBe("https://github.com/advisories/GHSA-2464-fhr4-w9xw");
  });

  it("returns nothing for malformed input instead of throwing", () => {
    expect(findFreshAdvisories({ message: "rate limited" }, NOW)).toEqual([]);
    expect(findFreshAdvisories([null, { ghsa_id: "not-an-id", severity: "critical" }], NOW)).toEqual([]);
  });
});

describe("notification text", () => {
  const fresh = findFreshAdvisories(advisories, NOW);

  it("says how many and which versions to update to", () => {
    expect(notificationTitle(fresh)).toBe("Next.js security fix: 2 critical, 1 high (update to 16.4.1 / 15.5.28)");
  });

  it("names the worst advisory, what to do, and every GHSA id it covers", () => {
    const body = notificationBody(fresh);
    expect(body).toContain("Unauthenticated Remote Code Execution");
    expect(body).toContain("+2 more");
    expect(body).toContain("/live-security-update next");
    for (const a of fresh) expect(body).toContain(a.ghsaId);
  });
});

function fakePayload(previous: Array<{ title?: string; body?: string; url?: string }>) {
  return {
    find: vi.fn(async ({ collection }: { collection: string }) =>
      collection === "users" ? { docs: [{ id: 1 }, { id: 2 }] } : { docs: previous },
    ),
    create: vi.fn(async () => ({ id: 99 })),
  };
}

describe("runNextjsSecurityAdvisoriesCron", () => {
  it("notifies every admin once with a link to the worst advisory", async () => {
    const payload = fakePayload([]);
    const summary = await runNextjsSecurityAdvisoriesCron({
      payload: payload as never,
      fetchAdvisories: async () => advisories,
      now: NOW,
    });

    expect(summary.notified).toBe(2);
    const data = (payload.create.mock.calls[0] as unknown as [{ data: Record<string, string> }])[0].data;
    expect(data.kind).toBe("nextjs-security-advisory");
    expect(data.url).toBe("https://github.com/advisories/GHSA-673q-mjm6-r5xr");
  });

  it("does not raise an advisory an earlier notification already named", async () => {
    const earlier = findFreshAdvisories(advisories, NOW);
    const payload = fakePayload([{ title: notificationTitle(earlier), body: notificationBody(earlier) }]);
    const summary = await runNextjsSecurityAdvisoriesCron({
      payload: payload as never,
      fetchAdvisories: async () => advisories,
      now: NOW,
    });

    expect(summary.notified).toBe(0);
    expect(summary.alreadyNotified).toHaveLength(3);
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("only raises the advisories that are new", async () => {
    const payload = fakePayload([{ body: "Advisories: GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw" }]);
    await runNextjsSecurityAdvisoriesCron({ payload: payload as never, fetchAdvisories: async () => advisories, now: NOW });
    const data = (payload.create.mock.calls[0] as unknown as [{ data: Record<string, string> }])[0].data;
    expect(data.title).toBe("Next.js security fix: 1 high (update to 16.4.1 / 15.5.28)");
  });

  it("reports a fetch failure without touching the database", async () => {
    const payload = fakePayload([]);
    const summary = await runNextjsSecurityAdvisoriesCron({
      payload: payload as never,
      fetchAdvisories: async () => {
        throw new Error("GitHub advisories returned 403");
      },
      now: NOW,
    });
    expect(summary.error).toContain("403");
    expect(payload.find).not.toHaveBeenCalled();
  });
});
