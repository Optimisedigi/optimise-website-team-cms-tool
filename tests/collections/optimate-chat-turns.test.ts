import { describe, it, expect } from "vitest";
import { OptimateChatTurns } from "@/collections/OptimateChatTurns";

function findField(fields: any[], name: string): any {
  for (const f of fields) {
    if ("name" in f && f.name === name) return f;
  }
  return undefined;
}

describe("OptimateChatTurns collection", () => {
  it("uses the expected slug", () => {
    expect(OptimateChatTurns.slug).toBe("optimate-chat-turns");
  });

  it("is hidden from the admin sidebar", () => {
    expect(OptimateChatTurns.admin?.hidden).toBe(true);
  });

  it("uses preview as the admin title", () => {
    expect(OptimateChatTurns.admin?.useAsTitle).toBe("preview");
  });

  it("declares required sessionId / mode / user / role / content fields and nullable audit", () => {
    for (const name of ["sessionId", "mode", "user", "role", "content"]) {
      const f = findField(OptimateChatTurns.fields ?? [], name);
      expect(f, `missing field: ${name}`).toBeDefined();
      expect(f.required).toBe(true);
    }
    const audit = findField(OptimateChatTurns.fields ?? [], "audit");
    expect(audit, "missing field: audit").toBeDefined();
    expect(audit.required).toBe(false);
  });

  it("audit and user relations index by id", () => {
    const audit = findField(OptimateChatTurns.fields ?? [], "audit");
    expect(audit.type).toBe("relationship");
    expect(audit.relationTo).toBe("google-ads-audits");
    expect(audit.index).toBe(true);

    const user = findField(OptimateChatTurns.fields ?? [], "user");
    expect(user.type).toBe("relationship");
    expect(user.relationTo).toBe("users");
    expect(user.index).toBe(true);
  });

  it("role select offers user + assistant", () => {
    const role = findField(OptimateChatTurns.fields ?? [], "role");
    const values = role.options.map((o: any) => o.value);
    expect(values).toEqual(expect.arrayContaining(["user", "assistant"]));
  });

  it("denies updates entirely", () => {
    expect(OptimateChatTurns.access?.update).toBeDefined();
    // Implemented as `update: false` (a literal), Payload normalises to a
    // function returning false. Either form is fine — check the resolved
    // result.
    const res =
      typeof OptimateChatTurns.access!.update === "function"
        ? (OptimateChatTurns.access!.update as any)({ req: { user: { role: "admin" } } })
        : OptimateChatTurns.access!.update;
    expect(res).toBe(false);
  });

  it("non-admin read filters by their own user id", () => {
    const read = OptimateChatTurns.access?.read as any;
    const result = read({ req: { user: { id: 42, role: "manager" } } });
    expect(result).toEqual({ user: { equals: 42 } });
  });

  it("admin read returns true (no filter)", () => {
    const read = OptimateChatTurns.access?.read as any;
    const result = read({ req: { user: { id: 1, role: "admin" } } });
    expect(result).toBe(true);
  });

  it("anonymous read is denied", () => {
    const read = OptimateChatTurns.access?.read as any;
    expect(read({ req: { user: null } })).toBe(false);
  });

  describe("preview hook", () => {
    const hook = (OptimateChatTurns.hooks?.beforeChange ?? [])[0] as
      | ((args: { data: Record<string, unknown> }) => Record<string, unknown>)
      | undefined;

    it("trims preview to 80 chars on long content", () => {
      expect(hook).toBeDefined();
      const long = "a".repeat(200);
      const out = hook!({ data: { content: long } });
      expect((out.preview as string).length).toBe(80);
    });

    it("uses the full content when shorter than 80 chars", () => {
      const out = hook!({ data: { content: "hello world" } });
      expect(out.preview).toBe("hello world");
    });

    it("ignores missing content", () => {
      const out = hook!({ data: {} });
      expect(out.preview).toBeUndefined();
    });
  });
});
