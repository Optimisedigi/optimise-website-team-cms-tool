"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ForecastLab } from "@/components/client-hub/ForecastLab";
import { OrganicGrowthTracker } from "@/components/client-hub/OrganicGrowthTracker";
import { ValueLedger } from "@/components/client-hub/ValueLedger";
import {
  PinGateFrame,
  pinGateBlurredInputStyle,
  pinGateFocusedInputStyle,
  pinGateInputStyle,
} from "@/components/PinGateFrame";
import { usePinDigitClick } from "@/components/usePinDigitClick";
import "./client-hub.css";

export function ClientHubClient({ slug }: { slug: string }): React.ReactElement {
  const [pin, setPin] = useState("");
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [hub, setHub] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const playDigitClick = usePinDigitClick();

  const loadHubWithPin = useCallback(async (pinValue: string): Promise<void> => {
    setError("");
    setPinLoading(true);
    try {
      const res = await fetch(`/api/client-hub/${slug}?pin=${encodeURIComponent(pinValue)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Could not load client hub");
        return;
      }
      setPin(pinValue);
      setHub(json.hub);
    } catch {
      setError("Could not load client hub");
    } finally {
      setPinLoading(false);
      setDigits(["", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  }, [slug]);

  async function loadHub(event?: React.FormEvent): Promise<void> {
    event?.preventDefault();
    await loadHubWithPin(pin);
  }

  const handleDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError("");
    if (digit) playDigitClick();
    if (digit && index < 3) inputRefs.current[index + 1]?.focus();
    if (digit && index === 3 && next.every((d) => d !== "")) {
      void loadHubWithPin(next.join(""));
    }
  }, [digits, loadHubWithPin, playDigitClick]);

  const handleKeyDown = useCallback((index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    const next = ["", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    setError("");
    for (let i = 0; i < pasted.length; i++) window.setTimeout(playDigitClick, i * 45);
    if (pasted.length === 4) void loadHubWithPin(pasted);
    else inputRefs.current[pasted.length]?.focus();
  }, [loadHubWithPin, playDigitClick]);

  useEffect(() => {
    if (!hub) inputRefs.current[0]?.focus();
  }, [hub]);

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
      <PinGateFrame
        eyebrow="Client Growth Hub"
        title="Optimise Digital"
        subtitle="Enter your 4-digit PIN access code to view tasks, links, requests, value proof, forecasts, and organic growth"
      >
        <form style={{ position: "relative" }} onSubmit={loadHub}>
          <div style={{ display: "flex", justifyContent: "center", gap: 18 }} onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                disabled={pinLoading}
                onChange={(event) => handleDigitChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                style={{ ...pinGateInputStyle, opacity: pinLoading ? 0.5 : 1 }}
                onFocus={(event) => {
                  Object.assign(event.currentTarget.style, pinGateFocusedInputStyle);
                }}
                onBlur={(event) => {
                  Object.assign(event.currentTarget.style, pinGateBlurredInputStyle);
                }}
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>
          <button type="submit" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Open hub
          </button>
          {pinLoading ? <p style={{ marginTop: 24, fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 13, color: "#8b90ad", textAlign: "center" }}>Verifying...</p> : null}
          {error ? <p style={{ marginTop: 24, fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 13, color: "#ff7a7a", textAlign: "center" }}>{error}</p> : null}
        </form>
      </PinGateFrame>
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
