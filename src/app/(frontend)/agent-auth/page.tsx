/**
 * Redirect stub. The agent auth page moved into the admin shell at
 * /admin/agent-auth. Keeps old bookmarks from 404ing.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page() {
  redirect("/admin/agent-auth");
}
