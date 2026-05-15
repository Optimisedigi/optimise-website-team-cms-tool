import { describe, it, expect, vi } from "vitest";
import { InvoiceStatementDrafts } from "@/collections/InvoiceStatementDrafts";

describe("InvoiceStatementDrafts collection", () => {
  it("uses the expected slug + Finance admin group", () => {
    expect(InvoiceStatementDrafts.slug).toBe("invoice-statement-drafts");
    expect(InvoiceStatementDrafts.admin?.group).toBe("Finance");
    expect(InvoiceStatementDrafts.admin?.useAsTitle).toBe("contactName");
  });

  it("status field offers the five expected lifecycle values", () => {
    const status = (InvoiceStatementDrafts.fields ?? []).find(
      (f) => "name" in f && f.name === "status",
    ) as { options?: Array<{ value: string }> } | undefined;
    expect(status).toBeDefined();
    const values = (status?.options ?? []).map((o) => o.value);
    expect(values).toEqual([
      "pending",
      "approved",
      "rejected",
      "failed",
      "expired",
    ]);
  });

  it("declares xeroContactId as indexed + required (upsert key)", () => {
    const field = (InvoiceStatementDrafts.fields ?? []).find(
      (f) => "name" in f && f.name === "xeroContactId",
    ) as { required?: boolean; index?: boolean } | undefined;
    expect(field?.required).toBe(true);
    expect(field?.index).toBe(true);
  });

  it("declares the ccList field for audit", () => {
    const field = (InvoiceStatementDrafts.fields ?? []).find(
      (f) => "name" in f && f.name === "ccList",
    );
    expect(field).toBeDefined();
  });
});

describe("InvoiceStatementDrafts beforeChange hook (idempotency)", () => {
  function getHook() {
    const hooks = InvoiceStatementDrafts.hooks?.beforeChange ?? [];
    expect(hooks.length).toBeGreaterThan(0);
    return hooks[0]!;
  }

  it("allows create when no existing pending row exists", async () => {
    const hook = getHook();
    const find = vi.fn().mockResolvedValue({ docs: [] });
    const data = {
      status: "pending",
      xeroContactId: "xero-1",
      contactName: "Acme",
    };
    const out = await hook({
      data,
      operation: "create",
      req: { payload: { find } },
    } as any);
    expect(out).toEqual(data);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("throws when an existing pending row blocks the create", async () => {
    const hook = getHook();
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 12 }] });
    await expect(
      hook({
        data: {
          status: "pending",
          xeroContactId: "xero-1",
        },
        operation: "create",
        req: { payload: { find } },
      } as any),
    ).rejects.toThrow(/pending invoice-statement draft already exists/i);
  });

  it("skips the hook for non-pending creates", async () => {
    const hook = getHook();
    const find = vi.fn();
    const data = { status: "approved", xeroContactId: "xero-1" };
    await hook({
      data,
      operation: "create",
      req: { payload: { find } },
    } as any);
    expect(find).not.toHaveBeenCalled();
  });

  it("skips the hook on update operations", async () => {
    const hook = getHook();
    const find = vi.fn();
    const data = { status: "pending", xeroContactId: "xero-1" };
    await hook({
      data,
      operation: "update",
      req: { payload: { find } },
    } as any);
    expect(find).not.toHaveBeenCalled();
  });
});
