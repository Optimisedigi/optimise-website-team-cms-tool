/**
 * Redirect stub. The agent approvals list moved into the admin shell at
 * /admin/agent-approvals. This keeps old bookmarks from 404ing. Query string
 * (e.g. ?status=pending) is preserved.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.append(key, value);
    else if (Array.isArray(value)) for (const v of value) qs.append(key, v);
  }
  const query = qs.toString();
  redirect(`/admin/agent-approvals${query ? `?${query}` : ""}`);
}
