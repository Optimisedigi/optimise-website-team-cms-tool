import type { Payload } from "payload";

import { logActivity } from "./activity-log";

/**
 * Subset of the Contract document fields we care about for the sync.
 * Loosely typed because the source is a Payload-returned `Contract` with
 * relationship fields that may be IDs or populated objects.
 */
export interface ContractSyncSource {
  id: number | string;
  contractTitle?: string | null;
  client?: number | string | { id: number | string } | null;
  setupFee?: number | null;
  monthlyRetainer?: number | null;
  contractStartDate?: string | null;
  additionalWork?: Array<{
    projectName?: string | null;
    amount?: number | null;
    countTowardsRetainer?: boolean | null;
  }> | null;
}

/**
 * Result the route can use for logging / debugging.
 */
export interface ContractSyncResult {
  ok: boolean;
  clientId: number | string | null;
  applied: {
    monthlyRetainer: boolean;
    setupFee: boolean;
    clientStartDate: boolean;
    additionalWorkAppended: number;
  };
  warnings: string[];
  error?: string;
}

/**
 * Resolve a client relationship value to its numeric / string id.
 */
function resolveClientId(
  rel: ContractSyncSource["client"],
): number | string | null {
  if (rel == null) return null;
  if (typeof rel === "object") return rel.id ?? null;
  return rel;
}

/**
 * One-way copy from a signed contract to its linked client.
 *
 * Called from the contract signing route immediately after the contract's
 * `status` flips to `completed`. Conflict policy:
 *
 *   - `client.monthlyRetainer` already set & non-zero -> do not overwrite;
 *     record a warning. Otherwise copy and log a `retainer_changed`
 *     activity so the existing tracker fires.
 *   - `client.setupFee` already set & non-zero -> do not overwrite;
 *     record a warning.
 *   - `client.clientStartDate` already set -> do not overwrite.
 *   - `additionalWork[]` rows always append to `oneOffProjects[]` with
 *     `date` defaulting to `contractStartDate` or `now`.
 *
 * Never throws. Catches its own errors and surfaces them in the result.
 */
export async function syncContractToClient(
  payload: Payload,
  contract: ContractSyncSource,
): Promise<ContractSyncResult> {
  const clientId = resolveClientId(contract.client);
  const result: ContractSyncResult = {
    ok: false,
    clientId,
    applied: {
      monthlyRetainer: false,
      setupFee: false,
      clientStartDate: false,
      additionalWorkAppended: 0,
    },
    warnings: [],
  };

  if (clientId == null) {
    result.warnings.push("Contract has no linked client; skipped sync.");
    result.ok = true;
    return result;
  }

  try {
    const client = (await payload.findByID({
      collection: "clients" as any,
      id: clientId as any,
      overrideAccess: true,
      depth: 0,
    })) as Record<string, unknown> | null;

    if (!client) {
      result.warnings.push(`Client ${clientId} not found.`);
      return result;
    }

    const updates: Record<string, unknown> = {};

    // Monthly retainer ─────────────────────────────────────────────────────
    const contractRetainer = Number(contract.monthlyRetainer) || 0;
    const existingRetainer = Number(client.monthlyRetainer) || 0;
    if (contractRetainer > 0) {
      if (existingRetainer > 0 && existingRetainer !== contractRetainer) {
        result.warnings.push(
          `monthlyRetainer not overwritten: client has $${existingRetainer}, contract has $${contractRetainer}.`,
        );
      } else if (existingRetainer === 0) {
        updates.monthlyRetainer = contractRetainer;
        result.applied.monthlyRetainer = true;
      }
    }

    // Setup fee ────────────────────────────────────────────────────────────
    const contractSetup = Number(contract.setupFee) || 0;
    const existingSetup = Number(client.setupFee) || 0;
    if (contractSetup > 0) {
      if (existingSetup > 0 && existingSetup !== contractSetup) {
        result.warnings.push(
          `setupFee not overwritten: client has $${existingSetup}, contract has $${contractSetup}.`,
        );
      } else if (existingSetup === 0) {
        updates.setupFee = contractSetup;
        result.applied.setupFee = true;
      }
    }

    // Client start date ────────────────────────────────────────────────────
    const contractStart = contract.contractStartDate ?? null;
    const existingStart = (client.clientStartDate as string | null) ?? null;
    if (contractStart && !existingStart) {
      updates.clientStartDate = contractStart;
      result.applied.clientStartDate = true;
    } else if (contractStart && existingStart && contractStart !== existingStart) {
      result.warnings.push(
        `clientStartDate not overwritten: client has ${existingStart}, contract has ${contractStart}.`,
      );
    }

    // additionalWork → oneOffProjects (always append) ──────────────────────
    const additionalWork = Array.isArray(contract.additionalWork)
      ? contract.additionalWork
      : [];
    if (additionalWork.length > 0) {
      const existingOneOffs = Array.isArray(client.oneOffProjects)
        ? (client.oneOffProjects as Array<Record<string, unknown>>)
        : [];
      const defaultDate =
        (contract.contractStartDate as string | null) ?? new Date().toISOString();
      const appended = additionalWork
        .filter((row) => row && row.projectName && row.amount != null)
        .map((row) => ({
          projectName: row.projectName,
          amount: Number(row.amount) || 0,
          date: defaultDate,
          countTowardsRetainer: Boolean(row.countTowardsRetainer),
        }));
      if (appended.length > 0) {
        updates.oneOffProjects = [...existingOneOffs, ...appended];
        result.applied.additionalWorkAppended = appended.length;
      }
    }

    if (Object.keys(updates).length === 0) {
      result.ok = true;
      return result;
    }

    await payload.update({
      collection: "clients" as any,
      id: clientId as any,
      data: updates as any,
      overrideAccess: true,
    });

    // If the retainer was newly applied, surface it via the existing tracker
    // so the dashboard / activity log picks it up.
    if (result.applied.monthlyRetainer) {
      await logActivity(payload, {
        type: "retainer_changed",
        title: `Retainer set from signed contract: ${contract.contractTitle ?? `#${contract.id}`}`,
        description: `Synced $${contractRetainer}/mo to client #${clientId} on contract signature.`,
        client: clientId,
      }).catch(() => {});
    }

    if (result.warnings.length > 0) {
      await logActivity(payload, {
        type: "contract_client_signed",
        title: `Contract sync warnings: ${contract.contractTitle ?? `#${contract.id}`}`,
        description: result.warnings.join(" | "),
        client: clientId,
      }).catch(() => {});
    }

    result.ok = true;
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    try {
      await logActivity(payload, {
        type: "contract_client_signed",
        title: `Contract sync failed: ${contract.contractTitle ?? `#${contract.id}`}`,
        description: msg,
        client: clientId ?? undefined,
      });
    } catch {
      /* ignored */
    }
    return result;
  }
}
