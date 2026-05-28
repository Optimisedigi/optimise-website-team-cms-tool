"use client";

import React from "react";
import { useFormFields } from "@payloadcms/ui";
import { estimateTokens, formatTokens } from "@/lib/agents/_shared/token-estimate";

/**
 * Read-only UI field that shows a live ≈token estimate for the row's `content`
 * field, recalculating as the user types. Mounted on AgentMemory and AgentSoul
 * (both have a `content` textarea). Heuristic only (~4 chars/token) — labelled
 * "≈" so it's never mistaken for an exact count.
 *
 * Memory/soul entries are injected verbatim into every OptiMate prompt, so this
 * nudges authors to keep each entry succinct.
 */
const MemoryTokenCounterField: React.FC = () => {
  // Subscribe to the live `content` value so the estimate updates on each keystroke.
  const content = useFormFields(([fields]) => {
    const f = fields?.content as { value?: unknown } | undefined;
    return typeof f?.value === "string" ? f.value : "";
  });

  const tokens = estimateTokens(content);
  const over = tokens > 60; // soft nudge: a single entry rarely needs > ~60 tokens

  return (
    <div style={{ marginBottom: "var(--base, 1rem)" }}>
      <div style={{ fontSize: 12, color: "var(--theme-elevation-500)", marginBottom: 4 }}>
        Prompt cost (loaded every turn)
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: over ? "#b45309" : "var(--theme-elevation-700)",
          background: over ? "#fffbeb" : "var(--theme-elevation-50)",
          border: `1px solid ${over ? "#fde68a" : "var(--theme-elevation-150)"}`,
          borderRadius: 4,
          padding: "4px 10px",
        }}
      >
        {formatTokens(tokens)}
        {over && <span style={{ fontWeight: 400, fontSize: 12 }}>— consider trimming</span>}
      </div>
    </div>
  );
};

export default MemoryTokenCounterField;
