import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to handle deployment version tracking.
 *
 * Sets a deploy cookie on full page loads so the client can detect
 * when a new deployment is live. Combined with Next.js's experimental
 * appNavFailHandling, this ensures graceful recovery from stale
 * router state after deployments.
 */

const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "local";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const clientDeployId = request.cookies.get("__deploy_id")?.value;

  if (clientDeployId !== BUILD_ID) {
    response.cookies.set("__deploy_id", BUILD_ID, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
