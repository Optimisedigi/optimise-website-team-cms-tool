import { describe, it, expect } from "vitest";
import { SiteHealthReports } from "@/collections/SiteHealthReports";

// ─── Helpers ────────────────────────────────────────────────────────────────
// Recursively find a named field anywhere in a Payload field tree, descending
// through layout wrappers (tabs/row/collapsible/group) that don't carry a name.
function findField(fields: any[], name: string): any {
  for (const f of fields ?? []) {
    if ("name" in f && f.name === name) return f;
    if (Array.isArray(f.fields)) {
      const inner = findField(f.fields, name);
      if (inner) return inner;
    }
    if (f.type === "tabs" && Array.isArray(f.tabs)) {
      for (const t of f.tabs) {
        const inner = findField(t.fields ?? [], name);
        if (inner) return inner;
      }
    }
  }
  return undefined;
}

// Find the gscData group regardless of where it sits in the tab tree.
function findGscDataGroup(): any {
  return findField(SiteHealthReports.fields as any[], "gscData");
}

describe("SiteHealthReports — GSC indexing-coverage fields", () => {
  it("has a gscData group", () => {
    const gsc = findGscDataGroup();
    expect(gsc).toBeDefined();
    expect(gsc.type).toBe("group");
    expect(Array.isArray(gsc.fields)).toBe(true);
  });

  it("persists the per-reason 'why pages aren't indexed' rollup as JSON", () => {
    const gsc = findGscDataGroup();
    const reasons = findField(gsc.fields, "reasonsBreakdown");
    expect(reasons).toBeDefined();
    expect(reasons.type).toBe("json");
  });

  it("persists inspection coverage metadata as JSON", () => {
    const gsc = findGscDataGroup();
    const meta = findField(gsc.fields, "inspectionMeta");
    expect(meta).toBeDefined();
    expect(meta.type).toBe("json");
  });

  it("retains the existing indexing fields", () => {
    const gsc = findGscDataGroup();
    expect(findField(gsc.fields, "indexingIssues")?.type).toBe("json");
    expect(findField(gsc.fields, "canonicalMismatches")?.type).toBe("json");
    expect(findField(gsc.fields, "indexedPages")?.type).toBe("number");
    expect(findField(gsc.fields, "notIndexedPages")?.type).toBe("number");
  });
});
