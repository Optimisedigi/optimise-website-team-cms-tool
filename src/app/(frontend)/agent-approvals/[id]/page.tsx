/**
 * Redirect stub. The approval detail page moved into the admin shell at
 * /admin/agent-approvals/[id]. Keeps old bookmarks from 404ing.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/agent-approvals/${id}`);
}
