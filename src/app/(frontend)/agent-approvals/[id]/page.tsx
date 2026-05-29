/**
 * Approval review page. Two-column layout: left shows the rendered preview
 * (clientHtml in iframe srcdoc, internalMarkdown rendered with a small helper),
 * right shows the structured payload, run link, agent + client metadata. Action
 * buttons live in the client `Actions` component.
 */

import { headers as nextHeaders } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import ApprovalActions from "./Actions";
import { isAdmin } from "@/lib/access";

export const dynamic = "force-dynamic";

const CMS_BLUE = "#0b5394";
const CMS_GOLD = "#f2b705";

const WRAP_STYLE: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6fa",
};

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-body, system-ui, -apple-system, sans-serif)",
  maxWidth: 1220,
  margin: "0 auto",
  padding: "24px 24px 40px",
  color: "var(--theme-elevation-900, #111827)",
};

const CARD: React.CSSProperties = {
  background: "var(--theme-elevation-0, #fff)",
  border: "1px solid var(--theme-elevation-150, #dfe3ea)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

interface ApprovalDoc {
  id: number;
  title: string;
  agentName: string;
  agentRunId: string;
  proposalType: string;
  status: string;
  proposalPayload: Record<string, unknown> | null;
  rendered?: { clientHtml?: string | null; internalMarkdown?: string | null } | null;
  client?: { id: number; name?: string | null } | number | null;
  reviewedBy?: { id: number; email?: string | null } | number | null;
  reviewedAt?: string | null;
  appliedAt?: string | null;
  applyError?: string | null;
  createdAt: string;
}

function statusColors(s: string): { bg: string; fg: string } {
  switch (s) {
    case "pending":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "approved":
      return { bg: "#dbeafe", fg: "#1e40af" };
    case "rejected":
    case "failed":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "applied":
      return { bg: "#dcfce7", fg: "#166534" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

/**
 * Tiny markdown renderer for the internal preview. Mirrors the GoogleAdsChat
 * helper's behaviour for headers, **bold**, bullet lists, and pipe tables.
 */
function renderInternalMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inline = (line: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1]) parts.push(<strong key={`b-${key++}`}>{m[1]}</strong>);
      else if (m[2]) parts.push(<code key={`c-${key++}`} style={inlineCode}>{m[2]}</code>);
      last = re.lastIndex;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts.length > 0 ? parts : [line];
  };

  while (i < lines.length) {
    const line = lines[i];
    // Pipe table
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*-{2,}/.test(lines[i + 1].replace(/\|/g, ""))) {
      const header = line.split("|").map((s) => s.trim()).filter((_, idx, arr) => idx > 0 || arr[0] !== "");
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").map((s) => s.trim());
        if (cells[0] === "") cells.shift();
        if (cells[cells.length - 1] === "") cells.pop();
        body.push(cells);
        i++;
      }
      out.push(
        <table key={`tbl-${key++}`} style={tableStyle}>
          <thead>
            <tr>{header.map((h, idx) => <th key={idx} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => <td key={cIdx} style={tdStyle}>{inline(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    if (line.startsWith("# ")) {
      out.push(<h2 key={`h-${key++}`} style={{ fontSize: 16, marginTop: 16, marginBottom: 6 }}>{line.slice(2)}</h2>);
    } else if (line.startsWith("## ")) {
      out.push(<h3 key={`h-${key++}`} style={{ fontSize: 14, marginTop: 12, marginBottom: 4 }}>{line.slice(3)}</h3>);
    } else if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={`ul-${key++}`} style={{ margin: "6px 0", paddingLeft: 20 }}>
          {items.map((it, idx) => <li key={idx}>{inline(it)}</li>)}
        </ul>,
      );
      continue;
    } else if (line.trim() === "") {
      out.push(<div key={`br-${key++}`} style={{ height: 6 }} />);
    } else {
      out.push(<p key={`p-${key++}`} style={{ margin: "4px 0" }}>{inline(line)}</p>);
    }
    i++;
  }
  return out;
}

const tableStyle: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 12,
  marginTop: 8,
  marginBottom: 8,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  background: "#f9fafb",
  padding: "6px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#6b7280",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #f3f4f6",
};
const inlineCode: React.CSSProperties = {
  padding: "1px 5px",
  background: "#f3f4f6",
  borderRadius: 3,
  fontSize: "0.9em",
  fontFamily: "ui-monospace, monospace",
};

export default async function ApprovalReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    redirect(`/admin/login?redirect=${encodeURIComponent(`/agent-approvals/${id}`)}`);
  }

  let doc: ApprovalDoc;
  try {
    doc = (await payload.findByID({
      collection: "agent-approval-queue" as any,
      id: numericId,
      depth: 1,
      overrideAccess: true,
    })) as unknown as ApprovalDoc;
  } catch {
    notFound();
  }

  const sc = statusColors(doc.status);
  const internalMd = doc.rendered?.internalMarkdown ?? "";
  const clientHtml = doc.rendered?.clientHtml ?? "";
  const clientLabel = renderClient(doc.client);
  const reviewer = renderReviewer(doc.reviewedBy);

  return (
    <div style={WRAP_STYLE}>
    <div style={PAGE_STYLE}>
      <div style={{ marginBottom: 12 }}>
        <a href="/agent-approvals" style={{ fontSize: 12, color: CMS_BLUE, textDecoration: "none", fontWeight: 700 }}>
          ← Approvals
        </a>
      </div>
      <div
        style={{
          background: `linear-gradient(135deg, ${CMS_BLUE}, #083763)`,
          color: "#fff",
          borderRadius: 16,
          padding: 18,
          marginBottom: 12,
          boxShadow: "0 14px 40px rgba(11, 83, 148, 0.22)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "start",
          gap: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: CMS_GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }}>
            Agent approval review
          </div>
          <h1 style={{ fontSize: 24, margin: "4px 0 6px", lineHeight: 1.15 }}>{doc.title}</h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
            <code>{doc.agentName}</code> &middot; <code>{doc.proposalType}</code> &middot; created {new Date(doc.createdAt).toLocaleString()}
          </div>
          {(doc.applyError || !isAdmin(user) || doc.status === "approved") && (
            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>
              {!isAdmin(user) && <div>You can review and reject this proposal. Approving or applying requires an admin role.</div>}
              {doc.status === "approved" && <div>Apply marks the proposal as applied after the operator runs the change manually.</div>}
              {doc.applyError && <div style={{ color: "#fecaca" }}><strong>Apply error:</strong> {doc.applyError}</div>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <span
            style={{
              background: sc.bg,
              color: sc.fg,
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              whiteSpace: "nowrap",
            }}
          >
            {doc.status}
          </span>
          <div style={{ background: "rgba(255,255,255,0.98)", borderRadius: 10, padding: 8, minWidth: 320 }}>
            <ApprovalActions approvalId={doc.id} status={doc.status} canApproveOrApply={isAdmin(user)} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 14, alignItems: "flex-start" }}>
        <div>
          <div style={CARD}>
            <h2 style={{ fontSize: 13, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5, color: CMS_BLUE }}>
              Internal review
            </h2>
            {internalMd ? renderInternalMarkdown(internalMd) : <p style={{ color: "#9ca3af", fontSize: 13 }}>No internal markdown rendered.</p>}
          </div>
          <div style={CARD}>
            <h2 style={{ fontSize: 13, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5, color: CMS_BLUE }}>
              Client preview
            </h2>
            {clientHtml ? (
              <iframe
                srcDoc={clientHtml}
                style={{ width: "100%", minHeight: 320, border: "1px solid var(--theme-elevation-150, #dfe3ea)", borderRadius: 10, background: "#fff" }}
                sandbox=""
                title="Client preview"
              />
            ) : (
              <p style={{ color: "#9ca3af", fontSize: 13 }}>No client HTML rendered.</p>
            )}
          </div>
        </div>

        <div>
          <div style={CARD}>
            <h2 style={{ fontSize: 13, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5, color: CMS_BLUE }}>
              Metadata
            </h2>
            <dl style={{ fontSize: 13, margin: 0 }}>
              <Meta label="Approval ID" value={`#${doc.id}`} />
              <Meta label="Client" value={clientLabel} />
              <Meta label="Run" value={
                <a href={`/agent-runs/${doc.agentRunId}`} style={{ color: CMS_BLUE, fontWeight: 700 }}>
                  {doc.agentRunId} →
                </a>
              } />
              <Meta label="Reviewed by" value={reviewer} />
              <Meta label="Reviewed at" value={doc.reviewedAt ? new Date(doc.reviewedAt).toLocaleString() : "—"} />
              <Meta label="Applied at" value={doc.appliedAt ? new Date(doc.appliedAt).toLocaleString() : "—"} />
            </dl>
          </div>
          <div style={CARD}>
            <h2 style={{ fontSize: 13, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5, color: CMS_BLUE }}>
              Structured payload
            </h2>
            <pre
              style={{
                background: "#071d33",
                color: "#e2e8f0",
                padding: 10,
                borderRadius: 10,
                fontSize: 10,
                lineHeight: 1.35,
                margin: 0,
                overflow: "auto",
                maxHeight: 360,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            >
              {JSON.stringify(doc.proposalPayload ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

function renderClient(client: ApprovalDoc["client"]): React.ReactNode {
  if (!client) return "—";
  if (typeof client === "number") return `#${client}`;
  return (
    <a href={`/admin/collections/clients/${client.id}`} style={{ color: CMS_BLUE, fontWeight: 700 }}>
      {client.name ?? `#${client.id}`}
    </a>
  );
}

function renderReviewer(reviewer: ApprovalDoc["reviewedBy"]): React.ReactNode {
  if (!reviewer) return "—";
  if (typeof reviewer === "number") return `#${reviewer}`;
  return reviewer.email ?? `#${reviewer.id}`;
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--theme-elevation-100, #eef1f5)" }}>
      <dt style={{ color: "#6b7280", fontSize: 12 }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </div>
  );
}
