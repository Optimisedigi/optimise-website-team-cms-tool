import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to handle Next.js version skew on deployments.
 *
 * When new routes are added (e.g. new Payload collections), the browser's
 * cached Next-Router-State-Tree header becomes stale and can't be parsed
 * by the new deployment, causing 500 errors on all admin navigations.
 *
 * This middleware strips the stale header when a deployment mismatch is
 * detected, forcing Next.js to treat the request as an initial page load.
 */

const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "local";

export function middleware(request: NextRequest) {
  const isRSC = request.headers.get("rsc") === "1";
  const hasRouterState = request.headers.has("next-router-state-tree");

  if (!isRSC || !hasRouterState) {
    // Not a soft navigation or no router state — nothing to fix
    const response = NextResponse.next();
    response.cookies.set("__deploy_id", BUILD_ID, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  }

  // RSC request with router state header — check for version mismatch
  const clientDeployId = request.cookies.get("__deploy_id")?.value;

  if (clientDeployId && clientDeployId === BUILD_ID) {
    // Same deployment — let the header through
    return NextResponse.next();
  }

  // Deployment mismatch (or first visit) — strip the stale header
  // This forces Next.js to treat it as an initial render
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("next-router-state-tree");

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.cookies.set("__deploy_id", BUILD_ID, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
