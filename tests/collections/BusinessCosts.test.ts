import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusinessCosts } from "@/collections/BusinessCosts";

// ─── Helpers ───────────────────────────────────────────────────
const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn() },
};

const mockReq = (overrides: Record<string, any> = {}) => ({
  payload: mockPayload,
  user: { id: 1, email: "admin@test.com", role: "admin" },
  ...overrides,
});

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

function getBeforeChangeHooks() {
  return BusinessCosts.hooks?.beforeChange ?? [];
}

// ─── Field Structure Tests ─────────────────────────────────────
describe("BusinessCosts Collection", () => {
  it("should have correct slug", () => {
    expect(BusinessCosts.slug).toBe("business-costs");
  });

  it("should be in Costs Overview admin group", () => {
    expect(BusinessCosts.admin?.group).toBe("Costs Overview");
  });

  it("should have required date field", () => {
    const dateField = findField(BusinessCosts.fields, "date");
    expect(dateField).toBeDefined();
    expect(dateField).toHaveProperty("type", "date");
    expect(dateField).toHaveProperty("required", true);
  });

  it("should have required amount field", () => {
    const amountField = findField(BusinessCosts.fields, "amount");
    expect(amountField).toBeDefined();
    expect(amountField).toHaveProperty("type", "number");
    expect(amountField).toHaveProperty("required", true);
  });

  it("should have required description field", () => {
    const descField = findField(BusinessCosts.fields, "description");
    expect(descField).toBeDefined();
    expect(descField).toHaveProperty("type", "text");
    expect(descField).toHaveProperty("required", true);
  });

  it("should have category relationship to cost-categories", () => {
    const categoryField = findField(BusinessCosts.fields, "category");
    expect(categoryField).toBeDefined();
    expect(categoryField).toHaveProperty("type", "relationship");
    expect(categoryField).toHaveProperty("relationTo", "cost-categories");
  });

  it("should default source to manual", () => {
    const sourceField = findField(BusinessCosts.fields, "source");
    expect(sourceField).toBeDefined();
    expect(sourceField).toHaveProperty("defaultValue", "manual");
  });

  it("should have read-only month field", () => {
    const monthField = findField(BusinessCosts.fields, "month");
    expect(monthField).toBeDefined();
    expect(monthField.admin?.readOnly).toBe(true);
  });

  it("should have read-only year field", () => {
    const yearField = findField(BusinessCosts.fields, "year");
    expect(yearField).toBeDefined();
    expect(yearField.admin?.readOnly).toBe(true);
  });

  it("should have client relationship to clients", () => {
    const clientField = findField(BusinessCosts.fields, "client");
    expect(clientField).toBeDefined();
    expect(clientField).toHaveProperty("type", "relationship");
    expect(clientField).toHaveProperty("relationTo", "clients");
  });
});

// ─── Access Control Tests ──────────────────────────────────────
describe("BusinessCosts: access control", () => {
  it("should allow read for authenticated users", () => {
    const access = BusinessCosts.access?.read;
    expect(access).toBeDefined();
    if (typeof access === "function") {
      expect(access({ req: mockReq() } as any)).toBe(true);
    }
  });

  it("should deny read for unauthenticated users", () => {
    const access = BusinessCosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: null }) } as any)).toBe(false);
    }
  });

  it("should allow create for authenticated users", () => {
    const access = BusinessCosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq() } as any)).toBe(true);
    }
  });

  it("should deny create for unauthenticated users", () => {
    const access = BusinessCosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: null }) } as any)).toBe(false);
    }
  });

  it("should allow delete for admin users", () => {
    const access = BusinessCosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { role: "admin" } }) } as any)).toBe(true);
    }
  });

  it("should deny delete for non-admin users", () => {
    const access = BusinessCosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { role: "specialist" } }) } as any)).toBe(false);
    }
  });

  it("should deny delete for unauthenticated users", () => {
    const access = BusinessCosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: null }) } as any)).toBe(false);
    }
  });
});

// ─── beforeChange hook: date → month/year derivation ───────────
describe("BusinessCosts: beforeChange date derivation hook", () => {
  let dateHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getBeforeChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    dateHook = hooks[0];
  });

  it("should derive month and year from date", () => {
    const data = { date: "2025-03-15" };
    const result = dateHook({ data });
    expect(result.month).toBe("2025-03");
    expect(result.year).toBe(2025);
  });

  it("should zero-pad single-digit months", () => {
    const data = { date: "2025-01-05" };
    const result = dateHook({ data });
    expect(result.month).toBe("2025-01");
  });

  it("should handle December correctly", () => {
    const data = { date: "2024-12-25" };
    const result = dateHook({ data });
    expect(result.month).toBe("2024-12");
    expect(result.year).toBe(2024);
  });

  it("should not set month/year when date is missing", () => {
    const data = { description: "No date entry" };
    const result = dateHook({ data });
    expect(result.month).toBeUndefined();
    expect(result.year).toBeUndefined();
  });

  it("should not set month/year when date is empty string", () => {
    const data = { date: "" };
    const result = dateHook({ data });
    expect(result.month).toBeUndefined();
    expect(result.year).toBeUndefined();
  });

  it("should return data when data is undefined", () => {
    const result = dateHook({ data: undefined });
    expect(result).toBeUndefined();
  });

  it("should handle ISO datetime strings", () => {
    const data = { date: "2025-06-15T10:30:00.000Z" };
    const result = dateHook({ data });
    expect(result.month).toBe("2025-06");
    expect(result.year).toBe(2025);
  });

  it("should preserve other data fields", () => {
    const data = { date: "2025-04-10", description: "Office supplies", amount: 42.50 };
    const result = dateHook({ data });
    expect(result.description).toBe("Office supplies");
    expect(result.amount).toBe(42.50);
    expect(result.month).toBe("2025-04");
    expect(result.year).toBe(2025);
  });
});
