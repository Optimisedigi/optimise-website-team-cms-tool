"use client";

import React, { useEffect, useState } from "react";
import { formatTokens } from "@/lib/agents/_shared/token-estimate";

interface Usage {
  memoryTokens: number;
  soulTokens: number;
  totalTokens: number;
  pinnedFactCount: number;
  soulAspectCount: number;
}

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

/**
 * Read-only panel on the OptiMate Settings page showing the estimated token
 * cost the agent-memory + agent-soul block adds to EVERY OptiMate prompt
 * (excluding the base system prompt). Fetches the live figures from
 * /api/agent/memory-token-usage so the numbers reflect what's actually injected.
 */
const MemoryTokenUsagePanel: React.FC = () => {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/memory-token-usage");
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load (HTTP ${res.status})`);
          return;
        }
        const json = (await res.json()) as Usage;
        if (!cancelled) setUsage(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const row = (label: string, detail: string, value: number, strong = false) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "8px 0",
        borderTop: strong ? "2px solid var(--theme-elevation-150)" : "1px solid var(--theme-elevation-100)",
      }}
    >
      <div>
        <div style={{ fontWeight: strong ? 700 : 600, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--theme-elevation-500)" }}>{detail}</div>
      </div>
      <div style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 15 : 13, whiteSpace: "nowrap" }}>
        {formatTokens(value)}
      </div>
    </div>
  );

  return (
    <section
      role="region"
      aria-label="Memory and soul prompt cost"
      style={{
        ...panelShellStyle,
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: 6,
        padding: 16,
        marginBottom: "var(--base, 1rem)",
        background: "var(--theme-elevation-50)",
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Memory &amp; soul prompt cost</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--theme-elevation-500)", lineHeight: 1.5 }}>
        Estimated tokens the agent&apos;s pinned memory and soul add to{" "}
        <strong>every OptiMate prompt</strong> (on top of the base system prompt, which isn&apos;t
        counted here). Per-client chats may pin a few extra client-scoped facts. Keep entries
        succinct to keep this low. Estimates are heuristic (≈4 chars/token).
      </p>

      {loading && <div style={{ fontSize: 13, color: "var(--theme-elevation-500)" }}>Loading…</div>}
      {error && <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>}

      {usage && (
        <div>
          {row(
            "OptiMate Soul",
            `${usage.soulAspectCount} aspect${usage.soulAspectCount === 1 ? "" : "s"} (all loaded)`,
            usage.soulTokens,
          )}
          {row(
            "OptiMate Memory (pinned)",
            `${usage.pinnedFactCount} global fact${usage.pinnedFactCount === 1 ? "" : "s"} (importance ≥ 80)`,
            usage.memoryTokens,
          )}
          {row("Total added per prompt", "Soul + pinned memory", usage.totalTokens, true)}
        </div>
      )}
    </section>
  );
};

export default MemoryTokenUsagePanel;
