import { describe, it, expect } from "vitest";
import { GoogleAdsSnapshots } from "@/collections/GoogleAdsSnapshots";

// ─── Helpers ───────────────────────────────────────────────────
function findField(fields: any[], name: string): any {
  for (const f of fields) {
    if ("name" in f && f.name === name) return f;
    if ("tabs" in f) {
      for (const tab of f.tabs) {
        const found = findField(tab.fields, name);
        if (found) return found;
      }
    }
    if ("fields" in f && (f.type === "row" || f.type === "collapsible")) {
      const found = findField(f.fields, name);
      if (found) return found;
    }
  }
  return undefined;
}

// ─── Field Structure Tests ─────────────────────────────────────
describe("GoogleAdsSnapshots Collection", () => {
  it("has the correct slug", () => {
    expect(GoogleAdsSnapshots.slug).toBe("google-ads-snapshots");
  });

  it("has singular/plural labels", () => {
    expect(GoogleAdsSnapshots.labels).toBeDefined();
    expect((GoogleAdsSnapshots.labels as any).singular).toBe("Google Ads Snapshot");
    expect((GoogleAdsSnapshots.labels as any).plural).toBe("Google Ads Snapshots");
  });

  it("is hidden from the admin sidebar", () => {
    expect(GoogleAdsSnapshots.admin?.hidden).toBe(true);
  });

  // ─── Access ───────────────────────────────────────────────
  describe("access", () => {
    it("allows read for any logged-in user, denies anon", () => {
      const access = GoogleAdsSnapshots.access?.read as Function;
      expect(access({ req: { user: { id: 1, role: "manager" } } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows create for any logged-in user, denies anon", () => {
      const access = GoogleAdsSnapshots.access?.create as Function;
      expect(access({ req: { user: { id: 1, role: "manager" } } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows update for any logged-in user, denies anon", () => {
      const access = GoogleAdsSnapshots.access?.update as Function;
      expect(access({ req: { user: { id: 1, role: "manager" } } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows delete only for admin", () => {
      const access = GoogleAdsSnapshots.access?.delete as Function;
      expect(access({ req: { user: { id: 1, role: "admin" } } })).toBe(true);
      expect(access({ req: { user: { id: 2, role: "manager" } } })).toBe(false);
      expect(access({ req: { user: null } })).toBe(false);
    });
  });

  // ─── Required fields ──────────────────────────────────────
  describe("fields", () => {
    it("client is a relationship to clients (required)", () => {
      const field = findField(GoogleAdsSnapshots.fields ?? [], "client");
      expect(field).toBeDefined();
      expect(field.type).toBe("relationship");
      expect(field.relationTo).toBe("clients");
      expect(field.required).toBe(true);
    });

    it("level is a select with exactly the four enum values", () => {
      const field = findField(GoogleAdsSnapshots.fields ?? [], "level");
      expect(field).toBeDefined();
      expect(field.type).toBe("select");
      expect(field.required).toBe(true);

      const values = field.options.map((o: any) => o.value).sort();
      expect(values).toEqual(["ad_group", "campaign", "keyword", "search_term"]);
    });

    it("capturedAt is a date and required", () => {
      const field = findField(GoogleAdsSnapshots.fields ?? [], "capturedAt");
      expect(field).toBeDefined();
      expect(field.type).toBe("date");
      expect(field.required).toBe(true);
    });

    it("customerId is text and required", () => {
      const field = findField(GoogleAdsSnapshots.fields ?? [], "customerId");
      expect(field).toBeDefined();
      expect(field.type).toBe("text");
      expect(field.required).toBe(true);
    });

    it("rows is a json field", () => {
      const field = findField(GoogleAdsSnapshots.fields ?? [], "rows");
      expect(field).toBeDefined();
      expect(field.type).toBe("json");
    });

    it("rowCount is a number field", () => {
      const field = findField(GoogleAdsSnapshots.fields ?? [], "rowCount");
      expect(field).toBeDefined();
      expect(field.type).toBe("number");
    });

    it("optional metadata fields exist (dateRangeLabel, sourceEndpoint, fetchDurationMs, error)", () => {
      expect(findField(GoogleAdsSnapshots.fields ?? [], "dateRangeLabel")?.type).toBe("text");
      expect(findField(GoogleAdsSnapshots.fields ?? [], "sourceEndpoint")?.type).toBe("text");
      expect(findField(GoogleAdsSnapshots.fields ?? [], "fetchDurationMs")?.type).toBe("number");
      expect(findField(GoogleAdsSnapshots.fields ?? [], "error")?.type).toBe("text");
    });
  });
});
