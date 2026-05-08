/**
 * Tool: get_gsc_indexing_status
 *
 * Returns indexed page count, not-indexed estimate, and a sample of indexing
 * issues from the URL Inspection API. Wraps lib/gsc-service.fetchIndexingStatus.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { fetchIndexingStatus } from "@/lib/gsc-service";
import { getValidGscToken } from "./_client-tokens";

type EmptyArgs = Record<string, never>;

export const getGscIndexingStatus: CanonicalTool<EmptyArgs> = {
  name: "get_gsc_indexing_status",
  description:
    "Returns indexed page count, not-indexed estimate, and a sample of indexing issues from the URL Inspection API for the linked client's GSC property. Takes no arguments.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  validate: () => ({} as EmptyArgs),
  execute: async (_args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;
    const tokenRes = await getValidGscToken(clientId ?? null);
    if (!tokenRes.ok) return { ok: false, error: tokenRes.reason };

    try {
      const result = await fetchIndexingStatus(tokenRes.accessToken, tokenRes.siteUrl);
      return {
        ok: true,
        data: {
          siteUrl: tokenRes.siteUrl,
          indexedPages: result.indexedPages,
          notIndexedPages: result.notIndexedPages,
          indexingIssues: result.indexingIssues,
        },
      };
    } catch (err) {
      return { ok: false, error: `GSC indexing query failed: ${(err as Error).message}` };
    }
  },
};
