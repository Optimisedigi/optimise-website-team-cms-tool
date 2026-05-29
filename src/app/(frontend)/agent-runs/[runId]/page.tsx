/**
 * Per-run timeline viewer for Optimate agents. Reads activity-log rows tagged
 * with this runId and renders them as a vertical timeline. Diagnostic page —
 * intentionally raw, no Payload chrome, system fonts.
 */

import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";

export const dynamic = "force-dynamic";

const WRAP_STYLE: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f6fa",
};

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  maxWidth: 980,
  margin: "0 auto",
  padding: "32px 20px",
  color: "#222",
};

const HEADER_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

const ROW_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  marginBottom: 10,
};

interface ActivityRow {
  id: number | string;
  type: string;
  title: string;
  description?: string | null;
  agentRunId?: string | null;
  agentName?: string | null;
  step?: number | null;
  toolName?: string | null;
  input?: unknown;
  output?: unknown;
  reasoning?: string | null;
  model?: string | null;
  source?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

function chipColors(type: string): { bg: string; fg: string } {
  switch (type) {
    case "agent_reasoning":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "agent_tool_call":
      return { bg: "#dbeafe", fg: "#1e40af" };
    case "agent_final_output":
      return { bg: "#dcfce7", fg: "#166534" };
    case "agent_error":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "agent_auth_event":
      return { bg: "#ede9fe", fg: "#5b21b6" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

function sourceBadge(source: string | null | undefined): { bg: string; fg: string; label: string } {
  if (source === "oauth") return { bg: "#dcfce7", fg: "#166534", label: "oauth" };
  if (source === "api-key") return { bg: "#dbeafe", fg: "#1e40af", label: "api-key" };
  if (source === "api-key-fallback")
    return { bg: "#fef3c7", fg: "#92400e", label: "api-key (fallback)" };
  return { bg: "#f3f4f6", fg: "#374151", label: source || "unknown" };
}

function fmtJson(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    // Tool outputs are JSON-stringified before they hit the log; pretty-print
    // when possible so the timeline doesn't show one giant escaped blob.
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function fmtDurationMs(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    redirect(`/admin/login?redirect=${encodeURIComponent(`/agent-runs/${runId}`)}`);
  }

  const result = await payload.find({
    collection: "activity-log",
    where: { agentRunId: { equals: runId } } as any,
    limit: 500,
    sort: "createdAt",
    overrideAccess: true,
  });

  const rows = (result.docs as unknown as ActivityRow[]).slice().sort((a, b) => {
    const aStep = a.step ?? 0;
    const bStep = b.step ?? 0;
    if (aStep !== bStep) return aStep - bStep;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  if (rows.length === 0) {
    return (
      <div style={WRAP_STYLE}>
      <div style={PAGE_STYLE}>
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Agent run</h1>
        <p style={{ color: "#666" }}>
          No activity-log rows found for run <code>{runId}</code>.
        </p>
        <p style={{ marginTop: 24 }}>
          <a href="/agent-approvals" style={{ color: "#2563eb" }}>
            ← Back to approvals
          </a>
        </p>
      </div>
      </div>
    );
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const totalDurationMs = rows.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
  const turns = rows.reduce((max, r) => Math.max(max, r.step ?? 0), 0);
  const finalRow = rows.find((r) => r.type === "agent_final_output");
  const modelOnFinal = finalRow?.model ?? last.model ?? "unknown";
  const sourceOnFinal = finalRow?.source ?? last.source ?? null;
  const src = sourceBadge(sourceOnFinal);

  return (
    <div style={WRAP_STYLE}>
    <div style={PAGE_STYLE}>
      <div style={{ marginBottom: 12 }}>
        <a href="/agent-approvals" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}>
          ← Approvals
        </a>
      </div>
      <h1 style={{ fontSize: 22, marginTop: 0, marginBottom: 4 }}>Agent run timeline</h1>
      <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
        Run id <code>{runId}</code>
      </p>

      <div style={HEADER_STYLE}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
          <Stat label="Agent" value={first.agentName ?? "(unknown)"} />
          <Stat label="Model (final)" value={modelOnFinal} />
          <Stat
            label="Source"
            value={
              <span
                style={{
                  background: src.bg,
                  color: src.fg,
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {src.label}
              </span>
            }
          />
          <Stat label="Turns" value={String(turns)} />
          <Stat label="Steps logged" value={String(rows.length)} />
          <Stat label="Total tool/LLM time" value={fmtDurationMs(totalDurationMs)} />
          <Stat label="Started" value={new Date(first.createdAt).toLocaleString()} />
        </div>
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => {
          const chip = chipColors(row.type);
          return (
            <li key={String(row.id)} style={ROW_STYLE}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span
                  style={{
                    background: "#1f2937",
                    color: "#fff",
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  step {row.step ?? "-"}
                </span>
                <span
                  style={{
                    background: chip.bg,
                    color: chip.fg,
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  {row.type.replace("agent_", "")}
                </span>
                {row.toolName && (
                  <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#1f2937" }}>
                    {row.toolName}
                  </span>
                )}
                {row.model && (
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{row.model}</span>
                )}
                {row.durationMs != null && (
                  <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>
                    {fmtDurationMs(row.durationMs)}
                  </span>
                )}
              </div>
              {row.title && row.type !== "agent_reasoning" && (
                <div style={{ fontSize: 13, marginBottom: 6 }}>{row.title}</div>
              )}
              {row.description && (
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>{row.description}</div>
              )}
              {row.input != null && Object.keys(row.input as object).length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 11, color: "#6b7280", cursor: "pointer" }}>Input</summary>
                  <pre style={preStyle}>{fmtJson(row.input)}</pre>
                </details>
              )}
              {row.output != null && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 11, color: "#6b7280", cursor: "pointer" }}>Output</summary>
                  <pre style={preStyle}>{fmtJson(row.output)}</pre>
                </details>
              )}
              {row.reasoning && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 11, color: "#6b7280", cursor: "pointer" }}>
                    Reasoning (hidden by default)
                  </summary>
                  <pre style={{ ...preStyle, whiteSpace: "pre-wrap" }}>{row.reasoning}</pre>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
    </div>
  );
}

const preStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  padding: 10,
  borderRadius: 6,
  fontSize: 11,
  lineHeight: 1.5,
  margin: "6px 0 0",
  overflow: "auto",
  maxHeight: 320,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{value}</div>
    </div>
  );
}
