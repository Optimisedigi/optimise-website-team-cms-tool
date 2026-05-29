/**
 * Agent approvals list. Server component. Defaults to pending; query string
 * supports filtering by status, agentName, and clientId.
 */

import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";

export const dynamic = "force-dynamic";

const CMS_BLUE = "#0b5394";
const CMS_GOLD = "#f2b705";

const WRAP_STYLE: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6fa",
};

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-body, system-ui, -apple-system, sans-serif)",
  maxWidth: 1180,
  margin: "0 auto",
  padding: "24px 24px 40px",
  color: "var(--theme-elevation-900, #111827)",
};

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "var(--theme-elevation-0, #fff)",
  border: "1px solid var(--theme-elevation-150, #dfe3ea)",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "var(--theme-elevation-600, #4b5563)",
  background: "var(--theme-elevation-50, #f8fafc)",
  padding: "11px 14px",
  borderBottom: "1px solid var(--theme-elevation-150, #dfe3ea)",
};

const TD: React.CSSProperties = {
  fontSize: 13,
  padding: "12px 14px",
  borderBottom: "1px solid var(--theme-elevation-100, #eef1f5)",
  verticalAlign: "top",
};

const STATUSES = ["pending", "approved", "rejected", "applied", "failed"] as const;

function statusColors(s: string): { bg: string; fg: string } {
  switch (s) {
    case "pending":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "approved":
      return { bg: "#dbeafe", fg: "#1e40af" };
    case "rejected":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "applied":
      return { bg: "#dcfce7", fg: "#166534" };
    case "failed":
      return { bg: "#fee2e2", fg: "#991b1b" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

interface ApprovalListRow {
  id: number;
  title: string;
  agentName: string;
  proposalType: string;
  status: string;
  createdAt: string;
  client?: { id: number; name?: string | null } | number | null;
}

export default async function AgentApprovalsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = (typeof params.status === "string" ? params.status : "pending") as
    | (typeof STATUSES)[number]
    | "all";
  const agentName = typeof params.agentName === "string" ? params.agentName : "";
  const clientFilter = typeof params.client === "string" ? params.client : "";

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    redirect(`/admin/login?redirect=/agent-approvals`);
  }

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = { equals: status };
  if (agentName) where.agentName = { equals: agentName };
  if (clientFilter) where.client = { equals: clientFilter };

  const result = await payload.find({
    collection: "agent-approval-queue" as any,
    where: where as any,
    sort: "-createdAt",
    limit: 50,
    depth: 1,
    overrideAccess: true,
  });

  const rows = result.docs as unknown as ApprovalListRow[];

  return (
    <div style={WRAP_STYLE}>
    <div style={PAGE_STYLE}>
      <div
        style={{
          background: `linear-gradient(135deg, ${CMS_BLUE}, #083763)`,
          color: "#fff",
          borderRadius: 16,
          padding: 22,
          marginBottom: 18,
          boxShadow: "0 14px 40px rgba(11, 83, 148, 0.22)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ color: CMS_GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }}>
              Optimise Digital CMS
            </div>
            <h1 style={{ fontSize: 28, margin: "4px 0 6px" }}>Agent approvals</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", margin: 0 }}>
              Review OptiMate recommendations before anything changes in a client account.
            </p>
          </div>
          <a href="/agent-auth" style={{ fontSize: 12, color: "#fff", textDecoration: "none", fontWeight: 700 }}>
            Agent auth →
          </a>
        </div>
      </div>

      <form
        method="get"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          background: "var(--theme-elevation-0, #fff)",
          border: "1px solid var(--theme-elevation-150, #dfe3ea)",
          borderRadius: 12,
          padding: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label style={labelStyle}>
          <span style={{ marginRight: 4 }}>Status</span>
          <select name="status" defaultValue={status} style={inputStyle}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="applied">Applied</option>
            <option value="failed">Failed</option>
            <option value="all">All</option>
          </select>
        </label>
        <label style={labelStyle}>
          <span style={{ marginRight: 4 }}>Agent</span>
          <input
            type="text"
            name="agentName"
            defaultValue={agentName}
            placeholder="optimate-google-ads"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ marginRight: 4 }}>Client ID</span>
          <input
            type="text"
            name="client"
            defaultValue={clientFilter}
            placeholder=""
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <button type="submit" style={buttonStyle}>
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <div
          style={{
            background: "var(--theme-elevation-0, #fff)",
            border: "1px solid var(--theme-elevation-150, #dfe3ea)",
            borderRadius: 12,
            padding: 24,
            color: "#6b7280",
            fontSize: 13,
          }}
        >
          No approvals found for the current filter.
        </div>
      ) : (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH}>Title</th>
              <th style={TH}>Agent</th>
              <th style={TH}>Type</th>
              <th style={TH}>Client</th>
              <th style={TH}>Status</th>
              <th style={TH}>Created</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sc = statusColors(r.status);
              const clientLabel = renderClient(r.client);
              return (
                <tr key={r.id}>
                  <td style={TD}>{r.title}</td>
                  <td style={{ ...TD, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {r.agentName}
                  </td>
                  <td style={{ ...TD, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {r.proposalType}
                  </td>
                  <td style={TD}>{clientLabel}</td>
                  <td style={TD}>
                    <span
                      style={{
                        background: sc.bg,
                        color: sc.fg,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ ...TD, color: "#6b7280", fontSize: 12 }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={TD}>
                    <a
                      href={`/agent-approvals/${r.id}`}
                      style={{ color: CMS_BLUE, fontSize: 12, textDecoration: "none", fontWeight: 700 }}
                    >
                      Open →
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
        Showing {rows.length} of {result.totalDocs ?? rows.length}
      </p>
    </div>
    </div>
  );
}

function renderClient(client: ApprovalListRow["client"]): string {
  if (!client) return "—";
  if (typeof client === "number") return `#${client}`;
  return client.name ?? `#${client.id}`;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--theme-elevation-700, #374151)",
  fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid var(--theme-elevation-200, #d1d5db)",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--theme-elevation-0, #fff)",
};
const buttonStyle: React.CSSProperties = {
  padding: "7px 14px",
  background: CMS_BLUE,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
