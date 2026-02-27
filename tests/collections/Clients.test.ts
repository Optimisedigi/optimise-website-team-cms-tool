import { describe, it, expect, vi, beforeEach } from "vitest";
import { Clients } from "@/collections/Clients";

// Mock the activity-log module
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { logActivity } from "@/lib/activity-log";

// ─── Helpers ───────────────────────────────────────────────────
const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn() },
};

const mockReq = (overrides: Record<string, any> = {}) => ({
  payload: mockPayload,
  user: { id: 1, email: "admin@test.com", name: "Admin" },
  ...overrides,
});

/**
 * Extract the collection-level beforeChange hooks array.
 */
function getBeforeChangeHooks() {
  return Clients.hooks?.beforeChange ?? [];
}

/**
 * Extract the collection-level afterChange hooks array.
 */
function getAfterChangeHooks() {
  return Clients.hooks?.afterChange ?? [];
}

/**
 * Find a field by name, searching inside tabs/rows recursively.
 */
function findField(fields: any[], name: string): any {
  for (const f of fields) {
    if ("name" in f && f.name === name) return f;
    if ("tabs" in f) {
      for (const tab of f.tabs) {
        const found = findField(tab.fields, name);
        if (found) return found;
      }
    }
    if ("fields" in f && f.type === "row") {
      const found = findField(f.fields, name);
      if (found) return found;
    }
  }
  return undefined;
}

// ─── Field Structure Tests (existing) ──────────────────────────
describe("Clients Collection", () => {
  it("should have correct slug", () => {
    expect(Clients.slug).toBe("clients");
  });

  it("should have required name field", () => {
    const nameField = findField(Clients.fields, "name");
    expect(nameField).toBeDefined();
    expect(nameField).toHaveProperty("required", true);
    expect(nameField).toHaveProperty("type", "text");
  });

  it("should have required unique slug field", () => {
    const slugField = findField(Clients.fields, "slug");
    expect(slugField).toBeDefined();
    expect(slugField).toHaveProperty("required", true);
    expect(slugField).toHaveProperty("unique", true);
    expect(slugField).toHaveProperty("type", "text");
  });

  it("should have apiKey field with auto-generation hook", () => {
    const apiKeyField = findField(Clients.fields, "apiKey");
    expect(apiKeyField).toBeDefined();
    expect(apiKeyField).toHaveProperty("hooks");
  });

  it("should have isActive checkbox with default true", () => {
    const isActiveField = findField(Clients.fields, "isActive");
    expect(isActiveField).toBeDefined();
    expect(isActiveField).toHaveProperty("type", "checkbox");
    expect(isActiveField).toHaveProperty("defaultValue", true);
  });

  it("should be in Clients admin group", () => {
    expect(Clients.admin?.group).toBe("Clients");
  });

  it("should use name as title", () => {
    expect(Clients.admin?.useAsTitle).toBe("name");
  });
});

// ─── trackRetainerChange hook ──────────────────────────────────
describe("Clients: trackRetainerChange hook", () => {
  let trackRetainerChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getBeforeChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    trackRetainerChange = hooks[0];
  });

  it("should skip when operation is not update", async () => {
    const data = { monthlyRetainer: 5000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: { monthlyRetainer: 3000 },
      req: mockReq(),
      operation: "create",
    });
    expect(result).toEqual(data);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("should skip when data is undefined", async () => {
    const result = await trackRetainerChange({
      data: undefined,
      originalDoc: { monthlyRetainer: 3000 },
      req: mockReq(),
      operation: "update",
    });
    expect(result).toBeUndefined();
  });

  it("should skip when originalDoc is undefined", async () => {
    const data = { monthlyRetainer: 5000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: undefined,
      req: mockReq(),
      operation: "update",
    });
    expect(result).toEqual(data);
  });

  it("should skip when retainer amount has not changed", async () => {
    const data = { monthlyRetainer: 3000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: { monthlyRetainer: 3000, retainerHistory: [] },
      req: mockReq(),
      operation: "update",
    });
    expect(result).toEqual(data);
    expect(result.retainerHistory).toBeUndefined();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("should create history entry when retainer changes", async () => {
    const data = { monthlyRetainer: 5000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Acme Corp",
        monthlyRetainer: 3000,
        retainerHistory: [],
      },
      req: mockReq(),
      operation: "update",
    });

    expect(result.retainerHistory).toHaveLength(1);
    expect(result.retainerHistory[0]).toMatchObject({
      amount: 5000,
      previousAmount: 3000,
      changedBy: "admin@test.com",
    });
    expect(result.retainerHistory[0].effectiveDate).toBeDefined();
  });

  it("should prepend new entry to existing history", async () => {
    const existingHistory = [
      { amount: 3000, previousAmount: 2000, effectiveDate: "2025-01-01", changedBy: "old@test.com" },
    ];
    const data = { monthlyRetainer: 5000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Acme Corp",
        monthlyRetainer: 3000,
        retainerHistory: existingHistory,
      },
      req: mockReq(),
      operation: "update",
    });

    expect(result.retainerHistory).toHaveLength(2);
    expect(result.retainerHistory[0].amount).toBe(5000);
    expect(result.retainerHistory[1].amount).toBe(3000);
  });

  it("should handle null retainer values as 0", async () => {
    const data = { monthlyRetainer: 2000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Acme Corp",
        monthlyRetainer: null,
        retainerHistory: [],
      },
      req: mockReq(),
      operation: "update",
    });

    expect(result.retainerHistory).toHaveLength(1);
    expect(result.retainerHistory[0].previousAmount).toBe(0);
    expect(result.retainerHistory[0].amount).toBe(2000);
  });

  it("should not create history entry when both old and new are null/0", async () => {
    const data = {};
    const result = await trackRetainerChange({
      data,
      originalDoc: { id: "client-1", name: "Acme Corp", retainerHistory: [] },
      req: mockReq(),
      operation: "update",
    });
    expect(result.retainerHistory).toBeUndefined();
  });

  it("should log activity when retainer changes", async () => {
    const data = { monthlyRetainer: 8000 };
    await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Acme Corp",
        monthlyRetainer: 5000,
        retainerHistory: [],
      },
      req: mockReq(),
      operation: "update",
    });

    expect(logActivity).toHaveBeenCalledWith(mockPayload, {
      type: "retainer_changed",
      title: "Retainer changed for Acme Corp",
      description: "$5,000 → $8,000/mo",
      user: 1,
      client: "client-1",
    });
  });

  it("should use user.name as changedBy when email is missing", async () => {
    const data = { monthlyRetainer: 4000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Test",
        monthlyRetainer: 2000,
        retainerHistory: [],
      },
      req: mockReq({ user: { id: 2, name: "Bob" } }),
      operation: "update",
    });
    expect(result.retainerHistory[0].changedBy).toBe("Bob");
  });

  it("should use 'system' as changedBy when user is missing", async () => {
    const data = { monthlyRetainer: 4000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Test",
        monthlyRetainer: 2000,
        retainerHistory: [],
      },
      req: mockReq({ user: null }),
      operation: "update",
    });
    expect(result.retainerHistory[0].changedBy).toBe("system");
  });

  it("should handle non-array retainerHistory gracefully", async () => {
    const data = { monthlyRetainer: 4000 };
    const result = await trackRetainerChange({
      data,
      originalDoc: {
        id: "client-1",
        name: "Test",
        monthlyRetainer: 2000,
        retainerHistory: "corrupted",
      },
      req: mockReq(),
      operation: "update",
    });
    expect(result.retainerHistory).toHaveLength(1);
  });
});

// ─── afterChange hook (activity logging on create) ─────────────
describe("Clients: afterChange hook", () => {
  let afterChangeHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    afterChangeHook = hooks[0];
  });

  it("should log activity when a client is created", async () => {
    await afterChangeHook({
      doc: { id: "c1", name: "New Client", websiteUrl: "https://example.com" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(mockPayload, {
      type: "client_added",
      title: "New client: New Client",
      description: "https://example.com",
      user: 1,
      client: "c1",
    });
  });

  it("should not log activity on update", async () => {
    await afterChangeHook({
      doc: { id: "c1", name: "Old Client" },
      operation: "update",
      req: mockReq(),
    });

    expect(logActivity).not.toHaveBeenCalled();
  });

  it("should use empty string when websiteUrl is missing", async () => {
    await afterChangeHook({
      doc: { id: "c1", name: "No URL Client" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ description: "" }),
    );
  });
});

// ─── clientPin field ──────────────────────────────────────────
describe("Clients: clientPin field", () => {
  let clientPinField: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clientPinField = findField(Clients.fields, "clientPin");
  });

  it("should be unique", () => {
    expect(clientPinField.unique).toBe(true);
  });

  it("should auto-generate a 4-digit PIN on create when no value", () => {
    const hook = clientPinField.hooks.beforeChange[0];
    const result = hook({ value: undefined, operation: "create" });
    expect(result).toMatch(/^\d{4}$/);
  });

  it("should preserve existing value on create", () => {
    const hook = clientPinField.hooks.beforeChange[0];
    const result = hook({ value: "1234", operation: "create" });
    expect(result).toBe("1234");
  });

  it("should not generate PIN on update", () => {
    const hook = clientPinField.hooks.beforeChange[0];
    const result = hook({ value: undefined, operation: "update" });
    expect(result).toBeUndefined();
  });

  it("should validate that PIN is exactly 4 digits", async () => {
    const validate = clientPinField.validate;
    // null is valid (optional)
    expect(await validate(null, { req: mockReq(), id: undefined })).toBe(true);
    // valid 4 digits
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });
    expect(await validate("1234", { req: mockReq(), id: undefined })).toBe(true);
    // too short
    expect(await validate("123", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");
    // too long
    expect(await validate("12345", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");
    // letters
    expect(await validate("abcd", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");
  });

  it("should reject duplicate PIN", async () => {
    const validate = clientPinField.validate;
    mockPayload.find.mockResolvedValueOnce({
      totalDocs: 1,
      docs: [{ name: "Other Client" }],
    });
    const result = await validate("5678", { req: mockReq(), id: "my-id" });
    expect(result).toContain("already in use");
    expect(result).toContain("Other Client");
  });

  it("should exclude own id when checking for duplicates", async () => {
    const validate = clientPinField.validate;
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });
    await validate("9999", { req: mockReq(), id: "self-id" });
    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not_equals: "self-id" },
        }),
      }),
    );
  });
});

// ─── apiKey field ─────────────────────────────────────────────
describe("Clients: apiKey field", () => {
  let apiKeyField: any;

  beforeEach(() => {
    apiKeyField = findField(Clients.fields, "apiKey");
  });

  it("should auto-generate key on create when no value", () => {
    const hook = apiKeyField.hooks.beforeChange[0];
    const result = hook({ value: undefined, operation: "create" });
    expect(result).toMatch(/^key_[a-f0-9]{48}$/);
  });

  it("should preserve existing value on create", () => {
    const hook = apiKeyField.hooks.beforeChange[0];
    const result = hook({ value: "existing-key", operation: "create" });
    expect(result).toBe("existing-key");
  });

  it("should not generate key on update", () => {
    const hook = apiKeyField.hooks.beforeChange[0];
    const result = hook({ value: undefined, operation: "update" });
    expect(result).toBeUndefined();
  });

  it("should generate unique keys each time", () => {
    const hook = apiKeyField.hooks.beforeChange[0];
    const key1 = hook({ value: undefined, operation: "create" });
    const key2 = hook({ value: undefined, operation: "create" });
    expect(key1).not.toBe(key2);
  });

  it("should be readOnly in admin", () => {
    expect(apiKeyField.admin.readOnly).toBe(true);
  });
});
