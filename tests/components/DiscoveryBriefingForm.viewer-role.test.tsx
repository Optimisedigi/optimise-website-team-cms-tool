/**
 * Verifies the `viewerRole` prop on `DiscoveryBriefingForm`:
 *
 * - `"admin"` (default): Hide section checkboxes render, hidden sections
 *   still appear as a collapsed header with a "Hidden" pill.
 * - `"client"`: Hide checkboxes are absent, the "Hidden" pill is absent, and
 *   hidden sections are not rendered at all (no collapsed header, no
 *   placeholder).
 *
 * `fetch` is stubbed to a no-op that returns the form's empty initial state
 * so the component's hydrate + autosave effects don't blow up under jsdom.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiscoveryBriefingForm } from "@/components/discovery-briefing/DiscoveryBriefingForm";
import {
  defaultDiscoveryBriefingState,
  type DiscoveryBriefingState,
} from "@/lib/discovery-briefing/types";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: null,
            data: defaultDiscoveryBriefingState(),
            markdown: null,
            parentSlug: null,
            briefingIdPadded: "000",
            requirePin: false,
            parentPin: "",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ),
  );
}

/** Build an initial state with the given section ids marked as hidden. */
function withHidden(...ids: string[]): DiscoveryBriefingState {
  const state = defaultDiscoveryBriefingState();
  state.hiddenSections = ids;
  return state;
}

describe("DiscoveryBriefingForm — viewerRole", () => {
  beforeEach(() => {
    stubFetch();
  });

  it("admin viewer: shows Hide section checkboxes", () => {
    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={defaultDiscoveryBriefingState()}
        viewerRole="admin"
      />,
    );
    const hideLabels = screen.getAllByText(/^Hide section$/i);
    // 18 stable section ids in DISCOVERY_BRIEFING_SECTIONS — at least one
    // Hide section toggle per visible section.
    expect(hideLabels.length).toBeGreaterThan(0);
  });

  it("client viewer: hides the Hide section checkboxes", () => {
    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={defaultDiscoveryBriefingState()}
        viewerRole="client"
      />,
    );
    expect(screen.queryAllByText(/^Hide section$/i)).toHaveLength(0);
  });

  it("admin viewer: shows markdown export buttons", () => {
    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={defaultDiscoveryBriefingState()}
        viewerRole="admin"
      />,
    );
    expect(screen.getAllByRole("button", { name: /Download \/ Copy Markdown/i })).toHaveLength(2);
  });

  it("client viewer: can export markdown without calling the authenticated CMS save API", async () => {
    const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
    vi.stubGlobal("navigator", { clipboard });
    const fetchMock = vi.mocked(fetch);
    const initial = defaultDiscoveryBriefingState();
    initial.businessName = "Acme";

    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={initial}
        viewerRole="client"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Download \/ Copy Markdown/i })[0]);

    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("**Business:** Acme"));
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("admin viewer: keeps hidden section as a collapsed header with the 'Hidden' pill", () => {
    const initial = withHidden("businessOverview");
    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={initial}
        viewerRole="admin"
      />,
    );
    // Title still renders so the team can re-enable in place.
    expect(screen.getByText(/Business Overview/i)).toBeTruthy();
    // The subtitle pill swaps to the "Hidden" badge for admins.
    expect(screen.getAllByText(/^Hidden$/).length).toBeGreaterThan(0);
  });

  it("client viewer: hidden sections are not rendered at all", () => {
    const initial = withHidden("businessOverview");
    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={initial}
        viewerRole="client"
      />,
    );
    // No section title, no "Hidden" placeholder \u2014 the entire section is dropped.
    expect(screen.queryByText(/Business Overview/i)).toBeNull();
    expect(screen.queryByText(/^Hidden$/)).toBeNull();
  });

  it("defaults to admin viewer when the prop is omitted", () => {
    render(
      <DiscoveryBriefingForm
        scope="client"
        scopeId={1}
        scopeLabel="Acme"
        initialState={defaultDiscoveryBriefingState()}
      />,
    );
    expect(screen.getAllByText(/^Hide section$/i).length).toBeGreaterThan(0);
  });
});
