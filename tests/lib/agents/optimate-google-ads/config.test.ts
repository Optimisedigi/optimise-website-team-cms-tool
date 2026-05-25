import { describe, expect, it } from "vitest";
import { conversionActionsForClient } from "@/lib/agents/optimate-google-ads/config";

describe("conversionActionsForClient", () => {
  it("includes dashboard conversion actions used by the Google Ads dashboard and budget tools", () => {
    const actions = conversionActionsForClient({
      id: 4,
      name: "Malcolm Thompson Pumps",
      dashboardConversionActions: "Form Submission\nPhone Click\nEmail Click\nGet Directions",
      conversionActionCategories: [],
      phoneCallConversionActions: null,
      formSubmitConversionActions: null,
    });

    expect(actions).toBe("Form Submission,Phone Click,Email Click,Get Directions");
  });

  it("deduplicates dashboard, category, and legacy actions while preserving category-first order", () => {
    const actions = conversionActionsForClient({
      dashboardConversionActions: "Lead Form\nPhone Click",
      conversionActionCategories: [
        { label: "Calls", actions: "Phone Click\nQualified Call" },
      ],
      phoneCallConversionActions: "Qualified Call",
      formSubmitConversionActions: "Email Click",
    });

    expect(actions).toBe("Phone Click,Qualified Call,Lead Form,Email Click");
  });
});
