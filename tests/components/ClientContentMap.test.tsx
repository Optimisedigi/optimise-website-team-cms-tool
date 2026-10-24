import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useDocumentInfo } from "@payloadcms/ui";
import fixture from "../fixtures/content-map-snapshot-sample.json";
import living from "../fixtures/content-map-living-sample.json";
import ClientContentMap from "@/components/ClientContentMap";
import ContentMapPage from "@/components/content-map/ContentMapPage";
import type { ContentMapApiResponse, ContentMapSnapshot } from "@/lib/content-map/types";

vi.mock("@payloadcms/ui", () => ({ useDocumentInfo: vi.fn() }));

function apiResponse(over: Partial<ContentMapApiResponse> = {}): ContentMapApiResponse {
  return {
    client: { id: "42", name: "Away Digital Teams", slug: "away-digital-teams", siteUrl: "https://example.com", enabled: true, authorities: [] },
    run: null,
    snapshot: fixture as unknown as ContentMapSnapshot,
    decisions: [],
    termW: {},
    sent: {},
    history: [],
    ...over,
  };
}

const DRAFTED = {
  status: "drafted", source: "cms-article", blogPostId: "11", anchor: "outsourcing costs", note: "Readers comparing options want the numbers.", model: "kimi-k3", appliedAt: null,
  original: "Many owners start by comparing outsourcing costs across countries.",
  replacement: "Many owners start by comparing [outsourcing costs](https://example.com/blog/costs/) across countries.",
};

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
let fetchMock: Mock;

function mockApi(state: ContentMapApiResponse) {
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith("/api/content-map?") || url.startsWith("/api/content-map/view?")) return ok(state);
    if (url === "/api/content-map/decision") return ok({ ok: true });
    if (url === "/api/content-map/recommendations/send") return ok({ blogPromptId: "77", created: true });
    if (url === "/api/content-map/links/draft") return ok({ ok: true, action: { ...DRAFTED } });
    if (url === "/api/content-map/links/apply") return ok({ ok: true, action: { ...DRAFTED, status: "applied", appliedAt: "2026-10-23T01:00:00.000Z" } });
    if (url === "/api/content-map/questions") return ok({ questions: state.citations?.questions ?? [] });
    if (url === "/api/content-map/ideas") return ok({ ok: true, model: "kimi-k3", count: 5 });
    return ok({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

beforeEach(() => {
  (useDocumentInfo as Mock).mockReturnValue({ id: "42" });
});
afterEach(() => vi.clearAllMocks());

describe("ClientContentMap", () => {
  it("renders all four tabs and switches between them", async () => {
    mockApi(apiResponse());
    render(<ClientContentMap />);
    expect(await screen.findByText("Topic associations")).toBeInTheDocument();
    expect(await screen.findByText("How the topics connect")).toBeInTheDocument();
    // No eyebrow line above the title any more; the update date sits by the actions.
    expect(screen.queryByText(/Internal link map/)).toBeNull();
    expect(screen.getByRole("button", { name: "Re-analyse" })).toHaveAttribute("title", "Updated 22 Oct 2026");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Approach", "Map", "Gap matrix", "AI citations", "Link opportunities", "Write next"]);
    expect(screen.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Approach" }));
    expect(screen.getByText("The approach")).toBeInTheDocument();
    expect(screen.getAllByTestId("approach-topic").length).toBe(5);
    fireEvent.click(screen.getByRole("tab", { name: "Gap matrix" }));
    expect(screen.getByText(/Rows link out, columns receive/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Link opportunities" }));
    expect(screen.getByText(/Suggested natural links between related pages/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Write next" }));
    expect(screen.getByText("What to write next")).toBeInTheDocument();
    expect(screen.getAllByTestId("rec-card")).toHaveLength(5);
  });

  it("accept posts to the decision API", async () => {
    mockApi(apiResponse());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Link opportunities" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0] as HTMLElement);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/content-map/decision", expect.objectContaining({ method: "POST" })));
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/content-map/decision");
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({ clientId: "42", decision: "accepted" });
    await waitFor(() => expect(screen.getAllByText("Accepted").length).toBeGreaterThan(1));
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("sends a recommendation to the Blog Prompter and shows Sent", async () => {
    mockApi(apiResponse());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Write next" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to Blog Prompter" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/content-map/recommendations/send", expect.anything()));
    expect(await screen.findByText(/Sent ·/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open brief" })).toHaveAttribute("href", "/admin/collections/blog-prompts/77");
  });

  it("accepting drafts the link edit, shows before/after, and Apply writes it", async () => {
    mockApi(apiResponse());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Link opportunities" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Accept" })[0] as HTMLElement);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/content-map/links/draft", expect.anything()));
    expect(await screen.findByText(DRAFTED.original)).toBeInTheDocument();
    expect(screen.getByText("outsourcing costs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply to article" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/content-map/links/apply", expect.anything()));
    expect(await screen.findByText(/Added to the article · 23 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open article" })).toHaveAttribute("href", "/admin/collections/blog-posts/11");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows a stored draft from the API without calling the model again", async () => {
    const key = (fixture as unknown as ContentMapSnapshot).opportunities[0]!.key;
    mockApi(apiResponse({ decisions: [{ key, decision: "accepted" }], actions: { [key]: { ...DRAFTED } as never } }));
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Link opportunities" }));
    expect(await screen.findByRole("button", { name: "Apply to article" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/content-map/links/draft", expect.anything());
  });

  it("writes Write next ideas with AI when the analysis only has template ideas", async () => {
    mockApi(apiResponse());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Write next" }));
    fireEvent.click(screen.getByRole("button", { name: "Write ideas with AI" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/content-map/ideas", expect.anything()));
  });

  it("links from the client record to the full page at /SEO/Topic-association-linking/<slug>", async () => {
    mockApi(apiResponse());
    render(<ClientContentMap />);
    expect(await screen.findByRole("link", { name: "Open full page" })).toHaveAttribute("href", "/SEO/Topic-association-linking/away-digital-teams");
  });

  it("full page fills the window and links back to the client", async () => {
    mockApi(apiResponse());
    const { container } = render(<ContentMapPage clientId="42" slug="away-digital-teams" audience="team" staff />);
    expect(await screen.findByText("How the topics connect")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open full page" })).toBeNull();
    expect((container.querySelector(".ccm-root") as HTMLElement).style.height).toBe("calc(100vh - 40px)");
    expect(screen.getByRole("img", { name: "Optimise Digital" })).toHaveAttribute("src", "/optimise-logo-animated.gif");
    expect(screen.getByText("Managed by")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Client view" })).toHaveAttribute("href", "/SEO/Topic-association-linking/away-digital-teams?view=client");
  });

  it("client view: opens on the approach, reads from the PIN-gated route and has no team controls", async () => {
    const key = (fixture as unknown as ContentMapSnapshot).opportunities[0]!.key;
    mockApi(apiResponse({ decisions: [{ key, decision: "accepted" }], actions: { [key]: { ...DRAFTED, status: "applied" } as never }, sent: { [(fixture as unknown as ContentMapSnapshot).recommendations[0]!.id]: "1" } }));
    render(<ContentMapPage clientId="" slug="away-digital-teams" audience="client" />);
    expect(await screen.findByText("Our approach")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/content-map/view?slug=away-digital-teams", expect.anything());
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Approach", "Map", "Gap matrix", "AI citations", "Internal links", "Planned articles"]);
    expect(screen.queryByRole("button", { name: "Re-analyse" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open client" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Team view" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Internal links" }));
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
    expect(screen.getByText("Added")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Planned articles" }));
    expect(screen.getByText("Articles we're planning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to Blog Prompter" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Write ideas with AI|Rewrite ideas/ })).toBeNull();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("shows the CMS rocket while the first analysis runs, with the step it's on", async () => {
    mockApi(apiResponse({ snapshot: null, run: { runId: "r1", status: "running", mode: "full", phase: "crawling", pagesCrawled: 42, error: null, startedAt: "2026-10-23T07:00:00.000Z" } as never }));
    render(<ClientContentMap />);
    const rocket = await screen.findByTestId("ccm-rocket");
    expect(rocket).toHaveTextContent("Analysing the site");
    expect(rocket).toHaveTextContent("Reading the site · 42 pages so far");
    expect(screen.getByRole("status", { name: "Analysing the site" })).toBeInTheDocument();
  });

  it("shows the rocket the moment Analyse now is pressed", async () => {
    let release: (v: Response) => void = () => {};
    mockApi(apiResponse({ snapshot: null, run: null }));
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === "/api/content-map/run" ? new Promise<Response>((r) => { release = r; }) : base(url, init));
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("button", { name: "Analyse now" }));
    expect(await screen.findByTestId("ccm-rocket")).toHaveTextContent("Starting the analysis");
    release(new Response(JSON.stringify({ run: { runId: "r2", status: "running", mode: "full", phase: "queued", pagesCrawled: 0, error: null, startedAt: null } }), { status: 200 }));
    expect(await screen.findByText(/Waiting for a free slot to start/)).toBeInTheDocument();
  });

  it("explains how to switch analysis on", async () => {
    mockApi(apiResponse({ client: { id: "42", name: "X", siteUrl: "", enabled: false, authorities: [] }, snapshot: null }));
    render(<ClientContentMap />);
    expect(await screen.findByText(/switched off for this client.*Blog Settings tab → Content Map/)).toBeInTheDocument();
  });
});

const livingState = () => JSON.parse(JSON.stringify(living)) as ContentMapApiResponse;
const bodyOf = (url: string) => {
  const call = fetchMock.mock.calls.find((c) => c[0] === url);
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
};

describe("ClientContentMap · living layer", () => {
  it("plan cards show reasons and origin, and the brief shows what AI tools cite", async () => {
    mockApi(livingState());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Write next" }));
    expect(screen.getAllByTestId("rec-card")).toHaveLength(living.plan.length);
    expect(screen.getAllByText("ChatGPT and Perplexity cite 2 other sites for this question").length).toBeGreaterThan(0);
    expect(screen.getAllByText("From AI citations").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Suggested by the client").length).toBeGreaterThan(0);
    expect(screen.getByText(/What AI tools cite today/)).toBeInTheDocument();
    expect(screen.getByText("Do better than them")).toBeInTheDocument();
    const src = living.plan[0]!.sources![0]!;
    const link = screen.getByRole("link", { name: new RegExp(src.domain.replace(/\./g, "\\.")) });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    fireEvent.click(screen.getByRole("button", { name: "Send to Blog Prompter" }));
    await waitFor(() => expect(bodyOf("/api/content-map/recommendations/send")).toMatchObject({ clientId: "42", recommendationId: living.plan[0]!.id }));
  });

  it("team Suggest posts to the staff route", async () => {
    mockApi(livingState());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("button", { name: "Suggest" }));
    fireEvent.click(screen.getByRole("radio", { name: "Connect two topics" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cost of managing remote teams" } });
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "Buyers ask." } });
    fireEvent.change(screen.getByLabelText("Second topic"), { target: { value: "cost" } });
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    await waitFor(() => expect(bodyOf("/api/content-map/suggestions")).toEqual({ clientId: "42", kind: "bridge", title: "Cost of managing remote teams", why: "Buyers ask.", topic: "vietnam", topicB: "cost" }));
  });

  it("client Suggest posts to the PIN route with the slug and shows errors inline", async () => {
    const state = livingState();
    mockApi(state);
    const base = fetchMock.getMockImplementation() as (u: string) => unknown;
    fetchMock.mockImplementation((url: string) => url === "/api/content-map/view/suggestions"
      ? Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })
      : base(url));
    render(<ContentMapPage clientId="" slug="away-digital-teams" audience="client" />);
    fireEvent.click(await screen.findByRole("button", { name: "Suggest" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hiring designers" } });
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "We get asked." } });
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    await waitFor(() => expect(bodyOf("/api/content-map/view/suggestions")).toEqual({ slug: "away-digital-teams", kind: "article", title: "Hiring designers", why: "We get asked.", topic: "vietnam" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Too many suggestions/);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/content-map/suggestions", expect.anything());
  });

  it("team approve and dismiss call decide", async () => {
    mockApi(livingState());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "Write next" }));
    expect(screen.getByText("Suggestions · 2")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0] as HTMLElement);
    await waitFor(() => expect(bodyOf("/api/content-map/suggestions/decide")).toEqual({ clientId: "42", id: "s1", decision: "approve" }));
    fetchMock.mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[1] as HTMLElement);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Covered already" } });
    const reasonRow = screen.getByLabelText("Reason").parentElement as HTMLElement;
    fireEvent.click(within(reasonRow).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(bodyOf("/api/content-map/suggestions/decide")).toEqual({ clientId: "42", id: "s2", decision: "dismiss", reason: "Covered already" }));
  });

  it("shows suggestions dashed on the map and the gap matrix", async () => {
    mockApi(livingState());
    render(<ClientContentMap />);
    expect(await screen.findByTestId("ghost-bridge-s2")).toBeInTheDocument();
    expect(screen.getByTestId("ghost-topic-s1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ov-node-managing-teams"));
    expect(screen.getByTestId("ghost-article-s3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Gap matrix" }));
    fireEvent.click(screen.getByTitle(/^Cost → Managing teams/));
    expect(screen.getByTestId("pair-suggestion")).toHaveTextContent(/Management overhead/);
  });

  it("AI citations tab renders the grid and adds/removes questions", async () => {
    mockApi(livingState());
    render(<ClientContentMap />);
    fireEvent.click(await screen.findByRole("tab", { name: "AI citations" }));
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Approach", "Map", "Gap matrix", "AI citations", "Link opportunities", "Write next"]);
    expect(screen.getByTestId("citations-grid")).toBeInTheDocument();
    expect(screen.getAllByTestId("cite-cell")).toHaveLength(living.citations.questions.length * 4);
    // Two sections: existing articles first, then planned/suggested.
    const existing = screen.getByTestId("citations-group-existing");
    const planned = screen.getByTestId("citations-group-planned");
    expect(existing.compareDocumentPosition(planned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(existing).toHaveTextContent("Your published articles · 5");
    expect(planned).toHaveTextContent("Planned and suggested, by topic · 10");
    const firstExisting = living.citations.questions.find((q) => q.group === "existing")!;
    expect(within(existing).getByRole("link", { name: `Article: ${firstExisting.pageTitle} ↗` })).toHaveAttribute("href", firstExisting.pageUrl);
    expect(within(existing).queryByLabelText(/Add a question to/)).toBeNull();
    expect(screen.getAllByText("Google AI Overviews").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("refresh-item")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Add a question to cost"), { target: { value: "How much does a Vietnam team cost?" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add question" })[3] as HTMLElement);
    await waitFor(() => expect(bodyOf("/api/content-map/questions")).toEqual({ clientId: "42", action: "add", topic: "cost", question: "How much does a Vietnam team cost?" }));
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: `Remove question: ${living.citations.questions[0]!.question}` }));
    await waitFor(() => expect(bodyOf("/api/content-map/questions")).toEqual({ clientId: "42", action: "remove", id: "q1" }));
    fireEvent.click(screen.getByRole("button", { name: "Check AI citations" }));
    await waitFor(() => expect(bodyOf("/api/content-map/citations/run")).toEqual({ clientId: "42" }));
  });

  it("client view has no team controls and shows Your suggestions", async () => {
    mockApi(livingState());
    render(<ContentMapPage clientId="" slug="away-digital-teams" audience="client" />);
    expect(await screen.findByText("Our approach")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Approach", "Map", "Gap matrix", "AI citations", "Internal links", "Planned articles"]);
    expect(screen.getByText(/Your suggestions/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.getByText("Added to the plan")).toBeInTheDocument();
    expect(screen.getByTestId("approach-citations")).toBeInTheDocument();
    expect(screen.getByTestId("why-articles")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "AI citations" }));
    expect(screen.getByText(/Each week we ask ChatGPT, Perplexity, Gemini and Google's AI Overviews/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check AI citations" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add question" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove question/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Planned articles" }));
    expect(screen.getAllByText("Suggested by you").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
