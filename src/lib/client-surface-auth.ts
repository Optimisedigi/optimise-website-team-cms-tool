import type { NextRequest } from "next/server";
import type { Payload } from "payload";

import { validateDashboardToken } from "@/app/(frontend)/api/dashboard/verify/route";

/**
 * Gate for per-client surfaces (Google Ads account structure, snapshots).
 *
 * Passes when the caller holds a dashboard PIN token minted for this slug
 * (`dashboard_token` cookie) or an authenticated Payload admin session.
 * Fails closed: any error in the session lookup is treated as unauthenticated.
 */
export async function isAuthorisedForClientSlug(
  req: NextRequest,
  payload: Payload,
  slug: string,
): Promise<boolean> {
  const token = req.cookies.get("dashboard_token")?.value;
  if (validateDashboardToken(token, slug)) return true;
  try {
    const { user } = await payload.auth({ headers: req.headers });
    return Boolean(user);
  } catch {
    return false;
  }
}
