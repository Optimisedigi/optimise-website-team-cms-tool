import { describe, it, expect, vi } from "vitest";
import KeywordDeepDiveSessions from "@/collections/KeywordDeepDiveSessions";

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/collections/api-key-access", () => ({
  hasValidApiKey: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access")>();
  return {
    ...actual,
    // Keep real FEATURE_KEYS and hideUnlessFeature; mock userHasFeature for targeted tests
    userHasFeature: vi.fn().mockImplementation((user: any, slug: string) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      const features = user.featureAccess ?? [];
      return features.includes(slug);
    }),
  };
});

import { userHasFeature } from "@/lib/access";

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
describe("KeywordDeepDiveSessions Collection", () => {
  it("should have correct slug", () => {
    expect(KeywordDeepDiveSessions.slug).toBe("keyword-deep-dive-sessions");
  });

  it("should hide from the sidebar via a function (not the boolean form, which would block edit routes)", () => {
    expect(typeof KeywordDeepDiveSessions.admin?.hidden).toBe("function");
  });

  it("should have client relationship field", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "client");
    expect(field).toBeDefined();
    expect(field.type).toBe("relationship");
    expect(field.relationTo).toBe("clients");
  });

  it("should have googleAdsAudit relationship field", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "googleAdsAudit");
    expect(field).toBeDefined();
    expect(field.type).toBe("relationship");
    expect(field.relationTo).toBe("google-ads-audits");
  });

  it("should have title text field", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "title");
    expect(field).toBeDefined();
    expect(field.type).toBe("text");
  });

  it("should have keywords array field", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "keywords");
    expect(field).toBeDefined();
    expect(field.type).toBe("array");
  });

  it("should have status select field with correct options", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "status");
    expect(field).toBeDefined();
    expect(field.type).toBe("select");
    expect(field.options.map((o: any) => o.value)).toContain("pending");
    expect(field.options.map((o: any) => o.value)).toContain("applied");
    expect(field.options.map((o: any) => o.value)).toContain("archived");
    expect(field.defaultValue).toBe("pending");
  });

  it("should have appliedToNKL relationship field", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "appliedToNKL");
    expect(field).toBeDefined();
    expect(field.type).toBe("relationship");
    expect(field.relationTo).toBe("negative-keyword-lists");
  });

  it("should have keywordCount computed number field", () => {
    const field = findField(KeywordDeepDiveSessions.fields ?? [], "keywordCount");
    expect(field).toBeDefined();
    expect(field.type).toBe("number");
  });

  it("should use title as useAsTitle", () => {
    expect(KeywordDeepDiveSessions.admin?.useAsTitle).toBe("title");
  });

  it("should hide from nav without feature", () => {
    const hidden = KeywordDeepDiveSessions.admin?.hidden;
    expect(hidden).toBeDefined();
  });
});

// ─── Access Control Tests ─────────────────────────────────────
describe("KeywordDeepDiveSessions access", () => {
  it("should allow admin to read", async () => {
    const access = KeywordDeepDiveSessions.access?.read;
    const result = await access?.({
      req: { headers: {}, user: { id: 1, email: "admin@test.com", role: "admin" } },
    } as any, undefined as any);
    expect(result).toBe(true);
  });

  it("should deny non-admin without feature", async () => {
    vi.mocked(userHasFeature).mockReturnValueOnce(false);
    const access = KeywordDeepDiveSessions.access?.read;
    const result = await access?.({
      req: { headers: {}, user: { id: 2, email: "manager@test.com", role: "manager", featureAccess: [] } },
    } as any, undefined as any);
    expect(result).toBe(false);
  });

  it("should allow api key read", async () => {
    const { hasValidApiKey } = await import("@/collections/api-key-access");
    vi.mocked(hasValidApiKey).mockReturnValueOnce(true);
    const access = KeywordDeepDiveSessions.access?.read;
    const result = await access?.({
      req: { headers: { "x-api-key": "valid-key" } },
    } as any, undefined as any);
    expect(result).toBe(true);
  });

  it("should deny create without feature or api key", async () => {
    vi.mocked(userHasFeature).mockReturnValueOnce(false);
    const access = KeywordDeepDiveSessions.access?.create;
    const result = await access?.({
      req: { headers: {}, user: { id: 2, email: "specialist@test.com", role: "specialist", featureAccess: [] } },
    } as any, undefined as any);
    expect(result).toBe(false);
  });
});
