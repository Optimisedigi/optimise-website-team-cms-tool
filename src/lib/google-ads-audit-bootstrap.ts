import type { Payload } from "payload";
import { createSnapshotForAudit } from "@/lib/google-ads-audit-snapshots";

type BootstrapClient = {
  id: string | number;
  name?: string | null;
  websiteUrl?: string | null;
  clientPin?: string | null;
  googleAdsCustomerId?: string | null;
};

/**
 * Create (or find) the audit record for a client that just got its first Google
 * Ads customer ID.
 *
 * Deliberately NOT joined to the caller's transaction. Payload rolls back and
 * discards `req.transactionID` whenever a sub-operation throws, so an audit that
 * failed validation would silently take the client's own save down with it — the
 * caller would still report success. Bootstrapping an audit is best-effort;
 * saving the ID the user typed is not.
 */
export async function ensureGoogleAdsAudit(
  payload: Payload,
  doc: BootstrapClient,
): Promise<{ id: string | number } | null> {
  const customerId = String(doc.googleAdsCustomerId || "").trim();
  if (!customerId) return null;
  const existing = await payload.find({
    collection: "google-ads-audits",
    where: { and: [{ client: { equals: doc.id } }, { customerId: { equals: customerId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.docs[0]) return existing.docs[0] as { id: string | number };
  return (await payload.create({
    collection: "google-ads-audits",
    data: {
      businessName: doc.name,
      customerId,
      websiteUrl: doc.websiteUrl || undefined,
      client: doc.id,
      presentationPin: doc.clientPin || undefined,
      auditStatus: "pending",
    } as never,
    overrideAccess: true,
  })) as { id: string | number };
}

/**
 * Take the first snapshot for a freshly bootstrapped audit.
 *
 * MUST NOT be awaited inside the client's save. It performs a Google Ads API
 * round-trip, so awaiting it makes saving a client depend on an external
 * service: when that upstream is slow or failing (production returned
 * "metadata lookup failed (502) / GAQL 403 caller does not have permission" for
 * an account the MCC cannot read yet) the save inherits the latency and, if the
 * request dies before commit, the customer ID the user typed is lost while the
 * audit row — written on its own connection — survives.
 *
 * Snapshotting is best-effort; saving the ID is not. Never throws.
 */
export async function startInitialGoogleAdsSnapshot(
  payload: Payload,
  auditId: string | number,
  clientId: string | number,
): Promise<void> {
  try {
    await createSnapshotForAudit(payload, auditId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    payload.logger.error(
      `[Clients] Automatic Google Ads snapshot failed for client ${clientId}: ${message}`,
    );
    await payload
      .update({
        collection: "google-ads-audits",
        id: auditId,
        data: {
          auditStatus: "failed",
          snapshotState: "failed",
          auditError: message,
        } as never,
        overrideAccess: true,
      })
      .catch(() => undefined);
  }
}
