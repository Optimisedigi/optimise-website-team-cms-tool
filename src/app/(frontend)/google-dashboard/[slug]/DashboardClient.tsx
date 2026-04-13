"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GoogleAdsDashboard } from "@/components/dashboards/googleads/GoogleAdsDashboard";
import type { GoogleAdsDashboardData, GoogleAdsDashboardQualityData } from "@/lib/dashboard-types";

interface DashboardClientProps {
  slug: string;
  clientName: string;
  isAuthenticated: boolean;
  initialData: GoogleAdsDashboardData | null;
  initialError: string | null;
  initialQualityData?: GoogleAdsDashboardQualityData | null;
  brandKeywords?: string;
  conversionActions?: string;
}

export function DashboardClient({ slug, clientName, isAuthenticated, initialData, initialError, initialQualityData, brandKeywords, conversionActions }: DashboardClientProps) {
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

  // Rocket loading screen (after PIN success, before reload)
  if (verified) {
    return <RocketLoading />;
  }

  // PIN entry screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{clientName}</h1>
          <p className="text-slate-400">Enter your 4-digit PIN access code to view the Google Ads dashboard</p>
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
    return <GoogleAdsDashboard data={data} initialQualityData={initialQualityData ?? undefined} brandKeywords={brandKeywords} conversionActions={conversionActions} />;
  }

  return null;
}

function RocketLoading() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="relative w-20 h-36">
        {/* Flames */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-16 animate-[rocketLoop_2.6s_cubic-bezier(0.4,0,0.2,1)_infinite]">
          <div className="absolute bottom-0 w-2.5 h-7 left-[5px] rounded-[50%_50%_40%_40%] bg-gradient-to-t from-transparent via-amber-500 to-red-500 opacity-0 animate-[flameLoop_2.6s_cubic-bezier(0.4,0,0.2,1)_infinite]" />
          <div className="absolute bottom-0 w-1.5 h-[18px] left-[2px] rounded-[50%_50%_40%_40%] bg-gradient-to-t from-transparent to-amber-400 opacity-0 animate-[flameLoop_2.6s_cubic-bezier(0.4,0,0.2,1)_0.08s_infinite]" />
          <div className="absolute bottom-0 w-1.5 h-5 left-[10px] rounded-[50%_50%_40%_40%] bg-gradient-to-t from-transparent to-orange-400 opacity-0 animate-[flameLoop_2.6s_cubic-bezier(0.4,0,0.2,1)_0.04s_infinite]" />
        </div>
        {/* Rocket */}
        <div className="absolute bottom-5 left-1/2 z-10 animate-[rocketOffsetLoop_2.6s_cubic-bezier(0.4,0,0.2,1)_infinite]">
          <img
            src="/optimise-rocket-logo-black.png"
            alt=""
            width={48}
            height={48}
            className="block w-12 h-12 object-contain -rotate-[30deg] brightness-0 invert"
          />
        </div>
      </div>
      <p className="mt-6 text-sm text-slate-400 tracking-wide">Loading dashboard…</p>

      <style>{`
        @keyframes rocketLoop {
          0% { transform: translateX(-50%) translateY(0); opacity: 0; }
          8% { transform: translateX(-50%) translateY(0); opacity: 1; }
          18% { transform: translateX(-50%) translateY(2px); opacity: 1; }
          32% { transform: translateX(-50%) translateY(-6px); opacity: 1; }
          78% { transform: translateX(-50%) translateY(-130px); opacity: 1; }
          92% { transform: translateX(-50%) translateY(-220px); opacity: 0; }
          100% { transform: translateX(-50%) translateY(-220px); opacity: 0; }
        }
        @keyframes rocketOffsetLoop {
          0% { transform: translateX(calc(-50% - 5.9px)) translateY(0); opacity: 0; }
          8% { transform: translateX(calc(-50% - 5.9px)) translateY(0); opacity: 1; }
          18% { transform: translateX(calc(-50% - 5.9px)) translateY(2px); opacity: 1; }
          32% { transform: translateX(calc(-50% - 5.9px)) translateY(-6px); opacity: 1; }
          78% { transform: translateX(calc(-50% - 5.9px)) translateY(-130px); opacity: 1; }
          92% { transform: translateX(calc(-50% - 5.9px)) translateY(-220px); opacity: 0; }
          100% { transform: translateX(calc(-50% - 5.9px)) translateY(-220px); opacity: 0; }
        }
        @keyframes flameLoop {
          0% { opacity: 0; transform: scaleY(0.2); }
          10% { opacity: 0.6; transform: scaleY(0.4); }
          22% { opacity: 0.9; transform: scaleY(0.6); }
          36% { opacity: 1; transform: scaleY(1); }
          76% { opacity: 1; transform: scaleY(1.4); }
          90% { opacity: 0; transform: scaleY(1.8); }
          100% { opacity: 0; transform: scaleY(0.2); }
        }
      `}</style>
    </div>
  );
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
