import { describe, expect, it, vi, beforeEach } from "vitest";

const callLLM = vi.fn();

vi.mock("@/lib/agents/_shared/llm", () => ({
  callLLM: (...args: unknown[]) => callLLM(...args),
}));

vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: vi.fn().mockResolvedValue({
    defaultAutonomousModel: "claude-sonnet-5",
  }),
}));

import { classifyViolations, type TriageRow } from "@/lib/match-type-triage";

function reply(text: string) {
  return { message: { content: [{ type: "text", text }] } };
}

const client = { name: "Away Digital Teams", websiteUrl: "https://awaydigitalteams.com" };

const rows: TriageRow[] = [
  { id: 1, searchTerm: "offshore developers", summary: "A generic phrase for hiring remote developers, not a specific brand." },
  { id: 2, searchTerm: "remote staff co", summary: "An offshore staffing company based in Manila." },
  { id: 3, searchTerm: "brisbane dentist", summary: "A dental clinic in Brisbane." },
  { id: 4, searchTerm: "zzqx", summary: "Unclear — no results found." },
];

beforeEach(() => {
  callLLM.mockReset();
});

describe("classifyViolations", () => {
  it("maps each bucket back to its row", async () => {
    callLLM.mockResolvedValue(
      reply(
        JSON.stringify([
          { id: "1", decision: "relevant_keyword", reason: "Generic and relevant.", confidence: 90 },
          { id: "2", decision: "competitor", reason: "Rival offshore staffing firm.", confidence: 85 },
          { id: "3", decision: "irrelevant", reason: "Unrelated trade.", confidence: 80 },
          { id: "4", decision: "unclear", reason: "No research.", confidence: 20 },
        ]),
      ),
    );

    const decisions = await classifyViolations({ client, rows });

    expect(decisions.map((d) => [d.id, d.decision])).toEqual([
      [1, "relevant_keyword"],
      [2, "competitor"],
      [3, "irrelevant"],
      [4, "unclear"],
    ]);
    expect(decisions[1].reason).toBe("Rival offshore staffing firm.");
  });

  it("passes client context so competitor is judged against the client's trade", async () => {
    callLLM.mockResolvedValue(
      reply('[{"id":"3","decision":"irrelevant","reason":"Dentist, unrelated trade.","confidence":95}]'),
    );

    const decisions = await classifyViolations({ client, rows: [rows[2]] });

    expect(decisions).toEqual([
      { id: 3, decision: "irrelevant", reason: "Dentist, unrelated trade.", confidence: 95 },
    ]);
    const prompt = callLLM.mock.calls[0][0].messages[0].content[0].text as string;
    expect(prompt).toContain("Away Digital Teams");
    expect(prompt).toContain("awaydigitalteams.com");
  });

  it("tolerates fenced JSON wrapped in prose", async () => {
    callLLM.mockResolvedValue(
      reply('Here you go:\n```json\n[{"id":"1","decision":"relevant_keyword","reason":"x","confidence":70}]\n```'),
    );
    const decisions = await classifyViolations({ client, rows: [rows[0]] });
    expect(decisions[0].decision).toBe("relevant_keyword");
  });

  it("throws on malformed output rather than inventing decisions", async () => {
    callLLM.mockResolvedValue(reply("I could not decide, sorry."));
    await expect(classifyViolations({ client, rows })).rejects.toThrow();
  });

  it("throws when no returned row matches a known id or bucket", async () => {
    callLLM.mockResolvedValue(reply('[{"id":"999","decision":"relevant_keyword","reason":"x","confidence":50}]'));
    await expect(classifyViolations({ client, rows })).rejects.toThrow(/no usable decisions/i);
  });

  it("drops unknown buckets but keeps valid siblings", async () => {
    callLLM.mockResolvedValue(
      reply(
        '[{"id":"1","decision":"maybe","reason":"x","confidence":50},{"id":"2","decision":"competitor","reason":"y","confidence":60}]',
      ),
    );
    const decisions = await classifyViolations({ client, rows });
    expect(decisions).toEqual([{ id: 2, decision: "competitor", reason: "y", confidence: 60 }]);
  });

  it("returns nothing without calling the model for an empty batch", async () => {
    await expect(classifyViolations({ client, rows: [] })).resolves.toEqual([]);
    expect(callLLM).not.toHaveBeenCalled();
  });
});
