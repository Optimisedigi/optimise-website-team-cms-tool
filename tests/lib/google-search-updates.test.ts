import { describe, expect, it, vi } from "vitest";

import { classifySearchIncident, stripHtml } from "@/lib/google-search-updates/classify";
import { INCIDENT_CAP, normaliseIncident, fetchSearchStatusIncidents } from "@/lib/google-search-updates/fetch";
import { runGoogleSearchUpdatesCron } from "@/lib/google-search-updates/cron";

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPayload: vi.fn(),
}));

describe("classifySearchIncident", () => {
  it("tags core, spam, discover, and serving from Google's titles", () => {
    expect(classifySearchIncident("May 2026 core update", "Ranking")).toBe("core");
    expect(classifySearchIncident("August 2026 spam update")).toBe("spam");
    expect(classifySearchIncident("February 2026 Discover update")).toBe("discover");
    expect(classifySearchIncident("Serving was experiencing an issue", "Serving")).toBe("serving");
    expect(classifySearchIncident("Unrelated notice")).toBe("other");
  });
});

describe("normaliseIncident", () => {
  const raw = {
    id: "wdAXJk6LRRihEjpzEeWE",
    external_desc: "May 2026 core update",
    begin: "2026-05-21T15:40:00+00:00",
    end: "2026-06-02T12:40:00+00:00",
    modified: "2026-06-02T12:44:24+00:00",
    status_impact: "SERVICE_INFORMATION",
    severity: "low",
    service_name: "Ranking",
    uri: "incidents/wdAXJk6LRRihEjpzEeWE",
    most_recent_update: {
      text: 'The rollout was complete as of June 2, 2026. See <https://developers.google.com/search/updates/core-updates>.',
    },
  };

  it("maps the official Search Status shape and strips tags from the update text", () => {
    const result = normaliseIncident(raw);
    expect(result).toMatchObject({
      incidentId: "wdAXJk6LRRihEjpzEeWE",
      title: "May 2026 core update",
      kind: "core",
      begin: "2026-05-21T15:40:00+00:00",
      end: "2026-06-02T12:40:00+00:00",
    });
    expect(result?.latestUpdate).toContain("rollout was complete");
    expect(result?.latestUpdate).not.toContain("<https");
    expect(result?.sourceUri).toBe("https://status.search.google.com/incidents/wdAXJk6LRRihEjpzEeWE");
  });

  it("drops rows without an id or title — they cannot be deduped", () => {
    expect(normaliseIncident({ external_desc: "x" })).toBeNull();
    expect(normaliseIncident(null)).toBeNull();
  });

  it("never follows an off-host uri from the payload", () => {
    const result = normaliseIncident({ ...raw, uri: "https://evil.example/phish" });
    expect(result?.sourceUri).toBe("https://status.search.google.com/");
  });
});

describe("stripHtml", () => {
  it("collapses Google's tagged update text to plain words", () => {
    expect(stripHtml("Released the <https://example.com> update")).toBe("Released the update");
  });
});

describe("fetchSearchStatusIncidents", () => {
  it("rejects a non-array payload rather than writing junk", async () => {
    const result = await fetchSearchStatusIncidents({
      fetchImpl: (async () => new Response(JSON.stringify({ oops: true }), { status: 200 })) as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.incidents).toEqual([]);
  });

  it("caps the list so a huge payload cannot blow the store", async () => {
    const rows = Array.from({ length: INCIDENT_CAP + 50 }, (_, i) => ({
      id: `id-${i}`,
      external_desc: `May 2026 core update ${i}`,
    }));
    const result = await fetchSearchStatusIncidents({
      fetchImpl: (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.incidents).toHaveLength(INCIDENT_CAP);
  });
});

describe("runGoogleSearchUpdatesCron", () => {
  it("creates new ranking incidents once and updates on the second run without duplicating", async () => {
    const store = new Map<string, { id: number; incidentId: string; notifiedAt?: string | null; title: string }>();
    let nextId = 1;
    const payload = {
      find: vi.fn(async ({ collection, where }: { collection: string; where?: { incidentId?: { equals: string }; role?: { equals: string } } }) => {
        if (collection === "users") return { docs: [{ id: 1 }] };
        const id = where?.incidentId?.equals;
        const doc = id ? store.get(id) : undefined;
        return { docs: doc ? [doc] : [] };
      }),
      create: vi.fn(async ({ collection, data }: { collection: string; data: { incidentId?: string; title?: string } }) => {
        if (collection === "notifications") return { id: 99 };
        const created = { id: nextId++, incidentId: data.incidentId!, title: data.title || "", notifiedAt: null };
        store.set(created.incidentId, created);
        return created;
      }),
      update: vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
        const current = [...store.values()].find((row) => row.id === id);
        if (current) Object.assign(current, data);
        return current;
      }),
    };

    const incident = {
      incidentId: "abc",
      title: "May 2026 core update",
      kind: "core" as const,
      begin: "2026-05-21T15:40:00+00:00",
      end: "",
      modified: "",
      statusImpact: "SERVICE_INFORMATION",
      severity: "low",
      serviceName: "Ranking",
      latestUpdate: "Released",
      sourceUri: "https://status.search.google.com/incidents/abc",
      raw: {},
    };

    const first = await runGoogleSearchUpdatesCron({
      payload: payload as never,
      fetchIncidents: async () => ({ ok: true, incidents: [incident] }),
    });
    expect(first.created).toBe(1);
    expect(first.updated).toBe(0);
    expect(first.notified).toBe(1);
    expect(store.size).toBe(1);

    const second = await runGoogleSearchUpdatesCron({
      payload: payload as never,
      fetchIncidents: async () => ({
        ok: true,
        incidents: [{ ...incident, end: "2026-06-02T12:40:00+00:00", latestUpdate: "Complete" }],
      }),
    });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.notified).toBe(0);
    expect(store.size).toBe(1);
  });

  it("does not notify for serving outages", async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [] })),
      create: vi.fn(async ({ data }: { data: { incidentId?: string } }) => ({ id: 1, ...data })),
      update: vi.fn(),
    };
    const summary = await runGoogleSearchUpdatesCron({
      payload: payload as never,
      fetchIncidents: async () => ({
        ok: true,
        incidents: [
          {
            incidentId: "srv",
            title: "Serving was experiencing an issue",
            kind: "serving",
            begin: "2026-02-25T03:55:00+00:00",
            end: "2026-02-25T04:10:00+00:00",
            modified: "",
            statusImpact: "SERVICE_DISRUPTION",
            severity: "medium",
            serviceName: "Serving",
            latestUpdate: "Fixed",
            sourceUri: "https://status.search.google.com/incidents/srv",
            raw: {},
          },
        ],
      }),
    });
    expect(summary.created).toBe(1);
    expect(summary.notified).toBe(0);
    expect(
      payload.create.mock.calls.every(
        (call: [{ collection?: string }]) => call[0].collection !== "notifications",
      ),
    ).toBe(true);
  });
});
