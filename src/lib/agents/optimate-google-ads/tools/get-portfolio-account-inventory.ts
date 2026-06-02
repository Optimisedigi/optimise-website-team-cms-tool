import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { loadPortfolioAccounts } from "./_portfolio-accounts";

interface InventoryArgs {
  status?: "all" | "active" | "managed" | "unmanaged";
  limit?: number;
  query?: string;
}

const MAX_LIMIT = 200;

export const getPortfolioAccountInventory: CanonicalTool<InventoryArgs> = {
  name: "get_portfolio_account_inventory",
  description:
    "Read-only compact Google Ads account inventory across the portfolio. Args: status ('all'|'active'|'managed'|'unmanaged', default managed), limit (max 200, default 100), query (matches display name or masked customer id). Returns accountRef for audit-backed accounts, clientId, displayName, maskedCustomerId, source, active, managed, lastAuditUpdate, monthlySpend, count, truncated.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["all", "active", "managed", "unmanaged"] },
      limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
      query: { type: "string" },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const status = obj.status === undefined ? undefined : String(obj.status).toLowerCase();
    if (status && status !== "all" && status !== "active" && status !== "managed" && status !== "unmanaged") {
      throw new Error("status must be all, active, managed, or unmanaged");
    }
    const out: InventoryArgs = {};
    if (status) out.status = status as InventoryArgs["status"];
    if (obj.limit !== undefined) {
      const n = Number(obj.limit);
      if (!Number.isFinite(n) || n < 1) throw new Error("limit must be >= 1");
      out.limit = Math.min(MAX_LIMIT, Math.floor(n));
    }
    if (typeof obj.query === "string" && obj.query.trim()) out.query = obj.query.trim();
    return out;
  },
  execute: async (args) => {
    const status = args.status ?? "managed";
    const limit = Math.min(args.limit ?? 100, MAX_LIMIT);
    const query = args.query?.toLowerCase();
    let accounts = await loadPortfolioAccounts();
    accounts = accounts.filter((account) => {
      if (status === "active" && !account.active) return false;
      if (status === "managed" && !account.managed) return false;
      if (status === "unmanaged" && account.managed) return false;
      if (!query) return true;
      return (
        account.displayName.toLowerCase().includes(query) ||
        account.maskedCustomerId.toLowerCase().includes(query)
      );
    });
    const rows = accounts.slice(0, limit).map(({ customerId: _customerId, ...safe }) => safe);
    return {
      ok: true,
      data: {
        status,
        count: rows.length,
        totalMatched: accounts.length,
        truncated: accounts.length > rows.length,
        accounts: rows,
      },
    };
  },
};
