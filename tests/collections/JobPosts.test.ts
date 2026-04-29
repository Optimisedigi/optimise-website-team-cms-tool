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

  it("should be in Content admin group", () => {
    expect(JobPosts.admin?.group).toBe("Content");
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
  it("should allow read for admin users", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq() } as any)).toBe(true);
    }
  });

  it("should allow read for manager users", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { id: 2, role: "manager" } }) } as any)).toBe(true);
    }
  });

  it("should deny read for specialist users", () => {
    const access = JobPosts.access?.read;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { id: 3, role: "specialist" } }) } as any)).toBe(false);
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
      expect(access({ req: mockReq() } as any)).toBe(true);
    }
  });

  it("should allow create for manager users", () => {
    const access = JobPosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { id: 2, role: "manager" } }) } as any)).toBe(true);
    }
  });

  it("should deny create for specialist users", () => {
    const access = JobPosts.access?.create;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { id: 3, role: "specialist" } }) } as any)).toBe(false);
    }
  });

  it("should allow update for admin users", () => {
    const access = JobPosts.access?.update;
    if (typeof access === "function") {
      expect(access({ req: mockReq() } as any)).toBe(true);
    }
  });

  it("should deny update for specialist users", () => {
    const access = JobPosts.access?.update;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { id: 3, role: "specialist" } }) } as any)).toBe(false);
    }
  });

  it("should allow delete for admin users", () => {
    const access = JobPosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq() } as any)).toBe(true);
    }
  });

  it("should deny delete for specialist users", () => {
    const access = JobPosts.access?.delete;
    if (typeof access === "function") {
      expect(access({ req: mockReq({ user: { id: 3, role: "specialist" } }) } as any)).toBe(false);
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
  it("should hide from specialist users", () => {
    const hidden = JobPosts.admin?.hidden;
    if (typeof hidden === "function") {
      expect(hidden({ user: { role: "specialist" } } as any)).toBe(true);
    }
  });

  it("should not hide from admin users", () => {
    const hidden = JobPosts.admin?.hidden;
    if (typeof hidden === "function") {
      expect(hidden({ user: { role: "admin" } } as any)).toBe(false);
    }
  });

  it("should not hide from manager users", () => {
    const hidden = JobPosts.admin?.hidden;
    if (typeof hidden === "function") {
      expect(hidden({ user: { role: "manager" } } as any)).toBe(false);
    }
  });
});

// ─── Slug beforeValidate hook ──────────────────────────────────
describe("JobPosts: slug beforeValidate hook", () => {
  it("should auto-generate slug from jobTitle when no value", () => {
    const slugField = findField(JobPosts.fields, "slug");
    expect(slugField).toBeDefined();
    expect(slugField.hooks?.beforeValidate).toBeDefined();
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: undefined, data: { jobTitle: "Senior SEO Specialist" } });
    expect(result).toBe("senior-seo-specialist");
  });

  it("should preserve existing slug value", () => {
    const slugField = findField(JobPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: "existing-slug", data: { jobTitle: "Ignored Title" } });
    expect(result).toBe("existing-slug");
  });

  it("should strip special characters from generated slug", () => {
    const slugField = findField(JobPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: undefined, data: { jobTitle: "CRO & UX Designer (Remote)" } });
    expect(result).toBe("cro-ux-designer-remote");
  });

  it("should strip leading and trailing hyphens", () => {
    const slugField = findField(JobPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: undefined, data: { jobTitle: "  —Design Lead— " } });
    expect(result).toBe("design-lead");
  });

  it("should return undefined when no value and no jobTitle", () => {
    const slugField = findField(JobPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: undefined, data: {} });
    expect(result).toBeUndefined();
  });

  it("should return undefined when data is missing", () => {
    const slugField = findField(JobPosts.fields, "slug");
    const hook = slugField.hooks.beforeValidate[0];
    const result = hook({ value: undefined, data: undefined });
    expect(result).toBeUndefined();
  });
});
