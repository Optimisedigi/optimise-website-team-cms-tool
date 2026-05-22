import { describe, it, expect } from "vitest";
import { GoalRuns } from "@/collections/GoalRuns";

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
describe("GoalRuns Collection", () => {
  it("has the correct slug", () => {
    expect(GoalRuns.slug).toBe("goal-runs");
  });

  it("has singular/plural labels", () => {
    expect(GoalRuns.labels).toBeDefined();
    expect((GoalRuns.labels as any).singular).toBe("Goal Run");
    expect((GoalRuns.labels as any).plural).toBe("Goal Runs");
  });

  it("is hidden from the admin sidebar", () => {
    expect(GoalRuns.admin?.hidden).toBe(true);
  });

  it("uses goal as the admin title field", () => {
    expect(GoalRuns.admin?.useAsTitle).toBe("goal");
  });

  // ─── Access ──────────────────────────────────────────────────────────
  describe("access", () => {
    const managerUser = { id: 1, role: "manager" as const };
    const adminUser = { id: 1, role: "admin" as const };
    const otherUser = { id: 2, role: "manager" as const };

    it("allows read for any logged-in user, denies anon", () => {
      const access = GoalRuns.access?.read as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows create for any logged-in user, denies anon", () => {
      const access = GoalRuns.access?.create as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows update for any logged-in user, denies anon", () => {
      const access = GoalRuns.access?.update as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows delete only for admin", () => {
      const access = GoalRuns.access?.delete as Function;
      expect(access({ req: { user: adminUser } })).toBe(true);
      expect(access({ req: { user: otherUser } })).toBe(false);
      expect(access({ req: { user: null } })).toBe(false);
    });
  });

  // ─── Fields ───────────────────────────────────────────────────────────
  describe("fields", () => {
    it("client is a required relationship to clients (indexed)", () => {
      const field = findField(GoalRuns.fields ?? [], "client");
      expect(field).toBeDefined();
      expect(field.type).toBe("relationship");
      expect(field.relationTo).toBe("clients");
      expect(field.required).toBe(true);
      expect(field.index).toBe(true);
    });

    it("goal is required text (indexed)", () => {
      const field = findField(GoalRuns.fields ?? [], "goal");
      expect(field).toBeDefined();
      expect(field.type).toBe("text");
      expect(field.required).toBe(true);
      expect(field.index).toBe(true);
    });

    it("status is a required select with all eight lifecycle values", () => {
      const field = findField(GoalRuns.fields ?? [], "status");
      expect(field).toBeDefined();
      expect(field.type).toBe("select");
      expect(field.required).toBe(true);
      expect(field.defaultValue).toBe("awaiting_data");

      const values = (field.options as any[]).map((o) => o.value).sort();
      expect(values).toEqual([
        "analysing",
        "awaiting_data",
        "blocked",
        "complete",
        "executing",
        "failed",
        "measuring",
        "pending_approval",
      ]);
    });

    it("status is indexed", () => {
      const field = findField(GoalRuns.fields ?? [], "status");
      expect(field.index).toBe(true);
    });

    it("tier is a nullable select with green/yellow/red", () => {
      const field = findField(GoalRuns.fields ?? [], "tier");
      expect(field).toBeDefined();
      expect(field.type).toBe("select");
      expect(field.required).not.toBe(true);

      const values = (field.options as any[]).map((o) => o.value).sort();
      expect(values).toEqual(["green", "red", "yellow"]);
    });

    it("tier is indexed", () => {
      const field = findField(GoalRuns.fields ?? [], "tier");
      expect(field.index).toBe(true);
    });

    it("completedAt is a nullable date", () => {
      const field = findField(GoalRuns.fields ?? [], "completedAt");
      expect(field).toBeDefined();
      expect(field.type).toBe("date");
      expect(field.required).not.toBe(true);
    });

    it("error is a nullable textarea", () => {
      const field = findField(GoalRuns.fields ?? [], "error");
      expect(field).toBeDefined();
      expect(field.type).toBe("textarea");
      expect(field.required).not.toBe(true);
    });

    it("has timestamps (createdAt/updatedAt via timestamps: true)", () => {
      // Payload sets up created_at / updated_at when timestamps: true.
      // We verify the collection config flag is set.
      expect((GoalRuns as any).timestamps).toBe(true);
    });
  });
});
