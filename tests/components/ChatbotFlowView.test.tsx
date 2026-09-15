import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatbotFlowView } from "@/components/dashboards/landing/ChatbotFlowView";

describe("ChatbotFlowView", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders five paths without job-seeker content and shows real opening answers", () => {
    render(<ChatbotFlowView />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /job seeker/i })).not.toBeInTheDocument();
    expect(screen.getByText("What would you like help with today?")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Answer choices for Opening message" })).toHaveTextContent("I’m ready to hire");
  });

  it("opens one complete branch at a time from each overview decision", () => {
    render(<ChatbotFlowView />);
    const openBranch = (buttonName: string, selectedTab: string, question: string) => {
      const branchButton = screen.getByRole("button", { name: buttonName });
      fireEvent.pointerDown(branchButton, { button: 0, pointerId: 1 });
      fireEvent.click(branchButton);
      const selected = screen.getAllByRole("tab").filter((tab) => tab.getAttribute("aria-selected") === "true");
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveAccessibleName(selectedTab);
      expect(screen.getByText(question)).toBeInTheDocument();
    };

    openBranch("Open Ready to hire full branch", "Ready to hire", "What kind of role are you looking to hire?");
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    openBranch("Open Assess readiness full branch", "Readiness check", "Do you have a clearly defined role and a repeatable onboarding plan?");
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    openBranch("Open Researching full branch", "Research", "What would you like to understand about building an offshore team?");
  });

  it("supports tab-list and canvas keyboard navigation", () => {
    render(<ChatbotFlowView />);
    const overview = screen.getByRole("tab", { name: "Overview" });
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Ready to hire" })).toHaveAttribute("aria-selected", "true");

    const canvas = screen.getByRole("tabpanel");
    const scene = screen.getByTestId("flow-scene");
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
    expect(within(routes).getByText("Opening message to Ready to hire when I’m ready to hire")).toBeInTheDocument();
    expect(within(routes).getByText("Ready to hire to Available throughout")).toBeInTheDocument();
    expect(screen.getByText("I’m ready to hire", { selector: "span" })).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the readable compact scale at 320px without hiding controls", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(620);
    render(<ChatbotFlowView />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Fit all" })).toBeVisible();
    const compactTransform = screen.getByTestId("flow-scene").style.transform;
    expect(compactTransform).toContain("translate(16px,");
    expect(compactTransform).toContain("scale(0.72)");
  });
});
