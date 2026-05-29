"use client";

import React, { useState } from "react";
import { Button, useDocumentInfo } from "@payloadcms/ui";

type CreateState = "idle" | "loading" | "success" | "error";

export default function CreateOrganicSnapshotButton(): React.ReactElement | null {
  const { id: clientId } = useDocumentInfo();
  const [message, setMessage] = useState<string>("");
  const [state, setState] = useState<CreateState>("idle");
  if (!clientId) return null;

  async function createSnapshot(): Promise<void> {
    setState("loading");
    setMessage("Finding latest GSC snapshot…");
    try {
      const latestRes = await fetch(`/api/organic-growth-snapshots/latest-gsc?clientId=${encodeURIComponent(String(clientId))}`, {
        credentials: "include",
      });
      const latestJson = await latestRes.json().catch(() => ({}));
      if (!latestRes.ok || !latestJson.ok || !latestJson.snapshot?.id) {
        throw new Error(latestJson.error || "No GSC snapshot found for this client.");
      }

      setMessage("Creating organic growth snapshot…");
      const createRes = await fetch("/api/organic-growth-snapshots/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "payload-admin",
        },
        body: JSON.stringify({ clientId, gscSnapshotId: latestJson.snapshot.id }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createJson.ok) throw new Error(createJson.error || "Snapshot creation failed.");
      setState("success");
      setMessage(createJson.created ? "Organic growth snapshot created. Refresh to see it in the tracker." : "A snapshot already exists for the latest GSC data.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not create organic snapshot.");
    }
  }

  return (
    <div style={{ padding: "8px 0" }}>
      <Button type="button" size="small" disabled={state === "loading"} onClick={createSnapshot}>
        {state === "loading" ? "Creating…" : "Create Organic Snapshot"}
      </Button>
      {message ? (
        <p style={{ marginTop: 8, color: state === "error" ? "var(--theme-error-500)" : "var(--theme-elevation-600)" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
