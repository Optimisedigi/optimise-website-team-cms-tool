"use client";

/**
 * PIN gate for the public Discovery Briefing routes.
 *
 * Mirrors `AuditPasswordGate` UX (4 input boxes, paste support, lockout
 * messaging) but POSTs to `/api/discovery-auth` and unlocks per-briefing
 * via component state — there's no shared cookie because the form behind
 * the gate makes authed-as-the-user requests via the existing CMS routes
 * (the gate is purely client-side). The state survives the form mount;
 * a hard refresh re-prompts, which is the intentional trade-off:
 * briefings are PII-heavy and we'd rather over-prompt than under-prompt.
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import PinGateLogo from "./PinGateLogo";

export interface DiscoveryPinGateProps {
  scope: "client" | "proposal";
  /** Parent slug — matches the URL segment. */
  slug: string;
  /** Padded briefing id — matches the URL segment. */
  briefingId: string;
  /** Friendly business / client name shown above the prompt. */
  businessName?: string;
  /** Form rendered once the PIN is accepted. */
  children: ReactNode;
}

export default function DiscoveryPinGate(
  props: DiscoveryPinGateProps,
): React.ReactElement {
  const { scope, slug, briefingId, businessName, children } = props;
  const [unlocked, setUnlocked] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submit = useCallback(
    async (pin: string) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/discovery-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, slug, briefingId, password: pin }),
        });
        if (res.ok) {
          setUnlocked(true);
          return;
        }
        const body = (await res
          .json()
          .catch(() => ({}))) as { error?: string };
        if (res.status === 429) {
          setError(
            body.error ||
              "Too many incorrect attempts. Please try again in 15 minutes.",
          );
        } else {
          setError(body.error || "Invalid access code.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
        setDigits(["", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    },
    [scope, slug, briefingId],
  );

  const handleChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = digit;
      setDigits(next);
      setError("");
      if (digit && index < 3) inputRefs.current[index + 1]?.focus();
      if (digit && index === 3 && next.every((d) => d !== ""))
        submit(next.join(""));
    },
    [digits, submit],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 4);
      if (!pasted.length) return;
      const next = ["", "", "", ""];
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
      setDigits(next);
      setError("");
      if (pasted.length === 4) submit(pasted);
      else inputRefs.current[pasted.length]?.focus();
    },
    [submit],
  );

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  if (unlocked) return <>{children}</>;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        {businessName && (
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#fff",
              margin: "0 0 6px",
            }}
          >
            {businessName}
          </h1>
        )}
        <h2
          style={{
            fontSize: businessName ? 18 : 24,
            fontWeight: businessName ? 500 : 700,
            color: businessName ? "#94a3b8" : "#fff",
            margin: "0 0 8px",
          }}
        >
          Discovery Briefing
        </h2>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
          Enter your 4-digit PIN to open the discovery briefing
        </p>
      </div>
      <div
        style={{ display: "flex", justifyContent: "center", gap: 12 }}
        onPaste={handlePaste}
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={loading}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            style={{
              width: 64,
              height: 80,
              textAlign: "center",
              fontSize: 24,
              fontWeight: 600,
              border: "2px solid #475569",
              borderRadius: 12,
              background: "#1e293b",
              color: "#fff",
              outline: "none",
              opacity: loading ? 0.5 : 1,
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#60a5fa";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#475569";
            }}
          />
        ))}
      </div>
      {loading && (
        <p
          style={{
            marginTop: 24,
            fontSize: 14,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          Verifying...
        </p>
      )}
      {error && (
        <p
          style={{
            marginTop: 24,
            fontSize: 14,
            color: "#f87171",
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}
      <PinGateLogo />
    </div>
  );
}
