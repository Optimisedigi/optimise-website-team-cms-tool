import { describe, it, expect } from "vitest";
import { GoalRunSnapshots } from "@/collections/GoalRunSnapshots";

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
describe("GoalRunSnapshots Collection", () => {
  it("has the correct slug", () => {
    expect(GoalRunSnapshots.slug).toBe("goal-run-snapshots");
  });

  it("has singular/plural labels", () => {
    expect(GoalRunSnapshots.labels).toBeDefined();
    expect((GoalRunSnapshots.labels as any).singular).toBe("Goal Run Snapshot");
    expect((GoalRunSnapshots.labels as any).plural).toBe("Goal Run Snapshots");
  });

  it("is hidden from the admin sidebar", () => {
    expect(GoalRunSnapshots.admin?.hidden).toBe(true);
  });

  it("uses action as the admin title field", () => {
    expect(GoalRunSnapshots.admin?.useAsTitle).toBe("action");
  });

  // ─── Access ──────────────────────────────────────────────────────────
  describe("access", () => {
    const managerUser = { id: 1, role: "manager" as const };
    const adminUser = { id: 1, role: "admin" as const };
    const otherUser = { id: 2, role: "manager" as const };

    it("allows read for any logged-in user, denies anon", () => {
      const access = GoalRunSnapshots.access?.read as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows create for any logged-in user, denies anon", () => {
      const access = GoalRunSnapshots.access?.create as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows update for any logged-in user, denies anon", () => {
      const access = GoalRunSnapshots.access?.update as Function;
      expect(access({ req: { user: managerUser } })).toBe(true);
      expect(access({ req: { user: null } })).toBe(false);
    });

    it("allows delete only for admin", () => {
      const access = GoalRunSnapshots.access?.delete as Function;
      expect(access({ req: { user: adminUser } })).toBe(true);
      expect(access({ req: { user: otherUser } })).toBe(false);
      expect(access({ req: { user: null } })).toBe(false);
    });
  });

  // ─── Fields ───────────────────────────────────────────────────────────
  describe("fields", () => {
    it("goalRun is a required relationship to goal-runs (indexed)", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "goalRun");
      expect(field).toBeDefined();
      expect(field.type).toBe("relationship");
      expect(field.relationTo).toBe("goal-runs");
      expect(field.required).toBe(true);
      expect(field.index).toBe(true);
    });

    it("step is a required number", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "step");
      expect(field).toBeDefined();
      expect(field.type).toBe("number");
      expect(field.required).toBe(true);
    });

    it("action is required text", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "action");
      expect(field).toBeDefined();
      expect(field.type).toBe("text");
      expect(field.required).toBe(true);
    });

    it("riskTier is a required select with green/yellow/red/black", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "riskTier");
      expect(field).toBeDefined();
      expect(field.type).toBe("select");
      expect(field.required).toBe(true);

      const values = (field.options as any[]).map((o) => o.value).sort();
      expect(values).toEqual(["black", "green", "red", "yellow"]);
    });

    it("status is a required select with all seven outcome values (indexed)", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "status");
      expect(field).toBeDefined();
      expect(field.type).toBe("select");
      expect(field.required).toBe(true);
      expect(field.index).toBe(true);

      const values = (field.options as any[]).map((o) => o.value).sort();
      expect(values).toEqual([
        "applied",
        "approved",
        "blocked_by_contract",
        "blocked_by_pacer",
        "blocked_by_scope",
        "proposed",
        "rejected",
      ]);
    });

    it("campaignIds is an array field with a campaignId text subfield", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "campaignIds");
      expect(field).toBeDefined();
      expect(field.type).toBe("array");
      expect(Array.isArray(field.fields)).toBe(true);

      const subField = field.fields.find(
        (f: any) => f.name === "campaignId",
      );
      expect(subField).toBeDefined();
      expect(subField.type).toBe("text");
      expect(subField.required).toBe(true);
    });

    it("proposedPayload is required json", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "proposedPayload");
      expect(field).toBeDefined();
      expect(field.type).toBe("json");
      expect(field.required).toBe(true);
    });

    it("modifiedPayload is nullable json", () => {
      const field = findField(
        GoalRunSnapshots.fields ?? [],
        "modifiedPayload",
      );
      expect(field).toBeDefined();
      expect(field.type).toBe("json");
      expect(field.required).not.toBe(true);
    });

    it("blockReason is nullable textarea", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "blockReason");
      expect(field).toBeDefined();
      expect(field.type).toBe("textarea");
      expect(field.required).not.toBe(true);
    });

    it("approval is a nullable relationship to agent-approval-queue (hasMany: false)", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "approval");
      expect(field).toBeDefined();
      expect(field.type).toBe("relationship");
      expect(field.relationTo).toBe("agent-approval-queue");
      expect(field.required).not.toBe(true);
      expect(field.hasMany).toBe(false);
    });

    it("measuredAt is a nullable date", () => {
      const field = findField(GoalRunSnapshots.fields ?? [], "measuredAt");
      expect(field).toBeDefined();
      expect(field.type).toBe("date");
      expect(field.required).not.toBe(true);
    });

    it("measuredResult is nullable json", () => {
      const field = findField(
        GoalRunSnapshots.fields ?? [],
        "measuredResult",
      );
      expect(field).toBeDefined();
      expect(field.type).toBe("json");
      expect(field.required).not.toBe(true);
    });

    it("has timestamps (createdAt/updatedAt via timestamps: true)", () => {
      expect((GoalRunSnapshots as any).timestamps).toBe(true);
    });
  });
});
