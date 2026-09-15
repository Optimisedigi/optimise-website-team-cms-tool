import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.fn();
const validate = vi.fn();
const getCookie = vi.fn();
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });

vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "space-font" }),
  JetBrains_Mono: () => ({ variable: "mono-font" }),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie }) }));
vi.mock("payload", () => ({ getPayload: async () => ({ find }) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({ validateDashboardToken: validate }));
vi.mock("@/components/dashboards/shared/DashboardPinEntry", () => ({ DashboardPinEntry: ({ slug, redirectTo }: { slug: string; redirectTo: string }) => <div data-testid="pin" data-slug={slug} data-redirect={redirectTo} /> }));
vi.mock("@/components/PinGateFrame", () => ({ PinGateFrame: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/dashboards/landing/ChatbotFlowView", () => ({ ChatbotFlowView: () => <div>Flow canvas</div> }));

const Page = (await import("@/app/(frontend)/landing-dashboard/[slug]/chatbot-flow/page")).default;
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("Away chatbot flow page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    find.mockResolvedValue({ docs: [{ name: "Away Digital Teams", slug: "away-digital-teams" }] });
    getCookie.mockReturnValue({ value: "token" });
  });

  it("rejects aliases before database access or token validation", async () => {
    await expect(Page(params("away-digital"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(find).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical client record is unavailable", async () => {
    find.mockResolvedValue({ docs: [] });
    await expect(Page(params("away-digital-teams"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(validate).not.toHaveBeenCalled();
  });

  it("shows the existing PIN gate with a canonical redirect when unauthorized", async () => {
    validate.mockReturnValue(false);
    render(await Page(params("away-digital-teams")));
    const pin = screen.getByTestId("pin");
    expect(pin).toHaveAttribute("data-slug", "away-digital-teams");
    expect(pin).toHaveAttribute("data-redirect", "/landing-dashboard/away-digital-teams/chatbot-flow");
    expect(validate).toHaveBeenCalledWith("token", "away-digital-teams");
  });

  it("renders the read-only flow after canonical token validation", async () => {
    validate.mockReturnValue(true);
    render(await Page(params("away-digital-teams")));
    expect(screen.getByRole("heading", { name: "Chatbot conversation flow" })).toBeInTheDocument();
    expect(screen.getByText("Flow canvas")).toBeInTheDocument();
  });
});
