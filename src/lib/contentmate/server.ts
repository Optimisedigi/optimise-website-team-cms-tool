import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { ContentMateClient } from "@/lib/agents/contentmate/tools";

export async function authenticateBlogUser() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  return { payload, user: user as { id: string | number; role?: string } | null };
}

export async function activeContentMateClients(payload: Awaited<ReturnType<typeof getPayload>>): Promise<ContentMateClient[]> {
  const result = await payload.find({
    collection: "clients",
    where: { isActive: { not_equals: false } },
    sort: "name",
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { name: true },
  });
  return result.docs.flatMap((client) => typeof client.name === "string" && client.name.trim()
    ? [{ id: String(client.id), name: client.name.trim() }]
    : []);
}
