// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MatchTypeTriageDecisions from "@/components/match-type-violations/MatchTypeTriageDecisions";

const decided = [
  {
    id: 1,
    searchTerm: "offshore developers",
    adGroupName: "Offshore",
    clicks: 4,
    impressions: 90,
    aiDecision: "relevant_keyword",
    aiReason: "Generic and relevant.",
    aiSummary: "A generic phrase for hiring remote developers.",
    aiConfidence: 90,
    aiDecidedAt: "2026-08-31T00:00:00.000Z",
  },
  {
    id: 2,
    searchTerm: "remote staff co",
    clicks: 1,
    impressions: 10,
    aiDecision: "competitor",
    aiReason: "Rival offshore staffing firm.",
    aiDecidedAt: "2026-08-31T00:00:00.000Z",
  },
  // Untriaged row leaking through the API must never be rendered.
  { id: 3, searchTerm: "leaked untriaged term", clicks: 0, impressions: 9, aiDecision: null, aiDecidedAt: null },
];

let violationUrls: string[] = [];

function mockFetch(docs: unknown[]) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/negative-keyword-lists")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ docs: [{ id: 55, name: "Competitors", relevancyExclusion: "competitor" }] }),
      } as unknown as Response);
    }
    if (String(url).startsWith("/api/match-type-violations?")) {
      violationUrls.push(String(url));
      return Promise.resolve({
        ok: true,
        json: async () => ({ docs, totalDocs: docs.length, totalPages: 1 }),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }), text: async () => "" } as unknown as Response);
  });
}

beforeEach(() => {
  violationUrls = [];
  vi.stubGlobal("fetch", mockFetch(decided));
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MatchTypeTriageDecisions", () => {
  it("only requests pending rows the triage has decided", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await waitFor(() => expect(violationUrls.length).toBeGreaterThan(0));
    expect(violationUrls[0]).toContain("status=pending");
    expect(violationUrls[0]).toContain("aiDecided=true");
    expect(violationUrls[0]).toContain("limit=100");
  });

  it("groups decided rows and hides any untriaged row", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    expect(await screen.findByText("Add as exact keyword (1)")).toBeTruthy();
    expect(screen.getByText("Competitor negatives (1)")).toBeTruthy();
    expect(screen.getByText("offshore developers")).toBeTruthy();
    expect(screen.queryByText("leaked untriaged term")).toBeNull();
  });

  it("sends autoExactFromCandidates when approving the relevant bucket", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Add as exact keyword (1)");
    fireEvent.click(screen.getAllByText("Select all")[0]);
    fireEvent.click(screen.getByText("Add as exact keywords (1)"));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("add-exact-bulk"),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body).toMatchObject({ candidateIds: ["1"], autoExactFromCandidates: true, negateSource: true });
    });
  });

  it("routes competitor approvals to the client's competitor list", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Competitor negatives (1)");
    fireEvent.click(screen.getAllByText("Select all")[1]);
    // The competitor bucket defaults its destination to the competitor list.
    fireEvent.click(screen.getAllByText("Add as negatives (1)")[0]);

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("bulk-approve"),
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
        candidateIds: ["2"],
        assignedListId: "55",
      });
    });
  });

  it("shows an empty state when nothing has been triaged", async () => {
    vi.stubGlobal("fetch", mockFetch([]));
    render(<MatchTypeTriageDecisions clientId="6" />);
    expect(await screen.findByText(/No auto decisions yet/)).toBeTruthy();
  });
});

describe("acting on Unclear rows", () => {
  const unclear = [
    {
      id: 9,
      searchTerm: "tech agency",
      adGroupName: "Outsourced Team",
      clicks: 1,
      impressions: 3,
      aiDecision: "unclear",
      aiReason: "Ambiguous, could be many trades.",
      aiConfidence: 35,
      aiDecidedAt: "2026-09-01T00:00:00.000Z",
    },
  ];

  it("offers all three actions on an unclear row so it is not a dead end", async () => {
    vi.stubGlobal("fetch", mockFetch(unclear));
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Unclear — manual review (1)");

    expect(screen.getByText("Add as exact keywords (0)")).toBeTruthy();
    expect(screen.getByText("Add as negatives (0)")).toBeTruthy();
    // The destination picker is what makes the negatives action flexible.
    expect(screen.getByText("Each term’s own ad group")).toBeTruthy();
  });

  it("negates a selected unclear row through the shared approve endpoint", async () => {
    vi.stubGlobal("fetch", mockFetch(unclear));
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Unclear — manual review (1)");
    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByText("Add as negatives (1)"));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("bulk-approve"),
      );
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
        candidateIds: ["9"],
        routing: { mode: "auto" },
      });
    });
  });

  it("lets a reviewer overrule the AI and treat a 'relevant' row as a competitor", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Add as exact keyword (1)");
    fireEvent.click(screen.getAllByText("Select all")[0]);
    // Point the exact-keyword bucket's negatives at the competitor list instead.
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "55" } });
    fireEvent.click(screen.getAllByText("Add as negatives (1)")[0]);

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("bulk-approve"),
      );
      expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
        candidateIds: ["1"],
        assignedListId: "55",
      });
    });
  });
});

describe("choosing a negative keyword list per bucket", () => {
  it("defaults to ad-group negatives and sends routing:auto", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Add as exact keyword (1)");
    fireEvent.click(screen.getAllByText("Select all")[0]);
    fireEvent.click(screen.getAllByText("Add as negatives (1)")[0]);

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("bulk-approve"),
      );
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.routing).toEqual({ mode: "auto" });
      expect(body.assignedListId).toBeUndefined();
    });
  });

  it("sends the chosen list instead of ad-group routing", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Add as exact keyword (1)");
    fireEvent.click(screen.getAllByText("Select all")[0]);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "55" } });
    fireEvent.click(screen.getAllByText("Add as negatives (1)")[0]);

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("bulk-approve"),
      );
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.assignedListId).toBe("55");
      expect(body.routing).toBeUndefined();
    });
  });

  it("keeps each bucket's destination independent", async () => {
    render(<MatchTypeTriageDecisions clientId="6" />);
    await screen.findByText("Competitor negatives (1)");
    // Change the first bucket only; the competitor bucket must keep its default.
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "55" } });

    fireEvent.click(screen.getAllByText("Select all")[1]);
    // Only the competitor bucket has a selection, so exactly one button reads (1).
    fireEvent.click(screen.getByText("Add as negatives (1)"));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
        String(url).includes("bulk-approve"),
      );
      // Its own default list, unaffected by the change to the first bucket.
      expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
        candidateIds: ["2"],
        assignedListId: "55",
      });
    });
  });
});
