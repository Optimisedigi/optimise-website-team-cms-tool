import type { CollectionAfterChangeHook } from "payload";
import { deferPostCommit } from "../google-ads-audit-bootstrap";
import { authoritiesSignature } from "./authorities";
import { relId, requestRefresh, triggerContentMapRun } from "./snapshots";
import type { ContentMapMode } from "./types";

/** Which run (if any) a client save should start. Pure for tests. */
export function clientRunMode(doc: Record<string, unknown>, previous: Record<string, unknown> | null | undefined): ContentMapMode | null {
  if (doc.contentMapEnabled !== true) return null;
  const wasOn = previous?.contentMapEnabled === true;
  const url = String(doc.websiteUrl ?? "").trim();
  if (!url) return null;
  if (!wasOn || url !== String(previous?.websiteUrl ?? "").trim()) return "full";
  if (authoritiesSignature(doc) !== authoritiesSignature(previous)) return "refresh";
  return null;
}

const POST_FIELDS = ["title", "slug", "status", "markdownContent", "category"] as const;

export function blogPostChanged(doc: Record<string, unknown>, previous: Record<string, unknown> | null | undefined): boolean {
  if (!previous) return true;
  return POST_FIELDS.some((f) => String(doc[f] ?? "") !== String(previous[f] ?? ""));
}

/** Clients afterChange. GT work runs after commit and can never fail the save. */
export const contentMapClientAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  if (operation !== "create" && operation !== "update") return doc;
  // Callers that start their own run (topic suggestion approval) skip this one.
  if (req.context?.skipContentMap) return doc;
  const mode = clientRunMode(doc, operation === "update" ? previousDoc : null);
  if (!mode) return doc;
  const payload = req.payload;
  const clientId = String(doc.id);
  deferPostCommit(payload, `content map ${mode} run`, async () => {
    // Authority edits while a run is going flag pendingRefresh instead of a second run.
    if (mode === "refresh") return requestRefresh(payload, clientId);
    const res = await triggerContentMapRun(payload, clientId, mode);
    if (!res.ok) payload.logger?.warn?.(`[ContentMap] ${mode} run not started: ${res.error}`);
  });
  return doc;
};

/** BlogPosts afterChange: refresh the client's map when an article changes. */
export const contentMapBlogPostAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  if (operation !== "create" && operation !== "update") return doc;
  if (req.context?.skipContentMap) return doc;
  if (!blogPostChanged(doc, operation === "update" ? previousDoc : null)) return doc;
  const clientId = relId(doc.client);
  if (!clientId) return doc;
  const payload = req.payload;
  deferPostCommit(payload, "content map refresh", async () => {
    const client = (await payload.findByID({
      collection: "clients",
      id: clientId,
      depth: 0,
      overrideAccess: true,
      select: { contentMapEnabled: true, websiteUrl: true },
    })) as unknown as Record<string, unknown>;
    if (client.contentMapEnabled !== true || !String(client.websiteUrl ?? "").trim()) return;
    await requestRefresh(payload, clientId);
  });
  return doc;
};
