import { describe, expect, it } from "vitest";
import {
  createAdminMateContractTools,
  missingContractDetails,
  searchClients,
  validateStagedContract,
} from "@/lib/agents/adminmate/contract-tools";
import type { AdminMateClient } from "@/lib/agents/adminmate/tools";

const clients: AdminMateClient[] = [
  { id: "1", name: "Acme Corp", slug: "acme-corp", websiteUrl: "https://acmecorp.com", contactName: "Jane Doe", contactEmail: "jane@acme.com", monthlyRetainer: 2000, isActive: true },
  { id: "2", name: "Berendsen Fluid Power Pty Ltd", slug: "berendsen", isActive: false },
  { id: "3", name: "Zed Plumbing", slug: "zed-plumbing", isActive: true },
];
const templates = [
  { id: "10", label: "Google Ads", contractTitle: "Google Ads Management Agreement", monthlyRetainer: 1500, currency: "AUD" },
  { id: "11", label: "E-Commerce", contractTitle: "E-Commerce SEO Agreement" },
];
const base = { templateId: "10", clientId: "1", contractTitle: "Google Ads - Acme", clientName: "Acme Corp" };
const ctx = { agentName: "AdminMate", agentRunId: "run", context: {}, log: () => {} };

describe("validateStagedContract", () => {
  it("requires a template and exactly one client source", () => {
    expect(() => validateStagedContract({ ...base, templateId: undefined })).toThrow(/templateId/);
    expect(() => validateStagedContract({ ...base, clientId: undefined })).toThrow(/client is required/);
    expect(() => validateStagedContract({ ...base, newClient: { name: "New Co" } })).toThrow(/not both/);
  });

  it("accepts a new client and inherits its contact details", () => {
    const staged = validateStagedContract({
      templateId: 10,
      newClient: { name: "New Co", websiteUrl: "newco.com", contactName: "Sam", contactEmail: "sam@newco.com" },
      contractTitle: "SEO - New Co",
    });
    expect(staged.newClient?.slug).toBe("new-co");
    expect(staged.clientName).toBe("New Co");
    expect(staged.clientContactName).toBe("Sam");
    expect(staged.clientEmail).toBe("sam@newco.com");
    expect(staged.clientWebsite).toBe("https://newco.com");
    expect(staged.contractDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("validates money, dates, emails and currency", () => {
    expect(() => validateStagedContract({ ...base, monthlyRetainer: -5 })).toThrow(/monthlyRetainer/);
    expect(() => validateStagedContract({ ...base, contractStartDate: "1 Oct" })).toThrow(/YYYY-MM-DD/);
    expect(() => validateStagedContract({ ...base, contractStartDate: "2026-10-01", contractEndDate: "2026-09-01" })).toThrow(/contractEndDate/);
    expect(() => validateStagedContract({ ...base, clientEmail: "not-an-email" })).toThrow(/clientEmail/);
    expect(() => validateStagedContract({ ...base, currency: "XYZ" })).toThrow(/currency/);
    const ok = validateStagedContract({ ...base, monthlyRetainer: "2500.50", setupFee: 0, currency: "USD", contractStartDate: "2026-10-01", clientEmail: "a@b.co, c@d.co" });
    expect(ok.monthlyRetainer).toBe(2500.5);
    expect(ok.setupFee).toBe(0);
    expect(ok.currency).toBe("USD");
  });

  it("drops fields outside the allowlist", () => {
    const staged = validateStagedContract({ ...base, status: "completed", signingToken: "abc", isTemplate: true, agencySignature: 5 }) as Record<string, unknown>;
    expect(staged.status).toBeUndefined();
    expect(staged.signingToken).toBeUndefined();
    expect(staged.isTemplate).toBeUndefined();
    expect(staged.agencySignature).toBeUndefined();
  });

  it("validates additionalWork rows", () => {
    expect(() => validateStagedContract({ ...base, additionalWork: [{ projectName: "Site build" }] })).toThrow(/amount is required/);
    const staged = validateStagedContract({ ...base, additionalWork: [{ projectName: "Site build", amount: 4000, countTowardsRetainer: true }] });
    expect(staged.additionalWork).toEqual([{ projectName: "Site build", amount: 4000, countTowardsRetainer: true }]);
  });
});

describe("missingContractDetails", () => {
  it("lists the important details still blank", () => {
    const staged = validateStagedContract({ ...base, monthlyRetainer: 2000, clientEmail: "jane@acme.com" });
    expect(missingContractDetails(staged)).toEqual(["setupFee", "contractStartDate", "clientBusinessAddress", "clientContactName"]);
  });
});

describe("searchClients", () => {
  it("matches active and inactive clients by name and website", () => {
    expect(searchClients("acme", clients).map((c) => c.id)).toEqual(["1"]);
    expect(searchClients("berendsen", clients).map((c) => c.isActive)).toEqual([false]);
    expect(searchClients("acmecorp.com", clients).map((c) => c.id)).toEqual(["1"]);
    expect(searchClients("", clients)).toHaveLength(3);
    expect(searchClients("", clients, "inactive").map((c) => c.id)).toEqual(["2"]);
  });
});

describe("createAdminMateContractTools", () => {
  const tools = createAdminMateContractTools(clients, templates);
  const tool = (name: string) => tools.find((t) => t.name === name)!;

  it("lists templates and finds clients without side effects", async () => {
    const list = await tool("list_contract_templates").execute({}, ctx);
    expect(list.ok).toBe(true);
    expect((list.data as { templates: unknown[] }).templates).toHaveLength(2);
    const find = tool("find_clients");
    const found = await find.execute(find.validate!({ query: "zed" }), ctx);
    expect((found.data as { matches: Array<{ id: string }> }).matches.map((c) => c.id)).toEqual(["3"]);
  });

  it("stages a contract pre-filled from the chosen client and rejects unknown templates", async () => {
    const stage = tool("stage_contract");
    expect(stage.sideEffect).toBeUndefined();
    expect(() => stage.validate!({ ...base, templateId: "99" })).toThrow(/template/i);
    expect(() => stage.validate!({ ...base, clientId: "42" })).toThrow(/client/i);
    const good = await stage.execute(stage.validate!({ ...base, contractStartDate: "2026-10-01" }) as never, ctx);
    expect(good.ok).toBe(true);
    const data = good.data as { staged: Record<string, unknown>; missingDetails: string[] };
    expect(data.staged).toMatchObject({ clientContactName: "Jane Doe", clientEmail: "jane@acme.com", clientWebsite: "https://acmecorp.com", monthlyRetainer: 2000 });
    expect(data.missingDetails).toEqual(["setupFee", "clientBusinessAddress"]);
  });
});
