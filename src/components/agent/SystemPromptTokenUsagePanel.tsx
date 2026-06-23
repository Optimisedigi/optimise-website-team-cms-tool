"use client";

import React, { useEffect, useState } from "react";
import { formatTokens } from "@/lib/agents/_shared/token-estimate";

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

const SOURCE_PATHS = [
  {
    label: "GoogleMate base prompt",
    path: "src/lib/agents/optimate-google-ads/config.ts",
    detail: "Main Google Ads prompt, conditional workflow guides, and prompt-mode logic.",
  },
  {
    label: "GoogleMate shared prompt builder",
    path: "src/lib/agents/_shared/system-prompt-builder.ts",
    detail: "Shared composer used by GoogleMate and GmailMate.",
  },
  {
    label: "GoogleMate tone file",
    path: "src/lib/agents/_shared/tone-of-voice.md",
    detail: "Shared tone/personality text included in the prompt.",
  },
  {
    label: "InvoiceMate base prompt",
    path: "src/lib/agents/optimate-invoice/system-prompt.ts",
    detail: "Lightweight Xero invoice assistant prompt.",
  },
  {
    label: "GmailMate base prompt",
    path: "src/lib/agents/optimate-email/index.ts",
    detail: "Email/Gmail assistant prompt and email tool routing.",
  },
  {
    label: "Stored memory injection",
    path: "src/lib/agents/optimate-google-ads/memory-loader.ts",
    detail: "Loads pinned memory and soul rules injected into Mate prompts.",
  },
  {
    label: "GoogleMate tool registries",
    path: "src/lib/agents/optimate-google-ads/index.ts, src/lib/agents/optimate-google-ads/tools/*.ts",
    detail: "Live audit and portfolio tool definitions, counted as request input schema JSON.",
  },
  {
    label: "InvoiceMate tool registry",
    path: "src/app/(frontend)/api/xero/chat/route.ts",
    detail: "Xero/InvoiceMate tool definitions, counted as request input schema JSON.",
  },
  {
    label: "GmailMate tool registry",
    path: "src/lib/agents/optimate-email/index.ts, src/lib/agents/optimate-email/tools/*.ts",
    detail: "GmailMate email tool definitions, counted as request input schema JSON.",
  },
];

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
    <div
      style={{
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
        padding: 16,
        marginBottom: "var(--base, 1rem)",
        background: "var(--theme-elevation-50)",
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Mate prompt and tool token estimate</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
        Live estimate for GoogleMate, InvoiceMate, and GmailMate base system prompts plus enabled tool-schema JSON. GoogleMate prompt rows are separate request modes;
        tool schemas are additional request input and are separate from tool results returned after tools run. This uses the project heuristic (≈4 chars/token) and does not call or bill any model.
      </p>

      <details
        style={{
          border: "1px solid var(--theme-elevation-100)",
          borderRadius: 6,
          padding: "10px 12px",
          marginBottom: 12,
          background: "var(--theme-bg)",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          Prompt, memory, and tool source paths
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {SOURCE_PATHS.map((item) => (
            <div key={item.label} style={{ fontSize: 12, lineHeight: 1.45 }}>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              <code style={{ display: "block", whiteSpace: "normal", color: "var(--theme-elevation-700)" }}>
                {item.path}
              </code>
              <div style={{ color: "var(--theme-elevation-500)" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </details>

      {loading && <div style={{ fontSize: 13, color: "var(--theme-elevation-500)" }}>Loading…</div>}
      {error && <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>}

      {usage && !loading && !error && (
        <div>
          <section>
            <h4 style={{ margin: "0 0 4px", fontSize: 13 }}>System prompts</h4>
            <div style={{ display: "grid", gap: 8 }}>
              {usage.prompts.map((row) => (
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
                      {row.description} · {formatNumber(row.characters)} chars
                    </div>
                    {row.sourcePaths && row.sourcePaths.length > 0 && (
                      <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
                        {row.sourcePaths.map((path) => (
                          <code key={path} style={{ fontSize: 11, color: "var(--theme-elevation-700)", whiteSpace: "normal" }}>
                            {path}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
                    {formatTokens(row.estimatedTokens)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 4px", fontSize: 13 }}>Tool schema request input</h4>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.45 }}>
              These JSON schemas are sent with each matching request so the model knows the available tool names, descriptions, and parameters. They are extra input tokens, not the same as tool result payloads returned after a tool call.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {usage.toolSchemas.map((row) => (
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
                      {row.description} · {formatNumber(row.toolCount)} tools · {formatNumber(row.characters)} JSON chars
                    </div>
                    {row.sourcePaths && row.sourcePaths.length > 0 && (
                      <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
                        {row.sourcePaths.map((path) => (
                          <code key={path} style={{ fontSize: 11, color: "var(--theme-elevation-700)", whiteSpace: "normal" }}>
                            {path}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
                    {formatTokens(row.estimatedTokens)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ marginTop: 10, fontSize: 11, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
            Last checked: {formatCheckedAt(usage.checkedAt)}. Use one prompt row plus the matching tool-schema row per request; tool result tokens are separate runtime payloads. {usage.note}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemPromptTokenUsagePanel;
