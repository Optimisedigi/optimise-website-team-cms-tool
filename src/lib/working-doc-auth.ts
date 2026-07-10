import { getPayload } from "payload";

import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

const knownWorkingDocs = new Set(["cipher/patient-journey-review"]);

export function isKnownWorkingDocSlug(slug: string) {
  return knownWorkingDocs.has(slug);
}

export async function verifyWorkingDocPin(input: { slug: string; pin: string }) {
  const [clientSlug, deckSlug] = input.slug.split("/", 2);
  if (!clientSlug || !deckSlug || !isKnownWorkingDocSlug(input.slug)) {
    return { ok: false, status: 404 as const, message: "Document not found" };
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const clientResult = await payload.find({
    collection: "clients",
    where: { slug: { equals: clientSlug } },
    limit: 1,
    overrideAccess: true,
    select: { clientPin: true },
  });
  const client = clientResult.docs[0] as { clientPin?: string | null } | undefined;

  const result = await checkPinWithLockout(
    `audit-auth:${input.slug}`,
    input.pin,
    client?.clientPin ?? "",
  );

  if (result.ok) return { ok: true as const };
  return { ok: false as const, status: result.status, message: result.message };
}
