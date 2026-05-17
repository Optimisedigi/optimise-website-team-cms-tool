"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleAdsDashboard } from "@/components/dashboards/googleads/GoogleAdsDashboard";
import RocketSplash from "@/components/RocketSplash";
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

  // PIN entry screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">{clientName}</h1>
          <h2 className="text-lg font-medium text-slate-400 mb-2">Google Ads Dashboard</h2>
          <p className="text-slate-400">Enter your 4-digit PIN access code to view the dashboard</p>
        </div>
        <PinEntry slug={slug} onSuccess={() => setVerified(true)} />
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
        <p className="mt-6 text-sm text-slate-400 text-center">Verifying...</p>
      )}

      {error && (
        <p className="mt-6 text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
