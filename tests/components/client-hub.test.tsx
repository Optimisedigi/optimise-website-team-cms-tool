import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ClientHubClient } from "@/app/(frontend)/client/[slug]/hub/ClientHubClient";

describe("ClientHubClient", () => {
  it("loads the hub and submits a client request", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/client-hub/acme?") && !init) {
        return Response.json({ ok: true, hub: { client: { name: "Acme" }, links: [], requests: [], valueLedger: { items: [], summary: { totalItems: 0 } }, forecastScenarios: [], organicGrowthSnapshots: [] } });
      }
      if (url === "/api/client-hub/acme/requests" && init?.method === "POST") {
        return Response.json({ ok: true, request: { id: 1 } }, { status: 201 });
      }
      return Response.json({ ok: true, hub: { client: { name: "Acme" }, links: [], requests: [{ id: 1, title: "Fix hero", description: "Please update" }], valueLedger: { items: [], summary: { totalItems: 0 } }, forecastScenarios: [], organicGrowthSnapshots: [] } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientHubClient slug="acme" />);
    fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Digit 2"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Digit 3"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Digit 4"), { target: { value: "4" } });

    expect(await screen.findByText("Acme")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("What do you need help with?"), { target: { value: "Fix hero" } });
    fireEvent.change(screen.getByPlaceholderText("Add the page URL, campaign, example, or context."), { target: { value: "Please update" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByText("Request submitted. We’ll review it shortly.")).toBeInTheDocument();
  });
});
