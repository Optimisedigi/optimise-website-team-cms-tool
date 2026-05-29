/**
 * Redirect stub. The agent run timeline moved into the admin shell at
 * /admin/agent-runs/[runId]. Keeps old bookmarks from 404ing.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  redirect(`/admin/agent-runs/${runId}`);
}
