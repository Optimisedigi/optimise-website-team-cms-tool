import { describe, it, expect } from "vitest";
import { Clients } from "@/collections/Clients";

// ─── Helpers ────────────────────────────────────────────────────────────────
// Walk into layout wrappers to find a field by name inside a flat array.
// Mirrors the resolver Payload uses when persisting form data.
function findFieldInArray(fields: any[], name: string): any {
  for (const f of fields ?? []) {
    if ("name" in f && f.name === name) return f;
    if ((f.type === "row" || f.type === "collapsible") && Array.isArray(f.fields)) {
      const inner = findFieldInArray(f.fields, name);
      if (inner) return inner;
    }
    if (f.type === "tabs" && Array.isArray(f.tabs)) {
      for (const tab of f.tabs) {
        const inner = findFieldInArray(tab.fields, name);
        if (inner) return inner;
      }
    }
  }
  return undefined;
}

// Locate the "Google Ads" tab inside the outer tabs block in Clients.fields.
function findGoogleAdsTab(): { fields: any[] } | undefined {
  for (const f of (Clients.fields ?? []) as any[]) {
    if (f.type === "tabs" && Array.isArray(f.tabs)) {
      for (const t of f.tabs) {
        if (t.label === "Google Ads") return t;
      }
    }
  }
  return undefined;
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("Clients — Account Health Contract fields", () => {
  const googleAdsTab = findGoogleAdsTab();

  it("has a Google Ads tab", () => {
    expect(googleAdsTab).toBeDefined();
    expect(Array.isArray(googleAdsTab!.fields)).toBe(true);
  });

  // ── spendPolicy group ────────────────────────────────────────────────────
  describe("spendPolicy group", () => {
    const spendPolicy = googleAdsTab
      ? findFieldInArray(googleAdsTab.fields, "spendPolicy")
      : undefined;

    it("is a group field with a description", () => {
      expect(spendPolicy).toBeDefined();
      expect(spendPolicy.type).toBe("group");
      expect(Array.isArray(spendPolicy.fields)).toBe(true);
    });

    it("has pacingMode select with all 4 pacing-mode options", () => {
      const f = findFieldInArray(spendPolicy.fields, "pacingMode");
      expect(f).toBeDefined();
      expect(f.type).toBe("select");
      const values = (f.options as Array<{ value: string }>)
        .map((o) => o.value)
        .sort();
      expect(values).toEqual(
        ["fixed_monthly", "performance_cap", "roas_target", "seasonal"].sort(),
      );
    });

    it("has pacingWindow select defaulting to calendar_month", () => {
      const f = findFieldInArray(spendPolicy.fields, "pacingWindow");
      expect(f).toBeDefined();
      expect(f.type).toBe("select");
      expect(f.defaultValue).toBe("calendar_month");
      const values = (f.options as Array<{ value: string }>).map((o) => o.value);
      expect(values).toContain("calendar_month");
    });

    it("has monthlyBudgetTarget as a number field", () => {
      const f = findFieldInArray(spendPolicy.fields, "monthlyBudgetTarget");
      expect(f).toBeDefined();
      expect(f.type).toBe("number");
    });

    it("has acceptableVariancePercentLow defaulting to 90", () => {
      const f = findFieldInArray(
        spendPolicy.fields,
        "acceptableVariancePercentLow",
      );
      expect(f).toBeDefined();
      expect(f.type).toBe("number");
      expect(f.defaultValue).toBe(90);
    });

    it("has acceptableVariancePercentHigh defaulting to 105", () => {
      const f = findFieldInArray(
        spendPolicy.fields,
        "acceptableVariancePercentHigh",
      );
      expect(f).toBeDefined();
      expect(f.type).toBe("number");
      expect(f.defaultValue).toBe(105);
    });

    it("has hardFloor as a number field", () => {
      const f = findFieldInArray(spendPolicy.fields, "hardFloor");
      expect(f).toBeDefined();
      expect(f.type).toBe("number");
    });

    it("has hardCeiling as a number field", () => {
      const f = findFieldInArray(spendPolicy.fields, "hardCeiling");
      expect(f).toBeDefined();
      expect(f.type).toBe("number");
    });
  });

  // ── protectedCampaignIds array ───────────────────────────────────────────
  describe("protectedCampaignIds array", () => {
    const field = googleAdsTab
      ? findFieldInArray(googleAdsTab.fields, "protectedCampaignIds")
      : undefined;

    it("is an array field", () => {
      expect(field).toBeDefined();
      expect(field.type).toBe("array");
    });

    it("has a required campaignId text subfield", () => {
      const sub = findFieldInArray(field.fields, "campaignId");
      expect(sub).toBeDefined();
      expect(sub.type).toBe("text");
      expect(sub.required).toBe(true);
    });
  });

  // ── brandCampaignIds array ───────────────────────────────────────────────
  describe("brandCampaignIds array", () => {
    const field = googleAdsTab
      ? findFieldInArray(googleAdsTab.fields, "brandCampaignIds")
      : undefined;

    it("is an array field", () => {
      expect(field).toBeDefined();
      expect(field.type).toBe("array");
    });

    it("has a required campaignId text subfield", () => {
      const sub = findFieldInArray(field.fields, "campaignId");
      expect(sub).toBeDefined();
      expect(sub.type).toBe("text");
      expect(sub.required).toBe(true);
    });
  });
});
