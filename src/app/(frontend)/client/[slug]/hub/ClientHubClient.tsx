"use client";

import React, { useState } from "react";
import { ForecastLab } from "@/components/client-hub/ForecastLab";
import { OrganicGrowthTracker } from "@/components/client-hub/OrganicGrowthTracker";
import { ValueLedger } from "@/components/client-hub/ValueLedger";
import "./client-hub.css";

export function ClientHubClient({ slug }: { slug: string }): React.ReactElement {
  const [pin, setPin] = useState("");
  const [hub, setHub] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  async function loadHub(event?: React.FormEvent): Promise<void> {
    event?.preventDefault();
    setError("");
    const res = await fetch(`/api/client-hub/${slug}?pin=${encodeURIComponent(pin)}`);
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error || "Could not load client hub");
      return;
    }
    setHub(json.hub);
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmittingRequest(true);
    setRequestMessage("");
    try {
      const res = await fetch(`/api/client-hub/${slug}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          requestType: form.get("requestType"),
          title: form.get("title"),
          description: form.get("description"),
          priority: form.get("priority"),
          submittedByName: form.get("submittedByName"),
          submittedByEmail: form.get("submittedByEmail"),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not submit request");
      formElement.reset();
      setRequestMessage("Request submitted. We’ll review it shortly.");
      await loadHub();
    } catch (requestError) {
      setRequestMessage(requestError instanceof Error ? requestError.message : "Could not submit request");
    } finally {
      setSubmittingRequest(false);
    }
  }

  if (!hub) {
    return (
      <main className="client-hub-shell auth">
        <form className="pin-card" onSubmit={loadHub}>
          <p className="eyebrow">Optimise Digital</p>
          <h1>Client Growth Hub</h1>
          <p>Enter your 4-digit client PIN to view tasks, links, requests, value proof, forecasts, and organic growth.</p>
          <input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" pattern="\d{4}" placeholder="PIN" />
          <button type="submit">Open hub</button>
          {error ? <p className="error">{error}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="client-hub-shell">
      <header className="hub-hero">
        <p className="eyebrow">Client Growth Hub</p>
        <h1>{hub.client?.name || "Client"}</h1>
        <p>A living workspace for requests, useful links, delivered value, forecasts, and organic growth.</p>
      </header>

      <section className="hub-panel">
        <h2>Links & documents</h2>
        <div className="hub-grid">
          {(hub.links || []).map((link: Record<string, unknown>, index: number) => (
            <a className="hub-card" href={String(link.url)} key={`${String(link.url)}-${index}`}>
              <p className="eyebrow">{String(link.kind || "link")}</p>
              <h3>{String(link.label || "Open link")}</h3>
            </a>
          ))}
        </div>
      </section>

      <section className="hub-panel">
        <h2>Request Hub</h2>
        <form className="request-form" onSubmit={submitRequest}>
          <div className="form-row">
            <label>
              Request type
              <select name="requestType" defaultValue="general">
                <option value="website_edit">Website edit</option>
                <option value="campaign_question">Campaign question</option>
                <option value="tracking_issue">Tracking issue</option>
                <option value="billing">Billing/admin</option>
                <option value="content_request">Content/SEO idea</option>
                <option value="general">General</option>
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <label>
            Title
            <input name="title" required placeholder="What do you need help with?" />
          </label>
          <label>
            Details
            <textarea name="description" required rows={4} placeholder="Add the page URL, campaign, example, or context." />
          </label>
          <div className="form-row">
            <label>
              Your name
              <input name="submittedByName" placeholder="Name" />
            </label>
            <label>
              Your email
              <input name="submittedByEmail" type="email" placeholder="you@example.com" />
            </label>
          </div>
          <button type="submit" disabled={submittingRequest}>{submittingRequest ? "Submitting…" : "Submit request"}</button>
          {requestMessage ? <p className={requestMessage.includes("submitted") ? "success" : "error"}>{requestMessage}</p> : null}
        </form>
        {(hub.requests || []).length === 0 ? <p>No open requests yet.</p> : null}
        <div className="hub-grid">
          {(hub.requests || []).map((request: Record<string, unknown>) => (
            <article className="hub-card" key={String(request.id)}>
              <p className="eyebrow">{String(request.status || "new").replace(/_/g, " ")}</p>
              <h3>{String(request.title || "Request")}</h3>
              <p>{String(request.description || "")}</p>
            </article>
          ))}
        </div>
      </section>

      <ValueLedger items={hub.valueLedger?.items || []} summary={hub.valueLedger?.summary} />
      <ForecastLab scenarios={hub.forecastScenarios || []} />
      <OrganicGrowthTracker snapshots={hub.organicGrowthSnapshots || []} />
    </main>
  );
}
