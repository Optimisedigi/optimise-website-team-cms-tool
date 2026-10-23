import { describe, expect, it } from "vitest";
import fixture from "../fixtures/content-map-snapshot-sample.json";
import type { ContentMapSnapshot } from "@/lib/content-map/types";
import { adjustTermW, assignTopicColours, makeShortTitle, matrixColumns, prepMap, prepOpps, scoreOpps } from "@/lib/content-map/view-model";

const snap = fixture as unknown as ContentMapSnapshot;

describe("content map view model", () => {
  it("colours topics: core first, primary authority teal", () => {
    const t = assignTopicColours(snap.topics);
    expect(t).toHaveLength(10);
    expect(t[0]).toMatchObject({ k: "core", c: "oklch(0.34 0.04 210)" });
    expect(t[1]).toMatchObject({ k: "vietnam", primary: true, c: "oklch(0.55 0.1 178)" });
    expect(t.filter((x) => x.agg).map((x) => x.k)).toEqual(["service", "proof", "offtopic", "other"]);
  });

  it("builds gaps, coverage and matrix columns", () => {
    const m = prepMap(snap);
    const seo = m.topics.filter((t) => !t.agg);
    for (const [a, b] of m.gaps) {
      expect(a).not.toBe(b);
      expect(m.M[a]?.[b]).toHaveLength(0);
    }
    const expected = seo.flatMap((a) => seo.filter((b) => b.k !== a.k && !(m.M[a.k]?.[b.k]?.length)).map((b) => [a.k, b.k]));
    expect(m.gaps).toEqual(expected);
    for (const t of seo) {
      const o = m.T[t.k];
      expect(o?.cov).toBeCloseTo(1 - (o?.noPeer.length ?? 0) / (o?.nodes.length ?? 1));
    }
    expect(m.T.service?.pages).toBe(66);
    expect(matrixColumns(m.topics.length)).toBe("150px repeat(10,minmax(40px,1fr))");
  });

  it("scores with gap boosts and learned weights", () => {
    const d = prepOpps(snap);
    expect(d.pairs.length).toBeGreaterThan(0);
    const base = scoreOpps(d, new Set(), {});
    for (const p of base.scored) {
      const boost = (p.same && !base.peerIn.has(p.t) ? 0.25 : 0) + (!p.same && base.gapsOpen.includes(`${d.all[p.s]?.g}>${d.all[p.t]?.g}`) ? 0.3 : 0);
      expect(p.score).toBeCloseTo(p.cos + boost);
    }
    const first = base.scored[0];
    if (!first) throw new Error("no pairs");
    const w = adjustTermW({}, first.shared, 2);
    const learned = scoreOpps(d, new Set(), w).scored[0];
    const lw = first.shared.length * 2;
    expect(learned?.score).toBeCloseTo(first.cos * (1 + lw * 0.12) + (first.score - first.cos));
    const down = scoreOpps(d, new Set(), adjustTermW({}, first.shared, -20)).scored[0];
    expect(down?.score).toBeCloseTo(first.cos * 0.3 + (first.score - first.cos));
  });

  it("short() strips the repeated brand and names the homepage", () => {
    const short = makeShortTitle(snap.nodes);
    expect(short({ t: "/" })).toBe("Homepage");
    expect(short({ t: "Our Process – Away Digital Teams: Outsourcing Company" })).toBe("Our Process");
    expect(short({ t: "Plain title" })).toBe("Plain title");
  });
});

describe("suggestionOverlay", () => {
  it("places pending/approved suggestions and skips dismissed ones", async () => {
    const { prepMap: prep, suggestionOverlay, bridgesFor } = await import("@/lib/content-map/view-model");
    const living = (await import("../fixtures/content-map-living-sample.json")).default as unknown as import("@/lib/content-map/types").ContentMapApiResponse;
    const model = prep(living.snapshot as import("@/lib/content-map/types").ContentMapSnapshot);
    const o = suggestionOverlay(model, living.suggestions ?? []);
    expect(o.topics.map((t) => t.id)).toEqual(["s1"]);
    expect(o.bridges.map((b) => b.id)).toEqual(["s2"]);
    expect(o.articles["managing-teams"]?.map((a) => a.id)).toEqual(["s3"]);
    expect(o.articles.vietnam).toBeUndefined();
    expect(bridgesFor(o, "managing-teams", "cost")).toHaveLength(1);
    expect(o.bridges[0]?.d).toMatch(/^M[\d.]+,[\d.]+ Q/);
  });
});
