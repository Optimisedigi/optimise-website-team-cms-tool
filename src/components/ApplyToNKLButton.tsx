"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useState, useEffect, useCallback } from "react";

interface NKLOption {
  id: string;
  name: string;
  keywordCount: number;
}

export default function ApplyToNKLButton() {
  const { initialData } = useDocumentInfo();
  const session = initialData as Record<string, unknown> | undefined;

  const sessionKeywords: Array<{
    keyword: string;
    matchType: string;
    flaggedForRemoval: boolean;
  }> = (session?.keywords as Array<{
    keyword: string;
    matchType: string;
    flaggedForRemoval: boolean;
  }>) ?? [];

  const pendingKeywords = sessionKeywords.filter((k) => !k.flaggedForRemoval);
  const status = session?.status as string | undefined;
  const clientId = session?.client as string | undefined;

  const [nkls, setNkls] = useState<NKLOption[]>([]);
  const [selectedNKLId, setSelectedNKLId] = useState<string>("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Fetch client's existing NKLs on mount
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/negative-keyword-lists/for-client?clientId=${encodeURIComponent(clientId as string)}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { nkls: [] }))
      .then((d) => setNkls(d.nkls ?? []))
      .catch(() => {});
  }, [clientId]);

  const toggleKeyword = useCallback((idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setChecked((prev) =>
      prev.size === pendingKeywords.length
        ? new Set()
        : new Set(pendingKeywords.map((_, i) => i))
    );
  }, [pendingKeywords]);

  const handleApply = async () => {
    if (!selectedNKLId || checked.size === 0 || !session?.id) return;
    setApplying(true);
    setResult(null);

    const keywordsToApply = Array.from(checked).map((idx) => pendingKeywords[idx]);

    try {
      const res = await fetch(
        `/api/keyword-deep-dive-sessions/${session.id as string}/apply-to-nkl`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nklId: selectedNKLId,
            keywords: keywordsToApply,
          }),
        }
      );
      const data = await res.json();

      if (res.ok) {
        setResult({
          type: "success",
          message: `${keywordsToApply.length} keyword${keywordsToApply.length !== 1 ? "s" : ""} added to NKL.`,
        });
        // Clear selection
        setChecked(new Set());
      } else {
        setResult({ type: "error", message: data.error || "Failed to apply keywords" });
      }
    } catch {
      setResult({ type: "error", message: "Network error" });
    } finally {
      setApplying(false);
    }
  };

  if (status === "applied") {
    return (
      <div className="payload-plugin default-loader" style={{ padding: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#059669",
            fontWeight: 500,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Applied to NKL
        </div>
        {session?.appliedToNKL ? (
          <p style={{ margin: "4px 0 0 24px", fontSize: "13px", color: "#6b7280" }}>
            Applied to:{" "}
            <a
              href={`/admin/collections/negative-keyword-lists/${(session.appliedToNKL as { id: string }).id}`}
              target="_blank"
              rel="noreferrer"
            >
              {nkls.find((n) => n.id === (session.appliedToNKL as { id: string }).id)?.name ?? "NKL"}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  if (status === "archived") {
    return (
      <div style={{ padding: "16px", color: "#6b7280" }}>
        <em>Archived — not pending review</em>
      </div>
    );
  }

  if (pendingKeywords.length === 0) {
    return (
      <div style={{ padding: "16px", color: "#6b7280" }}>
        No keywords pending review.
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", background: "#f9fafb", borderRadius: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "14px" }}>
          {pendingKeywords.length} keyword{pendingKeywords.length !== 1 ? "s" : ""} pending
        </span>
        <span style={{ fontSize: "13px", color: "#6b7280" }}>
          {checked.size} selected
        </span>
      </div>

      {/* Keyword checklist */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          overflow: "hidden",
          marginBottom: "12px",
          maxHeight: "240px",
          overflowY: "auto",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            background: "#f3f4f6",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
          }}
        >
          <input
            type="checkbox"
            checked={checked.size === pendingKeywords.length && pendingKeywords.length > 0}
            onChange={toggleAll}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>
            Select all
          </span>
        </div>

        {/* Keyword rows */}
        {pendingKeywords.map((kw, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              borderBottom:
                idx < pendingKeywords.length - 1 ? "1px solid #f3f4f6" : "none",
            }}
          >
            <input
              type="checkbox"
              checked={checked.has(idx)}
              onChange={() => toggleKeyword(idx)}
              style={{ cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: "13px", flex: 1, wordBreak: "break-word" }}>
              {kw.keyword}
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "#e5e7eb",
                color: "#374151",
                textTransform: "capitalize",
                flexShrink: 0,
              }}
            >
              {kw.matchType}
            </span>
          </div>
        ))}
      </div>

      {/* NKL selector */}
      <div style={{ marginBottom: "12px" }}>
        <label
          style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}
        >
          Apply selected to NKL:
        </label>
        <select
          value={selectedNKLId}
          onChange={(e) => setSelectedNKLId(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "13px",
            background: "#fff",
          }}
        >
          <option value="">— Choose a Negative Keyword List —</option>
          {nkls.map((nkl) => (
            <option key={nkl.id} value={nkl.id}>
              {nkl.name} ({nkl.keywordCount} keywords)
            </option>
          ))}
        </select>
        {nkls.length === 0 && clientId && (
          <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
            No NKLs found for this client.{" "}
            <a
              href="/admin/collections/negative-keyword-lists?filter[client][value]={clientId}"
              target="_blank"
              rel="noreferrer"
            >
              Create one first
            </a>
            .
          </p>
        )}
      </div>

      {/* Apply button */}
      <button
        onClick={handleApply}
        disabled={applying || !selectedNKLId || checked.size === 0}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "6px",
          border: "none",
          background:
            applying || !selectedNKLId || checked.size === 0 ? "#d1d5db" : "#dc2626",
          color: "#fff",
          fontWeight: 500,
          fontSize: "13px",
          cursor:
            applying || !selectedNKLId || checked.size === 0 ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {applying
          ? "Applying…"
          : `Apply ${checked.size} keyword${checked.size !== 1 ? "s" : ""} to NKL`}
      </button>

      {/* Result */}
      {result && (
        <div
          style={{
            marginTop: "10px",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "13px",
            background: result.type === "success" ? "#d1fae5" : "#fee2e2",
            color: result.type === "success" ? "#065f46" : "#991b1b",
          }}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
