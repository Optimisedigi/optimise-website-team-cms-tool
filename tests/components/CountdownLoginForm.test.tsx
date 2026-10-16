import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockSetUser = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockPrefetch = vi.fn();
const mockStartRouteTransition = vi.fn((cb: () => void) => cb());

vi.mock("@payloadcms/ui", () => ({
  useAuth: () => ({ setUser: mockSetUser }),
  useRouteTransition: () => ({ startRouteTransition: mockStartRouteTransition }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mockPrefetch, push: mockPush, replace: mockReplace }),
}));

import { CountdownLoginForm } from "@/components/login/CountdownLoginForm";

const FAST = { countStepMs: 1, launchMs: 1, reducedLaunchMs: 1 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function renderForm() {
  render(
    <CountdownLoginForm
      forgotPasswordUrl="/admin/forgot"
      loginUrl="/api/users/login"
      redirectTo="/admin/mail"
      timings={FAST}
    />,
  );
}

function fillAndLaunch(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Launch" }));
}

describe("CountdownLoginForm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    mockSetUser.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockPrefetch.mockReset();
    mockStartRouteTransition.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Countdown design with the forgot-password link", () => {
    renderForm();

    expect(screen.getByRole("heading", { name: "Ready for launch?" })).toBeInTheDocument();
    expect(screen.getByAltText("Optimise Digital")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/admin/forgot",
    );
    expect(screen.queryByText("Content CMS")).not.toBeInTheDocument();
  });

  it("logs in via Payload's REST endpoint, then goes straight to the redirect without the route-transition overlay", async () => {
    const payload = {
      exp: 1_800_000_000,
      token: "jwt",
      user: { collection: "users", email: "pe@example.com", id: 7 },
    };
    fetchMock.mockResolvedValue(jsonResponse(200, payload));
    renderForm();

    fillAndLaunch("pe@example.com", "hunter22");

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/admin/mail"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/login",
      expect.objectContaining({
        body: JSON.stringify({ email: "pe@example.com", password: "hunter22" }),
        credentials: "include",
        method: "POST",
      }),
    );
    expect(mockSetUser).toHaveBeenCalledWith(payload);
    // The route-transition overlay (RocketLoader) would flash before the dashboard loader.
    expect(mockStartRouteTransition).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Signed in" })).toBeInTheDocument();
  });

  it("shows the server's error and returns to the idle form when credentials are rejected", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        errors: [{ message: "The email or password provided is incorrect." }],
      }),
    );
    renderForm();

    fillAndLaunch("pe@example.com", "wrong");

    expect(
      await screen.findByText("The email or password provided is incorrect."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch" })).toBeEnabled();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("asks for missing details without calling the login endpoint", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Launch" }));

    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
