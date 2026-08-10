import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAdsDashboard } from "@/components/dashboards/googleads/GoogleAdsDashboard";
import type { GoogleAdsDashboardData } from "@/lib/dashboard-types";

/**
 * Mirrors the live Growth Tools payload for Away Digital Teams: two selected
 * primary actions and four more actions that only contribute to allConversions.
 */
const DATA = {
  slug: "away-digital",
  clientName: "Away Digital Teams",
  customerId: "3425353766",
  lastUpdated: new Date().toISOString(),
  availableConversionActions: [
    "Chat - Conversation Started",
    "Chat - Email Shared",
    "Chat - Interaction",
    "Chat - Quick Reply Click",
    "GNG【form visit】contact-us",
    "GTM - P1 Forms",
  ],
  kpis: {
    spend: 7500,
    clicks: 265,
    impressions: 6686,
    avgCpc: 28.38,
    ctr: 3.96,
    conversions: 1,
    allConversions: 66,
    cpa: 7500,
    conversionsByAction: { "GTM - P1 Forms": 1 },
    allConversionsByAction: {
      "Chat - Interaction": 53,
      "GNG【form visit】contact-us": 10,
      "Chat - Conversation Started": 1,
      "Chat - Quick Reply Click": 1,
      "GTM - P1 Forms": 1,
    },
    prevSpend: null,
    prevClicks: null,
    prevAvgCpc: null,
    prevConversions: null,
    prevCpa: null,
    yoySpend: null,
    yoyClicks: null,
    yoyAvgCpc: null,
    yoyConversions: null,
    yoyCpa: null,
  },
  monthlyTrend: [],
  campaignBreakdown: [],
  topKeywords: [],
  topConverters: [],
  budgetWasters: [],
  irrelevantTerms: [],
  auctionInsights: [],
  activityStats: {
    negativesAdded: 0,
    keywordsAdded: 0,
    adsUpdated: 0,
    bidChanges: 0,
    customStats: [],
  },
  notes: "",
  workDone: "",
} as unknown as GoogleAdsDashboardData;

const DEFAULTS = "Chat - Email Shared\nGTM - P1 Forms";

function renderDashboard(props: { hidden?: string; clientId?: string } = {}) {
  return render(
    <GoogleAdsDashboard
      data={DATA}
      conversionActions={DEFAULTS}
      conversionActionCategories={JSON.stringify([
        { label: "Form Submit", actions: ["GTM - P1 Forms"] },
      ])}
      hiddenSecondaryConversionActions={props.hidden}
      clientId={props.clientId}
    />,
  );
}

function openConversionDropdown() {
  fireEvent.click(screen.getByRole("button", { name: /Conversions/i }));
}

/** The selector panel section holding the secondary conversion checkboxes. */
function secondaryGroup(): HTMLElement {
  return screen.getByTestId("secondary-conversion-group");
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        // Only the save endpoint needs to succeed; dashboard data fetches are
        // left failing so the component keeps rendering its initial payload.
        ok: String(url).includes("/api/dashboard/conversion-action-defaults"),
        json: () => Promise.resolve({ success: true }),
      }),
    ),
  );
  // jsdom ships no ResizeObserver; the dashboard's charts construct one on mount.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleAdsDashboard secondary conversion selector", () => {
  it("lists the secondary actions with counts in their own group", () => {
    renderDashboard();
    openConversionDropdown();

    const group = secondaryGroup();
    expect(within(group).getByText("Chat - Interaction")).toBeInTheDocument();
    expect(within(group).getByText("53")).toBeInTheDocument();
    expect(within(group).getByText("GNG【form visit】contact-us")).toBeInTheDocument();
    expect(within(group).getByText("10")).toBeInTheDocument();
  });

  it("does not list selected primary actions in the secondary group", () => {
    renderDashboard();
    openConversionDropdown();

    const group = secondaryGroup();
    expect(within(group).queryByText("GTM - P1 Forms")).toBeNull();
    expect(within(group).queryByText("Chat - Email Shared")).toBeNull();
  });

  it("starts with every secondary action ticked", () => {
    renderDashboard();
    openConversionDropdown();

    const boxes = within(secondaryGroup()).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(4);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("removes an action from the KPI bar when it is unticked", () => {
    renderDashboard();
    const bar = screen.getByTestId("conversion-breakdown-bar");
    expect(within(bar).getByText("Secondary Conv (4)")).toBeInTheDocument();
    expect(within(bar).getByText("Chat - Quick Reply Click")).toBeInTheDocument();

    openConversionDropdown();
    const row = within(secondaryGroup()).getByTitle("Chat - Quick Reply Click");
    fireEvent.click(within(row).getByRole("checkbox"));

    expect(within(bar).getByText("Secondary Conv (3)")).toBeInTheDocument();
    expect(within(bar).queryByText("Chat - Quick Reply Click")).toBeNull();
    // The action stays listed so the choice can be reversed.
    expect(within(secondaryGroup()).getByTitle("Chat - Quick Reply Click")).toBeInTheDocument();
  });

  it("hides and restores the whole group via None / All", () => {
    renderDashboard();
    openConversionDropdown();

    fireEvent.click(within(secondaryGroup()).getByRole("button", { name: "None" }));
    expect(screen.queryByText(/Secondary Conv \(/)).toBeNull();

    fireEvent.click(within(secondaryGroup()).getByRole("button", { name: "All" }));
    const bar = screen.getByTestId("conversion-breakdown-bar");
    expect(within(bar).getByText("Secondary Conv (4)")).toBeInTheDocument();
  });

  it("does not refetch when a secondary action is toggled", () => {
    renderDashboard();
    const callsAfterMount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    openConversionDropdown();
    const row = within(secondaryGroup()).getByTitle("Chat - Interaction");
    fireEvent.click(within(row).getByRole("checkbox"));

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
  });
});

describe("GoogleAdsDashboard saved secondary conversion defaults", () => {
  it("applies the saved hidden actions on first render", () => {
    renderDashboard({ hidden: "Chat - Quick Reply Click\nChat - Conversation Started" });

    const bar = screen.getByTestId("conversion-breakdown-bar");
    expect(within(bar).getByText("Secondary Conv (2)")).toBeInTheDocument();
    expect(within(bar).queryByText("Chat - Quick Reply Click")).toBeNull();

    // Saved actions stay listed and unticked so the choice is reversible.
    openConversionDropdown();
    const row = within(secondaryGroup()).getByTitle("Chat - Quick Reply Click");
    expect((within(row).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("tolerates blank lines and padding in the saved value", () => {
    renderDashboard({ hidden: "\n  Chat - Interaction  \n\n" });

    const bar = screen.getByTestId("conversion-breakdown-bar");
    expect(within(bar).getByText("Secondary Conv (3)")).toBeInTheDocument();
    expect(within(bar).queryByText("Chat - Interaction")).toBeNull();
  });

  it("persists the current selection when Save as default is pressed", async () => {
    renderDashboard({ clientId: "42" });
    openConversionDropdown();

    // Nothing changed yet, so there is nothing to save.
    expect(within(secondaryGroup()).getByRole("button", { name: "Saved" })).toBeDisabled();

    const row = within(secondaryGroup()).getByTitle("Chat - Quick Reply Click");
    fireEvent.click(within(row).getByRole("checkbox"));

    const save = within(secondaryGroup()).getByRole("button", { name: "Save as default" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
      String(url).includes("/api/dashboard/conversion-action-defaults"),
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1].body))).toEqual({
      clientId: "42",
      slug: "away-digital",
      hiddenSecondaryActions: ["Chat - Quick Reply Click"],
    });

    // Once saved, the button settles back to a disabled "Saved" state.
    expect(
      await within(secondaryGroup()).findByRole("button", { name: "Saved" }),
    ).toBeDisabled();
  });

  it("omits the save control when no clientId is available", () => {
    renderDashboard();
    openConversionDropdown();
    expect(within(secondaryGroup()).queryByRole("button", { name: /Save as default|Saved/ })).toBeNull();
  });
});

/** The selector panel section holding the primary conversion checkboxes. */
function primaryGroup(): HTMLElement {
  return screen.getByTestId("primary-conversion-group");
}

function saveCallBody() {
  const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
    String(url).includes("/api/dashboard/conversion-action-defaults"),
  );
  return call ? JSON.parse(String(call[1].body)) : null;
}

describe("GoogleAdsDashboard primary conversion defaults", () => {
  it("persists the primary selection when Save as default is pressed", async () => {
    renderDashboard({ clientId: "42" });
    openConversionDropdown();

    const header = within(primaryGroup());
    expect(header.getByRole("button", { name: "Saved" })).toBeDisabled();

    fireEvent.click(within(primaryGroup()).getByTitle("Chat - Interaction").querySelector("input")!);

    const save = within(primaryGroup()).getByRole("button", { name: "Save as default" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(saveCallBody()).toEqual({
      clientId: "42",
      slug: "away-digital",
      selectedActions: ["Chat - Email Shared", "GTM - P1 Forms", "Chat - Interaction"],
    });

    expect(
      await within(primaryGroup()).findByRole("button", { name: "Saved" }),
    ).toBeDisabled();
  });

  it("treats a reordered selection as unchanged", () => {
    renderDashboard({ clientId: "42" });
    openConversionDropdown();

    // Untick then re-tick: same set, different order. Nothing to save.
    const box = within(primaryGroup()).getByTitle("Chat - Email Shared").querySelector("input")!;
    fireEvent.click(box);
    fireEvent.click(box);

    expect(within(primaryGroup()).getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("moves the Default badge onto the newly saved selection", async () => {
    // The badge renders uppercase via CSS, so match its title rather than its
    // text — which would also collide with the "Default" restore button.
    const badges = () =>
      primaryGroup().querySelectorAll('[title="Saved as a default for this client"]');

    renderDashboard({ clientId: "42" });
    openConversionDropdown();

    // "Chat - Interaction" starts as a non-default, secondary-only action.
    expect(badges()).toHaveLength(2);

    fireEvent.click(within(primaryGroup()).getByTitle("Chat - Interaction").querySelector("input")!);
    fireEvent.click(within(primaryGroup()).getByRole("button", { name: "Save as default" }));

    await within(primaryGroup()).findByRole("button", { name: "Saved" });
    expect(badges()).toHaveLength(3);
  });

  it("only sends the group that changed", () => {
    renderDashboard({ clientId: "42" });
    openConversionDropdown();

    const row = within(secondaryGroup()).getByTitle("Chat - Quick Reply Click");
    fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(within(secondaryGroup()).getByRole("button", { name: "Save as default" }));

    // Saving secondary must not rewrite the primary selection.
    const body = saveCallBody();
    expect(body).toHaveProperty("hiddenSecondaryActions");
    expect(body).not.toHaveProperty("selectedActions");
  });

  it("omits the primary save control when no clientId is available", () => {
    renderDashboard();
    openConversionDropdown();
    expect(
      within(primaryGroup()).queryByRole("button", { name: /Save as default|Saved/ }),
    ).toBeNull();
  });
});
