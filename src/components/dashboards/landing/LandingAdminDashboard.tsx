"use client";

import { useCallback, useEffect, useState } from "react";
import { LandingExperimentTab } from "../googleads/LandingExperimentTab";

/**
 * Internal landing overview: client list with 30-day health on the left,
 * the selected client's report and per-property settings on the right.
 *
 * The report itself is the existing LandingExperimentTab — the report route
 * accepts the admin session, so nothing here mints client tokens.
 */

interface DomainRow {
  id: number | string;
  hostname: string;
  status: string;
  dnsRecordType: string | null;
  dnsRecordName: string | null;
  dnsRecordValue: string | null;
  verificationTxt: string | null;
  lastCheckedAt: string | null;
  pathHint: string | null;
}

interface PropertyRow {
  id: number | string;
  name: string;
  propertyKey: string;
  status: string;
  sessions30d: number;
  conversions30d: number;
  activeExperiment: { id: string | null; status: string | null; primaryGoal: string } | null;
  allowedOrigins: string[];
  domains: DomainRow[];
}

interface ClientRow {
  id: number | string;
  name: string;
  slug: string;
  sessions30d: number;
  conversions30d: number;
  properties: PropertyRow[];
}

interface Overview {
  rangeDays: number;
  clients: ClientRow[];
}

const DOMAIN_STATUS_STYLE: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800",
  "pending-dns": "bg-amber-100 text-amber-800",
  "pending-ssl": "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

export function LandingAdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/landing-admin/overview");
      if (!res.ok) throw new Error(`Overview failed (${res.status})`);
      const json = (await res.json()) as Overview;
      setOverview(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load overview");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedClientId && overview?.clients.length) {
      setSelectedClientId(String(overview.clients[0].id));
    }
  }, [overview, selectedClientId]);

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!overview) return <div className="text-sm text-slate-500">Loading landing overview…</div>;
  if (overview.clients.length === 0) {
    return <div className="text-sm text-slate-500">No landing properties configured yet.</div>;
  }

  const selected = overview.clients.find((c) => String(c.id) === selectedClientId) ?? overview.clients[0];

  return (
    <div className="space-y-6">
      {/* Client picker sits top-right of the full-width data box: one row, so
          the report below gets the entire width instead of a 280px sidebar. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Performance — {selected.name}</h2>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Select client">
          {overview.clients.map((client) => {
            const domainStates = client.properties.flatMap((p) => p.domains.map((d) => d.status));
            const isSelected = String(client.id) === String(selected.id);
            const allLive = domainStates.length > 0 && domainStates.every((s) => s === "live");
            return (
              <button
                key={client.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedClientId(String(client.id))}
                title={`${client.sessions30d} sessions · ${client.conversions30d} conversions · ${overview.rangeDays}d`}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  isSelected
                    ? "border-slate-900 bg-white font-semibold text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white/60 text-slate-600 hover:bg-white"
                }`}
              >
                <span>{client.name || client.slug}</span>
                {domainStates.length > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      allLive ? DOMAIN_STATUS_STYLE.live : DOMAIN_STATUS_STYLE["pending-dns"]
                    }`}
                  >
                    {allLive ? "Domains live" : "Domain pending"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* The report renders its own cards; no second card around them. */}
      <LandingExperimentTab slug={selected.slug} />
    </div>
  );
}
