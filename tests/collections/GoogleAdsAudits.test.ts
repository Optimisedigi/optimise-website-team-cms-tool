import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleAdsAudits } from "@/collections/GoogleAdsAudits";

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/collections/api-key-access", () => ({
  hasValidApiKey: vi.fn().mockReturnValue(false),
}));

import { logActivity } from "@/lib/activity-log";
import { hasValidApiKey } from "@/collections/api-key-access";

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
  return GoogleAdsAudits.hooks?.beforeChange ?? [];
}

function getAfterChangeHooks() {
  return GoogleAdsAudits.hooks?.afterChange ?? [];
}

// ─── Field Structure Tests ─────────────────────────────────────
describe("GoogleAdsAudits Collection", () => {
  it("should have correct slug", () => {
    expect(GoogleAdsAudits.slug).toBe("google-ads-audits");
  });

  it("should use businessName as title", () => {
    expect(GoogleAdsAudits.admin?.useAsTitle).toBe("businessName");
  });

  it("should be in Audits admin group", () => {
    expect(GoogleAdsAudits.admin?.group).toBe("Growth Tools");
  });

  it("should have required businessName field", () => {
    const field = findField(GoogleAdsAudits.fields, "businessName");
    expect(field).toBeDefined();
    expect(field.required).toBe(true);
  });

  it("should have required unique slug field", () => {
    const field = findField(GoogleAdsAudits.fields, "slug");
    expect(field).toBeDefined();
    expect(field.required).toBe(true);
    expect(field.unique).toBe(true);
  });

  it("should have required customerId field", () => {
    const field = findField(GoogleAdsAudits.fields, "customerId");
    expect(field).toBeDefined();
    expect(field.required).toBe(true);
  });

  it("should have overallScore field with 0-100 range", () => {
    const field = findField(GoogleAdsAudits.fields, "overallScore");
    expect(field).toBeDefined();
    expect(field.min).toBe(0);
    expect(field.max).toBe(100);
  });

  it("should have presentationPin field in sidebar", () => {
    const field = findField(GoogleAdsAudits.fields, "presentationPin");
    expect(field).toBeDefined();
    // Note: uniqueness was removed (commit 6c2acce) — PINs can repeat.
    expect(field.admin?.position).toBe("sidebar");
  });

  it("should have client relationship in sidebar", () => {
    const field = findField(GoogleAdsAudits.fields, "client");
    expect(field).toBeDefined();
    expect(field.type).toBe("relationship");
    expect(field.relationTo).toBe("clients");
    expect(field.admin?.position).toBe("sidebar");
  });

  it("should have proposal relationship in sidebar", () => {
    const field = findField(GoogleAdsAudits.fields, "proposal");
    expect(field).toBeDefined();
    expect(field.type).toBe("relationship");
    expect(field.relationTo).toBe("client-proposals");
    expect(field.admin?.position).toBe("sidebar");
  });

  it("should have createProposal checkbox in sidebar", () => {
    const field = findField(GoogleAdsAudits.fields, "createProposal");
    expect(field).toBeDefined();
    expect(field.type).toBe("checkbox");
    expect(field.defaultValue).toBe(false);
    expect(field.admin?.position).toBe("sidebar");
  });

  it("should have auditStatus with correct options", () => {
    const field = findField(GoogleAdsAudits.fields, "auditStatus");
    expect(field).toBeDefined();
    const values = field.options.map((o: any) => o.value);
    expect(values).toEqual(["pending", "running", "completed", "failed"]);
  });

  it("should have actionItems array with priority and status fields", () => {
    const field = findField(GoogleAdsAudits.fields, "actionItems");
    expect(field).toBeDefined();
    expect(field.type).toBe("array");
    const actionField = field.fields.find((f: any) => f.name === "action");
    expect(actionField).toBeDefined();
    expect(actionField.required).toBe(true);
    // priority and status are inside a row wrapper
    const rowField = field.fields.find((f: any) => f.type === "row");
    expect(rowField).toBeDefined();
    const priorityField = rowField.fields.find((f: any) => f.name === "priority");
    expect(priorityField).toBeDefined();
    expect(priorityField.defaultValue).toBe("medium");
    const statusField = rowField.fields.find((f: any) => f.name === "status");
    expect(statusField).toBeDefined();
    expect(statusField.defaultValue).toBe("pending");
  });

  it("should have tabs structure", () => {
    const tabsField = GoogleAdsAudits.fields.find((f) => f.type === "tabs");
    expect(tabsField).toBeDefined();
    if (tabsField && "tabs" in tabsField) {
      const tabLabels = tabsField.tabs.map((t) => t.label);
      expect(tabLabels).toContain("Client Info");
      expect(tabLabels).toContain("Audit Control");
      expect(tabLabels).toContain("Audit Results");
      expect(tabLabels).toContain("Finding Curation");
      expect(tabLabels).toContain("Presentation");
      expect(tabLabels).toContain("History");
      expect(tabLabels).toContain("Action Items");
    }
  });
});

// ─── Access control tests ──────────────────────────────────────
describe("GoogleAdsAudits: access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow read for users with the feature", () => {
    const readFn = GoogleAdsAudits.access?.read as any;
    // Admin always passes
    expect(readFn({ req: { user: { role: "admin" } } })).toBe(true);
    // Non-admin with feature passes
    expect(
      readFn({
        req: {
          user: { role: "specialist", featureAccess: ["google-ads-audits"] },
        },
      }),
    ).toBe(true);
    // Non-admin without feature is denied
    expect(
      readFn({ req: { user: { role: "specialist", featureAccess: [] } } }),
    ).toBe(false);
  });

  it("should allow read for valid API key", () => {
    (hasValidApiKey as any).mockReturnValueOnce(true);
    const readFn = GoogleAdsAudits.access?.read as any;
    expect(readFn({ req: {} })).toBe(true);
  });

  it("should deny read for unauthenticated requests without API key", () => {
    const readFn = GoogleAdsAudits.access?.read as any;
    expect(readFn({ req: {} })).toBe(false);
  });

  it("should only allow admin to delete", () => {
    const deleteFn = GoogleAdsAudits.access?.delete as any;
    expect(deleteFn({ req: { user: { role: "admin" } } })).toBe(true);
    expect(deleteFn({ req: { user: { role: "editor" } } })).toBe(false);
    expect(deleteFn({ req: {} })).toBe(false);
  });

  it("should allow create for users with the feature", () => {
    const createFn = GoogleAdsAudits.access?.create as any;
    expect(createFn({ req: { user: { role: "admin" } } })).toBe(true);
    expect(
      createFn({
        req: {
          user: { role: "specialist", featureAccess: ["google-ads-audits"] },
        },
      }),
    ).toBe(true);
    expect(
      createFn({ req: { user: { role: "specialist", featureAccess: [] } } }),
    ).toBe(false);
  });

  it("should allow create for valid API key", () => {
    (hasValidApiKey as any).mockReturnValueOnce(true);
    const createFn = GoogleAdsAudits.access?.create as any;
    expect(createFn({ req: {} })).toBe(true);
  });
});

// ─── autoGenerateSlug hook ─────────────────────────────────────
describe("GoogleAdsAudits: autoGenerateSlug hook", () => {
  let autoGenerateSlug: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getBeforeChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    autoGenerateSlug = hooks[0];
  });

  it("should generate slug from businessName on create", async () => {
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });

    const data = { businessName: "Test Business" };
    const result = await autoGenerateSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBe("test-business");
  });

  it("should not overwrite existing slug", async () => {
    const data = { businessName: "Test", slug: "existing" };
    const result = await autoGenerateSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBe("existing");
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("should skip slug generation on update", async () => {
    const data = { businessName: "Test" };
    const result = await autoGenerateSlug({
      data,
      operation: "update",
      req: mockReq(),
    });

    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("should append suffix for duplicate slugs", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1 })
      .mockResolvedValueOnce({ totalDocs: 0 });

    const data = { businessName: "Duplicate" };
    const result = await autoGenerateSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBe("duplicate-1");
  });

  it("should query google-ads-audits collection for uniqueness", async () => {
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });

    const data = { businessName: "Query Check" };
    await autoGenerateSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
      }),
    );
  });

  it("should sanitize special characters", async () => {
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });

    const data = { businessName: "Bob's Plumbing & Heating!" };
    const result = await autoGenerateSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    expect(result.slug).not.toMatch(/^-/);
    expect(result.slug).not.toMatch(/-$/);
  });
});

// ─── createProposalHook ────────────────────────────────────────
describe("GoogleAdsAudits: createProposal hook", () => {
  let createProposalHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    createProposalHook = hooks[0];
  });

  it("should create a proposal when createProposal is toggled on", async () => {
    mockPayload.create.mockResolvedValueOnce({ id: "new-proposal-id" });
    mockPayload.update.mockResolvedValueOnce({});

    const doc = {
      id: "audit-1",
      createProposal: true,
      businessName: "Test Biz",
      websiteUrl: "https://test.com",
      businessType: "services",
      contactEmail: "test@test.com",
      customerId: "123-456-7890",
      overallScore: 65,
    };

    const result = await createProposalHook({
      doc,
      req: mockReq(),
      previousDoc: { createProposal: false },
    });

    expect(result).toBe(doc);

    // Verify proposal was created with correct data
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        data: expect.objectContaining({
          businessName: "Test Biz",
          websiteUrl: "https://test.com",
          businessType: "services",
          contactEmail: "test@test.com",
          googleAdsAudit: "audit-1",
          proposalStatus: "draft",
        }),
      }),
    );

    // Verify notes include score
    const createCall = mockPayload.create.mock.calls[0][0];
    expect(createCall.data.notes).toContain("score: 65/100");

    // Verify audit was updated to link back and reset toggle
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: "audit-1",
        data: {
          proposal: "new-proposal-id",
          createProposal: false,
        },
      }),
    );
  });

  it("should log activity after creating proposal", async () => {
    mockPayload.create.mockResolvedValueOnce({ id: "p1" });
    mockPayload.update.mockResolvedValueOnce({});

    const doc = {
      id: "audit-1",
      createProposal: true,
      businessName: "Logged Biz",
      customerId: "999-888-7777",
    };

    await createProposalHook({
      doc,
      req: mockReq(),
      previousDoc: { createProposal: false },
    });

    expect(logActivity).toHaveBeenCalledWith(mockPayload, {
      type: "google_ads_proposal_created",
      title: "Proposal created from audit: Logged Biz",
      description: "Customer ID: 999-888-7777",
      user: 1,
    });
  });

  it("should not trigger when createProposal was already true", async () => {
    const doc = {
      id: "audit-1",
      createProposal: true,
      businessName: "Test",
    };

    await createProposalHook({
      doc,
      req: mockReq(),
      previousDoc: { createProposal: true },
    });

    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("should not trigger when createProposal is false", async () => {
    const doc = {
      id: "audit-1",
      createProposal: false,
      businessName: "Test",
    };

    await createProposalHook({
      doc,
      req: mockReq(),
      previousDoc: { createProposal: false },
    });

    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("should reset toggle and rethrow on error", async () => {
    mockPayload.create.mockRejectedValueOnce(new Error("Duplicate"));
    mockPayload.update.mockResolvedValueOnce({});

    const doc = {
      id: "audit-1",
      createProposal: true,
      businessName: "Fail Test",
    };

    await expect(
      createProposalHook({
        doc,
        req: mockReq(),
        previousDoc: { createProposal: false },
      }),
    ).rejects.toThrow("Failed to create proposal");

    // Toggle should be reset
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: "audit-1",
        data: { createProposal: false },
      }),
    );

    expect(mockPayload.logger.error).toHaveBeenCalled();
  });

  it("should handle missing overallScore gracefully (no score in notes)", async () => {
    mockPayload.create.mockResolvedValueOnce({ id: "p1" });
    mockPayload.update.mockResolvedValueOnce({});

    const doc = {
      id: "audit-1",
      createProposal: true,
      businessName: "No Score",
      overallScore: null,
    };

    await createProposalHook({
      doc,
      req: mockReq(),
      previousDoc: { createProposal: false },
    });

    const createCall = mockPayload.create.mock.calls[0][0];
    expect(createCall.data.notes).toBe("Created from Google Ads audit");
    expect(createCall.data.notes).not.toContain("score:");
  });

  it("should handle missing customerId in activity log", async () => {
    mockPayload.create.mockResolvedValueOnce({ id: "p1" });
    mockPayload.update.mockResolvedValueOnce({});

    const doc = {
      id: "audit-1",
      createProposal: true,
      businessName: "No CID",
    };

    await createProposalHook({
      doc,
      req: mockReq(),
      previousDoc: { createProposal: false },
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ description: "Customer ID: not set" }),
    );
  });
});

// ─── presentationPin field ─────────────────────────────────────
describe("GoogleAdsAudits: presentationPin field", () => {
  let pinField: any;

  beforeEach(() => {
    vi.clearAllMocks();
    pinField = findField(GoogleAdsAudits.fields, "presentationPin");
  });

  it("should auto-generate a unique PIN on create", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0 });

    const hook = pinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "create", req: mockReq() });

    expect(result).toMatch(/^\d{4}$/);
  });

  it("should retry on collision and eventually succeed", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1 })
      .mockResolvedValueOnce({ totalDocs: 0 });

    const hook = pinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "create", req: mockReq() });

    expect(result).toMatch(/^\d{4}$/);
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
  });

  it("should fall back to hex after 20 failed attempts", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 1 }); // always collides

    const hook = pinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "create", req: mockReq() });

    // Falls back to hex string (4 hex chars)
    expect(result).toMatch(/^[A-F0-9]{4}$/);
    expect(mockPayload.find).toHaveBeenCalledTimes(20);
  });

  it("should preserve existing value on create", async () => {
    const hook = pinField.hooks.beforeChange[0];
    const result = await hook({ value: "4567", operation: "create", req: mockReq() });
    expect(result).toBe("4567");
  });

  it("should not generate PIN on update", async () => {
    const hook = pinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "update", req: mockReq() });
    expect(result).toBeUndefined();
  });

  it("should query google-ads-audits collection for uniqueness", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0 });

    const hook = pinField.hooks.beforeChange[0];
    await hook({ value: undefined, operation: "create", req: mockReq() });

    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        where: expect.objectContaining({
          presentationPin: expect.any(Object),
        }),
      }),
    );
  });

  it("should validate PIN format", async () => {
    const validate = pinField.validate;
    expect(await validate(null, { req: mockReq(), id: undefined })).toBe(true);
    expect(await validate("abc", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");
    expect(await validate("12345", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");

    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });
    expect(await validate("1234", { req: mockReq(), id: undefined })).toBe(true);
  });

  // Removed: "should reject duplicate PIN" and "should exclude own id when
  // checking duplicates" — the uniqueness constraint on presentationPin was
  // intentionally removed in commit 6c2acce (PINs can repeat across audits).
});

// ─── afterChange: activity logging on create ───────────────────
describe("GoogleAdsAudits: afterChange activity logging", () => {
  let activityHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    // Second hook is the activity logger
    expect(hooks.length).toBeGreaterThanOrEqual(2);
    activityHook = hooks[1];
  });

  it("should log activity when an audit is created", async () => {
    await activityHook({
      doc: { businessName: "New Audit Biz", customerId: "111-222-3333" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(mockPayload, {
      type: "google_ads_audit_created",
      title: "Google Ads audit: New Audit Biz",
      description: "Customer ID: 111-222-3333",
      user: 1,
    });
  });

  it("should not log activity on update", async () => {
    await activityHook({
      doc: { businessName: "Existing" },
      operation: "update",
      req: mockReq(),
    });

    expect(logActivity).not.toHaveBeenCalled();
  });

  it("should fall back to slug when businessName is missing", async () => {
    await activityHook({
      doc: { slug: "fallback-slug", customerId: "000-000-0000" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ title: "Google Ads audit: fallback-slug" }),
    );
  });

  it("should show 'not set' when customerId is missing", async () => {
    await activityHook({
      doc: { businessName: "No CID" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ description: "Customer ID: not set" }),
    );
  });
});
