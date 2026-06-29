"use client";

/**
 * OptiMate auth setup page (client body).
 *
 * One-time Anthropic OAuth connection (Claude Code client impersonation),
 * status panel showing per-provider credential state, and an emergency
 * force-fallback toggle.
 *
 * Rendered inside the Payload admin shell by
 * `src/app/(payload)/admin/agent-auth/page.tsx` (server). The API endpoints it
 * fetches enforce a logged-in CMS user on every call.
 */

import { useEffect, useState } from "react";

interface ProviderStatus {
  provider: string;
  oauthConnected: boolean;
  oauthExpiresAt: number | null;
  oauthObtainedAt: number | null;
  oauthAccountId?: boolean;
  codexDisabled?: boolean;
  forceFallback: boolean;
  envApiKeyPresent: boolean;
  lastFailure: { timestamp: string; message: string } | null;
}

interface GmailStatus {
  connected: boolean;
  email: string | null;
  tokenExpiry: string | null;
  settingsAccess?: boolean;
  hasSignature?: boolean;
  reconnectRequired?: boolean;
}

const baseStyle = {
  fontFamily: "system-ui, -apple-system, sans-serif",
  maxWidth: 720,
  margin: "0 auto",
  padding: "24px 0",
  color: "var(--theme-elevation-900, #222)",
};
const cardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};
const buttonStyle = {
  background: "#0b5394",
  color: "#fff",
  border: "none",
  padding: "8px 14px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};
const ghostButtonStyle = {
  ...buttonStyle,
  background: "transparent",
  color: "#0b5394",
  border: "1px solid #0b5394",
};
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  fontSize: 13,
  fontFamily: "ui-monospace, monospace",
};
const labelStyle = { fontSize: 12, color: "#666", marginBottom: 4, display: "block" };

function formatExpiry(ms: number | null): string {
  if (ms === null) return "n/a";
  const diff = ms - Date.now();
  if (diff < 0) return "expired";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function providerDisplayName(provider: string): string {
  switch (provider) {
    case "moonshot":
      return "Kimi API key (KIMI_API_KEY)";
    case "kimi-coding":
      return "Kimi For Coding OAuth";
    case "openai-codex":
      return "GPT Codex OAuth";
    case "xai-grok":
      return "Grok OAuth";
    default:
      return provider;
  }
}

function providerApiKeyLabel(provider: string, isPresent: boolean): { text: string; color: string } {
  if (provider === "kimi-coding" || provider === "openai-codex" || provider === "xai-grok") {
    return { text: "n/a (OAuth only)", color: "#9ca3af" };
  }
  return isPresent
    ? { text: provider === "moonshot" ? "set (Kimi API key)" : "set", color: "#15803d" }
    : { text: "missing", color: "#dc2626" };
}

export default function AgentAuthPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [pasteString, setPasteString] = useState("");
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  // Codex (ChatGPT) PKCE paste flow state — mirrors the Anthropic flow.
  const [codexAuthorizeUrl, setCodexAuthorizeUrl] = useState<string | null>(null);
  const [codexPasteString, setCodexPasteString] = useState("");
  const [codexCompleting, setCodexCompleting] = useState(false);
  // Kimi / Grok device-code flow state.
  const [kimiUserCode, setKimiUserCode] = useState<string | null>(null);
  const [kimiVerificationUri, setKimiVerificationUri] = useState<string | null>(null);
  const [kimiPolling, setKimiPolling] = useState(false);
  const [grokUserCode, setGrokUserCode] = useState<string | null>(null);
  const [grokVerificationUri, setGrokVerificationUri] = useState<string | null>(null);
  const [grokPolling, setGrokPolling] = useState(false);

  async function loadStatus() {
    setLoading(true);
    const [authRes, gmailRes] = await Promise.all([
      fetch("/api/agent-auth/status"),
      fetch("/api/gmail/status", { credentials: "include" }),
    ]);
    if (!authRes.ok) {
      setMessage(`Failed to load status (HTTP ${authRes.status})`);
      setLoading(false);
      return;
    }
    const json = await authRes.json();
    setProviders(json.providers);
    if (gmailRes.ok) {
      const gmailJson = (await gmailRes.json()) as GmailStatus;
      setGmailStatus(gmailJson);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();

    function handleCodexConnected() {
      setMessage("Connected to ChatGPT via Codex OAuth.");
      setCodexPasteString("");
      setCodexAuthorizeUrl(null);
      void loadStatus();
    }

    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "optimate-oauth-connected") return;
      if (event.data.provider === "openai-codex" && event.data.ok) handleCodexConnected();
    }

    function handleOAuthStorage(event: StorageEvent) {
      if (event.key !== "optimate-oauth-openai-codex" || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue) as { ok?: boolean };
        if (data.ok) handleCodexConnected();
      } catch {
        // Ignore malformed storage notifications.
      }
    }

    window.addEventListener("message", handleOAuthMessage);
    window.addEventListener("storage", handleOAuthStorage);
    return () => {
      window.removeEventListener("message", handleOAuthMessage);
      window.removeEventListener("storage", handleOAuthStorage);
    };
  }, []);

  async function handleBegin() {
    setMessage(null);
    const res = await fetch("/api/agent-auth/begin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "anthropic" }),
    });
    if (!res.ok) {
      const j = await res.json();
      setMessage(`Begin failed: ${j.error ?? res.status}`);
      return;
    }
    const json = await res.json();
    setAuthorizeUrl(json.authorizeUrl);
    window.open(json.authorizeUrl, "_blank", "noopener,noreferrer");
  }

  async function handleComplete() {
    setMessage(null);
    setCompleting(true);
    const res = await fetch("/api/agent-auth/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pasteString }),
    });
    setCompleting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(`Complete failed: ${json.error ?? res.status}`);
      return;
    }
    setMessage("Connected to Anthropic via OAuth.");
    setPasteString("");
    setAuthorizeUrl(null);
    await loadStatus();
  }

  async function handleCodexBegin() {
    setMessage(null);
    const res = await fetch("/api/agent-auth/begin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai-codex" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(`Codex begin failed: ${json.error ?? res.status}`);
      return;
    }
    setCodexAuthorizeUrl(json.authorizeUrl);
    window.open(json.authorizeUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCodexComplete() {
    setMessage(null);
    setCodexCompleting(true);
    const res = await fetch("/api/agent-auth/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pasteString: codexPasteString }),
    });
    setCodexCompleting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(`Codex complete failed: ${json.error ?? res.status}`);
      return;
    }
    setMessage("Connected to ChatGPT via Codex OAuth.");
    setCodexPasteString("");
    setCodexAuthorizeUrl(null);
    await loadStatus();
  }

  async function handleKimiBegin() {
    setMessage(null);
    setKimiUserCode(null);
    setKimiVerificationUri(null);
    const res = await fetch("/api/agent-auth/kimi/begin", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(`Kimi begin failed: ${json.error ?? res.status}`);
      return;
    }
    setKimiUserCode(json.userCode);
    setKimiVerificationUri(json.verificationUri);
    window.open(json.verificationUri, "_blank", "noopener,noreferrer");
    void pollKimi(Math.max(2, Number(json.interval) || 5), Number(json.expiresIn) || 600);
  }

  async function pollKimi(intervalSec: number, expiresInSec: number) {
    setKimiPolling(true);
    const deadline = Date.now() + expiresInSec * 1000;
    let delay = intervalSec * 1000;
    try {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, delay));
        const res = await fetch("/api/agent-auth/kimi/poll", { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(`Kimi poll failed: ${json.error ?? res.status}`);
          return;
        }
        if (json.status === "connected") {
          setMessage("Connected to Kimi For Coding via your Kimi subscription.");
          setKimiUserCode(null);
          setKimiVerificationUri(null);
          await loadStatus();
          return;
        }
        if (json.status === "denied") {
          setMessage("Kimi authorization was denied. Click Begin login to retry.");
          setKimiUserCode(null);
          return;
        }
        if (json.status === "expired") {
          setMessage("Kimi login code expired. Click Begin login to retry.");
          setKimiUserCode(null);
          return;
        }
        if (json.status === "slow_down") delay += 5000;
      }
      setMessage("Kimi login timed out. Click Begin login to retry.");
      setKimiUserCode(null);
    } finally {
      setKimiPolling(false);
    }
  }

  async function handleGrokBegin() {
    setMessage(null);
    setGrokUserCode(null);
    setGrokVerificationUri(null);
    const res = await fetch("/api/agent-auth/grok/begin", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(`Grok begin failed: ${json.error ?? res.status}`);
      return;
    }
    setGrokUserCode(json.userCode);
    setGrokVerificationUri(json.verificationUri);
    window.open(json.verificationUri, "_blank", "noopener,noreferrer");
    void pollGrok(Math.max(2, Number(json.interval) || 5), Number(json.expiresIn) || 600);
  }

  async function pollGrok(intervalSec: number, expiresInSec: number) {
    setGrokPolling(true);
    const deadline = Date.now() + expiresInSec * 1000;
    let delay = intervalSec * 1000;
    try {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, delay));
        const res = await fetch("/api/agent-auth/grok/poll", { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(`Grok poll failed: ${json.error ?? res.status}`);
          return;
        }
        if (json.status === "connected") {
          setMessage("Connected to xAI Grok via your SuperGrok subscription.");
          setGrokUserCode(null);
          setGrokVerificationUri(null);
          await loadStatus();
          return;
        }
        if (json.status === "denied") {
          setMessage("Grok authorization was denied. Click Begin login to retry.");
          setGrokUserCode(null);
          return;
        }
        if (json.status === "expired") {
          setMessage("Grok login code expired. Click Begin login to retry.");
          setGrokUserCode(null);
          return;
        }
        // slow_down: back off an extra 5s per RFC 8628.
        if (json.status === "slow_down") delay += 5000;
      }
      setMessage("Grok login timed out. Click Begin login to retry.");
      setGrokUserCode(null);
    } finally {
      setGrokPolling(false);
    }
  }

  async function handleToggleForceFallback(provider: string, enabled: boolean) {
    setMessage(null);
    const res = await fetch("/api/agent-auth/force-fallback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, enabled }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMessage(`Toggle failed: ${j.error ?? res.status}`);
      return;
    }
    await loadStatus();
  }

  async function disconnectGmail() {
    if (!confirm("Disconnect Gmail for your CMS user? You can reconnect straight after to grant the latest permissions.")) {
      return;
    }
    setGmailBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setMessage(`Gmail disconnect failed: ${json.error ?? res.status}`);
        return;
      }
      setMessage("Gmail disconnected. Click Connect Gmail to reconnect with the latest permissions.");
      await loadStatus();
    } finally {
      setGmailBusy(false);
    }
  }

  async function handleProbe(model: string) {
    setProbeResult(`Probing ${model}...`);
    const res = await fetch("/api/agent-auth/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const json = await res.json();
    if (json.ok) {
      setProbeResult(
        `OK. Model ${json.model} via ${json.source}, ${json.latencyMs}ms. Reply: "${json.replyPreview}"`,
      );
    } else {
      setProbeResult(`FAILED. ${json.error ?? "unknown error"} (${json.latencyMs}ms)`);
    }
  }

  return (
    <div style={baseStyle}>
      <h1 style={{ margin: "0 0 4px" }}>OptiMate auth</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Per-provider credential status for OptiMate. Claude uses Anthropic OAuth/API keys; Kimi is available through both API keys and Kimi For Coding OAuth; MiniMax uses API keys.
        GPT-5.5 is exposed through the ChatGPT subscription Codex OAuth path (the <code>gpt-5.5-codex</code> model), and Grok through the SuperGrok subscription OAuth path (the <code>grok-build</code> / <code>grok-composer-2.5-fast</code> models) — connect subscription models below.
      </p>

      {message && (
        <div style={{ ...cardStyle, background: "#f0f9ff", borderColor: "#0ea5e9", color: "#075985" }}>
          {message}
        </div>
      )}

      <div style={{ ...cardStyle, background: "#fffbeb", borderColor: "#fde68a" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>GPT / OpenAI auth</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
          Connect a ChatGPT plan with Codex OAuth (card below) and use the <code>gpt-5.5-codex</code> model. Reasoning is controlled per request from the chat UI. Plain OpenAI API-key models are hidden because this CMS is not configured with <code>OPENAI_API_KEY</code>. The Codex path reuses the Codex CLI OAuth client against a private endpoint — a ToS grey area OpenAI can break at any time — so any failure falls through the normal fallback chain (Kimi → MiniMax → Claude). Kill-switch: set <code>CODEX_OAUTH_DISABLED=1</code> in the environment to disable it fleet-wide instantly.
        </p>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Kimi auth</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666", lineHeight: 1.5 }}>
          Connect your Kimi coding subscription with the official kimi-cli device-code OAuth flow. Powers the
          {" "}<code>kimi-for-coding</code> model and does not spend <code>KIMI_API_KEY</code> credits. The billed API-key
          Kimi model remains available as <code>kimi-k2.6</code>. Kill-switch: set <code>KIMI_CODING_OAUTH_DISABLED=1</code>.
        </p>
        <button onClick={handleKimiBegin} disabled={kimiPolling} style={{ ...buttonStyle, opacity: kimiPolling ? 0.5 : 1 }}>
          {kimiPolling ? "Waiting for approval…" : "Begin Kimi login"}
        </button>
        {kimiUserCode && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#444" }}>
            <p style={{ margin: "0 0 6px" }}>
              Approve in the tab that opened (or{" "}
              {kimiVerificationUri && (
                <a href={kimiVerificationUri} target="_blank" rel="noopener noreferrer">click here</a>
              )}
              ), confirming this code:
            </p>
            <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, background: "#f3f4f6", padding: "4px 10px", borderRadius: 4 }}>
              {kimiUserCode}
            </code>
            <p style={{ margin: "8px 0 0", color: "#666" }}>
              {kimiPolling ? "Polling for approval… this completes automatically once you approve." : ""}
            </p>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Gmail connection</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666", lineHeight: 1.5 }}>
          Used by OptiMate to search attached emails, create Gmail drafts and replies, and append your Gmail signature. Reconnect if signature/settings access is missing.
        </p>
        {gmailStatus?.connected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: gmailStatus.reconnectRequired ? "#b45309" : "#15803d", fontWeight: 600 }}>
              Connected{gmailStatus.email ? `: ${gmailStatus.email}` : ""}
              {gmailStatus.reconnectRequired
                ? " · reconnect needed for signature access"
                : gmailStatus.settingsAccess
                  ? gmailStatus.hasSignature
                    ? " · signature ready"
                    : " · settings access ready, no Gmail signature found"
                  : ""}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <a href="/api/gmail/connect" style={{ ...ghostButtonStyle, textDecoration: "none" }}>
                Reconnect Gmail
              </a>
              <button type="button" onClick={disconnectGmail} disabled={gmailBusy} style={{ ...ghostButtonStyle, color: "#b91c1c", borderColor: "#b91c1c", opacity: gmailBusy ? 0.6 : 1 }}>
                {gmailBusy ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <a href="/api/gmail/connect" style={{ ...buttonStyle, display: "inline-block", textDecoration: "none" }}>
            Connect Gmail
          </a>
        )}
      </div>

      {/* Connect ChatGPT via Codex OAuth (Authorization Code + PKCE callback flow) */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Connect ChatGPT (Codex OAuth)</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666" }}>
          Opens ChatGPT sign-in in a new tab and returns to this CMS automatically. If the provider still shows a callback URL instead of completing, copy its full URL or <code>code</code> value and paste it below. Powers the <code>gpt-5.5-codex</code> model.
        </p>
        <button onClick={handleCodexBegin} style={buttonStyle}>
          1. Begin login
        </button>
        {codexAuthorizeUrl && (
          <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Tab not opening? <a href={codexAuthorizeUrl} target="_blank" rel="noopener noreferrer">Click here.</a>
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <label htmlFor="codex-paste" style={labelStyle}>
            Backup: paste the callback URL or code (<code>code</code>, <code>code#state</code>, or full URL)
          </label>
          <input
            id="codex-paste"
            type="text"
            value={codexPasteString}
            onChange={(e) => setCodexPasteString(e.target.value)}
            placeholder="https://cms.optimisedigital.online/api/agent-auth/callback/openai-codex?code=...&state=..."
            style={inputStyle}
          />
          <button
            onClick={handleCodexComplete}
            disabled={!codexPasteString || codexCompleting}
            style={{ ...buttonStyle, marginTop: 8, opacity: !codexPasteString || codexCompleting ? 0.5 : 1 }}
          >
            {codexCompleting ? "Exchanging..." : "Complete login from pasted code"}
          </button>
        </div>
      </div>

      {/* Connect xAI Grok via SuperGrok subscription (device-code OAuth) */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Connect xAI Grok (SuperGrok OAuth)</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666", lineHeight: 1.5 }}>
          Opens xAI sign-in in a new tab and uses the OAuth device-code flow — no code to paste. Spends your
          {" "}<strong>SuperGrok subscription</strong> (via the grok-cli proxy), not billed <code>XAI_API_KEY</code> tokens.
          Powers the <code>grok-build</code> and <code>grok-composer-2.5-fast</code> models. This reuses the grok CLI's
          private OAuth client against an undocumented endpoint — a ToS grey area xAI can break at any time — so any
          failure falls through the normal fallback chain (Kimi → MiniMax → Claude). Kill-switch: set
          {" "}<code>XAI_GROK_OAUTH_DISABLED=1</code> in the environment to disable it fleet-wide instantly.
        </p>
        <button onClick={handleGrokBegin} disabled={grokPolling} style={{ ...buttonStyle, opacity: grokPolling ? 0.5 : 1 }}>
          {grokPolling ? "Waiting for approval…" : "Begin login"}
        </button>
        {grokUserCode && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#444" }}>
            <p style={{ margin: "0 0 6px" }}>
              Approve in the tab that opened (or{" "}
              {grokVerificationUri && (
                <a href={grokVerificationUri} target="_blank" rel="noopener noreferrer">click here</a>
              )}
              ), confirming this code:
            </p>
            <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, background: "#f3f4f6", padding: "4px 10px", borderRadius: 4 }}>
              {grokUserCode}
            </code>
            <p style={{ margin: "8px 0 0", color: "#666" }}>
              {grokPolling ? "Polling for approval… this completes automatically once you approve." : ""}
            </p>
          </div>
        )}
      </div>

      {/* Connect Anthropic (optional) */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Connect Anthropic via OAuth (optional)</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666" }}>
          Use this only if you want Anthropic models in the fleet. Opens Anthropic in a new tab; copy the
          <code> code#state</code> string returned and paste it below. Optimate-Google-Ads runs on Kimi/MiniMax
          and does not need this connected.
        </p>
        <button onClick={handleBegin} style={buttonStyle}>
          1. Begin login
        </button>
        {authorizeUrl && (
          <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Tab not opening? <a href={authorizeUrl} target="_blank" rel="noopener noreferrer">Click here.</a>
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <label htmlFor="paste" style={labelStyle}>2. Paste the returned code (format: <code>code#state</code>)</label>
          <input
            id="paste"
            type="text"
            value={pasteString}
            onChange={(e) => setPasteString(e.target.value)}
            placeholder="code#state"
            style={inputStyle}
          />
          <button
            onClick={handleComplete}
            disabled={!pasteString || completing}
            style={{ ...buttonStyle, marginTop: 8, opacity: !pasteString || completing ? 0.5 : 1 }}
          >
            {completing ? "Exchanging..." : "3. Complete login"}
          </button>
        </div>
      </div>

      {/* Provider status */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Provider status</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
                <th style={{ padding: "6px 4px" }}>Provider</th>
                <th style={{ padding: "6px 4px" }}>OAuth</th>
                <th style={{ padding: "6px 4px" }}>API key</th>
                <th style={{ padding: "6px 4px" }}>Force fallback</th>
                <th style={{ padding: "6px 4px" }}>Last failure</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const apiKeyLabel = providerApiKeyLabel(p.provider, p.envApiKeyPresent);
                return (
                <tr key={p.provider} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 4px", fontWeight: 600 }}>
                    {providerDisplayName(p.provider)}
                    <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 400 }}>{p.provider}</div>
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    {p.oauthConnected ? (
                      <span style={{ color: "#15803d" }}>
                        connected, expires {formatExpiry(p.oauthExpiresAt)}
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>n/a</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <span style={{ color: apiKeyLabel.color }}>{apiKeyLabel.text}</span>
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={p.forceFallback}
                        onChange={(e) => handleToggleForceFallback(p.provider, e.target.checked)}
                      />
                      <span>{p.forceFallback ? "on (skipping OAuth)" : "off"}</span>
                    </label>
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    {p.lastFailure ? (
                      <span style={{ color: "#b91c1c" }} title={p.lastFailure.message}>
                        {new Date(p.lastFailure.timestamp).toLocaleString("en-AU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>none</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Probe */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Probe</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666" }}>
          Sends a 1-token "ok" prompt to the chosen model and reports the credential source that served it.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => handleProbe("claude-haiku-4.5")} style={ghostButtonStyle}>
            Probe Claude Haiku (OAuth)
          </button>
          <button onClick={() => handleProbe("claude-sonnet-4.6")} style={ghostButtonStyle}>
            Probe Sonnet 4.6 (OAuth)
          </button>
          <button onClick={() => handleProbe("kimi-for-coding")} style={ghostButtonStyle}>
            Probe Kimi For Coding (OAuth)
          </button>
          <button onClick={() => handleProbe("kimi-k2.6")} style={ghostButtonStyle}>
            Probe Kimi K2.6 (API key)
          </button>
          <button onClick={() => handleProbe("minimax-m3")} style={ghostButtonStyle}>
            Probe MiniMax M3 (API key)
          </button>
          <button onClick={() => handleProbe("gpt-5.5-codex")} style={ghostButtonStyle}>
            Probe GPT-5.5 Codex (ChatGPT OAuth)
          </button>
          <button onClick={() => handleProbe("grok-build")} style={ghostButtonStyle}>
            Probe Grok Build (SuperGrok OAuth)
          </button>
        </div>
        {probeResult && (
          <pre
            style={{
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              padding: 10,
              borderRadius: 4,
              fontSize: 12,
              marginTop: 10,
              whiteSpace: "pre-wrap",
            }}
          >
            {probeResult}
          </pre>
        )}
      </div>
    </div>
  );
}
