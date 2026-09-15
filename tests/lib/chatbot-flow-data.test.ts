import { describe, expect, it } from "vitest";
import { CHATBOT_FLOW_PATHS, CHATBOT_FLOW_TABS } from "@/components/dashboards/landing/chatbot-flow-data";

describe("Away chatbot flow proposal data", () => {
  it("defines five unique, internally connected paths without a job-seeker branch", () => {
    expect(CHATBOT_FLOW_TABS.map((tab) => tab.id)).toEqual([
      "overview", "ready", "readiness", "research", "recovery",
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

    const allCopy = JSON.stringify(CHATBOT_FLOW_PATHS).toLowerCase();
    expect(allCopy).not.toContain("looking for work");
    expect(allCopy).not.toContain("job seeker");
    expect(allCopy).not.toContain("careers");
  });

  it("provides readable question and answer copy for every user-facing question", () => {
    for (const path of CHATBOT_FLOW_PATHS) {
      for (const item of path.nodes.filter((node) => node.answers)) {
        expect(item.question?.trim().length, `${path.tab.id}/${item.id} needs visible question copy`).toBeGreaterThan(0);
        expect(item.answers?.length, `${path.tab.id}/${item.id} needs visible answers`).toBeGreaterThanOrEqual(2);
      }
    }

    const copy = JSON.stringify(CHATBOT_FLOW_PATHS);
    for (const question of [
      "What kind of role are you looking to hire?",
      "How many people are you looking to hire?",
      "When would you like your new team member to start?",
      "Which market is your business hiring for?",
      "What would you like to understand about building an offshore team?",
    ]) expect(copy).toContain(question);
  });

  it("retains every readiness pairing, score outcome, and routing caveat", () => {
    const readiness = CHATBOT_FLOW_PATHS.find((path) => path.tab.id === "readiness")!;
    const copy = readiness.nodes.map(({ title, body, question, answers }) => `${title} ${body} ${question} ${answers?.join(" ")}`).join(" ");
    for (const pairing of ["1 + 6", "2 + 3", "4 + 8", "5 + 9", "7 + 10"]) expect(copy).toContain(pairing);
    for (const band of ["8–10", "4–7", "0–3"]) expect(copy).toContain(band);
    expect(copy).toContain("Proposal routing guidance only");
    for (const band of ["high", "mid", "low"]) {
      const outcome = readiness.nodes.find((node) => node.id === band)!;
      expect(outcome.answers?.join(" ")).toMatch(/Book|planning call/);
      expect(outcome.answers?.join(" ")).toContain("checklist");
    }
  });

  it("keeps required fallbacks, consent, and unresolved ownership explicit", () => {
    const copy = JSON.stringify(CHATBOT_FLOW_PATHS);
    for (const marker of [
      "optional free text", "Market unknown", "international owner", "Calendar unavailable",
      "Invalid email", "Checklist access", "Separate follow-up consent", "Human requested",
      "Returning visitor", "never dead-end",
    ]) expect(copy).toContain(marker);
  });
});
