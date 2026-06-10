"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleAdsDashboard } from "@/components/dashboards/googleads/GoogleAdsDashboard";
import RocketSplash from "@/components/RocketSplash";
import PinGateLogo from "@/components/PinGateLogo";
import type { GoogleAdsDashboardData, GoogleAdsDashboardQualityData } from "@/lib/dashboard-types";

interface DashboardClientProps {
  slug: string;
  clientId: string;
  clientName: string;
  isAuthenticated: boolean;
  initialData: GoogleAdsDashboardData | null;
  initialError: string | null;
  initialQualityData?: GoogleAdsDashboardQualityData | null;
  brandKeywords?: string;
  conversionActions?: string;
  phoneCallActions?: string;
  formSubmitActions?: string;
  /** JSON-encoded array of `{ label, color, actions: string[] }` describing
   *  the client's named conversion-action categories. */
  conversionActionCategories?: string;
  initialKeywordSelections?: string[];
  /** Saved deep-dive selections that have already been promoted into a real,
   *  synced NKL by the agency. The dashboard renders these in an
   *  "Added as Negative" disabled state. */
  initialAddedSelections?: string[];
  /** Every keyword from any non-deep-dive active NKL for this client. Lets
   *  the dashboard show "Added as Negative" status for terms that are
   *  currently displayed but were never in the deep-dive saved list. */
  initialAddedNegatives?: string[];
}

export function DashboardClient({ slug, clientId, clientName, isAuthenticated, initialData, initialError, initialQualityData, brandKeywords, conversionActions, phoneCallActions, formSubmitActions, conversionActionCategories, initialKeywordSelections, initialAddedSelections, initialAddedNegatives }: DashboardClientProps) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [data, setData] = useState<GoogleAdsDashboardData | null>(initialData);
  const [error, setError] = useState(initialError || "");
  const [verified, setVerified] = useState(false);

  // Show rocket animation after PIN verified, then reload
  useEffect(() => {
    if (verified) {
      const timer = setTimeout(() => window.location.reload(), 600);
      return () => clearTimeout(timer);
    }
  }, [verified]);

  // Rocket loading screen (after PIN success, before reload).
  // Wrapper provides the dashboard's dark theme; RocketSplash itself is
  // shared with the admin and styled via google-dashboard/globals.css.
  if (verified) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
        <RocketSplash />
      </div>
    );
  }

  // PIN entry screen — cosmic theme (proposal v2): deep navy gradient,
  // starfield, Space Grotesk display + JetBrains Mono helper text.
  if (!authed) {
    const sg = "var(--font-space-grotesk), system-ui, sans-serif";
    const mono = "var(--font-jetbrains-mono), ui-monospace, monospace";
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(1200px 700px at 50% 18%, #11162e 0%, #0b1226 45%, #07091a 100%)",
        }}
      >
        {/* Starfield — subtle layered radial dots, purely decorative. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: [
              "radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,0.55), transparent)",
              "radial-gradient(1.5px 1.5px at 78% 14%, rgba(255,255,255,0.45), transparent)",
              "radial-gradient(1px 1px at 33% 68%, rgba(255,255,255,0.4), transparent)",
              "radial-gradient(1px 1px at 64% 82%, rgba(255,255,255,0.35), transparent)",
              "radial-gradient(2px 2px at 88% 56%, rgba(153,192,255,0.5), transparent)",
              "radial-gradient(1.5px 1.5px at 22% 88%, rgba(255,255,255,0.3), transparent)",
              "radial-gradient(1px 1px at 50% 38%, rgba(255,255,255,0.3), transparent)",
            ].join(","),
          }}
        />

        <div style={{ position: "relative", textAlign: "center", marginBottom: 44 }}>
          <div
            style={{
              fontFamily: sg,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#4d94ff",
              marginBottom: 18,
            }}
          >
            Google Ads Dashboard
          </div>
          <h1
            style={{
              fontFamily: sg,
              fontSize: 52,
              fontWeight: 600,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              margin: 0,
            }}
          >
            {clientName}
          </h1>
        </div>

        <PinEntry slug={slug} onSuccess={() => setVerified(true)} />

        <p
          style={{
            position: "relative",
            fontFamily: mono,
            fontSize: 13,
            letterSpacing: "0.02em",
            color: "#8b90ad",
            marginTop: 30,
          }}
        >
          Enter your 4-digit PIN access code to view the dashboard
        </p>
        <PinGateLogo />
      </div>
    );
  }

  // Error
  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Dashboard
  if (data) {
    return <GoogleAdsDashboard data={data} initialQualityData={initialQualityData ?? undefined} brandKeywords={brandKeywords} conversionActions={conversionActions} phoneCallActions={phoneCallActions} formSubmitActions={formSubmitActions} conversionActionCategories={conversionActionCategories} clientId={clientId} initialKeywordSelections={initialKeywordSelections} initialAddedSelections={initialAddedSelections} initialAddedNegatives={initialAddedNegatives} />;
  }

  return null;
}

function PinEntry({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const submit = useCallback(
    async (pin: string) => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/dashboard/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ pin, slug }),
        });

        if (res.ok) {
          onSuccess();
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
    [slug, onSuccess],
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

  const sg = "var(--font-space-grotesk), system-ui, sans-serif";
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
              e.target.style.border = "2px solid #4d94ff";
              e.target.style.boxShadow =
                "0 0 0 4px rgba(0,102,255,0.18), 0 8px 24px rgba(0,0,0,0.35)";
            }}
            onBlur={(e) => {
              e.target.style.border = "1px solid rgba(153,192,255,0.18)";
              e.target.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
            }}
            style={{
              width: 76,
              height: 92,
              borderRadius: 18,
              textAlign: "center",
              fontFamily: sg,
              fontSize: 34,
              fontWeight: 600,
              color: "#ffffff",
              caretColor: "#4d94ff",
              outline: "none",
              background:
                "linear-gradient(180deg, rgba(17,22,46,0.9) 0%, rgba(11,18,38,0.9) 100%)",
              border: "1px solid rgba(153,192,255,0.18)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              opacity: loading ? 0.5 : 1,
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {loading && (
        <p style={{ marginTop: 24, fontFamily: mono, fontSize: 13, color: "#8b90ad", textAlign: "center" }}>Verifying...</p>
      )}

      {error && (
        <p style={{ marginTop: 24, fontFamily: mono, fontSize: 13, color: "#ff7a7a", textAlign: "center" }}>{error}</p>
      )}
    </div>
  );
}
