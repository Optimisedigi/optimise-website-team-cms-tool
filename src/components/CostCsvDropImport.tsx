"use client";

/**
 * Admin-wide drag-and-drop import for bank statement CSVs.
 *
 * Drop a .csv file anywhere in the CMS window and it is posted straight to
 * `/api/costs/upload` (the same endpoint as the Costs page "Import CSV"
 * button). Drops already handled by another drop zone — Payload upload
 * fields, chat/mail attachment panels — are left alone: those zones call
 * preventDefault/stopPropagation, so this listener skips them.
 *
 * Only active for users with the `business-costs` feature.
 */

import { useEffect, useRef, useState } from "react";
import { toast, useAuth } from "@payloadcms/ui";
import { userHasFeature } from "@/lib/access";

import { COSTS_IMPORTED_EVENT } from "@/lib/finance/events";

export { COSTS_IMPORTED_EVENT };

type UploadSummary = {
  total: number;
  categorised: number;
  uncategorised: number;
  receipts: number;
  duplicatesSkipped: number;
};

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function parseSummary(body: unknown): UploadSummary | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const keys = ["total", "categorised", "uncategorised", "duplicatesSkipped"] as const;
  if (!keys.every((key) => typeof record[key] === "number")) return null;
  return {
    total: record.total as number,
    categorised: record.categorised as number,
    uncategorised: record.uncategorised as number,
    receipts: typeof record.receipts === "number" ? record.receipts : 0,
    duplicatesSkipped: record.duplicatesSkipped as number,
  };
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return `Upload failed (${status})`;
}

const COSTS_PATH = "/admin/finance/costs";

const CostCsvDropImport = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useAuth();
  const enabled = userHasFeature(user, "business-costs");
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const uploadingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const uploadFile = async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/costs/upload", { method: "POST", body: fd });
        const body: unknown = await res.json().catch(() => null);
        const summary = res.ok ? parseSummary(body) : null;
        if (!summary) {
          toast.error(`${file.name}: ${errorMessage(body, res.status)}`);
          return;
        }
        const onCostsPage = window.location.pathname.startsWith(COSTS_PATH);
        toast.success(
          `${file.name}: imported ${summary.total} costs (${summary.categorised} categorised, ${summary.uncategorised} uncategorised) and ${summary.receipts} payments received; ${summary.duplicatesSkipped} already-imported rows skipped`,
          onCostsPage
            ? undefined
            : { action: { label: "View costs", onClick: () => window.location.assign(COSTS_PATH) } },
        );
        window.dispatchEvent(new CustomEvent(COSTS_IMPORTED_EVENT));
      } catch {
        toast.error(`${file.name}: upload failed. Check your connection.`);
      }
    };

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      dragDepthRef.current += 1;
      setDragActive(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      // Required for the window to accept the drop (and stops the browser
      // navigating away to open the file).
      event.preventDefault();
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragActive(false);
    };

    const onDrop = (event: DragEvent) => {
      dragDepthRef.current = 0;
      setDragActive(false);
      if (!isFileDrag(event)) return;
      // Another drop zone (upload field, attachment panel) handled it.
      if (event.defaultPrevented) return;
      event.preventDefault();

      const files = Array.from(event.dataTransfer?.files ?? []);
      const csvFiles = files.filter(isCsvFile);
      if (csvFiles.length === 0) {
        toast.error("Only CSV bank statements can be dropped here to import costs.");
        return;
      }
      if (uploadingRef.current) {
        toast.error("A cost import is already running. Try again when it finishes.");
        return;
      }
      uploadingRef.current = true;
      toast.info(`Importing ${csvFiles.length === 1 ? csvFiles[0]?.name : `${csvFiles.length} CSV files`} into costs…`);
      void (async () => {
        try {
          // Sequential so duplicate detection sees earlier files' rows.
          for (const file of csvFiles) {
            await uploadFile(file);
          }
        } finally {
          uploadingRef.current = false;
        }
      })();
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  return (
    <>
      {children}
      {enabled && dragActive && (
        <div
          aria-hidden="true"
          data-testid="cost-csv-drop-hint"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 10000,
            padding: "10px 18px",
            borderRadius: 8,
            background: "#213843",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            // Never intercept the drop: upload fields underneath must still receive it.
            pointerEvents: "none",
          }}
        >
          Drop a bank statement CSV to import it into Costs
        </div>
      )}
    </>
  );
};

export default CostCsvDropImport;
