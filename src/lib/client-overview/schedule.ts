/**
 * Fire-and-forget entry point for the "Who is this client?" auto-draft, called
 * from collection afterChange hooks.
 *
 * The work (website fetch + LLM) takes tens of seconds and opens its own
 * database reads/writes, so it must never run inside the triggering save:
 *  - Inside a Next request it is handed to `after()`, which runs once the
 *    response is sent (so the save has committed) and keeps the serverless
 *    function alive until the draft is queued.
 *  - Outside a request (scripts, local API) `after()` throws, so it falls back
 *    to the next macrotask, like `deferPostCommit`.
 *
 * The worker is imported lazily: it pulls in the LLM layer and the approval
 * queue, which import the Payload config, and collection files are part of
 * that config.
 */

import { after } from "next/server";
import type { Payload } from "payload";
import type { ClientOverviewTrigger } from "./draft";

export function scheduleClientOverviewDraft(
  payload: Payload,
  clientId: number | string | null | undefined,
  trigger: ClientOverviewTrigger,
): void {
  if (clientId === null || clientId === undefined || clientId === "") return;

  const work = async (): Promise<void> => {
    try {
      const { runClientOverviewDraft } = await import("./draft");
      const outcome = await runClientOverviewDraft(payload, clientId, trigger);
      const line = `[client-overview] client ${clientId} (${trigger}): ${outcome.status}${
        outcome.status === "queued" ? ` as approval #${outcome.approvalId}` : ` (${outcome.reason})`
      }`;
      if (outcome.status === "failed") payload.logger?.warn?.(line);
      else payload.logger?.info?.(line);
    } catch (err) {
      payload.logger?.warn?.(`[client-overview] client ${clientId} (${trigger}) crashed: ${String(err)}`);
    }
  };

  try {
    after(work);
  } catch {
    setTimeout(() => void work(), 0);
  }
}
