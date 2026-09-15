import { describe, expect, it } from "vitest";
import { CHATBOT_FLOW_PATHS, CHATBOT_FLOW_TABS } from "@/components/dashboards/landing/chatbot-flow-data";

describe("Away chatbot flow proposal data", () => {
  it("defines six unique, internally connected paths", () => {
    expect(CHATBOT_FLOW_TABS.map((tab) => tab.id)).toEqual([
      "overview", "ready", "readiness", "research", "job-seeker", "recovery",
    ]);

    for (const path of CHATBOT_FLOW_PATHS) {
      const ids = path.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const edge of path.edges) {
        expect(ids, `${path.tab.id}: missing ${edge.from}`).toContain(edge.from);
        expect(ids, `${path.tab.id}: missing ${edge.to}`).toContain(edge.to);
      }

      const reachable = new Set([path.nodes[0].id]);
      let added = true;
      while (added) {
        added = false;
        for (const edge of path.edges) {
          if (reachable.has(edge.from) && !reachable.has(edge.to)) {
            reachable.add(edge.to);
            added = true;
          }
        }
      }
      expect([...reachable].sort(), `${path.tab.id}: every route must connect from its entry`).toEqual([...ids].sort());
    }
  });

  it("retains every readiness pairing, score outcome, and routing caveat", () => {
    const readiness = CHATBOT_FLOW_PATHS.find((path) => path.tab.id === "readiness")!;
    const copy = readiness.nodes.map(({ title, body }) => `${title} ${body}`).join(" ");
    for (const pairing of ["1 + 6", "2 + 3", "4 + 8", "5 + 9", "7 + 10"]) {
      expect(copy).toContain(pairing);
    }
    for (let step = 1; step <= 10; step += 1) expect(copy).toMatch(new RegExp(`(?:PDF |\\+ )${step}(?:\\D|$)`));
    for (const band of ["8–10", "4–7", "0–3"]) expect(copy).toContain(band);
    expect(copy).toContain("Proposal routing guidance only");
    for (const band of ["high", "mid", "low"]) {
      expect(readiness.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: band, to: "book" }),
        expect.objectContaining({ from: band, to: "checklist" }),
      ]));
    }
  });

  it("keeps required routes, fallbacks, consent, and unresolved decisions explicit", () => {
    const allCopy = CHATBOT_FLOW_PATHS.map((path) => [
      ...path.nodes.map(({ title, body }) => `${title} ${body}`),
      ...path.edges.map(({ label }) => label ?? ""),
    ].join(" ")).join(" ");
    for (const marker of [
      "Persistent secondary actions", "optional role text", "Market unknown", "International destination",
      "Calendar unavailable", "Invalid email", "Immediate checklist access", "Separate follow-up consent",
      "No sales qualification", "Careers destination", "Known free text", "Unsupported or unknown",
      "Human requested", "Returning known contact", "Abandonment nudge", "Never dead-end",
    ]) expect(allCopy).toContain(marker);
  });
});
