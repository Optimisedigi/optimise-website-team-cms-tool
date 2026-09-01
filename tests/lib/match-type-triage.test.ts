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
      {
        id: 3,
        decision: "irrelevant",
        reason: "Dentist, unrelated trade.",
        confidence: 95,
        suggestedAdGroup: null,
      },
    ]);
    const prompt = callLLM.mock.calls[0][0].messages[0].content[0].text as string;
    expect(prompt).toContain("Away Digital Teams");
    expect(prompt).toContain("awaydigitalteams.com");
  });

  it("tolerates fenced JSON wrapped in prose", async () => {
    callLLM.mockResolvedValue(
      // Confidence is incidental here; kept above MIN_CONFIDENCE so this stays a
      // test of fence tolerance rather than of the confidence floor.
      reply('Here you go:\n```json\n[{"id":"1","decision":"relevant_keyword","reason":"x","confidence":90}]\n```'),
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
        '[{"id":"1","decision":"maybe","reason":"x","confidence":90},{"id":"2","decision":"competitor","reason":"y","confidence":85}]',
      ),
    );
    const decisions = await classifyViolations({ client, rows });
    expect(decisions).toEqual([
      { id: 2, decision: "competitor", reason: "y", confidence: 85, suggestedAdGroup: null },
    ]);
  });

  it("returns nothing without calling the model for an empty batch", async () => {
    await expect(classifyViolations({ client, rows: [] })).resolves.toEqual([]);
    expect(callLLM).not.toHaveBeenCalled();
  });
});

describe("chunking large batches", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    searchTerm: `term ${i + 1}`,
    summary: `Summary ${i + 1}.`,
  }));

  it("splits big batches so one oversized reply cannot lose everything", async () => {
    callLLM.mockImplementation((opts: any) => {
      const text = opts.messages[0].content[0].text as string;
      const ids = many.map((r) => r.id).filter((id) => text.includes(`- id: "${id}"\n`));
      return Promise.resolve(
        reply(
          JSON.stringify(
            ids.map((id) => ({ id: String(id), decision: "irrelevant", reason: "x", confidence: 50 })),
          ),
        ),
      );
    });

    const decisions = await classifyViolations({ client, rows: many });

    expect(callLLM).toHaveBeenCalledTimes(3); // 12 + 12 + 6
    expect(decisions).toHaveLength(30);
  });

  it("keeps decisions from chunks that parsed when another chunk fails", async () => {
    let call = 0;
    callLLM.mockImplementation(() => {
      call++;
      if (call === 1) {
        return Promise.resolve(
          reply('[{"id":"1","decision":"competitor","reason":"ok","confidence":80}]'),
        );
      }
      return Promise.resolve(reply("sorry, no JSON here"));
    });

    const decisions = await classifyViolations({ client, rows: many });

    // Undecided rows are absent, so the cron leaves them retryable.
    expect(decisions).toEqual([
      { id: 1, decision: "competitor", reason: "ok", confidence: 80, suggestedAdGroup: null },
    ]);
  });

  it("still throws when every chunk fails", async () => {
    callLLM.mockResolvedValue(reply("no json at all"));
    await expect(classifyViolations({ client, rows: many })).rejects.toThrow();
  });
});

describe("client context and ad group routing", () => {
  const context = {
    ...client,
    idealCustomer: "Businesses hiring full-time dedicated offshore staff in Vietnam.",
    exclusions: "Temporary or contract roles\nJob seekers looking for work",
  };
  const adGroups = [
    { adGroupName: "Generic Vietnam outsourcing", campaignName: "Search - Vietnam - US" },
    { adGroupName: "Vietnam developer/IT", campaignName: "Search - Vietnam - US" },
  ];

  it("passes the client's excluded work and real ad groups into the prompt", async () => {
    callLLM.mockResolvedValue(
      reply('[{"id":"1","decision":"irrelevant","reason":"Contract roles.","confidence":90}]'),
    );

    await classifyViolations({ client: context, rows: [rows[0]], adGroups });

    const prompt = callLLM.mock.calls[0][0].messages[0].content[0].text as string;
    expect(prompt).toContain("Temporary or contract roles");
    expect(prompt).toContain("Job seekers looking for work");
    expect(prompt).toContain("full-time dedicated offshore staff");
    expect(prompt).toContain("Vietnam developer/IT");
  });

  it("keeps a suggested ad group that exists in the account", async () => {
    callLLM.mockResolvedValue(
      reply(
        '[{"id":"1","decision":"relevant_keyword","reason":"Software term.","confidence":90,"suggestedAdGroup":"Vietnam developer/IT"}]',
      ),
    );
    const rowInGeneric = { ...rows[0], adGroupName: "Generic Vietnam outsourcing" };

    const [decision] = await classifyViolations({ client: context, rows: [rowInGeneric], adGroups });

    expect(decision.suggestedAdGroup).toBe("Vietnam developer/IT");
  });

  it("discards a hallucinated ad group that is not in the account", async () => {
    callLLM.mockResolvedValue(
      reply(
        '[{"id":"1","decision":"relevant_keyword","reason":"x","confidence":90,"suggestedAdGroup":"Made Up Group"}]',
      ),
    );
    const [decision] = await classifyViolations({ client: context, rows: [rows[0]], adGroups });
    expect(decision.suggestedAdGroup).toBeNull();
  });

  it("does not suggest the ad group the term already sits in", async () => {
    callLLM.mockResolvedValue(
      reply(
        '[{"id":"1","decision":"relevant_keyword","reason":"x","confidence":90,"suggestedAdGroup":"Generic Vietnam outsourcing"}]',
      ),
    );
    const rowInGeneric = { ...rows[0], adGroupName: "Generic Vietnam outsourcing" };
    const [decision] = await classifyViolations({ client: context, rows: [rowInGeneric], adGroups });
    expect(decision.suggestedAdGroup).toBeNull();
  });
});

describe("confidence floor", () => {
  it("forces a below-75% call to unclear instead of recommending it", async () => {
    callLLM.mockResolvedValue(
      reply(
        '[{"id":"1","decision":"relevant_keyword","reason":"Tech staffing agency.","confidence":70}]',
      ),
    );
    const [decision] = await classifyViolations({ client, rows: [rows[0]] });

    expect(decision.decision).toBe("unclear");
    expect(decision.confidence).toBe(70);
    expect(decision.reason).toMatch(/Too uncertain to recommend \(70%\)/);
  });

  it("keeps a call at exactly the 75% floor", async () => {
    callLLM.mockResolvedValue(
      reply('[{"id":"1","decision":"relevant_keyword","reason":"ok","confidence":75}]'),
    );
    const [decision] = await classifyViolations({ client, rows: [rows[0]] });
    expect(decision.decision).toBe("relevant_keyword");
  });

  it("drops a routing suggestion when the call is too uncertain to act on", async () => {
    callLLM.mockResolvedValue(
      reply(
        '[{"id":"1","decision":"relevant_keyword","reason":"x","confidence":60,"suggestedAdGroup":"Vietnam developer/IT"}]',
      ),
    );
    const [decision] = await classifyViolations({
      client,
      rows: [rows[0]],
      adGroups: [{ adGroupName: "Vietnam developer/IT", campaignName: "c" }],
    });
    expect(decision.decision).toBe("unclear");
    expect(decision.suggestedAdGroup).toBeUndefined();
  });
});
