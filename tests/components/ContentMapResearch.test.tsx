import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { cleanup as cleanupAll, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import sample from "../fixtures/content-map-research-sample.json";
import ContentMapPage from "@/components/content-map/ContentMapPage";
import type { ContentMapApiResponse, ResearchView } from "@/lib/content-map/types";

vi.mock("@payloadcms/ui", () => ({ useDocumentInfo: vi.fn() }));

const team = () => structuredClone(sample) as unknown as ContentMapApiResponse;
/** What toClientView sends: no competitor sites anywhere, no dismissed ideas, no cmsIds. */
function clientState(): ContentMapApiResponse {
  const s = team();
  const r = s.research as ResearchView;
  r.error = null;
  r.insightsModel = "";
  r.ideas = r.ideas.filter((i) => i.status !== "dismissed").map((i) => ({ ...i, evidence: i.evidence.map(({ domains: _d, ...e }) => e) }));
  for (const t of Object.values(r.topics)) t.competitorDomains = [];
  s.inProgress = (s.inProgress ?? []).map((x) => ({ ...x, cmsId: null }));
  s.plan = (s.plan ?? []).map((p) => ({ ...p, reasons: p.reasons.map(({ domains: _d, ...x }) => x) }));
  return s;
}
const DOMAINS = [...new Set(Object.values((team().research as ResearchView).topics).flatMap((t) => t.competitorDomains.map((d) => d.domain)))];

const PLACEMENT = { topic: "cost", fit: 0.7, overlaps: ["vietnam"], placement: "new-article", pageId: null, pageTitle: null, newTopicName: null, linksTo: [], linksFrom: [], why: "Fits Cost and also touches Vietnam.", warnings: ["Overlaps an existing page."] };
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
let fetchMock: Mock;
function mockApi(state: ContentMapApiResponse, over: Record<string, () => unknown> = {}) {
  fetchMock = vi.fn((url: string) => {
    if (over[url]) return over[url]();
    if (url.startsWith("/api/content-map?") || url.startsWith("/api/content-map/view?")) return ok(state);
    if (url.endsWith("/placement")) return ok(PLACEMENT);
    return ok({ ok: true });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}
const bodyOf = (url: string) => {
  const call = fetchMock.mock.calls.find((c) => c[0] === url);
  return call ? JSON.parse((call[1] as RequestInit).body as string) : undefined;
};
const svgCount = () => document.querySelectorAll("main svg *").length;
const toggle = (label: string) => fireEvent.click(screen.getByRole("switch", { name: label }));
const renderTeam = (state = team()) => { mockApi(state); return render(<ContentMapPage clientId="42" slug="away-digital-teams" audience="team" staff />); };

afterEach(() => vi.clearAllMocks());

describe("Content Map · research layers", () => {
  it("all layers are off by default and the map is unchanged versus no research", async () => {
    const without = team();
    without.research = null;
    without.inProgress = [];
    const a = renderTeam(without);
    await screen.findByTestId("ov-node-cost");
    expect(screen.queryByTestId("research-layers")).toBeNull();
    const base = svgCount();
    fireEvent.click(screen.getByTestId("ov-node-cost"));
    const baseTopic = svgCount();
    a.unmount();

    renderTeam();
    await screen.findByTestId("research-layers");
    for (const s of screen.getAllByRole("switch")) expect(s).toHaveAttribute("aria-checked", "false");
    expect(screen.getAllByRole("switch").map((s) => s.textContent)).toEqual(["Search volume", "Questions", "Competitors", "Search Console"]);
    expect(screen.getByTestId("research-status")).toHaveTextContent("Researched 1 Oct · Search Console 22 Oct");
    expect(svgCount()).toBe(base);
    fireEvent.click(screen.getByTestId("ov-node-cost"));
    expect(svgCount()).toBe(baseTopic);
  });

  it("each layer adds its elements", async () => {
    renderTeam();
    await screen.findByTestId("research-layers");
    const base = svgCount();
    toggle("Search volume");
    expect(screen.getByTestId("demand-ring-vietnam")).toBeInTheDocument();
    expect(screen.getByTestId("demand-label-vietnam")).toHaveTextContent("8.4k/mo");
    expect(screen.getByTestId("research-topic-rs5")).toBeInTheDocument();
    toggle("Search volume");
    expect(svgCount()).toBe(base);
    toggle("Competitors");
    expect(screen.getByTestId("competitors-vietnam")).toHaveTextContent("6 competitor pages");
    toggle("Competitors");

    fireEvent.click(screen.getByTestId("ov-node-vietnam"));
    toggle("Questions");
    expect(screen.getByTestId("research-dot-rs4")).toBeInTheDocument();
    toggle("Questions");
    toggle("Search Console");
    expect(screen.getByTestId("cannibal-1")).toBeInTheDocument();
    expect(document.querySelector("[data-testid^='gsc-/blog/']")).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "All topics" })[0] as HTMLElement);
    fireEvent.click(screen.getByTestId("ov-node-cost"));
    expect(screen.getByTestId("gsc-query-0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Gap matrix" }));
    expect(screen.queryByTestId("pair-demand-cost-vietnam")).toBeNull();
    toggle("Search volume");
    expect(screen.getByTestId("pair-demand-cost-vietnam")).toHaveTextContent("1.3k/mo");
  });

  it("Questions and Search Console show lines on the overview, and say when there is nothing", async () => {
    renderTeam();
    await screen.findByTestId("research-layers");
    toggle("Questions");
    expect(screen.getByTestId("questions-vietnam")).toHaveTextContent("24 questions");
    toggle("Questions");
    toggle("Search Console");
    expect(screen.getByTestId("gsc-vietnam")).toHaveTextContent("40k impressions · pos 16");
    expect(screen.getByTestId("unanswered-cost")).toHaveTextContent("1 unanswered");
    toggle("Search Console");
    const empty = team();
    const r = empty.research as ResearchView;
    for (const t of Object.values(r.topics)) { t.questions = 0; t.gsc = null; }
    r.gscQueries = [];
    cleanupAll();
    renderTeam(empty);
    await screen.findByTestId("research-layers");
    toggle("Questions");
    toggle("Search Console");
    expect(screen.getByTestId("layer-empty-notes")).toHaveTextContent("Questions: no questions for these topics yet");
    expect(screen.getByTestId("layer-empty-notes")).toHaveTextContent("Search Console: no data for these topics yet");
  });

  it("Search Console switch is disabled when not connected", async () => {
    const s = team();
    (s.research as ResearchView).gscConnected = false;
    renderTeam(s);
    await screen.findByTestId("research-layers");
    expect(screen.getByRole("switch", { name: "Search Console" })).toBeDisabled();
    expect(screen.getByTestId("research-status")).toHaveTextContent("Search Console isn't connected");
  });

  it("Research now starts a run", async () => {
    renderTeam();
    fireEvent.click(await screen.findByRole("button", { name: "Research now" }));
    await waitFor(() => expect(bodyOf("/api/content-map/research/run")).toEqual({ clientId: "42" }));
  });

  it("evidence panel opens from a dot, and Add to plan / Dismiss call decide", async () => {
    renderTeam();
    await screen.findByTestId("research-layers");
    fireEvent.click(screen.getByTestId("ov-node-comparisons"));
    toggle("Competitors");
    fireEvent.click(screen.getByTestId("research-dot-rs3"));
    const panel = screen.getByTestId("research-panel");
    expect(within(panel).getAllByTestId("evidence-line").length).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Add to plan" }));
    await waitFor(() => expect(bodyOf("/api/content-map/research/decide")).toEqual({ clientId: "42", id: "rs3", action: "add" }));
    fetchMock.mockClear();
    fireEvent.click(within(screen.getByTestId("research-panel")).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(bodyOf("/api/content-map/research/decide")).toEqual({ clientId: "42", id: "rs3", action: "dismiss" }));
  });

  it("new-topic bubble opens its placement", async () => {
    renderTeam();
    await screen.findByTestId("research-layers");
    toggle("Competitors");
    fireEvent.click(screen.getByTestId("research-topic-rs5"));
    expect(screen.getByTestId("placement-line")).toHaveTextContent("Needs a new topic: Hiring developers in Vietnam");
  });

  it("Write next shows research volume, the Research list and In progress", async () => {
    renderTeam();
    fireEvent.click(await screen.findByRole("tab", { name: "Write next" }));
    expect(screen.getAllByTestId("rec-volume")[0]).toHaveTextContent("1,300 searches/mo");
    const list = screen.getByTestId("research-list");
    expect(within(list).getAllByTestId("research-idea")).toHaveLength(3);
    fireEvent.click(within(list).getByText(/Show dismissed · 1/));
    fireEvent.click(within(list).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(bodyOf("/api/content-map/research/decide")).toEqual({ clientId: "42", id: "rs6", action: "restore" }));
    const ip = screen.getByTestId("in-progress");
    expect(within(ip).getByRole("link", { name: "10 tips for working with offshore developers" })).toHaveAttribute("href", "/admin/blog/prompter?brief=301&client=42");
    expect(within(ip).getByRole("link", { name: "Our 2026 pricing explained" })).toHaveAttribute("href", "/admin/collections/blog-posts/512");
    fireEvent.click(within(ip).getByRole("link", { name: "Our 2026 pricing explained" }));
    expect(screen.getByTestId("admin-doc-panel").querySelector("iframe")).toHaveAttribute("src", "/admin/collections/blog-posts/512");
  });

  it("Approach shows demand per topic, where demand is and in progress", async () => {
    renderTeam();
    fireEvent.click(await screen.findByRole("tab", { name: "Approach" }));
    expect(screen.getAllByTestId("approach-demand").length).toBeGreaterThan(0);
    expect(screen.getByTestId("approach-where-demand")).toHaveTextContent("8.4k/mo");
    expect(screen.getByTestId("approach-in-progress")).toHaveTextContent("In progress · 2");
  });

  it("Check fit posts to the team route and shows the placement", async () => {
    renderTeam();
    fireEvent.click(await screen.findByRole("button", { name: "Suggest" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Vietnam salaries" } });
    fireEvent.click(screen.getByRole("button", { name: "Check fit" }));
    expect(await screen.findByTestId("check-result")).toHaveTextContent("Fits Cost and also touches Vietnam.");
    expect(bodyOf("/api/content-map/placement")).toEqual({ clientId: "42", title: "Vietnam salaries", topic: "vietnam" });
  });

  it("Check fit posts to the PIN route for the client and shows 429 inline", async () => {
    mockApi(clientState(), { "/api/content-map/view/placement": () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }) });
    render(<ContentMapPage clientId="" slug="away-digital-teams" audience="client" />);
    fireEvent.click(await screen.findByRole("button", { name: "Suggest" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Vietnam salaries" } });
    fireEvent.click(screen.getByRole("button", { name: "Check fit" }));
    expect(await screen.findByTestId("check-error")).toHaveTextContent(/Too many checks/);
    expect(bodyOf("/api/content-map/view/placement")).toEqual({ slug: "away-digital-teams", title: "Vietnam salaries", topic: "vietnam" });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/content-map/placement", expect.anything());
  });

  it("client view never shows competitor sites and has no team research controls", async () => {
    mockApi(clientState());
    render(<ContentMapPage clientId="" slug="away-digital-teams" audience="client" />);
    fireEvent.click(await screen.findByRole("tab", { name: "Map" }));
    expect(screen.queryByRole("button", { name: "Research now" })).toBeNull();
    toggle("Competitors");
    toggle("Search volume");
    expect(screen.getByTestId("competitors-vietnam")).toHaveTextContent("6 competitor pages");
    fireEvent.click(screen.getByTestId("demand-ring-vietnam"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByTestId("ov-node-cost"));
    fireEvent.click(screen.getByTestId("research-dot-rs1"));
    expect(screen.queryByRole("button", { name: "Add to plan" })).toBeNull();
    const seen = () => document.body.textContent ?? "";
    for (const d of DOMAINS) expect(seen()).not.toContain(d);
    fireEvent.click(screen.getByRole("tab", { name: "Planned articles" }));
    expect(screen.queryByRole("button", { name: "Add to plan" })).toBeNull();
    expect(within(screen.getByTestId("in-progress")).queryAllByRole("link")).toHaveLength(0);
    // "What AI tools cite today" (AI citations, not research) may name cited sites; research parts never do.
    const research = [...screen.getAllByTestId("reason-chip"), ...screen.queryAllByTestId("evidence-line"), screen.getByTestId("research-list"), screen.getByTestId("in-progress")].map((e) => e.textContent).join(" ");
    for (const d of DOMAINS) expect(research).not.toContain(d);
  });
});
