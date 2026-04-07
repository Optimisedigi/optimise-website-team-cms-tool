"use client";

import { useDocumentInfo, useAllFormFields } from "@payloadcms/ui";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ItemData = {
  id: string;
  itemName: string;
  itemStatus: string;
  completedAt: string;
  estimatedHours: number | null;
  requiresApproval: boolean;
  approvalStatus: string;
};

type PhaseData = {
  id: string;
  phaseName: string;
  phaseOrder: number;
  weekRange: string;
  phaseDescription: string;
  items: ItemData[];
};

type TimelineDoc = {
  id: string;
  title: string;
  client?: { id: number; name?: string } | number;
  serviceType: string;
  overallStatus: string;
  startDate?: string;
  endDate?: string;
  phases: PhaseData[];
  lastSharedAt?: string;
  sharedCount?: number;
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ITEM_STATUS_COLORS: Record<string, string> = {
  not_started: "#6B7280",
  in_progress: "#3B82F6",
  completed: "#10B981",
  skipped: "#F59E0B",
};

const ITEM_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  skipped: "Skipped",
};

const NEXT_ITEM_STATUS: Record<string, string> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed: "not_started",
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  not_needed: "Not needed",
  in_progress: "In progress",
  action_required: "Action required",
  awaiting_approval: "Awaiting approval",
  pending_approval: "Pending (old)",
  approved: "Approved",
};

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  not_needed: "#9ca3af",
  in_progress: "#3b82f6",
  action_required: "#ef4444",
  awaiting_approval: "#f59e0b",
  pending_approval: "#f59e0b",
  approved: "#10b981",
};

/* ------------------------------------------------------------------ */
/* Read phases/items from form state                                    */
/* ------------------------------------------------------------------ */

function extractPhases(fields: Record<string, any>): PhaseData[] {
  const phases: PhaseData[] = [];
  let i = 0;
  while (true) {
    const has =
      fields[`phases.${i}.phaseName`] !== undefined ||
      fields[`phases.${i}.id`] !== undefined;
    if (!has) break;

    const items: ItemData[] = [];
    let j = 0;
    while (true) {
      const hasItem =
        fields[`phases.${i}.items.${j}.itemName`] !== undefined ||
        fields[`phases.${i}.items.${j}.id`] !== undefined;
      if (!hasItem) break;

      items.push({
        id: fields[`phases.${i}.items.${j}.id`]?.value ?? "",
        itemName: fields[`phases.${i}.items.${j}.itemName`]?.value ?? "",
        itemStatus: fields[`phases.${i}.items.${j}.itemStatus`]?.value ?? "not_started",
        completedAt: fields[`phases.${i}.items.${j}.completedAt`]?.value ?? "",
        estimatedHours: fields[`phases.${i}.items.${j}.estimatedHours`]?.value ?? null,
        requiresApproval: !!fields[`phases.${i}.items.${j}.requiresApproval`]?.value,
        approvalStatus: fields[`phases.${i}.items.${j}.approvalStatus`]?.value ?? "not_needed",
      });
      j++;
    }

    phases.push({
      id: fields[`phases.${i}.id`]?.value ?? "",
      phaseName: fields[`phases.${i}.phaseName`]?.value ?? "",
      phaseOrder: fields[`phases.${i}.phaseOrder`]?.value ?? i + 1,
      weekRange: fields[`phases.${i}.weekRange`]?.value ?? "",
      phaseDescription: fields[`phases.${i}.phaseDescription`]?.value ?? "",
      items,
    });
    i++;
  }
  return phases;
}

/* ------------------------------------------------------------------ */
/* Email Preview Modal                                                  */
/* ------------------------------------------------------------------ */

function EmailPreviewModal({
  id,
  clientName,
  onClose,
}: {
  id: string;
  clientName: string;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string>("");
  const [plain, setPlain] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"html" | "plain" | "gmail" | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    fetch(`/api/client-timelines/${id}/email-preview`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName }),
    })
      .then((r) => r.json())
      .then((d) => {
        setHtml(d.html ?? "");
        setPlain(d.plain ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, clientName]);

  const copyToClipboard = async (text: string, type: "html" | "plain") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const copyHtmlForGmail = async () => {
    if (!html) return;
    try {
      const blob = new Blob([html], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob, "text/plain": new Blob([plain], { type: "text/plain" }) });
      await navigator.clipboard.write([clipboardItem]);
      setCopied("gmail");
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Fallback to plain text if rich copy fails
      await navigator.clipboard.writeText(plain);
      setCopied("plain");
      setTimeout(() => setCopied(null), 2500);
    }
  };

  const markShared = async () => {
    setSharing(true);
    try {
      await fetch(`/api/client-timelines/${id}/share`, {
        method: "POST",
        credentials: "include",
      });
      setShared(true);
      setTimeout(onClose, 1500);
    } catch {}
    setSharing(false);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 780, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Share with Client</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Copy the email below and paste into your client update</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {loading ? (
            <span style={{ color: "#6b7280", fontSize: 13 }}>Generating preview…</span>
          ) : (
            <>
              <button onClick={copyHtmlForGmail} style={{ padding: "6px 14px", background: copied === "gmail" ? "#10B981" : "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                {copied === "gmail" ? "✓ Copied!" : "📋 Copy for Gmail"}
              </button>
              <button onClick={() => copyToClipboard(html, "html")} style={{ padding: "6px 14px", background: copied === "html" ? "#10B981" : "#1f2937", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                {copied === "html" ? "✓ Copied!" : "Copy HTML"}
              </button>
              <button onClick={() => copyToClipboard(plain, "plain")} style={{ padding: "6px 14px", background: copied === "plain" ? "#10B981" : "#374151", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                {copied === "plain" ? "✓ Copied!" : "Copy plain text"}
              </button>
              <button onClick={markShared} disabled={sharing || shared} style={{ padding: "6px 14px", background: shared ? "#10B981" : "#2563EB", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: sharing || shared ? "default" : "pointer", opacity: sharing ? 0.7 : 1 }}>
                {shared ? "✓ Marked as shared" : sharing ? "Saving…" : "Mark as Shared"}
              </button>
            </>
          )}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#6b7280" }}>Loading preview…</div>
          ) : (
            <iframe srcDoc={html} title="Email Preview" style={{ width: "100%", height: "100%", minHeight: 400, border: "none" }} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                       */
/* ------------------------------------------------------------------ */

export default function ClientTimelineTracker() {
  return (
    <ErrorBoundary>
      <TrackerInner />
    </ErrorBoundary>
  );
}

function TrackerInner() {
  const { id: docId } = useDocumentInfo() as { id: string | number | undefined };
  const allFields = useAllFormFields() ?? [{}, () => {}];
  const fields: Record<string, any> = allFields[0] ?? {};
  const dispatchFields: any = allFields[1] ?? (() => {});
  const docIdStr = String(docId ?? "");
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read phases from form state — stays in sync with the worksheet
  const phases = useMemo(() => extractPhases(fields), [fields]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const updateItemStatus = useCallback(
    async (pi: number, ii: number, newStatus: string) => {
      if (!docIdStr) return;
      const itemId = phases[pi]?.items[ii]?.id;
      if (!itemId) return;
      setLoadingStep(itemId);

      // 1. Update form state immediately (instant UI feedback)
      dispatchFields({ type: "UPDATE", path: `phases.${pi}.items.${ii}.itemStatus`, value: newStatus });
      if (newStatus === "completed") {
        dispatchFields({ type: "UPDATE", path: `phases.${pi}.items.${ii}.completedAt`, value: new Date().toISOString() });
      }

      // 2. Persist to database
      try {
        const res = await fetch(`/api/client-timelines/${docIdStr}/item`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phaseIndex: pi, itemId, itemStatus: newStatus }),
        });
        const data = await res.json();
        if (!res.ok) showToast(data.error ?? "Failed to update");
        else showToast(`Marked as ${ITEM_STATUS_LABELS[newStatus] ?? newStatus}`);
      } catch {
        showToast("Network error");
      }
      setLoadingStep(null);
    },
    [docIdStr, phases, dispatchFields, showToast],
  );

  const updateApprovalStatus = useCallback(
    async (pi: number, ii: number, newApproval: string) => {
      if (!docIdStr) return;
      const itemId = phases[pi]?.items[ii]?.id;
      if (!itemId) return;
      dispatchFields({ type: "UPDATE", path: `phases.${pi}.items.${ii}.approvalStatus`, value: newApproval });
      if (newApproval === "approved") {
        dispatchFields({ type: "UPDATE", path: `phases.${pi}.items.${ii}.clientApprovedAt`, value: new Date().toISOString() });
      }
      try {
        await fetch(`/api/client-timelines/${docIdStr}/item`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phaseIndex: pi, itemId, approvalStatus: newApproval }),
        });
      } catch {}
    },
    [docIdStr, phases, dispatchFields],
  );

  // Compute totals — weighted by estimated hours (coerce to number in case form state returns a string)
  const stats = useMemo(() => {
    let total = 0, completed = 0, inProgress = 0, totalHours = 0, completedHours = 0;
    for (const phase of phases) {
      for (const item of phase.items) {
        const hours = Number(item.estimatedHours) || 1;
        total++;
        totalHours += hours;
        if (item.itemStatus === "completed" || item.itemStatus === "skipped") {
          completed++;
          completedHours += hours;
        } else if (item.itemStatus === "in_progress") {
          inProgress++;
        }
      }
    }
    const pct = totalHours > 0 ? Math.round((completedHours / totalHours) * 100) : 0;
    return { total, completed, inProgress, pct, totalHours, completedHours };
  }, [phases]);

  const formatDate = (d: string | undefined) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };

  if (phases.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#6b7280", fontFamily: "Arial, sans-serif" }}>
        No phases yet. Add phases in the <strong>Phases &amp; Items</strong> tab, or load a template from the <strong>Templates</strong> tab.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "0 4px 32px" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#111827", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}

      {/* Email Preview Modal */}
      {showEmailModal && (
        <EmailPreviewModal
          id={docIdStr || ""}
          clientName="Client"
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {/* Progress Header */}
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
            {stats.completedHours}h of {stats.totalHours}h complete{stats.total > 0 ? ` (${stats.completed} of ${stats.total} tasks)` : ''}
          </div>
          <div style={{ background: "#e5e7eb", borderRadius: 999, height: 10, width: 260, overflow: "hidden" }}>
            <div style={{ background: "#10B981", height: "100%", width: `${stats.pct}%`, borderRadius: 999, transition: "width .4s" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {stats.inProgress > 0 && (
            <span style={{ background: "#dbeafe", color: "#1e40af", padding: "4px 10px", borderRadius: 999, fontSize: 12 }}>
              {stats.inProgress} in progress
            </span>
          )}
          <button onClick={() => setShowEmailModal(true)} style={{ padding: "8px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
            Share with Client
          </button>
        </div>
      </div>

      {/* Phase accordion */}
      {phases.map((phase, pi) => {
        const phaseDone = phase.items.every((i) => i.itemStatus === "completed" || i.itemStatus === "skipped");
        const phaseInProgress = phase.items.some((i) => i.itemStatus === "in_progress" || i.itemStatus === "completed");
        const doneCount = phase.items.filter((i) => i.itemStatus === "completed" || i.itemStatus === "skipped").length;

        return (
          <div key={phase.id || String(pi)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
            {/* Phase header */}
            <div style={{ background: phaseDone ? "#f0fdf4" : phaseInProgress ? "#eff6ff" : "#f9fafb", padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{phase.phaseName}</span>
                {phase.weekRange && <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{phase.weekRange}</span>}
                {phaseDone && <span style={{ marginLeft: 8, fontSize: 11, background: "#10B981", color: "#fff", padding: "2px 8px", borderRadius: 999 }}>Done</span>}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {doneCount}/{phase.items.length}
              </div>
            </div>

            {/* Phase description */}
            {phase.phaseDescription && (
              <div style={{ padding: "8px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 13, color: "#6b7280" }}>
                {phase.phaseDescription}
              </div>
            )}

            {/* Items */}
            {phase.items.map((item, ii) => {
              const isLoading = loadingStep === item.id;
              const nextStatus = NEXT_ITEM_STATUS[item.itemStatus] ?? "in_progress";

              return (
                <div key={item.id || ii} style={{ padding: "10px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "flex-start", gap: 12, opacity: isLoading ? 0.6 : 1 }}>
                  {/* Status toggle button */}
                  <button
                    onClick={() => updateItemStatus(pi, ii, nextStatus)}
                    disabled={isLoading}
                    title={`Mark as ${ITEM_STATUS_LABELS[nextStatus] ?? nextStatus}`}
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      border: `2px solid ${ITEM_STATUS_COLORS[item.itemStatus] ?? "#d1d5db"}`,
                      background: item.itemStatus === "completed" ? ITEM_STATUS_COLORS.completed : "transparent",
                      flexShrink: 0, marginTop: 1, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 14, transition: "all .2s",
                    }}
                  >
                    {item.itemStatus === "completed" ? "✓" : ""}
                  </button>

                  {/* Item details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: item.itemStatus === "completed" ? "#6b7280" : "#111827", textDecoration: item.itemStatus === "completed" ? "line-through" : "none" }}>
                      {item.itemName}
                      {item.requiresApproval && (
                        <span style={{
                          marginLeft: 6, fontSize: 11,
                          background: APPROVAL_STATUS_COLORS[item.approvalStatus] + "22",
                          color: APPROVAL_STATUS_COLORS[item.approvalStatus],
                          padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                        }}>
                          {APPROVAL_STATUS_LABELS[item.approvalStatus] ?? item.approvalStatus}
                        </span>
                      )}
                    </div>

                    {/* Status pills — only show for items that aren't completed */}
                    {item.itemStatus !== "completed" && item.itemStatus !== "skipped" && (
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <span style={{ color: "#9ca3af", fontSize: 11, marginRight: 2 }}>Status:</span>
                        {(Object.keys(APPROVAL_STATUS_LABELS) as Array<keyof typeof APPROVAL_STATUS_LABELS>).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => updateApprovalStatus(pi, ii, opt)}
                            style={{
                              padding: "1px 6px", borderRadius: 4, border: "none", fontSize: 10, cursor: "pointer",
                              background: item.approvalStatus === opt ? APPROVAL_STATUS_COLORS[opt] : "#f3f4f6",
                              color: item.approvalStatus === opt ? "#fff" : "#6b7280",
                            }}
                          >
                            {APPROVAL_STATUS_LABELS[opt]}
                          </button>
                        ))}
                      </div>
                    )}

                    {item.itemStatus === "completed" && item.completedAt && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>✓ Completed {formatDate(item.completedAt)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
