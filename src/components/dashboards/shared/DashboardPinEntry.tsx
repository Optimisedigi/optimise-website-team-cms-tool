"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  pinGateBlurredInputStyle,
  pinGateFocusedInputStyle,
  pinGateInputStyle,
} from "@/components/PinGateFrame";
import { usePinDigitClick } from "@/components/usePinDigitClick";

interface DashboardPinEntryProps {
  /**
   * Client slug being unlocked. Required, not derived from `redirectTo`:
   * `/api/dashboard/verify` looks the client up by slug and 400s without one,
   * which the gate renders as "Something went wrong" — so a correct PIN reads
   * as a broken dashboard. Making it a required prop means a caller that
   * forgets it fails at typecheck rather than in front of a client.
   */
  slug: string;
  /** Where to redirect on success, e.g. "/dashboard/berendsen" */
  redirectTo: string;
  /** Which verify endpoint to hit */
  verifyEndpoint?: string;
}

export function DashboardPinEntry({
  slug,
  redirectTo,
  verifyEndpoint = "/api/dashboard/verify",
}: DashboardPinEntryProps) {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const playDigitClick = usePinDigitClick();

  const submit = useCallback(
    async (pin: string) => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(verifyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The endpoint replies with the session cookie the redirected page
          // then reads, so the response must be allowed to set it.
          credentials: "include",
          body: JSON.stringify({ pin, slug }),
        });

        if (res.ok) {
          router.push(redirectTo);
          return;
        }

        const body = await res.json().catch(() => ({} as { error?: string }));
        if (res.status === 429) {
          setError(body.error || "Too many incorrect attempts. Please try again in 15 minutes.");
        } else if (res.status === 401) {
          setError(body.error || "Invalid access code.");
        } else {
          setError(body.error || "Something went wrong. Please try again.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
        setDigits(["", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    },
    [router, redirectTo, verifyEndpoint, slug],
  );

  const handleChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = digit;
      setDigits(next);
      setError("");

      if (digit) {
        playDigitClick();
      }

      if (digit && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }

      if (digit && index === 3 && next.every((d) => d !== "")) {
        submit(next.join(""));
      }
    },
    [digits, playDigitClick, submit],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
      if (pasted.length === 0) return;

      const next = ["", "", "", ""];
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i];
      }
      setDigits(next);
      setError("");
      for (let i = 0; i < pasted.length; i++) {
        window.setTimeout(playDigitClick, i * 45);
      }

      if (pasted.length === 4) {
        submit(pasted);
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    },
    [playDigitClick, submit],
  );

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Shared with every other PIN gate in the app, so unlocking a dashboard looks
  // the same wherever a client arrives. The logo is the frame's job, not this
  // component's: rendering one here too would stack two logos on the screen.
  const mono = "var(--font-jetbrains-mono), ui-monospace, monospace";
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 18 }} onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={loading}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => {
              e.currentTarget.select();
              Object.assign(e.currentTarget.style, pinGateFocusedInputStyle);
            }}
            onBlur={(e) => {
              Object.assign(e.currentTarget.style, pinGateBlurredInputStyle);
            }}
            style={{ ...pinGateInputStyle, opacity: loading ? 0.5 : 1 }}
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {loading && (
        <p style={{ marginTop: 24, fontFamily: mono, fontSize: 13, color: "#8b90ad", textAlign: "center" }}>
          Verifying...
        </p>
      )}

      {error && (
        <p style={{ marginTop: 24, fontFamily: mono, fontSize: 13, color: "#ff7a7a", textAlign: "center" }}>
          {error}
        </p>
      )}
    </div>
  );
}
