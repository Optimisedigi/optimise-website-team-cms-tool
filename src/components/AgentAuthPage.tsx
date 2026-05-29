"use client";

/**
 * Agent auth setup page (client body).
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

export default function AgentAuthPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [pasteString, setPasteString] = useState("");
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<string | null>(null);
  // Codex (ChatGPT) PKCE paste flow state — mirrors the Anthropic flow.
  const [codexAuthorizeUrl, setCodexAuthorizeUrl] = useState<string | null>(null);
  const [codexPasteString, setCodexPasteString] = useState("");
  const [codexCompleting, setCodexCompleting] = useState(false);

  async function loadStatus() {
    setLoading(true);
    const res = await fetch("/api/agent-auth/status");
    if (!res.ok) {
      setMessage(`Failed to load status (HTTP ${res.status})`);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setProviders(json.providers);
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
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
      <h1 style={{ margin: "0 0 4px" }}>Optimate agent auth</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Per-provider credential status for the agent fleet. Claude uses Anthropic OAuth/API keys; Kimi and MiniMax use API keys.
        GPT-5.5 is exposed through the ChatGPT subscription Codex OAuth path (the <code>gpt-5.5-codex-*</code> models) — connect that below.
      </p>

      {message && (
        <div style={{ ...cardStyle, background: "#f0f9ff", borderColor: "#0ea5e9", color: "#075985" }}>
          {message}
        </div>
      )}

      <div style={{ ...cardStyle, background: "#fffbeb", borderColor: "#fde68a" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>GPT / OpenAI auth</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
          Connect a ChatGPT plan with Codex OAuth (card below) and use the <code>gpt-5.5-codex-medium</code> / <code>gpt-5.5-codex-low</code> models. Plain OpenAI API-key models are hidden because this CMS is not configured with <code>OPENAI_API_KEY</code>. The Codex path reuses the Codex CLI OAuth client against a private endpoint — a ToS grey area OpenAI can break at any time — so any failure falls through the normal fallback chain (Kimi → MiniMax → Claude). Kill-switch: set <code>CODEX_OAUTH_DISABLED=1</code> in the environment to disable it fleet-wide instantly.
        </p>
      </div>

      {/* Connect ChatGPT via Codex OAuth (Authorization Code + PKCE paste flow) */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Connect ChatGPT (Codex OAuth)</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: "#666" }}>
          Opens ChatGPT sign-in in a new tab. After you sign in, the browser lands on a
          {" "}<code>localhost</code> callback that won't load here — copy its full URL from the
          address bar (or the <code>code</code> value) and paste it below. Powers the
          {" "}<code>gpt-5.5-codex-medium</code> and <code>gpt-5.5-codex-low</code> models.
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
            2. Paste the callback URL or code (<code>code</code>, <code>code#state</code>, or full URL)
          </label>
          <input
            id="codex-paste"
            type="text"
            value={codexPasteString}
            onChange={(e) => setCodexPasteString(e.target.value)}
            placeholder="http://localhost:1455/auth/callback?code=...&state=..."
            style={inputStyle}
          />
          <button
            onClick={handleCodexComplete}
            disabled={!codexPasteString || codexCompleting}
            style={{ ...buttonStyle, marginTop: 8, opacity: !codexPasteString || codexCompleting ? 0.5 : 1 }}
          >
            {codexCompleting ? "Exchanging..." : "3. Complete login"}
          </button>
        </div>
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
              {providers.map((p) => (
                <tr key={p.provider} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 4px", fontWeight: 600 }}>{p.provider}</td>
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
                    {p.envApiKeyPresent ? (
                      <span style={{ color: "#15803d" }}>set</span>
                    ) : (
                      <span style={{ color: "#dc2626" }}>missing</span>
                    )}
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
              ))}
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
          <button onClick={() => handleProbe("kimi-k2.6")} style={ghostButtonStyle}>
            Probe Kimi K2.6 (API key)
          </button>
          <button onClick={() => handleProbe("minimax-m2.7")} style={ghostButtonStyle}>
            Probe MiniMax M2.7 (API key)
          </button>
          <button onClick={() => handleProbe("gpt-5.5-codex-medium")} style={ghostButtonStyle}>
            Probe GPT-5.5 Codex medium (ChatGPT OAuth)
          </button>
          <button onClick={() => handleProbe("gpt-5.5-codex-low")} style={ghostButtonStyle}>
            Probe GPT-5.5 Codex low (ChatGPT OAuth)
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
