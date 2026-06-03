import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientProposals } from "@/collections/ClientProposals";

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/proposalEditor", () => ({
  proposalEditor: {},
}));

import { logActivity } from "@/lib/activity-log";

// ─── Helpers ───────────────────────────────────────────────────
const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
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
  return ClientProposals.hooks?.beforeChange ?? [];
}

function getAfterChangeHooks() {
  return ClientProposals.hooks?.afterChange ?? [];
}

// ─── Field Structure Tests ─────────────────────────────────────
describe("ClientProposals Collection", () => {
  it("should have correct slug", () => {
    expect(ClientProposals.slug).toBe("client-proposals");
  });

  it("should use businessName as title", () => {
    expect(ClientProposals.admin?.useAsTitle).toBe("businessName");
  });

  it("should be in Clients admin group", () => {
    expect(ClientProposals.admin?.group).toBe("Clients");
  });

  it("should have required businessName field", () => {
    const field = findField(ClientProposals.fields, "businessName");
    expect(field).toBeDefined();
    expect(field.required).toBe(true);
    expect(field.type).toBe("text");
  });

  it("should have required unique slug field", () => {
    const field = findField(ClientProposals.fields, "slug");
    expect(field).toBeDefined();
    expect(field.required).toBe(true);
    expect(field.unique).toBe(true);
  });

  it("should have required websiteUrl field", () => {
    const field = findField(ClientProposals.fields, "websiteUrl");
    expect(field).toBeDefined();
    expect(field.required).toBe(true);
  });

  it("should have proposalStatus field in the main compact form with correct options", () => {
    const field = findField(ClientProposals.fields, "proposalStatus");
    expect(field).toBeDefined();
    expect(field.admin?.position).toBeUndefined();
    expect(field.defaultValue).toBe("draft");
    const values = field.options.map((o: any) => o.value);
    expect(values).toContain("draft");
    expect(values).toContain("proposal_sent");
    expect(values).toContain("client");
    expect(values).toContain("declined");
  });

  it("should have convertToClient checkbox in the main compact form", () => {
    const field = findField(ClientProposals.fields, "convertToClient");
    expect(field).toBeDefined();
    expect(field.type).toBe("checkbox");
    expect(field.defaultValue).toBe(false);
    expect(field.admin?.position).toBeUndefined();
  });

  it("should have proposalPin field in the main compact form", () => {
    const field = findField(ClientProposals.fields, "proposalPin");
    expect(field).toBeDefined();
    expect(field.unique).toBe(true);
    expect(field.admin?.position).toBeUndefined();
  });

  it("should have access controls requiring authentication", () => {
    const access = ClientProposals.access;
    expect(access?.read).toBeDefined();
    expect(access?.create).toBeDefined();
    expect(access?.update).toBeDefined();
    expect(access?.delete).toBeDefined();

    // No user = no access
    expect((access?.read as any)({ req: {} })).toBe(false);
    expect((access?.create as any)({ req: {} })).toBe(false);
    expect((access?.update as any)({ req: {} })).toBe(false);

    // Admin = access
    const admin = { user: { role: "admin" } };
    expect((access?.read as any)({ req: admin })).toBe(true);
    expect((access?.create as any)({ req: admin })).toBe(true);

    // Non-admin with the feature ticked = access
    const withFeature = {
      user: { role: "specialist", featureAccess: ["client-proposals"] },
    };
    expect((access?.read as any)({ req: withFeature })).toBe(true);
    expect((access?.create as any)({ req: withFeature })).toBe(true);

    // Non-admin without the feature = no access
    const withoutFeature = { user: { role: "specialist", featureAccess: [] } };
    expect((access?.read as any)({ req: withoutFeature })).toBe(false);
    expect((access?.create as any)({ req: withoutFeature })).toBe(false);
  });

  it("should only allow admin to delete", () => {
    const deleteFn = ClientProposals.access?.delete as any;
    expect(deleteFn({ req: { user: { role: "admin" } } })).toBe(true);
    expect(deleteFn({ req: { user: { role: "editor" } } })).toBe(false);
    expect(deleteFn({ req: {} })).toBe(false);
  });

  // ── Pre-sale workspace fields (added 2026-05-18) ─────────────────
  it("should have proposalNotes array field with correct dbName", () => {
    const field = findField(ClientProposals.fields, "proposalNotes");
    expect(field).toBeDefined();
    expect(field.type).toBe("array");
    expect(field.dbName).toBe("client_proposals_notes");
    // Mirrors clientNotes — author + content visible, category + date hidden.
    const author = findField(field.fields, "author");
    const content = findField(field.fields, "content");
    const category = findField(field.fields, "category");
    const date = findField(field.fields, "date");
    expect(author).toBeDefined();
    expect(content).toBeDefined();
    expect(content.required).toBe(true);
    expect(category.admin?.hidden).toBe(true);
    expect(date.admin?.hidden).toBe(true);
  });

  it("should have proposalAccountTimeline array field with correct dbName", () => {
    const field = findField(ClientProposals.fields, "proposalAccountTimeline");
    expect(field).toBeDefined();
    expect(field.type).toBe("array");
    expect(field.dbName).toBe("client_proposals_account_timeline");
    // Mirrors accountTimeline — fields are nested in a row.
    const date = findField(field.fields, "date");
    const actionType = findField(field.fields, "actionType");
    const description = findField(field.fields, "description");
    expect(date).toBeDefined();
    expect(actionType).toBeDefined();
    expect(actionType.required).toBe(true);
    expect(description).toBeDefined();
    expect(description.required).toBe(true);
  });

  it("should not expose the legacy discoveryNotes field (superseded by Discovery Briefing collection)", () => {
    expect(findField(ClientProposals.fields, "discoveryNotes")).toBeUndefined();
  });
});

// ─── generateUniqueSlug hook ───────────────────────────────────
describe("ClientProposals: generateUniqueSlug hook", () => {
  let generateUniqueSlug: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getBeforeChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    generateUniqueSlug = hooks[0];
  });

  it("should generate slug from businessName on create when slug is empty", async () => {
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });

    const data = { businessName: "Acme Corp" };
    const result = await generateUniqueSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBe("acme-corp");
  });

  it("should not overwrite existing slug", async () => {
    const data = { businessName: "Acme Corp", slug: "existing-slug" };
    const result = await generateUniqueSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBe("existing-slug");
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("should skip when operation is update", async () => {
    const data = { businessName: "Acme Corp" };
    const result = await generateUniqueSlug({
      data,
      operation: "update",
      req: mockReq(),
    });

    expect(result.slug).toBeUndefined();
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("should skip when businessName is missing", async () => {
    const data = {};
    const result = await generateUniqueSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBeUndefined();
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("should append suffix for duplicate slugs", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1 }) // "acme-corp" taken
      .mockResolvedValueOnce({ totalDocs: 1 }) // "acme-corp-1" taken
      .mockResolvedValueOnce({ totalDocs: 0 }); // "acme-corp-2" available

    const data = { businessName: "Acme Corp" };
    const result = await generateUniqueSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toBe("acme-corp-2");
  });

  it("should sanitize special characters from slug", async () => {
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });

    const data = { businessName: "O'Reilly & Sons! (PTY)" };
    const result = await generateUniqueSlug({
      data,
      operation: "create",
      req: mockReq(),
    });

    expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    expect(result.slug).not.toMatch(/^-/);
    expect(result.slug).not.toMatch(/-$/);
  });

  it("should return data when data is falsy", async () => {
    const result = await generateUniqueSlug({
      data: null,
      operation: "create",
      req: mockReq(),
    });
    expect(result).toBeNull();
  });
});

// ─── generateUniquePin (via proposalPin field hook) ────────────
describe("ClientProposals: proposalPin field", () => {
  let proposalPinField: any;

  beforeEach(() => {
    vi.clearAllMocks();
    proposalPinField = findField(ClientProposals.fields, "proposalPin");
  });

  it("should auto-generate a unique 4-digit PIN on create", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0 });

    const hook = proposalPinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "create", req: mockReq() });

    expect(result).toMatch(/^\d{4}$/);
  });

  it("should retry when PIN collides", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1 }) // first attempt collides
      .mockResolvedValueOnce({ totalDocs: 0 }); // second attempt succeeds

    const hook = proposalPinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "create", req: mockReq() });

    expect(result).toMatch(/^\d{4}$/);
    expect(mockPayload.find).toHaveBeenCalledTimes(2);
  });

  it("should throw after 20 failed attempts", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 1 }); // always collides

    const hook = proposalPinField.hooks.beforeChange[0];
    await expect(
      hook({ value: undefined, operation: "create", req: mockReq() }),
    ).rejects.toThrow("Unable to generate a unique proposal PIN");
  });

  it("should preserve existing value on create", async () => {
    const hook = proposalPinField.hooks.beforeChange[0];
    const result = await hook({ value: "5678", operation: "create", req: mockReq() });
    expect(result).toBe("5678");
  });

  it("should not generate PIN on update", async () => {
    const hook = proposalPinField.hooks.beforeChange[0];
    const result = await hook({ value: undefined, operation: "update", req: mockReq() });
    expect(result).toBeUndefined();
  });

  it("should validate PIN format", async () => {
    const validate = proposalPinField.validate;
    expect(await validate(null, { req: mockReq(), id: undefined })).toBe(true);
    expect(await validate("abc", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");
    expect(await validate("12345", { req: mockReq(), id: undefined })).toBe("PIN must be exactly 4 digits");

    mockPayload.find.mockResolvedValueOnce({ totalDocs: 0 });
    expect(await validate("1234", { req: mockReq(), id: undefined })).toBe(true);
  });

  it("should reject duplicate PIN", async () => {
    const validate = proposalPinField.validate;
    mockPayload.find.mockResolvedValueOnce({
      totalDocs: 1,
      docs: [{ businessName: "Other Proposal" }],
    });
    const result = await validate("5678", { req: mockReq(), id: "my-id" });
    expect(result).toContain("already in use");
    expect(result).toContain("Other Proposal");
  });
});

// ─── convertToClient hook ──────────────────────────────────────
describe("ClientProposals: convertToClient hook", () => {
  let convertToClientHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    expect(hooks.length).toBeGreaterThanOrEqual(1);
    convertToClientHook = hooks[0];
  });

  it("should create a client when convertToClient is toggled on", async () => {
    // find for contracts, then 6x find for re-linking audit collections
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "new-client-id" });
    mockPayload.update.mockResolvedValue({});
    mockPayload.delete.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Test Biz",
      slug: "test-biz",
      websiteUrl: "https://test.com",
      contactName: "John",
      contactEmail: "john@test.com",
      hasPhysicalLocations: false,
      businessType: "services",
      targetLocation: "au:sydney",
      businessGoals: "Grow online",
      competitors: [
        { name: "Comp1", websiteUrl: "https://comp1.com", googleMapsUrl: null, hasMetaAds: true, googleAdScreenshots: [] },
      ],
    };

    const result = await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    expect(result).toBe(doc);

    // Verify client was created
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "clients",
        data: expect.objectContaining({
          name: "Test Biz",
          slug: "test-biz-client",
          websiteUrl: "https://test.com",
          contactName: "John",
          contactEmail: "john@test.com",
          isActive: true,
          businessType: "services",
        }),
      }),
    );

    // Verify proposal is linked to the new client (not deleted)
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        id: "prop-1",
        data: expect.objectContaining({
          client: "new-client-id",
          proposalStatus: "client",
        }),
      }),
    );
  });

  it("should strip competitor-only fields from competitors", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "c1" });
    mockPayload.update.mockResolvedValue({});
    mockPayload.delete.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Test",
      slug: "test",
      competitors: [
        {
          name: "Rival",
          websiteUrl: "https://rival.com",
          googleMapsUrl: "https://maps.google.com/rival",
          hasMetaAds: true,
          googleAdScreenshots: [{ image: "img1" }],
          metaAdScreenshots: [{ image: "img2" }],
        },
      ],
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    const createCall = mockPayload.create.mock.calls[0][0];
    const competitors = createCall.data.competitors;
    expect(competitors[0]).toEqual({
      name: "Rival",
      websiteUrl: "https://rival.com",
      googleMapsUrl: "https://maps.google.com/rival",
    });
    expect(competitors[0].hasMetaAds).toBeUndefined();
    expect(competitors[0].googleAdScreenshots).toBeUndefined();
  });

  it("should flatten keywordCategories into single keywords string", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "c1" });
    mockPayload.update.mockResolvedValue({});
    mockPayload.delete.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Test",
      slug: "test",
      keywordCategories: [
        { categoryName: "Cat A", keywords: "keyword1\nkeyword2" },
        { categoryName: "Cat B", keywords: "keyword3" },
      ],
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    const createCall = mockPayload.create.mock.calls[0][0];
    expect(createCall.data.keywords).toBe("keyword1\nkeyword2\nkeyword3");
  });

  it("should fall back to legacy keywords field", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "c1" });
    mockPayload.update.mockResolvedValue({});
    mockPayload.delete.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Test",
      slug: "test",
      keywords: "legacy keyword list",
      keywordCategories: [],
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    const createCall = mockPayload.create.mock.calls[0][0];
    expect(createCall.data.keywords).toBe("legacy keyword list");
  });

  it("should not trigger when convertToClient was already true", async () => {
    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Test",
      slug: "test",
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: true },
    });

    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("should not trigger when convertToClient is false", async () => {
    const doc = {
      id: "prop-1",
      convertToClient: false,
      businessName: "Test",
      slug: "test",
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("should abort before creating when a client with the target slug already exists", async () => {
    // Pre-flight find returns 1 hit — hook should bail before touching create.
    mockPayload.find.mockResolvedValueOnce({
      totalDocs: 1,
      docs: [{ id: 7, name: "EPG" }],
    });
    mockPayload.update.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "EPG",
      slug: "epg",
    };

    await expect(
      convertToClientHook({
        doc,
        req: mockReq(),
        previousDoc: { convertToClient: false },
      }),
    ).rejects.toThrow(/A client with slug "epg-client" already exists/);

    expect(mockPayload.create).not.toHaveBeenCalled();
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { convertToClient: false },
      }),
    );
  });

  it("should reset toggle and rethrow on error", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockRejectedValueOnce(new Error("Duplicate slug"));
    mockPayload.update.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Test",
      slug: "test",
    };

    await expect(
      convertToClientHook({
        doc,
        req: mockReq(),
        previousDoc: { convertToClient: false },
      }),
    ).rejects.toThrow(/Failed to convert proposal "Test" to client: Duplicate slug/);

    // Toggle should be reset
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { convertToClient: false },
      }),
    );

    // Error should be logged
    expect(mockPayload.logger.error).toHaveBeenCalled();
  });

  it("should map proposal fields to client fields correctly", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "c1" });
    mockPayload.update.mockResolvedValue({});
    mockPayload.delete.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Full Mapping Test",
      slug: "full-mapping",
      websiteUrl: "https://example.com",
      contactName: "Jane Doe",
      contactEmail: "jane@example.com",
      hasPhysicalLocations: true,
      numberOfLocations: 3,
      googleMapsUrls: [{ url: "https://maps.google.com/place1", label: "HQ" }],
      conversionGoal: "lead generation",
      businessType: "ecommerce",
      targetLocation: "au:sydney",
      businessGoals: "Double revenue",
      tam: { root: {} },
      notes: "Custom notes",
      leadConversionRate: 5.5,
      leadToSaleConversionRate: 20,
      averageOrderValue: 150,
      annualPurchaseFrequency: 2.5,
      newCustomersLast12Months: 100,
      // notes field removed — legacyNotes is now hidden and not mapped.
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    const createCall = mockPayload.create.mock.calls[0][0];
    const clientData = createCall.data;

    expect(clientData.name).toBe("Full Mapping Test");
    expect(clientData.slug).toBe("full-mapping-client");
    expect(clientData.websiteUrl).toBe("https://example.com");
    expect(clientData.contactName).toBe("Jane Doe");
    expect(clientData.contactEmail).toBe("jane@example.com");
    expect(clientData.hasPhysicalLocations).toBe(true);
    expect(clientData.numberOfLocations).toBe(3);
    expect(clientData.googleMapsUrls).toEqual([{ url: "https://maps.google.com/place1", label: "HQ" }]);
    expect(clientData.conversionGoal).toBe("lead generation");
    expect(clientData.businessType).toBe("ecommerce");
    expect(clientData.targetLocation).toBe("au:sydney");
    expect(clientData.clientGoals).toBe("Double revenue");
    expect(clientData.tam).toEqual({ root: {} });
    expect(clientData.leadConversionRate).toBe(5.5);
    expect(clientData.leadToSaleConversionRate).toBe(20);
    expect(clientData.averageOrderValue).toBe(150);
    expect(clientData.annualPurchaseFrequency).toBe(2.5);
    expect(clientData.newCustomersLast12Months).toBe(100);
    expect(clientData.isActive).toBe(true);
  });

  // Removed: "should set default notes when notes field is empty" — the convertToClient
  // hook does not write a `notes` field on the Client, and the legacyNotes field on
  // Client is now hidden + auto-migrated to clientNotes. Test no longer reflects reality.

  it("should migrate proposalNotes → client clientNotes on conversion", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "new-client-id" });
    mockPayload.update.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Notes Test",
      slug: "notes-test",
      proposalNotes: [
        {
          id: "note-row-1",
          category: "meeting",
          date: "2026-05-10T10:00:00.000Z",
          author: "Alice",
          content: "Discovery call notes.",
        },
        {
          id: "note-row-2",
          category: "general",
          date: "2026-05-12T10:00:00.000Z",
          author: "Bob",
          content: "Follow-up.",
        },
      ],
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    // Find the update call that targets the new client with clientNotes
    const clientUpdate = mockPayload.update.mock.calls.find(
      ([args]: any[]) =>
        args.collection === "clients" && args.id === "new-client-id",
    );
    expect(clientUpdate).toBeDefined();
    const clientNotes = clientUpdate![0].data.clientNotes;
    expect(clientNotes).toHaveLength(2);
    // Row IDs stripped — Payload generates fresh ones.
    expect(clientNotes[0]).not.toHaveProperty("id");
    expect(clientNotes[0].author).toBe("Alice");
    expect(clientNotes[0].content).toBe("Discovery call notes.");
    expect(clientNotes[1].author).toBe("Bob");
  });

  it("should migrate proposalAccountTimeline → client accountTimeline on conversion", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "new-client-id" });
    mockPayload.update.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Timeline Test",
      slug: "timeline-test",
      proposalAccountTimeline: [
        {
          id: "tl-row-1",
          date: "2026-05-01T00:00:00.000Z",
          serviceArea: "google_ads",
          actionType: "strategy_meeting",
          description: "Initial strategy meeting.",
          addedBy: "Alice",
        },
      ],
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    const clientUpdate = mockPayload.update.mock.calls.find(
      ([args]: any[]) =>
        args.collection === "clients" && args.id === "new-client-id",
    );
    expect(clientUpdate).toBeDefined();
    const timeline = clientUpdate![0].data.accountTimeline;
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).not.toHaveProperty("id");
    expect(timeline[0].actionType).toBe("strategy_meeting");
    expect(timeline[0].description).toBe("Initial strategy meeting.");
    expect(timeline[0].addedBy).toBe("Alice");
  });

  it("should re-point a discovery briefing from the proposal to the new client on conversion", async () => {
    // find() is called for sales-leads check, salesLead lookup, each
    // collectionsToRelink iteration, and finally the discovery briefing
    // re-point. Default to empty, then override the briefing lookup.
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.find.mockImplementation(async (args: any) => {
      if (args.collection === "client-discovery-briefings") {
        return {
          totalDocs: 1,
          docs: [{ id: "briefing-9" }],
        };
      }
      return { totalDocs: 0, docs: [] };
    });
    mockPayload.create.mockResolvedValueOnce({ id: "new-client-id" });
    mockPayload.update.mockResolvedValue({});

    await convertToClientHook({
      doc: {
        id: "prop-1",
        convertToClient: true,
        businessName: "Briefing Repoint",
        slug: "briefing-repoint",
      },
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    const briefingUpdate = mockPayload.update.mock.calls.find(
      ([args]: any[]) =>
        args.collection === "client-discovery-briefings" &&
        args.id === "briefing-9",
    );
    expect(briefingUpdate).toBeDefined();
    expect(briefingUpdate![0].data).toEqual({
      client: "new-client-id",
      clientProposal: null,
    });
  });

  it("should not perform notes/timeline migration when both arrays are empty", async () => {
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.create.mockResolvedValueOnce({ id: "new-client-id" });
    mockPayload.update.mockResolvedValue({});

    const doc = {
      id: "prop-1",
      convertToClient: true,
      businessName: "Empty Test",
      slug: "empty-test",
    };

    await convertToClientHook({
      doc,
      req: mockReq(),
      previousDoc: { convertToClient: false },
    });

    // No update call should target the new client with clientNotes/accountTimeline.
    const clientUpdate = mockPayload.update.mock.calls.find(
      ([args]: any[]) =>
        args.collection === "clients" && args.id === "new-client-id",
    );
    expect(clientUpdate).toBeUndefined();
  });
});

// ─── afterChange: activity logging on create ───────────────────
describe("ClientProposals: afterChange activity logging", () => {
  let activityHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    // The activity logger is the last afterChange hook (registered after
    // convertToClientHook and startAsLeadHook).
    expect(hooks.length).toBeGreaterThanOrEqual(3);
    activityHook = hooks[2];
  });

  it("should log activity when a proposal is created", async () => {
    await activityHook({
      doc: { businessName: "New Prospect", slug: "new-prospect", websiteUrl: "https://new.com" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(mockPayload, {
      type: "proposal_created",
      title: "New proposal: New Prospect",
      description: "https://new.com",
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
      doc: { slug: "fallback-slug", websiteUrl: "" },
      operation: "create",
      req: mockReq(),
    });

    expect(logActivity).toHaveBeenCalledWith(
      mockPayload,
      expect.objectContaining({ title: "New proposal: fallback-slug" }),
    );
  });
});

// ─── afterChange: startAsLead hook ───────────────────────────
describe("ClientProposals: startAsLead hook", () => {
  let startAsLeadHook: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const hooks = getAfterChangeHooks();
    // Hook order: [convertToClientHook, startAsLeadHook, activityHook]
    expect(hooks.length).toBeGreaterThanOrEqual(3);
    startAsLeadHook = hooks[1];
  });

  it("does nothing when startAsLead is false", async () => {
    await startAsLeadHook({
      doc: { id: 1, startAsLead: false, businessName: "Foo" },
      previousDoc: { startAsLead: false },
      req: mockReq(),
    });
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("does nothing when startAsLead was already true (no flip)", async () => {
    await startAsLeadHook({
      doc: { id: 1, startAsLead: true, businessName: "Foo" },
      previousDoc: { startAsLead: true },
      req: mockReq(),
    });
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("creates a new SalesLead at proposal_sent stage when toggled on", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 });
    mockPayload.create.mockResolvedValueOnce({ id: 42 });
    mockPayload.update.mockResolvedValue({});

    await startAsLeadHook({
      doc: {
        id: 7,
        startAsLead: true,
        businessName: "Acme Pty Ltd",
        websiteUrl: "https://acme.example",
        contactName: "Jane Smith",
        contactEmail: "jane@acme.example",
        businessType: "services",
      },
      previousDoc: { startAsLead: false },
      req: mockReq(),
    });

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "sales-leads",
        data: expect.objectContaining({
          businessName: "Acme Pty Ltd",
          websiteUrl: "https://acme.example",
          contactName: "Jane Smith",
          contactEmail: "jane@acme.example",
          businessType: "services",
          stage: "proposal_sent",
          leadSource: "manual",
          proposal: 7,
        }),
      }),
    );

    // The proposal is updated to link the new lead and reset the toggle.
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        id: 7,
        data: expect.objectContaining({
          salesLead: 42,
          startAsLead: false,
        }),
      }),
    );
  });

  it("reuses an existing linked lead instead of creating a duplicate", async () => {
    // Existing lead with id 99 already references this proposal.
    mockPayload.find.mockResolvedValueOnce({
      docs: [{ id: 99 }],
      totalDocs: 1,
    });
    mockPayload.update.mockResolvedValue({});

    await startAsLeadHook({
      doc: { id: 3, startAsLead: true, businessName: "Acme" },
      previousDoc: { startAsLead: false },
      req: mockReq(),
    });

    expect(mockPayload.create).not.toHaveBeenCalled();
    // Still links the lead back onto the proposal.
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        id: 3,
        data: expect.objectContaining({
          salesLead: 99,
          startAsLead: false,
        }),
      }),
    );
  });

  it("maps an unknown businessType to 'other' rather than failing", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 });
    mockPayload.create.mockResolvedValueOnce({ id: 1 });
    mockPayload.update.mockResolvedValue({});

    await startAsLeadHook({
      doc: {
        id: 1,
        startAsLead: true,
        businessName: "Test",
        businessType: "some-unmapped-value",
      },
      previousDoc: { startAsLead: false },
      req: mockReq(),
    });

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessType: "other" }),
      }),
    );
  });

  it("resets the toggle and throws when lead creation fails", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 });
    mockPayload.create.mockRejectedValueOnce(new Error("DB constraint hit"));
    mockPayload.update.mockResolvedValue({});

    await expect(
      startAsLeadHook({
        doc: { id: 5, startAsLead: true, businessName: "Boom" },
        previousDoc: { startAsLead: false },
        req: mockReq(),
      }),
    ).rejects.toThrow(/Failed to create lead/);

    // The toggle is reset so the user can retry.
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "client-proposals",
        id: 5,
        data: { startAsLead: false },
      }),
    );
  });
});
