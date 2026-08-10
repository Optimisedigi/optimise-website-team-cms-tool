import { describe, expect, it } from "vitest";
import {
  cleanActionNames,
  syncCategories,
} from "@/app/(frontend)/api/dashboard/conversion-action-defaults/route";

describe("cleanActionNames", () => {
  it("trims, drops blanks, and dedupes while preserving order", () => {
    expect(cleanActionNames(["  B  ", "A", "", "   ", "B", "A"])).toEqual(["B", "A"]);
  });

  it("ignores non-string entries", () => {
    expect(cleanActionNames(["A", 7, null, undefined, {}, "B"])).toEqual(["A", "B"]);
  });

  it("keeps casing so names still match Google Ads exactly", () => {
    expect(cleanActionNames(["chat - email shared", "Chat - Email Shared"])).toEqual([
      "chat - email shared",
      "Chat - Email Shared",
    ]);
  });
});

describe("syncCategories", () => {
  const existing = [
    { label: "Form Submit", color: "violet", actions: "GTM - P1 Forms" },
    { label: "Chat", color: "emerald", actions: "Chat - Email Shared" },
  ];

  it("preserves the label and colour already configured for an action", () => {
    expect(syncCategories(["GTM - P1 Forms"], existing)).toEqual([
      { label: "Form Submit", color: "violet", actions: "GTM - P1 Forms" },
    ]);
  });

  it("defaults a brand-new action to its own name in sky", () => {
    expect(syncCategories(["Chat - Interaction"], existing)).toEqual([
      { label: "Chat - Interaction", color: "sky", actions: "Chat - Interaction" },
    ]);
  });

  it("emits one row per selected action, in selection order", () => {
    const rows = syncCategories(["Chat - Email Shared", "GTM - P1 Forms"], existing);
    expect(rows.map((r) => r.actions)).toEqual(["Chat - Email Shared", "GTM - P1 Forms"]);
    expect(rows.map((r) => r.label)).toEqual(["Chat", "Form Submit"]);
  });

  it("drops rows for actions that are no longer selected", () => {
    expect(syncCategories(["GTM - P1 Forms"], existing)).toHaveLength(1);
  });

  it("reads every action out of a multi-line category row", () => {
    const grouped = [{ label: "Chat", color: "rose", actions: "Chat - A\nChat - B" }];
    expect(syncCategories(["Chat - B"], grouped)).toEqual([
      { label: "Chat", color: "rose", actions: "Chat - B" },
    ]);
  });

  it("falls back to the action name when a stored label is blank", () => {
    const blank = [{ label: "   ", color: "amber", actions: "GTM - P1 Forms" }];
    expect(syncCategories(["GTM - P1 Forms"], blank)).toEqual([
      { label: "GTM - P1 Forms", color: "amber", actions: "GTM - P1 Forms" },
    ]);
  });

  it("tolerates a missing or malformed existing value", () => {
    for (const bad of [undefined, null, "nope", [null], [{ label: 1, actions: 2 }]]) {
      expect(syncCategories(["A"], bad)).toEqual([
        { label: "A", color: "sky", actions: "A" },
      ]);
    }
  });

  it("returns nothing when the selection is cleared", () => {
    expect(syncCategories([], existing)).toEqual([]);
  });
});
