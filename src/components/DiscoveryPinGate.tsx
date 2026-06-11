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
import {
  PinGateFrame,
  pinGateBlurredInputStyle,
  pinGateFocusedInputStyle,
  pinGateInputStyle,
} from "./PinGateFrame";

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
    <PinGateFrame
      eyebrow="Discovery Briefing"
      title={businessName}
      subtitle="Enter your 4-digit PIN access code to open the discovery briefing"
    >
      <div style={{ position: "relative" }}>
        <div
          style={{ display: "flex", justifyContent: "center", gap: 18 }}
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
              style={{ ...pinGateInputStyle, opacity: loading ? 0.5 : 1 }}
              onFocus={(e) => {
                Object.assign(e.currentTarget.style, pinGateFocusedInputStyle);
              }}
              onBlur={(e) => {
                Object.assign(e.currentTarget.style, pinGateBlurredInputStyle);
              }}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>
        {loading && (
          <p
            style={{
              marginTop: 24,
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: 13,
              color: "#8b90ad",
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
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: 13,
              color: "#ff7a7a",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        )}
      </div>
    </PinGateFrame>
  );
}
