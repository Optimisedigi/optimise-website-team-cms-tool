import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import fixture from "../fixtures/content-map-snapshot-sample.json";
import { MapPanels } from "@/components/content-map/MapPanels";
import { toClientView } from "@/lib/content-map/client-view";
import type { ContentMapSnapshot } from "@/lib/content-map/types";
import { prepMap } from "@/lib/content-map/view-model";

const base = () => structuredClone(fixture) as unknown as ContentMapSnapshot;
function withMembers(): ContentMapSnapshot {
  const s = base();
  const agg = s.nodes[113];
  if (!agg) throw new Error("fixture");
  agg.members = [
    { id: "/services/seo/", t: "SEO services", in: 5, from: [{ s: 0, w: 3 }, { s: 1, w: 2 }] },
    { id: "/services/ads/", t: "Google Ads services", in: 2, from: [{ s: 1, w: 2 }] },
  ];
  return s;
}
const renderPanel = (snap: ContentMapSnapshot, onNode = vi.fn()) => {
  const model = prepMap(snap);
  render(<MapPanels model={model} nav={{ topic: "service", sel: null, pair: null }} recs={[]} onNode={onNode} onPair={vi.fn()} onBack={vi.fn()} onHover={vi.fn()} onRec={vi.fn()} />);
  return { model, onNode };
};

describe("aggregate panel members", () => {
  it("lists the group's pages, the articles linking to each, and all articles linking in", () => {
    const { model, onNode } = renderPanel(withMembers());
    expect(screen.getByText("Linked from")).toBeInTheDocument();
    const list = screen.getByTestId("agg-members");
    expect(list).toHaveTextContent("Pages in this group · 2");
    expect(within(list).getAllByTestId("agg-member")[0]).toHaveTextContent("SEO services5 in");
    fireEvent.click(within(list).getAllByTestId("agg-member")[0] as HTMLElement);
    const arts = within(list).getAllByTestId("agg-article");
    expect(arts.map((a) => a.textContent)).toEqual([`${model.N[0]?.title}3`, `${model.N[1]?.title}2`]);
    fireEvent.click(arts[1] as HTMLElement);
    expect(onNode).toHaveBeenCalledWith(1);
    // Aggregated: node 1 links with 2 + 2 = 4, node 0 with 3.
    expect(within(screen.getByTestId("agg-into")).getAllByTestId("agg-article").map((a) => a.textContent)).toEqual([`${model.N[1]?.title}4`, `${model.N[0]?.title}3`]);
  });

  it("older snapshots without members show the re-analyse line", () => {
    renderPanel(base());
    expect(screen.getByTestId("agg-members-missing")).toHaveTextContent("Re-analyse to see the pages in this group and which articles link to them.");
    expect(screen.queryByTestId("agg-members")).toBeNull();
  });

  it("members survive the client view", () => {
    expect(JSON.stringify(withMembers().nodes[113]?.members)).toBe(JSON.stringify(toClientViewSnap(withMembers()).nodes[113]?.members));
  });
});

function toClientViewSnap(snap: ContentMapSnapshot): ContentMapSnapshot {
  const out = toClientView({ client: { id: "7", name: "A", slug: "a", siteUrl: "https://a.com", enabled: true, authorities: [] }, run: null, snapshot: snap, decisions: [], termW: {}, sent: {}, history: [], actions: {} } as never) as unknown as { snapshot: ContentMapSnapshot };
  return out.snapshot;
}
