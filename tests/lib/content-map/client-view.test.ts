import { describe, expect, it } from "vitest";
import sampleJson from "../../fixtures/content-map-snapshot-sample.json";
import { toClientView } from "@/lib/content-map/client-view";
import type { ContentMapApiResponse, ContentMapSnapshot, LinkAction } from "@/lib/content-map/types";

const sample = sampleJson as unknown as ContentMapSnapshot;
const [o1, o2, o3] = sample.opportunities;
const action = (over: Partial<LinkAction>): LinkAction => ({
  status: "drafted", source: "cms-article", original: "Secret draft sentence", replacement: "Secret [draft](/x)", anchor: "draft",
  note: "Internal note", model: "kimi-k3", blogPostId: "11", appliedAt: null, ...over,
});

function teamState(): ContentMapApiResponse {
  const snapshot = {
    ...sample,
    clientId: "7",
    ai: { ...sample.ai, ideas: { model: "claude-sonnet-5.5", generatedAt: "2026-10-23T00:00:00.000Z" } },
    nodes: sample.nodes.map((n, i) => (i === 0 ? { ...n, cmsId: "11", internalNote: "leak?" } : n)),
    opportunities: [...sample.opportunities.slice(0, 3), { ...o1!, key: "dup-key", dup: true }],
    secretField: "should never reach a client",
  } as unknown as ContentMapSnapshot;
  return {
    client: { id: "7", name: "Away", slug: "away", siteUrl: "https://a.com", enabled: true, authorities: [{ key: "vietnam", name: "Vietnam", primary: true, description: "Why Vietnam" }] },
    run: { runId: "run-1", status: "failed", error: "GT 502 stack trace", mode: "full", phase: "crawling", pagesCrawled: 3, startedAt: null },
    snapshot,
    decisions: [{ key: o1!.key, decision: "accepted" }, { key: o2!.key, decision: "dismissed" }, { key: o3!.key, decision: "accepted" }],
    termW: { vietnam: 2 },
    sent: { r1: "991" },
    history: [],
    actions: { [o1!.key]: action({ status: "applied", appliedAt: "2026-10-23T01:00:00.000Z" }), [o3!.key]: action({ status: "failed" }) },
  };
}

describe("toClientView", () => {
  const view = toClientView(teamState());
  const json = JSON.stringify(view);

  it("drops dismissed suggestions, cannibalisation flags and the learned ranking", () => {
    expect(view.snapshot!.opportunities.map((o) => o.key)).toEqual([o1!.key, o3!.key]);
    expect(view.decisions).toEqual([{ key: o1!.key, decision: "accepted" }, { key: o3!.key, decision: "accepted" }]);
    expect(view.termW).toEqual({});
  });

  it("shows accepted links only as added or planned, with no draft text, notes, models or article ids", () => {
    expect(view.actions![o1!.key]).toMatchObject({ status: "applied", appliedAt: "2026-10-23T01:00:00.000Z", original: "", replacement: "", note: "", model: "", blogPostId: null });
    expect(view.actions![o3!.key]).toMatchObject({ status: "drafted", note: "" });
    for (const secret of ["Secret draft sentence", "Internal note", "kimi-k3", "claude-sonnet-5.5", "GT 502", "991", "should never reach", "leak?", "cmsId", "run-1"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("hides failed runs and internal ids but keeps the map, topics and plan", () => {
    expect(view.run).toBeNull();
    expect(view.client).toEqual({ id: "", name: "Away", slug: "away", siteUrl: "https://a.com", enabled: true, authorities: [{ key: "vietnam", name: "Vietnam", primary: true, description: "Why Vietnam" }] });
    expect(view.sent).toEqual({ r1: "1" });
    expect(view.snapshot!.clientId).toBe("");
    expect(view.snapshot!.nodes).toHaveLength(sample.nodes.length);
    expect(view.snapshot!.recommendations).toHaveLength(sample.recommendations.length);
    expect(view.snapshot!.topics).toEqual(sample.topics);
  });

  it("keeps a running analysis visible without its run id", () => {
    const s = teamState();
    s.run = { ...s.run!, status: "running" };
    expect(toClientView(s).run).toMatchObject({ runId: "", status: "running", error: null, pagesCrawled: 3 });
  });
});
