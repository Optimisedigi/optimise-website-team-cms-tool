"use client";

/**
 * CMS-bound Client Discovery Briefing form.
 *
 * Why this file exists / design choice (re: orchestrator step 2):
 * --------------------------------------------------------------
 * We picked option (a) — port the standalone HTML form into a single React
 * client component and reuse the existing CSS via a CSS module. The
 * alternative (server-render the HTML and hydrate a JS island that talks
 * to the same DOM) would have required keeping `data-key` JS glue around
 * the markup forever; a flat React port is the smaller long-term surface
 * because we already have a typed `DiscoveryBriefingState` and a shared
 * markdown builder.
 *
 * The standalone HTML at `public/client-discovery-briefing.html` is left
 * untouched and continues to work via localStorage — this component is
 * the CMS-bound twin that hydrates from the API and PUTs every change
 * (debounced) back to it. The "Download Markdown" button explicitly
 * calls the API (`GET ?scope=…&id=…`) to get the server's regenerated
 * markdown — we deliberately do NOT re-render markdown client-side to
 * avoid drift with the server hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./DiscoveryBriefingForm.module.css";
import {
  defaultDiscoveryBriefingState,
  type DiscoveryBriefingAudienceSegment,
  type DiscoveryBriefingFaq,
  type DiscoveryBriefingLeadMagnet,
  type DiscoveryBriefingNurtureStep,
  type DiscoveryBriefingPillarTopic,
  type DiscoveryBriefingProof,
  type DiscoveryBriefingRaciRow,
  type DiscoveryBriefingService,
  type DiscoveryBriefingSectionId,
  type DiscoveryBriefingState,
} from "@/lib/discovery-briefing/types";

type Scope = "client" | "proposal";

/** A single proposal/deck the parent record exposes for linking. */
export interface AvailableDeckOption {
  slug: string;
  title: string;
  url: string;
}

export interface DiscoveryBriefingFormProps {
  scope: Scope;
  scopeId: number;
  /** Friendly title for the linked client / proposal, shown in the header. */
  scopeLabel: string;
  initialState: DiscoveryBriefingState;
  /** Parent slug — used to build the proposal deck CTA link. */
  parentSlug?: string;
  /** Slide decks declared on the parent (`presentations[]`). */
  availableDecks?: AvailableDeckOption[];
}

const TONE_OF_VOICE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Formal", label: "Formal" },
  { value: "Casual", label: "Casual" },
  { value: "Authoritative", label: "Authoritative" },
  { value: "Playful", label: "Playful" },
  { value: "Technical", label: "Technical" },
  { value: "Friendly", label: "Friendly" },
  { value: "Expert", label: "Expert" },
  { value: "other", label: "Other" },
];

const TOOL_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

const TOOL_ACCESS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "yes", label: "Granted" },
  { value: "no", label: "Not yet" },
  { value: "later", label: "Will provide later" },
];

const INDUSTRIES: Array<{ value: string; label: string }> = [
  { value: "healthcare", label: "Healthcare" },
  { value: "legal", label: "Legal" },
  { value: "finance", label: "Finance" },
  { value: "realestate", label: "Real estate" },
  { value: "hospitality", label: "Hospitality" },
  { value: "retail", label: "Retail / e-commerce" },
  { value: "construction", label: "Construction" },
  { value: "education", label: "Education" },
  { value: "tech", label: "Technology" },
  { value: "entertainment", label: "Entertainment / events" },
  { value: "other", label: "Other" },
];

const SOCIAL_PLATFORMS: Array<{
  key:
    | "socialLinkedin"
    | "socialFacebook"
    | "socialInstagram"
    | "socialTwitter"
    | "socialTikTok"
    | "socialYoutube";
  handleKey:
    | "socialLinkedinHandle"
    | "socialFacebookHandle"
    | "socialInstagramHandle"
    | "socialTwitterHandle"
    | "socialTikTokHandle"
    | "socialYoutubeHandle";
  label: string;
}> = [
  { key: "socialLinkedin", handleKey: "socialLinkedinHandle", label: "LinkedIn" },
  { key: "socialFacebook", handleKey: "socialFacebookHandle", label: "Facebook" },
  { key: "socialInstagram", handleKey: "socialInstagramHandle", label: "Instagram" },
  { key: "socialTwitter", handleKey: "socialTwitterHandle", label: "Twitter / X" },
  { key: "socialTikTok", handleKey: "socialTikTokHandle", label: "TikTok" },
  { key: "socialYoutube", handleKey: "socialYoutubeHandle", label: "YouTube" },
];

const GROWTH_CHANNELS: Array<{ value: string; label: string }> = [
  { value: "referrals", label: "Referrals / word of mouth" },
  { value: "organic", label: "Organic search (SEO)" },
  { value: "paid_search", label: "Paid search (Google Ads)" },
  { value: "paid_social", label: "Paid social (Meta / LinkedIn)" },
  { value: "partnerships", label: "Partnerships / affiliates" },
  { value: "events", label: "Events / trade shows" },
  { value: "outbound", label: "Cold outbound / sales" },
  { value: "other", label: "Other" },
];

const DEBOUNCE_MS = 600;

export function DiscoveryBriefingForm(props: DiscoveryBriefingFormProps) {
  const {
    scope,
    scopeId,
    scopeLabel,
    initialState,
    parentSlug,
    availableDecks = [],
  } = props;

  // Merge initial state with defaults defensively in case the persisted
  // object pre-dates a newer field. defaultDiscoveryBriefingState is the
  // source of truth for the shape.
  const [state, setState] = useState<DiscoveryBriefingState>(() => ({
    ...defaultDiscoveryBriefingState(),
    ...initialState,
  }));

  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, error: isError });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // ── Save (debounced PUT) ─────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  const firstRenderRef = useRef(true);
  const apiUrl = useMemo(
    () =>
      `/api/client-discovery-briefings/by-scope?scope=${scope}&id=${scopeId}`,
    [scope, scopeId],
  );

  useEffect(() => {
    // Skip the initial mount — `initialState` already represents what's on
    // the server, no need to PUT it back immediately.
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ data: latestStateRef.current }),
        });
        if (!res.ok) {
          showToast("Save failed", true);
          return;
        }
        showToast("Saved");
      } catch {
        showToast("Save failed", true);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, apiUrl, showToast]);

  // ── Helpers ──────────────────────────────────────────────────────
  const setField = useCallback(
    <K extends keyof DiscoveryBriefingState>(
      key: K,
      value: DiscoveryBriefingState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleIndustry = useCallback((value: string) => {
    setState((prev) => {
      const idx = prev.industries.indexOf(value);
      if (idx > -1) {
        const next = prev.industries.slice();
        next.splice(idx, 1);
        return { ...prev, industries: next };
      }
      return { ...prev, industries: [...prev.industries, value] };
    });
  }, []);

  const updateService = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingService>) => {
      setState((prev) => {
        const services = prev.services.slice();
        services[index] = { ...services[index], ...patch };
        return { ...prev, services };
      });
    },
    [],
  );
  const addService = useCallback(() => {
    setState((prev) => ({
      ...prev,
      services: [...prev.services, { name: "", highMargin: false, focus: false }],
    }));
  }, []);
  const removeService = useCallback((index: number) => {
    setState((prev) => {
      const services = prev.services.slice();
      services.splice(index, 1);
      return { ...prev, services };
    });
  }, []);

  const updateProof = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingProof>) => {
      setState((prev) => {
        const proof = prev.proof.slice();
        proof[index] = { ...proof[index], ...patch };
        return { ...prev, proof };
      });
    },
    [],
  );
  const addProof = useCallback(() => {
    setState((prev) => ({
      ...prev,
      proof: [
        ...prev.proof,
        { client: "", testimonial: "", useOnSite: false },
      ],
    }));
  }, []);
  const removeProof = useCallback((index: number) => {
    setState((prev) => {
      const proof = prev.proof.slice();
      proof.splice(index, 1);
      return { ...prev, proof };
    });
  }, []);

  // ── Ranked top growth channels (multi-select preserving pick order) ─
  const toggleGrowthChannel = useCallback((value: string) => {
    setState((prev) => {
      const list = prev.topGrowthChannels ?? [];
      const idx = list.indexOf(value);
      let next: string[];
      if (idx > -1) {
        next = list.slice();
        next.splice(idx, 1);
      } else {
        next = [...list, value];
      }
      // If we just removed `other`, clear the paired text input too.
      const clearOther = value === "other" && idx > -1;
      return {
        ...prev,
        topGrowthChannels: next,
        topGrowthChannelOther: clearOther ? "" : prev.topGrowthChannelOther,
      };
    });
  }, []);

  // ── Lead nurturing steps (ordered) ────────────────────────
  const updateNurtureStep = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingNurtureStep>) => {
      setState((prev) => {
        const steps = prev.leadNurturingSteps.slice();
        steps[index] = { ...steps[index], ...patch };
        return { ...prev, leadNurturingSteps: steps };
      });
    },
    [],
  );
  const addNurtureStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      leadNurturingSteps: [
        ...prev.leadNurturingSteps,
        { step: "", owner: "" },
      ],
    }));
  }, []);
  const removeNurtureStep = useCallback((index: number) => {
    setState((prev) => {
      const steps = prev.leadNurturingSteps.slice();
      steps.splice(index, 1);
      return { ...prev, leadNurturingSteps: steps };
    });
  }, []);

  // ── Tone-of-voice multi-select (no ranking) ────────────────────
  const toggleToneOfVoice = useCallback((value: string) => {
    setState((prev) => {
      const list = prev.brandToneOfVoice ?? [];
      const idx = list.indexOf(value);
      let next: string[];
      if (idx > -1) {
        next = list.slice();
        next.splice(idx, 1);
      } else {
        next = [...list, value];
      }
      const clearOther = value === "other" && idx > -1;
      return {
        ...prev,
        brandToneOfVoice: next,
        brandToneOfVoiceOther: clearOther ? "" : prev.brandToneOfVoiceOther,
      };
    });
  }, []);

  // ── Pillar topics (dynamic list) ──────────────────────────────
  const updatePillarTopic = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingPillarTopic>) => {
      setState((prev) => {
        const rows = prev.pillarTopics.slice();
        rows[index] = { ...rows[index], ...patch };
        return { ...prev, pillarTopics: rows };
      });
    },
    [],
  );
  const addPillarTopic = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pillarTopics: [...prev.pillarTopics, { name: "" }],
    }));
  }, []);
  const removePillarTopic = useCallback((index: number) => {
    setState((prev) => {
      const rows = prev.pillarTopics.slice();
      rows.splice(index, 1);
      return { ...prev, pillarTopics: rows };
    });
  }, []);

  // ── FAQs (dynamic list) ──────────────────────────────────
  const updateFaq = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingFaq>) => {
      setState((prev) => {
        const rows = prev.faqs.slice();
        rows[index] = { ...rows[index], ...patch };
        return { ...prev, faqs: rows };
      });
    },
    [],
  );
  const addFaq = useCallback(() => {
    setState((prev) => ({
      ...prev,
      faqs: [...prev.faqs, { question: "", answer: "" }],
    }));
  }, []);
  const removeFaq = useCallback((index: number) => {
    setState((prev) => {
      const rows = prev.faqs.slice();
      rows.splice(index, 1);
      return { ...prev, faqs: rows };
    });
  }, []);

  // ── Additional details (collapsible) ────────────────────────
  // Always starts collapsed on every page open — deliberately not persisted.
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false);

  // ── Meta count ───────────────────────────────────────────────────
  const filledCount = useMemo(() => {
    return Object.values(state).filter((v) => {
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "boolean") return v;
      return !!v;
    }).length;
  }, [state]);
  const totalKeys = Object.keys(defaultDiscoveryBriefingState()).length;

  // ── Download/copy markdown (always pull from server) ─────────────
  const downloadMarkdown = useCallback(async () => {
    try {
      // Ensure any in-flight debounced save lands first.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: latestStateRef.current }),
      });
      if (!putRes.ok) {
        showToast("Save failed before download", true);
        return;
      }
      const saved = (await putRes.json()) as { markdown?: string | null };
      const md = saved.markdown ?? "";
      if (!md) {
        showToast("No markdown available yet", true);
        return;
      }
      // Try clipboard first, then fall back to .md download.
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(md);
          showToast("Markdown copied to clipboard");
          return;
        }
      } catch {
        // fall through to download
      }
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (latestStateRef.current.businessName || "briefing")
        .replace(/\s+/g, "-")
        .toLowerCase();
      a.download = `client-discovery-${slug}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Markdown downloaded");
    } catch {
      showToast("Could not fetch markdown", true);
    }
  }, [apiUrl, showToast]);

  // ── Visibility helpers ───────────────────────────────────────────
  const hasGbp = state.gbpExists || state.gbpPartial || state.gbpNone;
  const visibleSocialPlatforms = SOCIAL_PLATFORMS.filter((p) => state[p.key]);
  const showIndustryOther = state.industries.includes("other");
  const growthChannelRank = (value: string): number | null => {
    const idx = (state.topGrowthChannels ?? []).indexOf(value);
    return idx === -1 ? null : idx + 1;
  };
  const showGrowthChannelOther = (state.topGrowthChannels ?? []).includes("other");
  const showToneOther = (state.brandToneOfVoice ?? []).includes("other");
  const linkedDeck = useMemo(
    () =>
      availableDecks.find((d) => d.slug === state.linkedDeckSlug) ?? null,
    [availableDecks, state.linkedDeckSlug],
  );
  /**
   * Resolve the proposal URL to use for the "View your proposal" CTA.
   * Prefer the parent's stored deckUrl (covers absolute external links);
   * fall back to the conventional `/partners/<slug>/<deck>/` shape when we
   * have a parentSlug.
   */
  const proposalHref = useMemo(() => {
    if (!linkedDeck) return null;
    if (linkedDeck.url) return linkedDeck.url;
    if (parentSlug) return `/partners/${parentSlug}/${linkedDeck.slug}/`;
    return null;
  }, [linkedDeck, parentSlug]);

  // ── Scroll to top on mount / refresh ─────────────────────────
  // Browsers restore scroll position on refresh by default; we always want
  // the briefing to open at the top so the team sees the latest header /
  // toolbar first.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      // ignore — cosmetic only
    }
  }, []);

  // ── Lead estimate (mirrors the markdown calc — live UI display) ───
  const estimatedLeads = useMemo(() => {
    const parse = (raw: string): number | null => {
      if (!raw) return null;
      const cleaned = raw.replace(/[^0-9.]/g, "");
      if (!cleaned) return null;
      const n = Number.parseFloat(cleaned);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const budget = parse(state.adsBudget);
    const cpc = parse(state.adsAvgCpc);
    const cr = parse(state.adsConversionRate);
    if (budget == null || cpc == null || cr == null) return null;
    const leads = (budget / cpc) * (cr / 100);
    if (!Number.isFinite(leads) || leads <= 0) return null;
    return Math.round(leads);
  }, [state.adsBudget, state.adsAvgCpc, state.adsConversionRate]);

  // ── Small reusable subcomponents (kept inline to limit prop churn) ─
  const textField = (
    key: keyof DiscoveryBriefingState,
    label: React.ReactNode,
    placeholder?: string,
    type: "text" | "url" = "text",
  ) => (
    <div className={styles.field}>
      <label>{label}</label>
      <input
        type={type}
        value={String(state[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) => setField(key, e.target.value as DiscoveryBriefingState[typeof key])}
      />
    </div>
  );

  const textareaField = (
    key: keyof DiscoveryBriefingState,
    label: React.ReactNode,
    placeholder?: string,
    style?: React.CSSProperties,
  ) => (
    <div className={styles.field}>
      <label>{label}</label>
      <textarea
        value={String(state[key] ?? "")}
        placeholder={placeholder}
        style={style}
        onChange={(e) => setField(key, e.target.value as DiscoveryBriefingState[typeof key])}
      />
    </div>
  );

  const selectField = (
    key: keyof DiscoveryBriefingState,
    label: React.ReactNode,
    options: Array<{ value: string; label: string }>,
    otherKey?: keyof DiscoveryBriefingState,
  ) => {
    const value = String(state[key] ?? "");
    const ariaLabel = typeof label === "string" ? label : undefined;

    // When the select is set to "other" and a paired text key exists, render
    // an inline text input instead of the dropdown. The select value stays
    // "other" for round-trip stability; the × button resets it back to "".
    if (otherKey && value === "other") {
      return (
        <div className={styles.otherInline}>
          <input
            type="text"
            value={String(state[otherKey] ?? "")}
            placeholder={`Specify ${ariaLabel ?? "value"}...`}
            aria-label={ariaLabel ? `${ariaLabel} (other)` : undefined}
            onChange={(e) =>
              setField(
                otherKey,
                e.target.value as DiscoveryBriefingState[typeof otherKey],
              )
            }
            autoFocus
          />
          <button
            type="button"
            className={styles.otherInlineReset}
            onClick={() => {
              setField(key, "" as DiscoveryBriefingState[typeof key]);
              setField(otherKey, "" as DiscoveryBriefingState[typeof otherKey]);
            }}
            aria-label={`Clear ${ariaLabel ?? "selection"}`}
            title="Pick a different option"
          >
            ×
          </button>
        </div>
      );
    }

    return (
      <select
        value={value}
        onChange={(e) =>
          setField(key, e.target.value as DiscoveryBriefingState[typeof key])
        }
        aria-label={ariaLabel}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  };

  const checkbox = (
    key: keyof DiscoveryBriefingState,
    label: React.ReactNode,
  ) => (
    <label className={styles.checkItem}>
      <input
        type="checkbox"
        checked={Boolean(state[key])}
        onChange={(e) =>
          setField(key, e.target.checked as DiscoveryBriefingState[typeof key])
        }
      />
      {label}
    </label>
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Client Discovery Briefing</p>
          <h1>{scopeLabel}</h1>
          <p className={styles.lede}>
            {scope === "proposal" ? "Proposal" : "Client"} discovery briefing —
            everything saves to the CMS as you type.
          </p>
        </div>
        <div className={styles.logoArea} style={{ marginTop: 90, marginLeft: -30 }}>
          <img
            src="/optimise-digital-logo-black.webp"
            alt="Optimise Digital"
            style={{ height: 18, width: "auto" }}
          />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={downloadMarkdown}
          >
            Download / Copy Markdown
          </button>
          <span className={styles.meta}>
            {filledCount}/{totalKeys} sections completed · saved
          </span>
        </div>

        {/* 1 · Business Overview */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>1 · Business Overview</h2>
            <span className={styles.num}>One sentence summary</span>
          </div>
          <div className={styles.field}>
            {textareaField(
              "oneLiner",
              "What does your business do in one sentence?",
              "We help [target audience] achieve [outcome] through [service]...",
            )}
          </div>
        </section>

        {/* 1.5 · Commercials & Growth */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>1.5 · Commercials &amp; Growth</h2>
            <span className={styles.num}>Revenue economics & lead flow</span>
          </div>
          <div className={styles.grid2}>
            {textField(
              "averageOrderValue",
              "Average order / client value",
              "e.g. $3,500 per project",
            )}
            {textField(
              "purchaseFrequency",
              "Purchases per client per year",
              "e.g. 2.5",
            )}
          </div>
          <div className={styles.grid2} style={{ marginTop: 10 }}>
            {textField(
              "newLeadsPerMonth",
              "Current new leads per month",
              "e.g. 25",
            )}
            {textField(
              "idealLeadVolume",
              "Ideal new leads per month",
              "e.g. 60",
            )}
          </div>
          <div className={styles.field} style={{ marginTop: 10 }}>
            <label>Top growth channels today</label>
            <p className={styles.fieldHint}>
              Pick all that apply — the order you click determines the ranking.
            </p>
            <div className={styles.chips}>
              {GROWTH_CHANNELS.map((ch) => {
                const rank = growthChannelRank(ch.value);
                const selected = rank !== null;
                return (
                  <button
                    type="button"
                    key={ch.value}
                    className={`${styles.chip} ${selected ? styles.chipSelected : ""}`}
                    onClick={() => toggleGrowthChannel(ch.value)}
                    aria-pressed={selected}
                  >
                    {selected ? <span className={styles.chipRank}>{rank}</span> : null}
                    {ch.label}
                  </button>
                );
              })}
            </div>
            {showGrowthChannelOther && (
              <input
                type="text"
                className={styles.subFieldInput}
                value={state.topGrowthChannelOther}
                placeholder="Specify other growth channel..."
                style={{ marginTop: 6 }}
                onChange={(e) => setField("topGrowthChannelOther", e.target.value)}
              />
            )}
          </div>
        </section>

        {/* 2 · Core Services */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>2 · Core Services</h2>
            <span className={styles.num}>List services with priority</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div>
                {state.services.map((s, i) => (
                  <div key={i} className={styles.serviceItem}>
                    <div className={styles.serviceRow}>
                      <input
                        type="text"
                        value={s.name}
                        placeholder="Service name"
                        onChange={(e) => updateService(i, { name: e.target.value })}
                      />
                      <button
                        type="button"
                        className={styles.btn}
                        style={{ fontSize: 10, padding: "4px 8px" }}
                        onClick={() =>
                          updateService(i, { highMargin: !s.highMargin })
                        }
                      >
                        {s.highMargin ? "✓ High margin" : "High margin?"}
                      </button>
                      <label
                        className={styles.checkItem}
                        style={{ fontSize: 10, whiteSpace: "nowrap" }}
                      >
                        <input
                          type="checkbox"
                          checked={s.focus}
                          onChange={(e) =>
                            updateService(i, { focus: e.target.checked })
                          }
                        />
                        Priority focus
                      </label>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ fontSize: 10, padding: "4px 8px" }}
                        onClick={() => removeService(i)}
                        aria-label={`Remove service ${i + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={styles.btn}
                style={{ marginTop: 8 }}
                onClick={addService}
              >
                + Add Service
              </button>
            </div>
            <div>
              {textareaField(
                "revenueSplit",
                "Revenue split (top 3 services)",
                "e.g. Service A (40%), Service B (25%), Service C (20%)",
                { minHeight: 80 },
              )}
              <div style={{ marginTop: 10 }}>
                {textareaField(
                  "specialisms",
                  "Specialisms / niches",
                  "Any specialist areas or niche markets...",
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3 · Target Audience */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>3 · Target Audience</h2>
            <span className={styles.num}>Who are your ideal clients?</span>
          </div>
          {textareaField(
            "idealClient",
            "Describe your ideal client in detail",
            "Include: industry, company size, revenue, location, pain points, decision-maker role...",
          )}
          <div className={styles.grid2} style={{ marginTop: 12 }}>
            {textField(
              "locations",
              "Primary location(s) you serve",
              "e.g. Sydney CBD, NSW, Australia / Remote worldwide",
            )}
            <div className={styles.field}>
              <label>Geographic focus for SEO</label>
              {selectField("geoFocus", "Geographic focus for SEO", [
                { value: "local", label: "Local (single city/region)" },
                { value: "regional", label: "Regional (state/country)" },
                { value: "national", label: "National" },
                { value: "international", label: "International" },
              ])}
            </div>
          </div>

          <div className={styles.field} style={{ marginTop: 12 }}>
            <label>Any specific industries you specialise in?</label>
            <div className={styles.chips}>
              {INDUSTRIES.map((ind) => {
                const selected = state.industries.includes(ind.value);
                return (
                  <button
                    type="button"
                    key={ind.value}
                    className={`${styles.chip} ${selected ? styles.chipSelected : ""}`}
                    onClick={() => toggleIndustry(ind.value)}
                    aria-pressed={selected}
                  >
                    {ind.label}
                  </button>
                );
              })}
            </div>
            {showIndustryOther && (
              <input
                type="text"
                className={styles.subFieldInput}
                value={state.industryOther}
                placeholder="Specify other industry..."
                style={{ marginTop: 6 }}
                onChange={(e) => setField("industryOther", e.target.value)}
              />
            )}
          </div>
        </section>

        {/* 4 · USP & Differentiation */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>4 · USP &amp; Differentiation</h2>
            <span className={styles.num}>What sets you apart?</span>
          </div>
          {textareaField(
            "usp",
            "What is your unique selling proposition (USP)?",
            "Why should clients choose you over competitors?",
          )}
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "competitorsAdmire",
              "Which competitors do you admire or want to mimic?",
              "List any competitors you respect, or that you feel are doing something well you'd like to replicate.",
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "differentiators",
              "What are your main differentiators vs competitors?",
              "e.g. faster turnaround, better support, proprietary process, certifications...",
            )}
          </div>
        </section>

        {/* 4.5 · Brand Assets & Voice */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>4.5 · Brand Assets &amp; Voice</h2>
            <span className={styles.num}>Logos, colours, fonts and tone</span>
          </div>
          <div className={styles.grid2}>
            {textField(
              "brandLogoNotes",
              "Logo / brand assets",
              "URL to drive folder, where to grab logos, etc.",
            )}
            {textField(
              "brandStyleGuideUrl",
              "Brand style guide URL",
              "https://...",
              "url",
            )}
          </div>
          <div className={styles.grid2} style={{ marginTop: 10 }}>
            {textField(
              "brandColors",
              "Brand colours",
              "e.g. #1A1A1A primary, #2563EB accent",
            )}
            {textField(
              "brandFonts",
              "Brand fonts",
              "e.g. Inter, Söhne",
            )}
          </div>
          <div className={styles.field} style={{ marginTop: 10 }}>
            <label>Tone of voice</label>
            <p className={styles.fieldHint}>
              Pick any that apply — these describe how the brand should sound.
            </p>
            <div className={styles.chips}>
              {TONE_OF_VOICE_OPTIONS.map((opt) => {
                const selected = (state.brandToneOfVoice ?? []).includes(
                  opt.value,
                );
                return (
                  <button
                    type="button"
                    key={opt.value}
                    className={`${styles.chip} ${styles.toneChip} ${selected ? styles.chipSelected : ""}`}
                    onClick={() => toggleToneOfVoice(opt.value)}
                    aria-pressed={selected}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {showToneOther && (
              <input
                type="text"
                className={styles.subFieldInput}
                value={state.brandToneOfVoiceOther}
                placeholder="Specify other tone of voice..."
                style={{ marginTop: 6 }}
                onChange={(e) =>
                  setField("brandToneOfVoiceOther", e.target.value)
                }
              />
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "brandReferenceSites",
              "Reference sites or writing you admire",
              "List any websites, blogs, or brands whose tone or visual style resonates.",
            )}
          </div>
        </section>

        {/* 5 · Tech Stack & Tools */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>5 · Tech Stack &amp; Tools</h2>
            <span className={styles.num}>What systems are you currently using?</span>
          </div>

          <div className={styles.grid3}>
            <div className={styles.field}>
              <label>CRM</label>
              {selectField(
                "crm",
                "CRM",
                [
                  { value: "hubspot", label: "HubSpot" },
                  { value: "salesforce", label: "Salesforce" },
                  { value: "pipedrive", label: "Pipedrive" },
                  { value: "zoho", label: "Zoho CRM" },
                  { value: "none", label: "None / Spreadsheets" },
                  { value: "other", label: "Other" },
                ],
                "crmOther",
              )}
            </div>
            <div className={styles.field}>
              <label>Email Marketing</label>
              {selectField(
                "emailMarketing",
                "Email Marketing",
                [
                  { value: "mailchimp", label: "MailChimp" },
                  { value: "klaviyo", label: "Klaviyo" },
                  { value: "activecampaign", label: "ActiveCampaign" },
                  { value: "convertkit", label: "ConvertKit" },
                  { value: "brevo", label: "Brevo / Sendinblue" },
                  { value: "none", label: "None" },
                  { value: "other", label: "Other" },
                ],
                "emailMarketingOther",
              )}
            </div>
            <div className={styles.field}>
              <label>Calendar / Scheduling</label>
              {selectField(
                "calendarScheduling",
                "Calendar / Scheduling",
                [
                  { value: "calendly", label: "Calendly" },
                  { value: "acuity", label: "Acuity Scheduling" },
                  { value: "squareappointments", label: "Square Appointments" },
                  { value: "squarespace", label: "Squarespace (bookings)" },
                  { value: "doodle", label: "Doodle" },
                  { value: "none", label: "None" },
                  { value: "other", label: "Other" },
                ],
                "calendarSchedulingOther",
              )}
            </div>
            <div className={styles.field}>
              <label>Project Management</label>
              {selectField(
                "projectManagement",
                "Project Management",
                [
                  { value: "asana", label: "Asana" },
                  { value: "monday", label: "Monday.com" },
                  { value: "trello", label: "Trello" },
                  { value: "jira", label: "Jira" },
                  { value: "clickup", label: "ClickUp" },
                  { value: "notion", label: "Notion" },
                  { value: "none", label: "None" },
                  { value: "other", label: "Other" },
                ],
                "projectManagementOther",
              )}
            </div>
            <div className={styles.field}>
              <label>Payment Processor</label>
              {selectField(
                "paymentProcessor",
                "Payment Processor",
                [
                  { value: "stripe", label: "Stripe" },
                  { value: "square", label: "Square" },
                  { value: "paypal", label: "PayPal" },
                  { value: "braintree", label: "Braintree" },
                  { value: "other", label: "Other" },
                ],
                "paymentProcessorOther",
              )}
            </div>
            <div className={styles.field}>
              <label>Communication / Phone</label>
              {selectField(
                "communication",
                "Communication / Phone",
                [
                  { value: "slack", label: "Slack" },
                  { value: "zoom", label: "Zoom" },
                  { value: "teams", label: "Microsoft Teams" },
                  { value: "ringcentral", label: "RingCentral" },
                  { value: "googlevoice", label: "Google Voice" },
                  { value: "none", label: "None" },
                  { value: "other", label: "Other" },
                ],
                "communicationOther",
              )}
            </div>
            <div className={styles.field}>
              <label>CMS (Content Management)</label>
              {selectField(
                "cms",
                "CMS",
                [
                  { value: "wordpress", label: "WordPress" },
                  { value: "shopify", label: "Shopify" },
                  { value: "webflow", label: "Webflow" },
                  { value: "squarespace", label: "Squarespace" },
                  { value: "drupal", label: "Drupal" },
                  { value: "wix", label: "Wix" },
                  { value: "joomla", label: "Joomla" },
                  { value: "custom", label: "Custom built" },
                  { value: "none", label: "None" },
                  { value: "other", label: "Other" },
                ],
                "cmsOther",
              )}
            </div>
            <div className={styles.field}>
              <label>Analytics</label>
              {selectField(
                "analytics",
                "Analytics",
                [
                  { value: "ga4", label: "Google Analytics 4" },
                  { value: "ga3", label: "Google Analytics 3 (Universal)" },
                  { value: "meta", label: "Meta Analytics" },
                  { value: "mixpanel", label: "Mixpanel" },
                  { value: "plausible", label: "Plausible" },
                  { value: "none", label: "None" },
                  { value: "other", label: "Other" },
                ],
                "analyticsOther",
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {textareaField(
              "otherTools",
              "Any other tools or software integral to your business?",
              "e.g. accounting software, HR tools, fulfilment systems...",
            )}
          </div>

          {/* Tools & Access checklist */}
          <div className={styles.toolsBlock}>
            <h3 className={styles.subHead}>Tools &amp; access</h3>
            <p className={styles.fieldHint}>
              Quick checklist for the analytics, hosting, and reputation tools
              we may need access to.
            </p>

            {availableDecks.length > 0 && (
              <div className={styles.field} style={{ marginBottom: 12 }}>
                <label>Link this briefing to a proposal deck</label>
                <p className={styles.fieldHint}>
                  Pick the deck you presented — we&apos;ll surface a link to it
                  at the bottom of this section for the client.
                </p>
                <select
                  value={state.linkedDeckSlug}
                  onChange={(e) =>
                    setField("linkedDeckSlug", e.target.value)
                  }
                  aria-label="Linked proposal deck"
                >
                  <option value="">None — hide proposal link</option>
                  {availableDecks.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.toolsTable}>
              <ToolAccessRow
                label="Google Search Console"
                statusKey="toolSearchConsoleStatus"
                accessKey="toolSearchConsoleAccess"
                state={state}
                setField={setField}
              />
              <ToolAccessRow
                label="Google Analytics 4"
                statusKey="toolGa4Status"
                accessKey="toolGa4Access"
                state={state}
                setField={setField}
              />
              <ToolAccessRow
                label="Google Tag Manager"
                statusKey="toolGtmStatus"
                accessKey="toolGtmAccess"
                state={state}
                setField={setField}
              />
              <ToolAccessRow
                label="Hosting"
                statusKey="toolHostingStatus"
                accessKey="toolHostingAccess"
                providerKey="toolHostingProvider"
                providerPlaceholder="e.g. Cloudflare Pages"
                state={state}
                setField={setField}
              />
              <ToolAccessRow
                label="DNS"
                statusKey="toolDnsStatus"
                accessKey="toolDnsAccess"
                providerKey="toolDnsProvider"
                providerPlaceholder="e.g. GoDaddy"
                state={state}
                setField={setField}
              />
              <ToolAccessRow
                label="Backlinks tool"
                statusKey="toolBacklinksStatus"
                accessKey="toolBacklinksAccess"
                providerKey="toolBacklinksTool"
                providerPlaceholder="e.g. Ahrefs, SEMrush"
                state={state}
                setField={setField}
              />
              <ToolAccessRow
                label="Review platforms"
                statusKey="toolReviewsStatus"
                accessKey="toolReviewsAccess"
                providerKey="toolReviewsPlatforms"
                providerPlaceholder="e.g. Trustpilot, ProductReview.com.au"
                state={state}
                setField={setField}
              />
            </div>

            <div className={styles.field} style={{ marginTop: 14 }}>
              <label>Have you done any PR?</label>
              <div className={styles.checkGroup}>
                {(
                  [
                    ["yes", "Yes"],
                    ["no", "No"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className={styles.checkItem}>
                    <input
                      type="radio"
                      name="prDone"
                      value={value}
                      checked={state.prDone === value}
                      onChange={(e) =>
                        e.target.checked && setField("prDone", value)
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {state.prDone === "yes" && (
                <div style={{ marginTop: 8 }}>
                  {textareaField(
                    "prDetails",
                    "PR details",
                    "Where, when, and what was covered.",
                  )}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              {textareaField(
                "existingBacklinksNotes",
                "Any existing backlinks worth protecting?",
                "List notable inbound links we should preserve during any migration.",
              )}
            </div>

            {proposalHref && (
              <div style={{ marginTop: 14 }}>
                <a
                  href={proposalHref}
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.proposalLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View your proposal →
                </a>
              </div>
            )}
          </div>
        </section>

        {/* 6 · Current SEO & Online Presence */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>6 · Current SEO &amp; Online Presence</h2>
            <span className={styles.num}>We handle keyword &amp; competitor research</span>
          </div>

          <div className={styles.field}>
            <label>Google Business Profile (My Business)</label>
            <div className={styles.checkGroup}>
              {checkbox("gbpExists", "Claimed and optimised")}
              {checkbox("gbpPartial", "Claimed but needs work")}
              {checkbox("gbpNone", "Not claimed / don't have one")}
            </div>
            <div
              className={`${styles.subBox} ${hasGbp ? styles.subBoxVisible : ""}`}
            >
              <p className={styles.subBoxHint}>
                If you have a Google Business Profile, do you:
              </p>
              <div className={styles.checkGroup}>
                {checkbox(
                  "gbpUpdateDetails",
                  "Keep your business details up to date (hours, address, services)",
                )}
                {checkbox(
                  "gbpRespondReviews",
                  "Respond to reviews (positive and negative)",
                )}
                {checkbox(
                  "gbpPostRegularly",
                  "Post regularly (updates, offers, photos)",
                )}
              </div>
            </div>
          </div>

          <div className={styles.field} style={{ marginTop: 12 }}>
            <label>Social media presence</label>
            <div className={styles.checkGroup}>
              {checkbox("socialLinkedin", "LinkedIn")}
              {checkbox("socialFacebook", "Facebook")}
              {checkbox("socialInstagram", "Instagram")}
              {checkbox("socialTwitter", "Twitter / X")}
              {checkbox("socialTikTok", "TikTok")}
              {checkbox("socialYoutube", "YouTube")}
            </div>
            <div
              className={`${styles.subBox} ${
                visibleSocialPlatforms.length > 0 ? styles.subBoxVisible : ""
              }`}
            >
              <div className={styles.socialHandlesGrid}>
                {visibleSocialPlatforms.map((p) => (
                  <div key={p.key} className={styles.socialHandleItem}>
                    <label className={styles.socialHandleLabel}>
                      {p.label} handle
                    </label>
                    <input
                      type="text"
                      className={styles.subFieldInput}
                      value={String(state[p.handleKey] ?? "")}
                      placeholder="e.g. @yourbusiness or full URL"
                      onChange={(e) => setField(p.handleKey, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 7 · Social Proof */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>7 · Social Proof &amp; Case Studies</h2>
            <span className={styles.num}>Who have you worked with?</span>
          </div>
          <p className={styles.sectionIntro}>
            List notable clients, case studies, or testimonials.
          </p>
          {textareaField(
            "notableClients",
            "Notable clients or brands you've worked with",
            "Company names, logos we can use (with permission)...",
          )}
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "notableIndividuals",
              "Key entertainers, speakers, or high-profile individuals (if applicable)",
              "Names of recognisable people or brands associated with your business...",
            )}
          </div>

          <div>
            {state.proof.map((p, i) => (
              <div key={i} className={styles.proofItem}>
                <input
                  type="text"
                  value={p.client}
                  placeholder="Client name"
                  onChange={(e) => updateProof(i, { client: e.target.value })}
                />
                <input
                  type="text"
                  value={p.testimonial}
                  placeholder="Testimonial excerpt..."
                  onChange={(e) =>
                    updateProof(i, { testimonial: e.target.value })
                  }
                />
                <label
                  className={styles.checkItem}
                  style={{ whiteSpace: "nowrap" }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(p.useOnSite)}
                    onChange={(e) =>
                      updateProof(i, { useOnSite: e.target.checked })
                    }
                  />
                  OK to use on website
                </label>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ fontSize: 10, padding: "4px 8px" }}
                  onClick={() => removeProof(i)}
                  aria-label={`Remove testimonial ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.btn}
            style={{ marginTop: 10 }}
            onClick={addProof}
          >
            + Add Case Study / Testimonial
          </button>

          <div className={styles.field} style={{ marginTop: 14 }}>
            <label>Do you have testimonials or reviews online?</label>
            <div className={styles.checkGroup}>
              {checkbox("reviewsGoogle", "Google reviews")}
              {checkbox("reviewsFacebook", "Facebook reviews")}
              {checkbox("reviewsClutch", "Clutch / industry sites")}
              {checkbox("reviewsNone", "None yet")}
            </div>
          </div>
        </section>

        {/* 8 · Content Strategy */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>8 · Content Strategy</h2>
            <span className={styles.num}>What will resonate with your audience?</span>
          </div>
          <div className={styles.field}>
            <label>Content types you think will work best</label>
            <p className={styles.fieldHint}>
              From your knowledge of the audience — which formats will land?
            </p>
            <div className={styles.checkGroup}>
              {checkbox("contentBlog", "Blog posts / articles")}
              {checkbox("contentCaseStudies", "Case studies")}
              {checkbox("contentGuides", "How-to guides / tutorials")}
              {checkbox("contentVideos", "Video content")}
              {checkbox("contentInfographics", "Infographics")}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "contentNotes",
              "Topics & angles your audience cares about",
              "e.g. blog articles on accounting & tax, how-to guides on the new budget, what to look for when doing tax… anything industry-specific that signals expertise.",
              { minHeight: 100 },
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <h3 className={styles.subHead}>Pillar topics</h3>
            <p className={styles.fieldHint}>
              The 3–6 broad themes your content will revolve around.
            </p>
            <div>
              {state.pillarTopics.map((p, i) => (
                <div key={i} className={styles.pillarRow}>
                  <input
                    type="text"
                    value={p.name}
                    placeholder={`Pillar topic ${i + 1}`}
                    onChange={(e) =>
                      updatePillarTopic(i, { name: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ fontSize: 10, padding: "4px 8px" }}
                    onClick={() => removePillarTopic(i)}
                    aria-label={`Remove pillar topic ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={styles.btn}
              style={{ marginTop: 8 }}
              onClick={addPillarTopic}
            >
              + Add Pillar Topic
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <h3 className={styles.subHead}>FAQs</h3>
            <p className={styles.fieldHint}>
              Questions you hear repeatedly from prospects — great seed material
              for site copy and structured data.
            </p>
            <div>
              {state.faqs.map((f, i) => (
                <div key={i} className={styles.faqItem}>
                  <div className={styles.faqRowHead}>
                    <span className={styles.faqIndex}>Q{i + 1}</span>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ fontSize: 10, padding: "4px 8px" }}
                      onClick={() => removeFaq(i)}
                      aria-label={`Remove FAQ ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    value={f.question}
                    placeholder="Question"
                    onChange={(e) =>
                      updateFaq(i, { question: e.target.value })
                    }
                  />
                  <textarea
                    value={f.answer}
                    placeholder="Answer"
                    onChange={(e) =>
                      updateFaq(i, { answer: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className={styles.btn}
              style={{ marginTop: 8 }}
              onClick={addFaq}
            >
              + Add FAQ
            </button>
          </div>
        </section>

        {/* 9 · Google Ads */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>9 · Google Ads</h2>
            <span className={styles.num}>Paid search strategy</span>
          </div>
          <div className={styles.field}>
            <label>Current Google Ads status</label>
            <div className={styles.checkGroup}>
              {(
                [
                  ["active", "Running now"],
                  ["paused", "Paused / Had before"],
                  ["never", "Never run"],
                  ["managed", "Agency-managed"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={styles.checkItem}>
                  <input
                    type="radio"
                    name="adsStatus"
                    value={value}
                    checked={state.adsStatus === value}
                    onChange={(e) =>
                      e.target.checked && setField("adsStatus", value)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "adsCampaigns",
              "Key campaigns or services for Google Ads",
              "Which services should we drive traffic to? What's the typical customer value?",
            )}
          </div>

          <div className={styles.field} style={{ marginTop: 12 }}>
            <label>Lead estimator</label>
            <p className={styles.fieldHint}>
              Rough projection — monthly budget ÷ average CPC × expected
              conversion rate. Leave blank if unknown.
            </p>
            <div className={styles.grid3}>
              {textField(
                "adsBudget",
                "Monthly budget",
                "e.g. $5,000",
              )}
              {textField(
                "adsAvgCpc",
                "Average CPC",
                "e.g. $2.50",
              )}
              {textField(
                "adsConversionRate",
                "Expected conversion rate (%)",
                "e.g. 4",
              )}
            </div>
            <div className={styles.leadEstimate}>
              {estimatedLeads != null ? (
                <>
                  <strong>Estimated leads / month:</strong>{" "}
                  <span className={styles.leadEstimateValue}>
                    {estimatedLeads}
                  </span>
                </>
              ) : (
                <span className={styles.leadEstimateMuted}>
                  Fill in budget, CPC, and conversion rate to see an
                  estimate.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 10 · Timeline */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>10 · Timeline</h2>
            <span className={styles.num}>Launch dates and hard deadlines</span>
          </div>
          <div className={styles.field}>
            {textField(
              "launchDate",
              "Ideal launch date",
              "e.g. 3 months from now, before Q4 busy season...",
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "deadlines",
              "Any hard deadlines or events to work around?",
              "Trade shows, product launches, busy seasons, renewal dates...",
            )}
          </div>
        </section>

        {/* 10.5 · Working Relationship */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>10.5 · Working Relationship</h2>
            <span className={styles.num}>How we operate together</span>
          </div>
          <div className={styles.field}>
            {textareaField(
              "pointOfContact",
              "Point of contact for changes, approvals & asset requests",
              "Name, role, email/phone — who do we go to for content sign-off, logos & asset requests?",
              { minHeight: 80 },
            )}
          </div>
        </section>

        {/* 10.7 · Lead Nurturing */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>10.7 · Lead Nurturing</h2>
            <span className={styles.num}>How leads flow today and where they should</span>
          </div>
          <p className={styles.sectionIntro}>
            Walk us through the current process — each step and who manages
            it — then describe what the future-state should look like.
          </p>
          <div>
            {state.leadNurturingSteps.map((s, i) => (
              <div key={i} className={styles.nurtureItem}>
                <span className={styles.nurtureStepNumber}>{i + 1}</span>
                <input
                  type="text"
                  value={s.step}
                  placeholder="Step (e.g. Lead form submitted)"
                  onChange={(e) => updateNurtureStep(i, { step: e.target.value })}
                />
                <input
                  type="text"
                  value={s.owner}
                  placeholder="Owner (who manages it)"
                  onChange={(e) => updateNurtureStep(i, { owner: e.target.value })}
                />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ fontSize: 10, padding: "4px 8px" }}
                  onClick={() => removeNurtureStep(i)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.btn}
            style={{ marginTop: 10 }}
            onClick={addNurtureStep}
          >
            + Add Step
          </button>
          <div style={{ marginTop: 14 }}>
            {textareaField(
              "leadNurturingFutureNotes",
              "What should the future-state lead nurturing flow look like?",
              "e.g. add SMS reminders after 48h, route hot leads to CRM, drip campaign for cold leads…",
              { minHeight: 100 },
            )}
          </div>
        </section>

        {/* 11 · Discovery Notes */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>11 · Discovery Notes</h2>
            <span className={styles.num}>Free-form notes for the meeting</span>
          </div>
          {textareaField(
            "additionalNotes",
            "Anything else we should know about your business?",
            "Processes, pain points, goals, concerns...",
            { minHeight: 100 },
          )}
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "questionsForUs",
              "Questions for us?",
              "What do you want to ask during our meeting?",
              { minHeight: 80 },
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {textareaField(
              "internalNotes",
              "Internal notes (for your team, not us)",
              "Any context your team needs to align on before the meeting...",
              { minHeight: 60 },
            )}
          </div>
        </section>

        {/* 12 · Additional details (collapsed by default) */}
        <section
          className={`${styles.section} ${styles.collapsibleSection}`}
        >
          <button
            type="button"
            className={styles.collapsibleHead}
            onClick={() => setAdditionalDetailsOpen((v) => !v)}
            aria-expanded={additionalDetailsOpen}
          >
            <div className={styles.sectionHead} style={{ margin: 0 }}>
              <h2>12 · Additional details</h2>
              <span className={styles.num}>
                Optional context — compliance, approvals, hosting
              </span>
            </div>
            <span className={styles.chevron} aria-hidden="true">
              {additionalDetailsOpen ? "▾" : "▸"}
            </span>
          </button>
          {additionalDetailsOpen && (
            <div className={styles.collapsibleBody}>
              {textareaField(
                "complianceNotes",
                "Compliance notes",
                "Regulated industry constraints, copy review requirements, etc.",
              )}
              <div style={{ marginTop: 12 }}>
                {textareaField(
                  "decisionMakerNotes",
                  "Decision-makers & approval cycle",
                  "Who approves what, and roughly how long sign-off takes.",
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {textareaField(
                  "hostingDnsNotes",
                  "Hosting / DNS extra notes",
                  "Anything beyond the tools checklist we should know.",
                )}
              </div>
            </div>
          )}
        </section>

        <div className={styles.toolbar} style={{ marginTop: 20 }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={downloadMarkdown}
          >
            Download / Copy Markdown
          </button>
          <span className={styles.meta} style={{ marginLeft: 0 }}>
            Generated by Optimise Digital
          </span>
        </div>
      </main>

      <div
        className={`${styles.toast} ${toast ? styles.toastShow : ""} ${
          toast?.error ? styles.toastError : ""
        }`}
        role="status"
        aria-live="polite"
      >
        {toast?.msg}
      </div>
    </div>
  );
}

export default DiscoveryBriefingForm;

// ── Local helper: a single row of the Tools & Access checklist ────
interface ToolAccessRowProps {
  label: string;
  statusKey: keyof DiscoveryBriefingState;
  accessKey: keyof DiscoveryBriefingState;
  providerKey?: keyof DiscoveryBriefingState;
  providerPlaceholder?: string;
  state: DiscoveryBriefingState;
  setField: <K extends keyof DiscoveryBriefingState>(
    key: K,
    value: DiscoveryBriefingState[K],
  ) => void;
}

function ToolAccessRow(props: ToolAccessRowProps) {
  const {
    label,
    statusKey,
    accessKey,
    providerKey,
    providerPlaceholder,
    state,
    setField,
  } = props;
  return (
    <div className={styles.toolsRow}>
      <div className={styles.toolsLabel}>{label}</div>
      <select
        className={styles.toolsSelect}
        value={String(state[statusKey] ?? "")}
        onChange={(e) =>
          setField(statusKey, e.target.value as DiscoveryBriefingState[typeof statusKey])
        }
        aria-label={`${label} — do you have it?`}
      >
        <option value="">Has it?</option>
        {TOOL_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className={styles.toolsSelect}
        value={String(state[accessKey] ?? "")}
        onChange={(e) =>
          setField(accessKey, e.target.value as DiscoveryBriefingState[typeof accessKey])
        }
        aria-label={`${label} — access status`}
      >
        <option value="">Access?</option>
        {TOOL_ACCESS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {providerKey ? (
        <input
          type="text"
          className={styles.toolsProvider}
          value={String(state[providerKey] ?? "")}
          placeholder={providerPlaceholder ?? ""}
          aria-label={`${label} — provider`}
          onChange={(e) =>
            setField(
              providerKey,
              e.target.value as DiscoveryBriefingState[typeof providerKey],
            )
          }
        />
      ) : (
        <div className={styles.toolsProviderSpacer} aria-hidden="true" />
      )}
    </div>
  );
}
