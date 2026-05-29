import crypto from "crypto";
import type { Payload } from "payload";

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufA.length, 0);
    bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
    crypto.timingSafeEqual(bufA, padded);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

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
  if (!constantTimeCompare(pin, client.clientPin)) return { ok: false, status: 401, error: "Incorrect PIN" };
  return { ok: true, clientId: client.id };
}

export function pinFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return request.headers.get("x-client-pin") || url.searchParams.get("pin");
}
