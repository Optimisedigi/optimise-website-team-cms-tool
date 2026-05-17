import { describe, it, expect, vi } from "vitest";
import { JobPosts } from "@/collections/JobPosts";

// ─── Helpers ───────────────────────────────────────────────────
const mockReq = (overrides: Record<string, any> = {}) => ({
  payload: {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn() },
  },
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

// ─── Field Structure Tests ─────────────────────────────────────
describe("JobPosts Collection", () => {
  it("should have correct slug", () => {
    expect(JobPosts.slug).toBe("job-posts");
  });

  it("should use jobTitle as display field", () => {
    expect(JobPosts.admin?.useAsTitle).toBe("jobTitle");
  });

  it("should be in Admin admin group", () => {
    expect(JobPosts.admin?.group).toBe("Admin");
  });

  it("should have drafts enabled", () => {
    expect(JobPosts.versions).toBeDefined();
    expect(JobPosts.versions).toHaveProperty("drafts", true);
  });

  it("should have required client relationship", () => {
    const clientField = findField(JobPosts.fields, "client");
    expect(clientField).toBeDefined();
    expect(clientField).toHaveProperty("type", "relationship");
    expect(clientField).toHaveProperty("relationTo", "clients");
    expect(clientField).toHaveProperty("required", true);
  });

  it("should have clientConfirmed checkbox defaulting to false", () => {
    const field = findField(JobPosts.fields, "clientConfirmed");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("type", "checkbox");
    expect(field).toHaveProperty("defaultValue", false);
  });

  it("should have required jobTitle field", () => {
    const field = findField(JobPosts.fields, "jobTitle");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("type", "text");
    expect(field).toHaveProperty("required", true);
  });

  it("should have required excerpt with maxLength 200", () => {
    const field = findField(JobPosts.fields, "excerpt");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("type", "textarea");
    expect(field).toHaveProperty("required", true);
    expect(field).toHaveProperty("maxLength", 200);
  });

  it("should have required description richText field", () => {
    const field = findField(JobPosts.fields, "description");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("type", "richText");
    expect(field).toHaveProperty("required", true);
  });

  it("should have required department select with expected options", () => {
    const field = findField(JobPosts.fields, "department");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("type", "select");
    expect(field).toHaveProperty("required", true);
    const values = field.options.map((o: any) => o.value);
    expect(values).toContain("seo");
    expect(values).toContain("paid-media");
    expect(values).toContain("development");
  });

  it("should default employmentType to full-time", () => {
    const field = findField(JobPosts.fields, "employmentType");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("defaultValue", "full-time");
  });

  it("should default location to Remote", () => {
    const field = findField(JobPosts.fields, "location");
    expect(field).toBeDefined();
    expect(field).toHaveProperty("defaultValue", "Remote");
  });

  it("should have status field with draft/published/closed options", () => {
    const field = findField(JobPosts.fields, "status");
    expect(field).toBeDefined();
    const values = field.options.map((o: any) => o.value);
    expect(values).toContain("draft");
    expect(values).toContain("published");
    expect(values).toContain("closed");
  });

  it("should default status to draft", () => {
    const field = findField(JobPosts.fields, "status");
    expect(field).toHaveProperty("defaultValue", "draft");
  });

  it("should have tabs structure", () => {
    const tabsField = JobPosts.fields.find((f) => f.type === "tabs");
    expect(tabsField).toBeDefined();
    if (tabsField && "tabs" in tabsField) {
      const tabLabels = tabsField.tabs.map((t) => t.label);
      expect(tabLabels).toContain("Role Details");
      expect(tabLabels).toContain("Classification");
      expect(tabLabels).toContain("SEO & URL");
      expect(tabLabels).toContain("Publishing");
    }
  });
});

// ─── Access Control Tests ──────────────────────────────────────
describe("JobPosts: access control", () => {
  // The access system is now feature-based, not role-based.
  const adminUser = { id: 1, role: "admin" };
  const userWith = { id: 2, role: "specialist", featureAccess: ["job-posts"] };
  const userWithout = { id: 3, role: "specialist", featureAccess: [] };

  it("should allow read for admin users", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: adminUser }) } as any)).toBe(true);
    }
  });

  it("should allow read for users with the feature", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: userWith }) } as any)).toBe(true);
    }
  });

  it("should deny read for users without the feature", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: userWithout }) } as any)).toBe(false);
    }
  });

  it("should deny read for unauthenticated users", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: null }) } as any)).toBe(false);
    }
  });

  it("should allow create for admin users", () => {
    const access = JobPosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: adminUser }) } as any)).toBe(true);
    }
  });

  it("should allow create for users with the feature", () => {
    const access = JobPosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: userWith }) } as any)).toBe(true);
    }
  });

  it("should deny create for users without the feature", () => {
    const access = JobPosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: userWithout }) } as any)).toBe(false);
    }
  });

  it("should allow update for admin users", () => {
    const access = JobPosts.access?.update;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: adminUser }) } as any)).toBe(true);
    }
  });

  it("should deny update for users without the feature", () => {
    const access = JobPosts.access?.update;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: userWithout }) } as any)).toBe(false);
    }
  });

  it("should allow delete for admin users", () => {
    const access = JobPosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: adminUser }) } as any)).toBe(true);
    }
  });

  it("should deny delete for non-admins", () => {
    const access = JobPosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: userWith }) } as any)).toBe(false);
      expect(access({ req: mockReq({ user: userWithout }) } as any)).toBe(false);
    }
  });

  it("should deny delete for unauthenticated users", () => {
    const access = JobPosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: null }) } as any)).toBe(false);
    }
  });
});

// ─── Admin hidden function ─────────────────────────────────────
describe("JobPosts: admin hidden", () => {
  it("should hide from users without the feature", () => {
    const hidden = JobPosts.admin?.hidden;
    if (typeof hidden === "function") {
      expect(
        hidden({ user: { role: "specialist", featureAccess: [] } } as any),
      ).toBe(true);
    }
  });

  it("should not hide from admin users", () => {
    const hidden = JobPosts.admin?.hidden;
    if (typeof hidden === "function") {
      expect(hidden({ user: { role: "admin" } } as any)).toBe(false);
    }
  });

  it("should not hide from users with the feature", () => {
    const hidden = JobPosts.admin?.hidden;
    if (typeof hidden === "function") {
      expect(
        hidden({ user: { role: "specialist", featureAccess: ["job-posts"] } } as any),
      ).toBe(false);
    }
  });
});
