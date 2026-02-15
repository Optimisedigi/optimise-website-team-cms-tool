import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to handle Next.js version skew on deployments.
 *
 * When new routes are added (e.g. new Payload collections), the browser's
 * cached Next-Router-State-Tree header becomes stale and can't be parsed
 * by the new deployment, causing 500 errors on all admin navigations.
 *
 * This middleware detects deployment mismatches and responds with a 200
 * containing a script that forces a full page reload, bypassing the stale
 * router state entirely.
 */

const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "local";

export function middleware(request: NextRequest) {
  const isRSC = request.headers.get("rsc") === "1";
  const hasRouterState = request.headers.has("next-router-state-tree");

  if (!isRSC || !hasRouterState) {
    // Not a soft navigation or no router state — set deploy cookie
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

  // Deployment mismatch (or first visit after deploy) — force MPA navigation.
  // We can't strip the header (Next.js reads it before our modification applies),
  // so we redirect to the same URL. The redirect causes a full page load
  // which won't send the stale RSC headers.
  const url = request.nextUrl.clone();
  const response = NextResponse.redirect(url, { status: 307 });
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
