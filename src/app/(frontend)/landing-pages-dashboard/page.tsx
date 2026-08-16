import { headers } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { LandingAdminDashboard } from "@/components/dashboards/landing/LandingAdminDashboard";
import "../google-dashboard/globals.css";

/**
 * Internal overview of every client's landing pages: 30-day traffic and
 * conversions per property, the embedded per-client experiment report, and the
 * settings area that maps custom domains and manages allowedOrigins.
 *
 * Auth is the Payload admin session (same-origin cookie set by /admin login),
 * exactly as the ad-group-scaffold route already does. No PIN, no dashboard
 * tokens: this page is cross-tenant and internal-only.
 */

export const dynamic = "force-dynamic";

export const metadata = { title: "Landing pages | Optimise Digital" };

export default async function LandingPagesDashboardPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">Landing pages</h1>
          <p className="mt-2 text-sm text-slate-600">This is an internal dashboard.</p>
          <a
            href="/admin/login?redirect=%2Flanding-pages-dashboard"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Sign in to the CMS
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto w-full max-w-6xl px-6">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-slate-500">Internal</p>
          <h1 className="text-2xl font-semibold text-slate-900">Landing pages</h1>
        </header>
        <LandingAdminDashboard />
      </div>
    </main>
  );
}
