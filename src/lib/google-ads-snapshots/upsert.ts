/**
 * Upsert helper for the `google-ads-snapshots` collection. Used by the daily
 * cron — there is a UNIQUE index on (client_id, level), so this helper finds
 * the existing row (if any) and updates it in-place, otherwise creates it.
 *
 * Error handling rule (intentional):
 *   - If `error` is set AND `rows` is empty, we ONLY update `error`,
 *     `capturedAt`, and `fetchDurationMs`. Previously successful `rows`
 *     stay visible to dashboards / OptiMate so the UI doesn't go blank on
 *     a single transient upstream failure.
 *   - If `rows` are provided (success), we clear any existing `error`.
 */

import type { Payload } from "payload";

import type { SnapshotLevel } from "./types";

export interface UpsertSnapshotArgs {
  clientId: string | number;
  level: SnapshotLevel;
  customerId: string;
  rows: unknown[];
  dateRangeLabel?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  sourceEndpoint?: string;
  fetchDurationMs?: number;
  error?: string;
}

export interface UpsertSnapshotResult {
  id: string | number;
  created: boolean;
}

interface ExistingDoc {
  id: string | number;
}

/**
 * Upsert the snapshot row for (client, level). See file docstring for the
 * error-preservation rule.
 */
export async function upsertSnapshot(
  payload: Payload,
  args: UpsertSnapshotArgs,
): Promise<UpsertSnapshotResult> {
  const capturedAt = new Date().toISOString();
  const rowCount = args.rows.length;

  const existing = await payload.find({
    collection: "google-ads-snapshots",
    where: {
      and: [
        { client: { equals: args.clientId } },
        { level: { equals: args.level } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const existingDoc = (existing.docs as unknown as ExistingDoc[])[0];

  const isErrorOnly = !!args.error && rowCount === 0;

  if (existingDoc) {
    // Build the update payload conditionally so we don't wipe last-good
    // rows on an error-only refresh.
    const data: Record<string, unknown> = {
      capturedAt,
      customerId: args.customerId,
    };
    if (typeof args.fetchDurationMs === "number") {
      data.fetchDurationMs = args.fetchDurationMs;
    }
    if (isErrorOnly) {
      data.error = args.error;
    } else {
      data.rows = args.rows;
      data.rowCount = rowCount;
      // Success — clear any stale error from a previous failed run.
      data.error = null;
      if (args.dateRangeLabel !== undefined) data.dateRangeLabel = args.dateRangeLabel;
      if (args.dateRangeStart !== undefined) data.dateRangeStart = args.dateRangeStart;
      if (args.dateRangeEnd !== undefined) data.dateRangeEnd = args.dateRangeEnd;
      if (args.sourceEndpoint !== undefined) data.sourceEndpoint = args.sourceEndpoint;
    }
    const updated = await payload.update({
      collection: "google-ads-snapshots",
      id: existingDoc.id,
      data,
      overrideAccess: true,
    });
    return { id: (updated as { id: string | number }).id, created: false };
  }

  // No existing row — create. Even an error-only first write is fine; rows
  // will be [] until the next successful cron run.
  const createData: Record<string, unknown> = {
    client: args.clientId,
    level: args.level,
    customerId: args.customerId,
    capturedAt,
    rows: args.rows,
    rowCount,
  };
  if (args.dateRangeLabel !== undefined) createData.dateRangeLabel = args.dateRangeLabel;
  if (args.dateRangeStart !== undefined) createData.dateRangeStart = args.dateRangeStart;
  if (args.dateRangeEnd !== undefined) createData.dateRangeEnd = args.dateRangeEnd;
  if (args.sourceEndpoint !== undefined) createData.sourceEndpoint = args.sourceEndpoint;
  if (typeof args.fetchDurationMs === "number") {
    createData.fetchDurationMs = args.fetchDurationMs;
  }
  if (args.error) createData.error = args.error;

  const created = await payload.create({
    collection: "google-ads-snapshots",
    // The narrowed `data` shape from payload-types isn't worth importing here
    // — the Payload create signature is a giant union across all collections.
    // We cast through `never` to get past the union check; the runtime shape
    // matches the GoogleAdsSnapshot collection fields.
    data: createData as never,
    overrideAccess: true,
  });
  return { id: (created as { id: string | number }).id, created: true };
}
