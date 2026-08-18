import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardPinEntry } from "@/components/dashboards/shared/DashboardPinEntry";

/**
 * The PIN gate must tell the verify endpoint *which client* is being unlocked.
 *
 * `/api/dashboard/verify` looks the client up by slug and rejects a body
 * without one with a 400 — which the gate renders as "Something went wrong",
 * so a correct PIN looks like a broken dashboard rather than a wrong code.
 * This test exists because the shared gate shipped posting `{ pin }` alone,
 * which made the landing dashboard unopenable with any PIN.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Audio feedback is irrelevant here and unavailable in jsdom.
vi.mock("@/components/usePinDigitClick", () => ({ usePinDigitClick: () => () => {} }));
vi.mock("@/components/PinGateLogo", () => ({ default: () => null }));

afterEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
});

function okFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Type one digit per box; the fourth submits. */
function typePin(pin: string) {
  pin.split("").forEach((digit, index) => {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1}`), { target: { value: digit } });
  });
}

describe("DashboardPinEntry", () => {
  it("sends the client slug alongside the PIN", async () => {
    const fetchMock = okFetch();

    render(<DashboardPinEntry slug="away-digital" redirectTo="/landing-dashboard/away-digital" />);
    typePin("1234");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ pin: "1234", slug: "away-digital" });
  });

  it("sends the slug when the PIN is pasted rather than typed", async () => {
    const fetchMock = okFetch();

    render(<DashboardPinEntry slug="away-digital" redirectTo="/landing-dashboard/away-digital" />);
    fireEvent.paste(screen.getByLabelText("Digit 1"), {
      clipboardData: { getData: () => "4321" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      pin: "4321",
      slug: "away-digital",
    });
  });

  it("sends the session cookie so the token set by verify is kept", async () => {
    const fetchMock = okFetch();

    render(<DashboardPinEntry slug="away-digital" redirectTo="/landing-dashboard/away-digital" />);
    typePin("1234");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("shows the endpoint's message when the PIN is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid access code." }),
      }),
    );

    render(<DashboardPinEntry slug="away-digital" redirectTo="/landing-dashboard/away-digital" />);
    typePin("0000");

    expect(await screen.findByText("Invalid access code.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
