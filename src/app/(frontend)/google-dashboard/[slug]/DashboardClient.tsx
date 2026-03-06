"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleAdsDashboard } from "@/components/dashboards/googleads/GoogleAdsDashboard";
import type { GoogleAdsDashboardData } from "@/lib/dashboard-types";

interface DashboardClientProps {
  slug: string;
  clientName: string;
  isAuthenticated: boolean;
}

export function DashboardClient({ slug, clientName, isAuthenticated }: DashboardClientProps) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [data, setData] = useState<GoogleAdsDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authed) return;

    setLoading(true);
    fetch(`/api/dashboard/data?slug=${encodeURIComponent(slug)}`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        if (!res.ok) {
          const text = await res.text();
          setError(`Failed to load dashboard: ${text}`);
          return;
        }
        const json = await res.json();
        setData(json);
      })
      .catch(() => setError("Failed to load dashboard data"))
      .finally(() => setLoading(false));
  }, [authed, slug]);

  // PIN entry screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{clientName}</h1>
          <p className="text-slate-400">Enter your 4-digit access code to view the dashboard</p>
        </div>
        <PinEntry slug={slug} onSuccess={() => window.location.reload()} />
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <svg
            className="animate-spin h-5 w-5 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading dashboard...
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  // Dashboard
  if (data) {
    return <GoogleAdsDashboard data={data} />;
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

        if (res.status === 429) {
          setError("Too many attempts. Please try again in a few minutes.");
        } else if (res.status === 401) {
          setError("Invalid access code.");
        } else {
          setError("Something went wrong. Please try again.");
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
