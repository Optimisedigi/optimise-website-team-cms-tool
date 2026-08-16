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

const DOMAIN_STATUS_LABEL: Record<string, string> = {
  live: "Live",
  "pending-dns": "Waiting on DNS",
  "pending-ssl": "SSL provisioning",
  error: "Error",
};

/** Exact scheme://host[:port] — matches what the manifest route compares against. */
const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;

export function LandingAdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function withBusy(key: string, action: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function addDomain(propertyId: PropertyRow["id"], hostname: string, pathHint: string) {
    await withBusy(`add-${propertyId}`, async () => {
      const res = await fetch("/api/landing-admin/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId, hostname, pathHint }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `Domain registration failed (${res.status})`);
      setNotice(`Domain registered. Copy the client instructions and send them.`);
      await load();
    });
  }

  async function checkDomain(domainId: DomainRow["id"]) {
    await withBusy(`check-${domainId}`, async () => {
      const res = await fetch(`/api/landing-admin/domains/${domainId}/check`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; status?: string; originAdded?: boolean }
        | null;
      if (!res.ok) throw new Error(json?.error ?? `Check failed (${res.status})`);
      setNotice(
        json?.status === "live"
          ? `Domain is live${json.originAdded ? " — origin added to the allowlist" : ""}.`
          : "Still waiting on DNS.",
      );
      await load();
    });
  }

  async function copyInstructions(domainId: DomainRow["id"]) {
    await withBusy(`copy-${domainId}`, async () => {
      const res = await fetch(`/api/landing-admin/domains/${domainId}/instructions`);
      if (!res.ok) throw new Error(`Could not load instructions (${res.status})`);
      await navigator.clipboard.writeText(await res.text());
      setNotice("Client instructions copied to clipboard.");
    });
  }

  async function saveOrigins(property: PropertyRow, origins: string[]) {
    await withBusy(`origins-${property.id}`, async () => {
      // Payload's own REST API: same admin cookie, same access control.
      const res = await fetch(`/api/landing-properties/${property.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowedOrigins: origins.map((origin) => ({ origin })) }),
      });
      if (!res.ok) throw new Error(`Saving origins failed (${res.status})`);
      setNotice("Allowed origins updated.");
      await load();
    });
  }

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!overview) return <div className="text-sm text-slate-500">Loading landing overview…</div>;
  if (overview.clients.length === 0) {
    return <div className="text-sm text-slate-500">No landing properties configured yet.</div>;
  }

  const selected = overview.clients.find((c) => String(c.id) === selectedClientId) ?? overview.clients[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        {overview.clients.map((client) => {
          const domainStates = client.properties.flatMap((p) => p.domains.map((d) => d.status));
          const isSelected = String(client.id) === String(selected.id);
          return (
            <button
              key={String(client.id)}
              type="button"
              onClick={() => setSelectedClientId(String(client.id))}
              className={`w-full rounded-xl border p-4 text-left transition ${
                isSelected ? "border-slate-900 bg-white shadow-sm" : "border-slate-200 bg-white/60 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{client.name || client.slug}</span>
                {domainStates.length > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      domainStates.every((s) => s === "live")
                        ? DOMAIN_STATUS_STYLE.live
                        : DOMAIN_STATUS_STYLE["pending-dns"]
                    }`}
                  >
                    {domainStates.every((s) => s === "live") ? "Domains live" : "Domain pending"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {client.sessions30d} sessions · {client.conversions30d} conversions · {overview.rangeDays}d
              </p>
            </button>
          );
        })}
      </aside>

      <div className="space-y-6">
        {notice && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">{notice}</div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Performance — {selected.name}</h2>
          <LandingExperimentTab slug={selected.slug} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Settings</h2>
          <p className="mt-1 text-xs text-slate-500">
            Custom domains and the origin allowlist. A property refuses events from any origin not listed here.
          </p>

          {selected.properties.map((property) => (
            <PropertySettings
              key={String(property.id)}
              property={property}
              busy={busy}
              onAddDomain={addDomain}
              onCheckDomain={checkDomain}
              onCopyInstructions={copyInstructions}
              onSaveOrigins={saveOrigins}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function PropertySettings({
  property,
  busy,
  onAddDomain,
  onCheckDomain,
  onCopyInstructions,
  onSaveOrigins,
}: {
  property: PropertyRow;
  busy: string | null;
  onAddDomain: (propertyId: PropertyRow["id"], hostname: string, pathHint: string) => Promise<void>;
  onCheckDomain: (domainId: DomainRow["id"]) => Promise<void>;
  onCopyInstructions: (domainId: DomainRow["id"]) => Promise<void>;
  onSaveOrigins: (property: PropertyRow, origins: string[]) => Promise<void>;
}) {
  const [hostname, setHostname] = useState("");
  const [pathHint, setPathHint] = useState("");
  const [newOrigin, setNewOrigin] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-900">{property.name}</h3>
        <span className="text-xs text-slate-500">
          {property.sessions30d} sessions · {property.conversions30d} conversions (30d)
        </span>
      </div>

      {/* Domains */}
      <div className="mt-3 space-y-2">
        {property.domains.map((domain) => (
          <div key={String(domain.id)} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{domain.hostname}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    DOMAIN_STATUS_STYLE[domain.status] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {DOMAIN_STATUS_LABEL[domain.status] ?? domain.status}
                </span>
                {domain.pathHint && <span className="text-xs text-slate-400">{domain.pathHint}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void onCheckDomain(domain.id)}
                  disabled={busy === `check-${domain.id}`}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === `check-${domain.id}` ? "Checking…" : "Check now"}
                </button>
                <button
                  type="button"
                  onClick={() => void onCopyInstructions(domain.id)}
                  disabled={busy === `copy-${domain.id}`}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Copy client instructions
                </button>
              </div>
            </div>
            {domain.dnsRecordValue && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  {domain.dnsRecordType} {domain.dnsRecordName} → {domain.dnsRecordValue}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(domain.dnsRecordValue ?? "")}
                  className="text-slate-500 underline hover:text-slate-800"
                >
                  copy value
                </button>
              </div>
            )}
            {domain.verificationTxt && (
              <p className="mt-1 text-xs text-amber-700">
                Needs TXT verification: <code>{domain.verificationTxt}</code>
              </p>
            )}
            {domain.lastCheckedAt && (
              <p className="mt-1 text-[10px] text-slate-400">
                Last checked {new Date(domain.lastCheckedAt).toLocaleString()}
              </p>
            )}
          </div>
        ))}

        <form
          className="flex items-end gap-2 flex-wrap"
          onSubmit={(event) => {
            event.preventDefault();
            const value = hostname.trim().toLowerCase();
            if (!value) return;
            void onAddDomain(property.id, value, pathHint.trim()).then(() => {
              setHostname("");
              setPathHint("");
            });
          }}
        >
          <label className="text-xs text-slate-600">
            Add custom domain
            <input
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder="hire.example.com"
              className="mt-1 block w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Page hint (optional)
            <input
              value={pathHint}
              onChange={(event) => setPathHint(event.target.value)}
              placeholder="/outsourcing-au"
              className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy === `add-${property.id}` || !hostname.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy === `add-${property.id}` ? "Registering…" : "Register domain"}
          </button>
        </form>
      </div>

      {/* Allowed origins */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allowed origins</h4>
        <ul className="mt-2 space-y-1">
          {property.allowedOrigins.map((origin) => (
            <li key={origin} className="flex items-center justify-between gap-2 text-sm text-slate-700">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{origin}</code>
              <button
                type="button"
                onClick={() =>
                  void onSaveOrigins(
                    property,
                    property.allowedOrigins.filter((existing) => existing !== origin),
                  )
                }
                disabled={busy === `origins-${property.id}` || property.allowedOrigins.length <= 1}
                title={
                  property.allowedOrigins.length <= 1
                    ? "A property must keep at least one origin"
                    : "Remove this origin"
                }
                className="text-xs text-red-600 hover:underline disabled:opacity-40 disabled:no-underline"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = newOrigin.trim().toLowerCase().replace(/\/+$/, "");
            if (!ORIGIN_PATTERN.test(value)) {
              setOriginError("Must be an exact origin like https://hire.example.com — no path, no trailing slash.");
              return;
            }
            setOriginError(null);
            if (property.allowedOrigins.includes(value)) return;
            void onSaveOrigins(property, [...property.allowedOrigins, value]).then(() => setNewOrigin(""));
          }}
        >
          <input
            value={newOrigin}
            onChange={(event) => setNewOrigin(event.target.value)}
            placeholder="https://hire.example.com"
            className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy === `origins-${property.id}` || !newOrigin.trim()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Add origin
          </button>
        </form>
        {originError && <p className="mt-1 text-xs text-red-600">{originError}</p>}
      </div>
    </div>
  );
}
