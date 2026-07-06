import type { TermResearchResponse } from "@/lib/search-term-research";

// ---------------------------------------------------------------------------
// The module reads GROWTH_TOOLS_URL / INTERNAL_API_KEY at top-level evaluation
// time, so each test uses vi.resetModules() + a fresh dynamic import() after
// setting env vars.
//
// Grounding (Serper via Growth Tools) is a real fetch to
// `${GROWTH_TOOLS_URL}/api/serp/top-results`, so it is exercised via a mocked
// global fetch. Summarisation goes through the shared `callLLM` layer, which is
// mocked here so we don't pull in the whole model registry / providers.
//
// Two distinct meanings of "grounded":
//   - TermResearchResponse.grounded (top-level) = GT reported `configured` true
//     (its Serper key is live). This is about the *service*, not any one term.
//   - TermResearchResult.grounded (per-result)  = that term got a real top
//     result / knowledge panel (source or knowledgeGraph present).
// ---------------------------------------------------------------------------

const mockCallLLM = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/_shared/llm", () => ({
  callLLM: (opts: unknown) => mockCallLLM(opts),
}));

const ORIG = {
  GROWTH_TOOLS_URL: process.env.GROWTH_TOOLS_URL,
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const GT_URL = "https://growth-tools.test";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/**
 * Route fetch to the GT grounding endpoint. `top` is the parsed JSON body it
 * returns; pass `topResponse` to override the raw response (e.g. a 404).
 */
function routeFetch(opts: { top?: unknown; topResponse?: any }) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/serp/top-results")) {
      if (opts.topResponse) return Promise.resolve(opts.topResponse);
      return Promise.resolve(jsonResponse(opts.top ?? { results: [], configured: true }));
    }
    return Promise.reject(new Error(`Unexpected fetch to ${url}`));
  });
}

/** Build an LLMResponse whose text content is the {term,summary} JSON array. */
function llmResponse(map: Record<string, string>) {
  const arr = Object.entries(map).map(([term, summary]) => ({ term, summary }));
  return {
    message: { role: "assistant", content: [{ type: "text", text: JSON.stringify(arr) }] },
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0 },
    model: "minimax-m3",
    providerModel: "MiniMax-M3",
    source: "env",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockCallLLM.mockReset();
  mockCallLLM.mockResolvedValue(llmResponse({})); // default: no summaries
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.resetModules();
  process.env.GROWTH_TOOLS_URL = GT_URL;
  process.env.INTERNAL_API_KEY = "internal-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const [k, v] of Object.entries(ORIG)) {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  }
});

async function importModule() {
  return await import("@/lib/search-term-research");
}

describe("researchSearchTerms", () => {
  it("(1) GT returns 404 → grounded:false, results still returned with fallback summaries, no throw", async () => {
    routeFetch({ topResponse: { ok: false, status: 404, text: () => Promise.resolve("Not Found") } });
    mockCallLLM.mockResolvedValue(llmResponse({ acme: "A software firm." }));

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme"]);

    expect(res.grounded).toBe(false); // GT unreachable → not grounded at service level
    expect(res.results).toHaveLength(1);
    expect(res.results[0].term).toBe("acme");
    // The summariser still ran (ungrounded), so we get its summary; the term itself is not grounded.
    expect(res.results[0].summary).toBe("A software firm.");
    expect(res.results[0].grounded).toBe(false);
    expect(res.results[0].source).toBeNull();
  });

  it("(2) GROWTH_TOOLS_URL / INTERNAL_API_KEY unset → ungrounded stub, no throw, no GT fetch", async () => {
    delete process.env.GROWTH_TOOLS_URL;
    delete process.env.INTERNAL_API_KEY;
    vi.resetModules();
    routeFetch({});

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme"]);

    expect(res.grounded).toBe(false);
    expect(res.results[0].grounded).toBe(false);
    expect(res.results[0].source).toBeNull();
    // No call to the GT top-results endpoint should have happened.
    const gtCalls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("/api/serp/top-results"),
    );
    expect(gtCalls).toHaveLength(0);
  });

  it("(3) GT responds configured:false → top-level grounded is false even with a source", async () => {
    routeFetch({
      top: {
        configured: false,
        results: [
          {
            term: "acme",
            source: { title: "Acme Ltd", link: "https://acme.example", snippet: "Acme makes things." },
            knowledgeGraph: null,
          },
        ],
      },
    });
    mockCallLLM.mockResolvedValue(llmResponse({ acme: "A manufacturer." }));

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme"]);

    expect(res.grounded).toBe(false); // service not configured
    expect(res.results[0].grounded).toBe(true); // but this term did get a source
    expect(res.results[0].source?.link).toBe("https://acme.example");
  });

  it("(4) happy path with source + knowledgeGraph → grounded:true, source populated, MiniMax is the model", async () => {
    routeFetch({
      top: {
        configured: true,
        results: [
          {
            term: "acme accountants leeds",
            source: {
              title: "Acme Accountants",
              link: "https://acme-accountants.co.uk",
              snippet: "Chartered accountants in Leeds.",
            },
            knowledgeGraph: { title: "Acme Accountants", type: "Accounting firm" },
          },
        ],
      },
    });
    mockCallLLM.mockResolvedValue(llmResponse({ "acme accountants leeds": "A UK accountancy firm in Leeds." }));

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme accountants leeds"]);

    expect(res.grounded).toBe(true);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].grounded).toBe(true);
    expect(res.results[0].summary).toBe("A UK accountancy firm in Leeds.");
    expect(res.results[0].source).toEqual({
      title: "Acme Accountants",
      link: "https://acme-accountants.co.uk",
      snippet: "Chartered accountants in Leeds.",
    });
    // The summariser defaults to MiniMax with a resilient fallback chain.
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const opts = mockCallLLM.mock.calls[0][0];
    expect(opts.model).toBe("minimax-m3");
    expect(opts.fallbackModels).toEqual(["claude-sonnet-4.6", "kimi-k2.6"]);
  });

  it("(5) duplicate / whitespace / empty input terms are deduped before grounding", async () => {
    let sentTerms: string[] = [];
    mockFetch.mockImplementation((url: string, init?: any) => {
      if (url.includes("/api/serp/top-results")) {
        sentTerms = JSON.parse(init.body).terms;
        return Promise.resolve(
          jsonResponse({
            configured: true,
            results: sentTerms.map((t) => ({ term: t, source: null, knowledgeGraph: null })),
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme", "  acme  ", "ACME", "", "   ", "beta"]);

    // "acme" collapses to one entry (first-seen casing kept), empties dropped.
    expect(sentTerms).toEqual(["acme", "beta"]);
    expect(res.results.map((r) => r.term)).toEqual(["acme", "beta"]);
  });

  it("(6) GT returns rows out of order / omits a term → output preserves input order and fills omitted as stubs", async () => {
    routeFetch({
      top: {
        configured: true,
        results: [
          // returned out of order, and "gamma" omitted entirely
          { term: "beta", source: { title: "Beta", link: "https://beta.example", snippet: "" }, knowledgeGraph: null },
          { term: "alpha", source: { title: "Alpha", link: "https://alpha.example", snippet: "" }, knowledgeGraph: null },
        ],
      },
    });
    mockCallLLM.mockResolvedValue(llmResponse({ alpha: "A.", beta: "B." }));

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["alpha", "beta", "gamma"]);

    // Input order preserved: alpha, beta, gamma.
    expect(res.results.map((r) => r.term)).toEqual(["alpha", "beta", "gamma"]);
    expect(res.results[0].source?.link).toBe("https://alpha.example");
    expect(res.results[1].source?.link).toBe("https://beta.example");
    // Omitted term filled as an ungrounded stub.
    expect(res.results[2].grounded).toBe(false);
    expect(res.results[2].source).toBeNull();
  });

  it("(7) summariser (callLLM) fails for the whole batch → 'No summary available' fallback, no crash, grounding preserved", async () => {
    routeFetch({
      top: {
        configured: true,
        results: [
          { term: "acme", source: { title: "Acme", link: "https://acme.example", snippet: "" }, knowledgeGraph: null },
        ],
      },
    });
    mockCallLLM.mockRejectedValue(new Error("all providers failed"));

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme"]);

    expect(res.grounded).toBe(true); // GT still grounded this term
    expect(res.results[0].grounded).toBe(true);
    expect(res.results[0].summary).toMatch(/No summary available/);
    expect(mockCallLLM).toHaveBeenCalledTimes(1); // attempted, then fell back gracefully
  });

  it("parses a summary array even when the model wraps it in prose/fences", async () => {
    routeFetch({
      top: {
        configured: true,
        results: [
          { term: "acme", source: { title: "Acme", link: "https://acme.example", snippet: "" }, knowledgeGraph: null },
        ],
      },
    });
    mockCallLLM.mockResolvedValue({
      message: {
        role: "assistant",
        content: [
          { type: "text", text: 'Here you go:\n```json\n[{"term":"acme","summary":"A widget maker."}]\n```' },
        ],
      },
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "minimax-m3",
      providerModel: "MiniMax-M3",
      source: "env",
    });

    const { researchSearchTerms } = await importModule();
    const res = await researchSearchTerms(["acme"]);
    expect(res.results[0].summary).toBe("A widget maker.");
  });

  it("returns an empty response for all-empty input without any fetch or LLM call", async () => {
    routeFetch({});
    const { researchSearchTerms } = await importModule();
    const res: TermResearchResponse = await researchSearchTerms(["", "   "]);
    expect(res).toEqual({ grounded: false, results: [] });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});
