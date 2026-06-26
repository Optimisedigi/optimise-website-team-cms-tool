"use client";

import React, { useEffect, useState } from "react";
import { formatTokens } from "@/lib/agents/_shared/token-estimate";

const panelShellStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 0,
  isolation: "isolate",
  contain: "layout paint",
  boxSizing: "border-box",
  width: "100%",
  clear: "both",
  overflow: "hidden",
  filter: "none",
  backdropFilter: "none",
};

interface PromptTokenRow {
  label: string;
  description: string;
  sourcePaths?: string[];
  characters: number;
  estimatedTokens: number;
}

interface ToolSchemaTokenRow extends PromptTokenRow {
  toolCount: number;
}

interface SystemPromptTokenUsage {
  checkedAt: string;
  estimator: string;
  note: string;
  prompts: PromptTokenRow[];
  toolSchemas: ToolSchemaTokenRow[];
}

interface AgentTokenGroup {
  heading: string;
  prompts: PromptTokenRow[];
  toolSchemas: ToolSchemaTokenRow[];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU").format(value);
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sourcePathDetails(paths?: string[]) {
  if (!paths || paths.length === 0) return null;
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--theme-elevation-500)" }}>
        Source paths
      </summary>
      <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
        {paths.map((path) => (
          <code key={path} style={{ fontSize: 11, color: "var(--theme-elevation-700)", whiteSpace: "normal" }}>
            {path}
          </code>
        ))}
      </div>
    </details>
  );
}

function tokenRow(row: PromptTokenRow | ToolSchemaTokenRow, meta: string) {
  return (
    <div
      key={row.label}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "baseline",
        padding: "8px 0",
        borderTop: "1px solid var(--theme-elevation-100)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{row.label}</div>
        <div style={{ fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.4 }}>
          {row.description} · {meta}
        </div>
        {sourcePathDetails(row.sourcePaths)}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{formatTokens(row.estimatedTokens)}</div>
    </div>
  );
}

function groupRows(usage: SystemPromptTokenUsage): AgentTokenGroup[] {
  const promptsByLabel = new Map(usage.prompts.map((row) => [row.label, row]));
  const toolsByLabel = new Map(usage.toolSchemas.map((row) => [row.label, row]));

  const getPrompts = (labels: string[]) => labels.map((label) => promptsByLabel.get(label)).filter(Boolean) as PromptTokenRow[];
  const getTools = (labels: string[]) => labels.map((label) => toolsByLabel.get(label)).filter(Boolean) as ToolSchemaTokenRow[];

  return [
    {
      heading: "GoogleMate",
      prompts: getPrompts([
        "GoogleMate normal chat",
        "GoogleMate geo/campaign workflow",
        "GoogleMate scheduled/deck workflow",
        "GoogleMate all guides legacy",
        "GoogleMate portfolio chat",
      ]),
      toolSchemas: getTools([
        "GoogleMate normal chat initial tool schemas",
        "GoogleMate geo/campaign initial tool schemas",
        "GoogleMate scheduled/deck initial tool schemas",
        "GoogleMate full audit tool schemas",
        "GoogleMate portfolio tool schemas",
      ]),
    },
    {
      heading: "InvoiceMate",
      prompts: getPrompts(["InvoiceMate base prompt"]),
      toolSchemas: getTools(["InvoiceMate tool schemas"]),
    },
    {
      heading: "GmailMate",
      prompts: getPrompts(["GmailMate base prompt"]),
      toolSchemas: getTools(["GmailMate tool schemas"]),
    },
  ];
}

const SystemPromptTokenUsagePanel: React.FC = () => {
  const [usage, setUsage] = useState<SystemPromptTokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/system-prompt-token-usage", { credentials: "include" });
        const json = (await res.json()) as SystemPromptTokenUsage & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || `Failed to load (HTTP ${res.status})`);
          setUsage(null);
        } else {
          setUsage(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load system prompt tokens");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      role="region"
      aria-label="Mate prompt and tool token estimate"
      style={{
        ...panelShellStyle,
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
        padding: 16,
        marginTop: "var(--base, 1rem)",
        marginBottom: "var(--base, 1rem)",
        background: "var(--theme-elevation-50)",
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Mate prompt and tool token estimate</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
        Live estimate for GoogleMate, InvoiceMate, and GmailMate system prompts plus enabled tool-schema JSON. Use one prompt row plus the matching tool-schema row for a request. Tool result payloads are separate runtime tokens.
      </p>

      {loading && <div style={{ fontSize: 13, color: "var(--theme-elevation-500)" }}>Loading…</div>}
      {error && <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>}

      {usage && !loading && !error && (
        <div>
          {groupRows(usage).map((group) => (
            <section key={group.heading} style={{ marginTop: group.heading === "GoogleMate" ? 0 : 18 }}>
              <h4 style={{ margin: "0 0 4px", fontSize: 13 }}>{group.heading}</h4>
              <div style={{ display: "grid", gap: 4 }}>
                {group.prompts.map((row) => tokenRow(row, `${formatNumber(row.characters)} chars`))}
                {group.toolSchemas.map((row) =>
                  tokenRow(row, `${formatNumber(row.toolCount)} tools · ${formatNumber(row.characters)} JSON chars`),
                )}
              </div>
            </section>
          ))}

          <div style={{ marginTop: 10, fontSize: 11, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
            Last checked: {formatCheckedAt(usage.checkedAt)}. {usage.note}
          </div>
        </div>
      )}
    </section>
  );
};

export default SystemPromptTokenUsagePanel;
