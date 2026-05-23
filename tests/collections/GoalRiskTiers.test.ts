import { describe, it, expect } from "vitest";
import { GoalRiskTiers } from "@/collections/GoalRiskTiers";

// ─── Helpers ───────────────────────────────────────────────────────────────
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

// ─── Collection Structure ─────────────────────────────────────────────────
describe("GoalRiskTiers Collection", () => {
  it("has the correct slug", () => {
    expect(GoalRiskTiers.slug).toBe("goal-risk-tiers");
  });

  it("has singular/plural labels", () => {
    expect(GoalRiskTiers.labels).toBeDefined();
    expect((GoalRiskTiers.labels as any).singular).toBe("Goal Risk Tier");
    expect((GoalRiskTiers.labels as any).plural).toBe("Goal Risk Tiers");
  });

  it("is visible in the admin sidebar (admin.group = 'Admin')", () => {
    expect(GoalRiskTiers.admin?.group).toBe("Admin");
    expect(GoalRiskTiers.admin?.hidden).not.toBe(true);
  });

  it("uses name as the admin title field", () => {
    expect(GoalRiskTiers.admin?.useAsTitle).toBe("name");
  });

  // ─── Access ────────────────────────────────────────────────────────────
  describe("access", () => {
    const managerUser = { id: 1, role: "manager" as const };
    const adminUser = { id: 1, role: "admin" as const };
    const otherUser = { id: 2, role: "manager" as const };

    it("allows read for any logged-in user, denies anon", () => {
      const access = GoalRiskTiers.access?.read as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows create for any logged-in user, denies anon", () => {
      const access = GoalRiskTiers.access?.create as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows update for any logged-in user, denies anon", () => {
      const access = GoalRiskTiers.access?.update as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows delete only for admin", () => {
      const access = GoalRiskTiers.access?.delete as Function;
      expect(access({ req: { user: adminUser } })).toBe(true);
      expect(access({ req: { user: otherUser } })).toBe(false);
      expect(access({ req: { user: null } })).toBe(false);
    });
  });

  // ─── Fields ───────────────────────────────────────────────────────────
  describe("fields", () => {
    it("name is required text", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "name");
      expect(field).toBeDefined();
      expect(field.type).toBe("text");
      expect(field.required).toBe(true);
    });

    it("tier is a required select with all four tier values (indexed)", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "tier");
      expect(field).toBeDefined();
      expect(field.type).toBe("select");
      expect(field.required).toBe(true);
      expect(field.index).toBe(true);

      const values = (field.options as any[]).map((o: any) => o.value).sort();
      expect(values).toEqual(["black", "green", "red", "yellow"]);
    });

    it("maxBudgetImpactDollars is a nullable number", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "maxBudgetImpactDollars");
      expect(field).toBeDefined();
      expect(field.type).toBe("number");
      expect(field.required).not.toBe(true);
    });

    it("allowedActionTypes is an optional array field with an actionType text subfield", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "allowedActionTypes");
      expect(field).toBeDefined();
      expect(field.type).toBe("array");
      expect(field.required).not.toBe(true); // optional
      expect(Array.isArray(field.fields)).toBe(true);

      const subField = field.fields.find((f: any) => f.name === "actionType");
      expect(subField).toBeDefined();
      expect(subField.type).toBe("text");
    });

    it("requiresApproval is a checkbox with defaultValue true", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "requiresApproval");
      expect(field).toBeDefined();
      expect(field.type).toBe("checkbox");
      expect(field.defaultValue).toBe(true);
    });

    it("autoExecute is a checkbox with defaultValue false", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "autoExecute");
      expect(field).toBeDefined();
      expect(field.type).toBe("checkbox");
      expect(field.defaultValue).toBe(false);
    });

    it("description is a nullable textarea", () => {
      const field = findField(GoalRiskTiers.fields ?? [], "description");
      expect(field).toBeDefined();
      expect(field.type).toBe("textarea");
      expect(field.required).not.toBe(true);
    });

    it("has timestamps (createdAt/updatedAt via timestamps: true)", () => {
      expect((GoalRiskTiers as any).timestamps).toBe(true);
    });
  });
});
