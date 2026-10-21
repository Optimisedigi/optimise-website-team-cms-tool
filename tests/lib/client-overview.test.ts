// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCallLLM = vi.hoisted(() => vi.fn());
const mockQueueForApproval = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/_shared/llm", () => ({
  callLLM: (opts: unknown) => mockCallLLM(opts),
}));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: async () => ({ defaultAutonomousModel: "claude-sonnet-5.5" }),
}));
vi.mock("@/lib/agents/_shared/approval-queue", () => ({
  queueForApproval: (input: unknown) => mockQueueForApproval(input),
}));

import {
  extractPageContent,
  fetchPublicHtml,
  isBlockedAddress,
  normaliseWebsiteUrl,
  pickExtraPageUrls,
} from "@/lib/client-overview/website-research";
import {
  applyClientOverviewDraft,
  buildOverviewRichText,
  backfillClientOverviews,
  CLIENT_OVERVIEW_PROPOSAL_TYPE,
  hasOverviewContent,
  listBackfillCandidates,
  parseOverviewDraft,
  runClientOverviewDraft,
} from "@/lib/client-overview/draft";

const publicLookup = async () => ["93.184.216.34"];

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

const HOME_HTML = `<html><head><title>Acme Plumbing &amp; Gas</title>
<meta name="description" content="Emergency plumbers in Brisbane"></head>
<body><script>var secret = 1</script><h1>Acme Plumbing</h1><p>24/7 plumbing across Brisbane's north side.</p>
<p>Hot water, blocked drains and gas fitting for homes and strata.</p>
<a href="/about-us/">About</a><a href="/services">Services</a><a href="https://other.com/about">Elsewhere</a></body></html>`;

const LLM_REPLY = JSON.stringify({
  summary: "Acme Plumbing is a 24/7 plumber serving Brisbane's north side.",
  points: [
    { label: "Products and services", detail: "Hot water, blocked drains and gas fitting." },
    { label: "Customers", detail: "Homeowners and [strata](https://evil.test) managers." },
  ],
});

type Doc = Record<string, unknown>;

function fakePayload(client: Doc, openApprovals = 0) {
  const update = vi.fn(async ({ data }: { data: Doc }) => Object.assign(client, data));
  return {
    findByID: vi.fn(async () => ({ ...client })),
    find: vi.fn(async () => ({ totalDocs: openApprovals, docs: [] })),
    update,
    logger: { info: vi.fn(), warn: vi.fn() },
  };
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  mockCallLLM.mockReset();
  mockQueueForApproval.mockReset();
});

describe("website URL guard", () => {
  it("accepts bare domains and rejects non-public or odd URLs", () => {
    const ok = normaliseWebsiteUrl("acme.com.au");
    expect(ok.ok && ok.url.toString()).toBe("https://acme.com.au/");
    expect(normaliseWebsiteUrl("").ok).toBe(false);
    expect(normaliseWebsiteUrl("ftp://acme.com").ok).toBe(false);
    expect(normaliseWebsiteUrl("http://localhost:3000").ok).toBe(false);
    expect(normaliseWebsiteUrl("https://user:pw@acme.com").ok).toBe(false);
    expect(normaliseWebsiteUrl("https://acme.com:8080").ok).toBe(false);
  });

  it("blocks private, loopback, metadata and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
  });

  it("refuses hosts that resolve to private addresses without fetching", async () => {
    await expect(
      fetchPublicHtml(new URL("https://acme.com"), { lookup: async () => ["10.0.0.5"] }),
    ).rejects.toThrow(/non-public/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-checks redirect targets", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/" } }),
    );
    await expect(fetchPublicHtml(new URL("https://acme.com"), { lookup: publicLookup })).rejects.toThrow(
      /non-public/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("page extraction", () => {
  it("keeps readable text and drops scripts", () => {
    const page = extractPageContent(HOME_HTML, "https://acme.com/");
    expect(page.title).toBe("Acme Plumbing & Gas");
    expect(page.description).toBe("Emergency plumbers in Brisbane");
    expect(page.text).toContain("24/7 plumbing across Brisbane's north side.");
    expect(page.text).not.toContain("secret");
  });

  it("picks same-site about and services pages only", () => {
    const urls = pickExtraPageUrls(HOME_HTML, new URL("https://www.acme.com/")).map((u: URL) => u.toString());
    expect(urls).toEqual(["https://www.acme.com/about-us/", "https://www.acme.com/services"]);
  });
});

describe("draft parsing and rich text", () => {
  it("strips link markup from model output", () => {
    const draft = parseOverviewDraft(`\`\`\`json\n${LLM_REPLY}\n\`\`\``);
    expect(draft?.points[1]?.detail).toBe("Homeowners and strata(https://evil.test) managers.");
    expect(parseOverviewDraft("no json here")).toBeNull();
  });

  it("builds Lexical content the populated check recognises", () => {
    const draft = parseOverviewDraft(LLM_REPLY);
    expect(draft).not.toBeNull();
    const rich = buildOverviewRichText(draft!);
    expect(hasOverviewContent(rich)).toBe(true);
    expect(hasOverviewContent({ root: { type: "root", children: [{ type: "paragraph", children: [] }] } })).toBe(false);
    expect(hasOverviewContent(null)).toBe(false);
  });
});

describe("runClientOverviewDraft", () => {
  const populated = {
    root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "Written by Pete" }] }] },
  };

  it("does nothing when the section is already filled in", async () => {
    const payload = fakePayload({ id: 1, name: "Acme", websiteUrl: "acme.com", clientOverview: populated });
    const outcome = await runClientOverviewDraft(payload as never, 1, "client-created", { lookup: publicLookup });
    expect(outcome).toEqual({ status: "skipped", reason: "The section is already filled in" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockQueueForApproval).not.toHaveBeenCalled();
  });

  it("does nothing when a draft is already waiting for approval", async () => {
    const payload = fakePayload({ id: 1, name: "Acme", websiteUrl: "acme.com", clientOverview: null }, 1);
    const outcome = await runClientOverviewDraft(payload as never, 1, "proposal-created", { lookup: publicLookup });
    expect(outcome.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("researches the website and queues the draft for approval", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      htmlResponse(url.endsWith("acme.com/") ? HOME_HTML : "<body><p>Family owned since the 90s in Brisbane.</p></body>"),
    );
    mockCallLLM.mockResolvedValue({ message: { role: "assistant", content: [{ type: "text", text: LLM_REPLY }] } });
    mockQueueForApproval.mockResolvedValue(42);
    const payload = fakePayload({ id: 7, name: "Acme", websiteUrl: "acme.com", clientOverview: null });

    const outcome = await runClientOverviewDraft(payload as never, 7, "client-created", { lookup: publicLookup });

    expect(outcome).toEqual({ status: "queued", approvalId: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const prompt = mockCallLLM.mock.calls[0]?.[0].messages[0].content[0].text as string;
    expect(prompt).toContain("Hot water, blocked drains");
    const queued = mockQueueForApproval.mock.calls[0]?.[0];
    expect(queued).toMatchObject({ proposalType: CLIENT_OVERVIEW_PROPOSAL_TYPE, clientId: 7 });
    expect(queued.proposalPayload.summary).toContain("Acme Plumbing");
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("reports an unreadable website as failed without queueing", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));
    const payload = fakePayload({ id: 7, name: "Acme", websiteUrl: "acme.com", clientOverview: null });
    const outcome = await runClientOverviewDraft(payload as never, 7, "client-created", { lookup: publicLookup });
    expect(outcome.status).toBe("failed");
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockQueueForApproval).not.toHaveBeenCalled();
  });
});

describe("applyClientOverviewDraft", () => {
  const proposal = JSON.parse(LLM_REPLY) as Record<string, unknown>;

  it("writes the approved draft into an empty section", async () => {
    const payload = fakePayload({ id: 3, name: "Acme", clientOverview: null });
    await applyClientOverviewDraft({ ...proposal, clientId: 3 }, { payload: payload as never, approvalId: 1, userId: 1 });
    const data = payload.update.mock.calls[0]?.[0].data as { clientOverview: unknown };
    expect(hasOverviewContent(data.clientOverview)).toBe(true);
  });

  it("never overwrites a section filled in after the draft was made", async () => {
    const payload = fakePayload({ id: 3, name: "Acme", clientOverview: "Manual notes" });
    await expect(
      applyClientOverviewDraft({ ...proposal, clientId: 3 }, { payload: payload as never, approvalId: 1, userId: 1 }),
    ).rejects.toThrow(/nothing was overwritten/);
    expect(payload.update).not.toHaveBeenCalled();
  });
});

describe("backfill", () => {
  const filled = { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "Done" }] }] } };
  const clients: Doc[] = [
    { id: 1, name: "Empty with site", websiteUrl: "one.com", clientOverview: null },
    { id: 2, name: "Already filled", websiteUrl: "two.com", clientOverview: filled },
    { id: 3, name: "No website", websiteUrl: "", clientOverview: null },
    { id: 4, name: "Draft waiting", websiteUrl: "four.com", clientOverview: null },
    { id: 5, name: "Empty with site too", websiteUrl: "five.com", clientOverview: null },
  ];

  function backfillPayload() {
    return {
      find: vi.fn(async ({ collection, where }: { collection: string; where?: { and?: Doc[] } }) => {
        if (collection === "clients") return { docs: clients, totalDocs: clients.length };
        // Per-client open-draft check carries a client filter; the list query does not.
        const byClient = where?.and?.find((w) => "client" in w) as { client?: { equals?: unknown } } | undefined;
        if (byClient) {
          const hit = byClient.client?.equals === 4;
          return { docs: [], totalDocs: hit ? 1 : 0 };
        }
        return { docs: [{ client: 4 }], totalDocs: 1 };
      }),
      findByID: vi.fn(async ({ id }: { id: number }) => ({ ...clients.find((c) => c.id === id) })),
      update: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn() },
    };
  }

  it("lists only active empty clients with a website and no waiting draft", async () => {
    const candidates = await listBackfillCandidates(backfillPayload() as never);
    expect(candidates.map((c) => c.id)).toEqual([1, 5]);
  });

  it("drafts in batches and continues after the last processed id", async () => {
    fetchMock.mockImplementation(async () => htmlResponse(HOME_HTML));
    mockCallLLM.mockResolvedValue({ message: { role: "assistant", content: [{ type: "text", text: LLM_REPLY }] } });
    mockQueueForApproval.mockResolvedValue(9);
    const payload = backfillPayload();

    const first = await backfillClientOverviews(payload as never, { limit: 1, lookup: publicLookup });
    expect(first.results.map((r) => [r.id, r.status])).toEqual([[1, "queued"]]);
    expect(first.remaining).toBe(1);

    const second = await backfillClientOverviews(payload as never, { limit: 1, afterId: first.lastId ?? undefined, lookup: publicLookup });
    expect(second.results.map((r) => r.id)).toEqual([5]);
    expect(second.remaining).toBe(0);
    expect(mockQueueForApproval.mock.calls[0]?.[0].proposalPayload.trigger).toBe("backfill");
  });
});
