"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import PinGateLogo from "@/components/PinGateLogo";

interface DashboardPinEntryProps {
  /** Where to redirect on success, e.g. "/dashboard/berendsen" */
  redirectTo: string;
  /** Which verify endpoint to hit */
  verifyEndpoint?: string;
}

export function DashboardPinEntry({
  redirectTo,
  verifyEndpoint = "/api/dashboard/verify",
}: DashboardPinEntryProps) {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submit = useCallback(
    async (pin: string) => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(verifyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
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
    [router, redirectTo, verifyEndpoint],
  );

  const handleChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[index] = digit;
      setDigits(next);
      setError("");

      if (digit && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }

      if (digit && index === 3 && next.every((d) => d !== "")) {
        submit(next.join(""));
      }
    },
    [digits, submit],
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

      if (pasted.length === 4) {
        submit(pasted);
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    },
    [submit],
  );

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  return (
    <div>
      <div className="flex justify-center gap-3" onPaste={handlePaste}>
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
            className="w-16 h-20 text-center text-2xl font-semibold border-2 rounded-xl
              bg-slate-800 border-slate-600 text-white
              focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20
              disabled:opacity-50 transition-colors"
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {loading && (
        <p className="mt-6 text-sm text-slate-400">Verifying...</p>
      )}

      {error && (
        <p className="mt-6 text-sm text-red-400">{error}</p>
      )}
      <PinGateLogo />
    </div>
  );
}
