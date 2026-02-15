import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to handle Next.js version skew on deployments.
 *
 * When new routes are added (e.g. new Payload collections), the browser's
 * cached Next-Router-State-Tree header becomes stale and can't be parsed
 * by the new deployment, causing 500 errors on all admin navigations.
 *
 * This middleware detects deployment mismatches and returns a non-RSC
 * response that forces the client-side router to do a full page reload.
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

  // Deployment mismatch (or first visit after deploy).
  // Return a non-RSC response so the client falls back to MPA navigation.
  // The client checks: if (!isFlightResponse || !res.ok) → doMpaNavigation()
  const url = request.nextUrl.pathname + request.nextUrl.search;
  return new Response(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body><script>window.location.replace(${JSON.stringify(url)})</script></body></html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html",
        "set-cookie": `__deploy_id=${BUILD_ID}; Path=/; HttpOnly; SameSite=Lax`,
      },
    },
  );
}

export const config = {
  matcher: ["/admin/:path*"],
};
