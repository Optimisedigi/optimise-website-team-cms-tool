import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatbotFlowView } from "@/components/dashboards/landing/ChatbotFlowView";

describe("ChatbotFlowView", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the six paths with an accessible default overview", () => {
    render(<ChatbotFlowView />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleDescription(/Entry routes/);
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
  });

  it("switches paths by click and tab-list keyboard navigation", () => {
    render(<ChatbotFlowView />);
    const overview = screen.getByRole("tab", { name: "Overview" });
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Ready to hire" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Role needed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Recovery" }));
    expect(screen.getByRole("heading", { name: "Unexpected input" })).toBeInTheDocument();
  });

  it("exposes labelled controls and proves keyboard canvas transforms", () => {
    render(<ChatbotFlowView />);
    const controls = screen.getByLabelText("Canvas controls");
    expect(within(controls).getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: "Fit all" })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: "Home" })).toBeInTheDocument();
    const canvas = screen.getByRole("tabpanel");
    const scene = screen.getByTestId("flow-scene");
    expect(canvas).toHaveAttribute("tabindex", "0");
    const initialTransform = scene.style.transform;
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(scene.style.transform).not.toBe(initialTransform);
    const pannedTransform = scene.style.transform;
    fireEvent.keyDown(canvas, { key: "+" });
    expect(scene.style.transform).not.toBe(pannedTransform);
    fireEvent.keyDown(canvas, { key: "Home" });
    expect(scene).toHaveStyle({ transform: "translate(48px, 48px) scale(1)" });
  });

  it("announces each branch with its source, destination, and condition", () => {
    render(<ChatbotFlowView />);
    const routes = screen.getByRole("list", { name: "Routes for Overview" });
    expect(within(routes).getByText("Welcome to Ready to hire when I’m ready to hire")).toBeInTheDocument();
    expect(within(routes).getByText("Ready to hire to Persistent secondary actions")).toBeInTheDocument();
    expect(screen.getByText("I’m ready to hire", { selector: "span" })).toHaveAttribute("aria-hidden", "true");
  });

  it("frames a 320px canvas at the readable compact scale without hiding controls", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
    render(<ChatbotFlowView />);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Fit all" })).toBeVisible();
    const compactTransform = screen.getByTestId("flow-scene").style.transform;
    expect(compactTransform).toContain("translate(16px,");
    expect(compactTransform).toContain("scale(0.72)");
  });
});
