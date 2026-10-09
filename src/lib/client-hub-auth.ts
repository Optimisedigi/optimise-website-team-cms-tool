import type { Payload } from "payload";

import { checkPinWithLockout } from "@/lib/pin-auth";

export async function verifyClientHubPin(
  payload: Payload,
  slug: string,
  pin: string | null | undefined,
): Promise<{ ok: true; clientId: string | number } | { ok: false; status: number; error: string }> {
  if (!pin || !/^\d{4}$/.test(pin)) return { ok: false, status: 401, error: "PIN required" };
  const result = await payload.find({
    collection: "clients" as any,
    where: { and: [{ slug: { equals: slug } }, { isActive: { equals: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { clientPin: true },
  });
  const client = result.docs[0] as { id: string | number; clientPin?: string | null } | undefined;
  if (!client?.clientPin) return { ok: false, status: 404, error: "Client not found" };
  // Per-slug persisted lockout: a 4-digit PIN must not be brute-forceable.
  const check = await checkPinWithLockout(`client-hub:${slug}`, pin, client.clientPin);
  if (!check.ok) return { ok: false, status: check.status, error: check.message };
  return { ok: true, clientId: client.id };
}

export function pinFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return request.headers.get("x-client-pin") || url.searchParams.get("pin");
}
