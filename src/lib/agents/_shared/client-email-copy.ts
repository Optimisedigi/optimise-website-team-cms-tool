/**
 * Reader for the editable client-facing email copy.
 *
 * The weekly/monthly report sentences are deterministic: a seed picks one
 * phrasing per slot. This module supplies the phrasing lists that OptiMate
 * Settings → Client Email Copy holds, so the agency can reword a sentence
 * without a deploy.
 *
 * Never throws. A settings-read failure must not stop a client report going
 * out, so it logs and returns no overrides, which leaves every slot on its
 * shipped default.
 */

import { getPayload } from "payload";
import config from "@/payload.config";
import {
  copyFieldName,
  EMAIL_COPY_SLOT_KEYS,
  parseCopyLines,
  type ClientEmailCopy,
} from "@/lib/agents/optimate-google-ads/tools/_email-copy-slots";

export async function loadClientEmailCopy(): Promise<ClientEmailCopy> {
  try {
    const payload = await getPayload({ config: await config });
    const settings = (await payload.findGlobal({
      slug: "optimate-settings" as never,
      depth: 0,
    })) as Record<string, unknown> | null;
    const stored = settings?.clientEmailCopy as Record<string, unknown> | undefined;
    if (!stored) return {};

    const copy: ClientEmailCopy = {};
    for (const slot of EMAIL_COPY_SLOT_KEYS) {
      const lines = parseCopyLines(stored[copyFieldName(slot)]);
      if (lines.length > 0) copy[slot] = lines;
    }
    return copy;
  } catch (err) {
    console.warn("[client-email-copy] settings read failed:", (err as Error).message);
    return {};
  }
}
