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
import { buildDiscoveryBriefingMarkdown } from "@/lib/discovery-briefing/markdown";
import styles from "./DiscoveryBriefingForm.module.css";
import {
  defaultDiscoveryBriefingState,
  type DiscoveryBriefingAudienceSegment,
  type DiscoveryBriefingAudienceType,
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
  /**
   * Who is viewing this form.
   *
   * - `"admin"` (default): full editor surface — Hide section checkboxes
   *   render, hidden sections still show their collapsed header so the team
   *   can re-enable, and the "Hidden" subtitle pill is visible.
   * - `"client"`: the public-facing surface. Hide controls are removed, the
   *   "Hidden" pill never renders, and hidden sections are dropped entirely
   *   (no collapsed header, no placeholder) so the client never sees what
   *   the team chose to exclude.
   */
  viewerRole?: "admin" | "client";
}

/**
 * Textarea that grows to fit its content automatically.
 *
 * Two layers of autosize so the form never traps text behind a scrollbar:
 *  1. CSS `field-sizing: content` handles this natively on modern Chromium.
 *  2. The effect below re-measures on every value change for browsers that
 *     don't yet support the CSS property (Safari/Firefox at time of writing).
 *
 * We reset `height` to `auto` first so shrinking back down works when the
 * user deletes text — otherwise `scrollHeight` would stay at the previous
 * tall measurement.
 */
function AutoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const value = props.value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} {...props} />;
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
    viewerRole = "admin",
  } = props;

  // Admin-only surfaces (Hide section controls, hidden-section placeholder)
  // are gated on this flag throughout the rest of the component.
  const isAdminViewer = viewerRole === "admin";

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

  // ── Target audience types (synced to commercial audienceSegments) ──────
  const updateTargetAudienceType = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingAudienceType>) => {
      setState((prev) => {
        const rows = (prev.targetAudienceTypes ?? []).slice();
        rows[index] = { ...rows[index], ...patch };
        // Sync names to audienceSegments
        const syncedSegments: DiscoveryBriefingAudienceSegment[] = rows.map((t) => {
          const existing = (prev.audienceSegments ?? [])[index];
          return {
            name: t.name,
            averageOrderValue: existing?.averageOrderValue ?? "",
            purchaseFrequency: existing?.purchaseFrequency ?? "",
            newLeadsPerMonth: existing?.newLeadsPerMonth ?? "",
            idealLeadVolume: existing?.idealLeadVolume ?? "",
          };
        });
        return { ...prev, targetAudienceTypes: rows, audienceSegments: syncedSegments };
      });
    },
    [],
  );
  const addTargetAudienceType = useCallback(() => {
    setState((prev) => {
      const newType: DiscoveryBriefingAudienceType = { name: "", description: "" };
      const newTypes = [...(prev.targetAudienceTypes ?? []), newType];
      // Also add a new empty segment to audienceSegments
      const newSegment: DiscoveryBriefingAudienceSegment = {
        name: "",
        averageOrderValue: "",
        purchaseFrequency: "",
        newLeadsPerMonth: "",
        idealLeadVolume: "",
      };
      const newSegments = [...(prev.audienceSegments ?? []), newSegment];
      return { ...prev, targetAudienceTypes: newTypes, audienceSegments: newSegments };
    });
  }, []);
  const removeTargetAudienceType = useCallback((index: number) => {
    setState((prev) => {
      const rows = (prev.targetAudienceTypes ?? []).slice();
      rows.splice(index, 1);
      const segments = (prev.audienceSegments ?? []).slice();
      segments.splice(index, 1);
      return { ...prev, targetAudienceTypes: rows, audienceSegments: segments };
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

  // Audience segments (multi-audience commercials)
  const updateAudienceSegment = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingAudienceSegment>) => {
      setState((prev) => {
        const rows = (prev.audienceSegments ?? []).slice();
        rows[index] = { ...rows[index], ...patch };
        // Sync name back to targetAudienceTypes
        let syncedTypes = prev.targetAudienceTypes ?? [];
        if (patch.name !== undefined) {
          syncedTypes = syncedTypes.slice();
          syncedTypes[index] = { ...syncedTypes[index], name: patch.name };
        }
        return { ...prev, audienceSegments: rows, targetAudienceTypes: syncedTypes };
      });
    },
    [],
  );
  const addAudienceSegment = useCallback(() => {
    setState((prev) => ({
      ...prev,
      audienceSegments: [
        ...(prev.audienceSegments ?? []),
        {
          name: "",
          averageOrderValue: "",
          purchaseFrequency: "",
          newLeadsPerMonth: "",
          idealLeadVolume: "",
        },
      ],
      targetAudienceTypes: [
        ...(prev.targetAudienceTypes ?? []),
        { name: "", description: "" },
      ],
    }));
  }, []);
  const removeAudienceSegment = useCallback((index: number) => {
    setState((prev) => {
      const rows = (prev.audienceSegments ?? []).slice();
      rows.splice(index, 1);
      const types = (prev.targetAudienceTypes ?? []).slice();
      types.splice(index, 1);
      return { ...prev, audienceSegments: rows, targetAudienceTypes: types };
    });
  }, []);

  // Lead magnets
  const updateLeadMagnet = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingLeadMagnet>) => {
      setState((prev) => {
        const rows = (prev.leadMagnets ?? []).slice();
        rows[index] = { ...rows[index], ...patch };
        return { ...prev, leadMagnets: rows };
      });
    },
    [],
  );
  const addLeadMagnet = useCallback(() => {
    setState((prev) => ({
      ...prev,
      leadMagnets: [
        ...(prev.leadMagnets ?? []),
        { name: "", description: "", cta: "" },
      ],
    }));
  }, []);
  const removeLeadMagnet = useCallback((index: number) => {
    setState((prev) => {
      const rows = (prev.leadMagnets ?? []).slice();
      rows.splice(index, 1);
      return { ...prev, leadMagnets: rows };
    });
  }, []);

  // RACI rows
  const updateRaciRow = useCallback(
    (index: number, patch: Partial<DiscoveryBriefingRaciRow>) => {
      setState((prev) => {
        const rows = (prev.raciRows ?? []).slice();
        rows[index] = { ...rows[index], ...patch };
        return { ...prev, raciRows: rows };
      });
    },
    [],
  );
  const addRaciRow = useCallback(() => {
    setState((prev) => ({
      ...prev,
      raciRows: [
        ...(prev.raciRows ?? []),
        {
          task: "",
          responsible: "",
          accountable: "",
          consulted: "",
          informed: "",
        },
      ],
    }));
  }, []);
  const removeRaciRow = useCallback((index: number) => {
    setState((prev) => {
      const rows = (prev.raciRows ?? []).slice();
      rows.splice(index, 1);
      return { ...prev, raciRows: rows };
    });
  }, []);

  // Section visibility toggles
  const isSectionHidden = useCallback(
    (id: DiscoveryBriefingSectionId): boolean =>
      (state.hiddenSections ?? []).includes(id),
    [state.hiddenSections],
  );
  const toggleSectionHidden = useCallback(
    (id: DiscoveryBriefingSectionId) => {
      setState((prev) => {
        const list = prev.hiddenSections ?? [];
        const idx = list.indexOf(id);
        if (idx > -1) {
          const next = list.slice();
          next.splice(idx, 1);
          return { ...prev, hiddenSections: next };
        }
        return { ...prev, hiddenSections: [...list, id] };
      });
    },
    [],
  );

  // ── Meta count ───────────────────────────────────────────────────
  const filledCount = useMemo(() => {
    return Object.values(state).filter((v) => {
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "boolean") return v;
      return !!v;
    }).length;
  }, [state]);
  const totalKeys = Object.keys(defaultDiscoveryBriefingState()).length;

  // ── Download/copy markdown ───────────────────────────────────────
  const downloadMarkdown = useCallback(async () => {
    try {
      // For admins, flush the debounced CMS save before exporting so the stored
      // server-rendered markdown stays in sync. Public/client viewers cannot use
      // the authenticated CMS API, so their export is generated locally from the
      // already-rendered, PIN-gated form state without exposing a write endpoint.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      let md = "";
      if (isAdminViewer) {
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
        md = saved.markdown ?? "";
      } else {
        md = buildDiscoveryBriefingMarkdown(latestStateRef.current);
      }

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
  }, [apiUrl, isAdminViewer, showToast]);

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
      <AutoTextarea
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

  /**
   * Shared section header with title, subtitle pill, optional extra
   * controls (e.g. an "+ Add" button), and a "Hide section" checkbox.
   * Hidden sections collapse their body — the body is rendered with
   * `renderSection` which returns null when the id is hidden.
   */
  const SectionHead = (props: {
    id: DiscoveryBriefingSectionId;
    num: string;
    title: React.ReactNode;
    subtitle: React.ReactNode;
    rightControls?: React.ReactNode;
  }) => {
    const hidden = isSectionHidden(props.id);
    // Client viewers never see the "Hidden" pill or the Hide checkbox —
    // hidden sections don't render at all for them (see renderSection).
    const showHiddenPill = hidden && isAdminViewer;
    return (
      <div className={styles.sectionHead}>
        <h2>
          {props.num} · {props.title}
        </h2>
        <span
          className={
            showHiddenPill ? `${styles.num} ${styles.numHidden}` : styles.num
          }
        >
          {showHiddenPill ? "Hidden" : props.subtitle}
        </span>
        <div className={styles.sectionHeadControls}>
          {props.rightControls}
          {isAdminViewer ? (
            <label
              className={styles.hideSectionToggle}
              title="Hide this section from the rendered markdown and the public client view"
            >
              <input
                type="checkbox"
                checked={hidden}
                onChange={() => toggleSectionHidden(props.id)}
              />
              Hide section
            </label>
          ) : null}
        </div>
      </div>
    );
  };

  /**
   * Wrap a section's `<section>` block. Admin viewers still see hidden
   * sections as a collapsed header (so the team can re-enable in place);
   * client viewers see nothing at all for hidden sections — not even a
   * placeholder — so the absence is visually clean.
   */
  const renderSection = (
    id: DiscoveryBriefingSectionId,
    head: React.ReactNode,
    body: React.ReactNode,
  ) => {
    const hidden = isSectionHidden(id);
    if (hidden && !isAdminViewer) return null;
    return (
      <section
        className={`${styles.section} ${hidden ? styles.sectionHidden : ""}`}
      >
        {head}
        {hidden ? null : body}
      </section>
    );
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Client Discovery Briefing</p>
          <h1 style={{ fontSize: "clamp(18px, 2.5vw, 24px)", fontWeight: 900, margin: "0 0 6px 0" }}>
            {scopeLabel}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p className={styles.lede}>
              {scope === "proposal" ? "Proposal" : "Client"} discovery briefing —
              everything saves to the CMS as you type.
            </p>
            <span className={styles.meta}>
              {filledCount}/{totalKeys} sections completed · saved
            </span>
          </div>
        </div>
        {/* Right-anchored stack: logo on top, Download / Copy Markdown
         * below it. Lives as a sibling of `headerText` so the parent
         * `.header` flex `justify-content: space-between` pins it to the
         * right edge of the centred max-width:1000px header at any
         * viewport width. On mobile (<=600px) the .header rule switches
         * to `flex-direction: column`, which stacks logo+button under
         * the title block naturally — no extra logic needed here. */}
        <div
          className={styles.logoArea}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          <img
            src="/optimise-digital-logo-black.webp"
            alt="Optimise Digital"
            style={{ height: 18, width: "auto" }}
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={downloadMarkdown}
            style={{ fontSize: 9, padding: "4px 8px" }}
          >
            Download / Copy Markdown
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* 1 · Business Overview */}
        {renderSection(
          "businessOverview",
          <SectionHead
            id="businessOverview"
            num="1"
            title="Business Overview"
            subtitle="One sentence summary"
          />,
          <div className={styles.field}>
            {textareaField(
              "oneLiner",
              "What does your business do in one sentence?",
              "We help [target audience] achieve [outcome] through [service]...",
            )}
          </div>,
        )}

        {/* 2 · Core Services */}
        {renderSection(
          "coreServices",
          <SectionHead
            id="coreServices"
            num="2"
            title="Core Services"
            subtitle="List services with priority"
          />,
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
          </div>,
        )}

        {/* 3 · Target Audience */}
        {renderSection(
          "targetAudience",
          <SectionHead
            id="targetAudience"
            num="3"
            title="Target Audience"
            subtitle="Who are your ideal clients?"
            rightControls={
              <button
                type="button"
                className={`${styles.btn} ${styles.audienceAddBtn}`}
                style={{ fontSize: 10, padding: "4px 8px" }}
                onClick={addTargetAudienceType}
              >
                + Audience type
              </button>
            }
          />,
          <>
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
            {/* Audience types list — synced to Commercials & Growth */}
            {state.targetAudienceTypes && state.targetAudienceTypes.length > 0 && (
              <div className={styles.field} style={{ marginTop: 12 }}>
                <label>Audience types</label>
                <p className={styles.fieldHint}>
                  Define different customer types. Names sync to Commercials &amp; Growth for economic data.
                </p>
                <div
                  className={`${styles.audienceGrid} ${
                    styles[
                      `cols${Math.min(4, state.targetAudienceTypes.length)}` as keyof typeof styles
                    ] ?? ""
                  }`}
                >
                  {state.targetAudienceTypes.map((type, i) => (
                    <div key={i} className={styles.audienceCol}>
                      <div className={styles.audienceColHead}>
                        <input
                          type="text"
                          value={type.name}
                          placeholder={`Audience type ${i + 1}`}
                          onChange={(e) =>
                            updateTargetAudienceType(i, { name: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnGhost}`}
                          style={{ fontSize: 10, padding: "4px 8px" }}
                          onClick={() => removeTargetAudienceType(i)}
                          aria-label={`Remove audience type ${i + 1}`}
                        >
                          ×
                        </button>
                      </div>
                      <div className={styles.field}>
                        <label>Description</label>
                        <AutoTextarea
                          value={type.description}
                          placeholder="Brief description of this audience..."
                          rows={2}
                          onChange={(e) =>
                            updateTargetAudienceType(i, { description: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>,
        )}

        {/* 4 · Commercials & Growth (multi-audience) */}
        {renderSection(
          "commercials",
          <SectionHead
            id="commercials"
            num="4"
            title={<>Commercials &amp; Growth</>}
            subtitle="Revenue economics & lead flow"
            rightControls={
              <button
                type="button"
                className={`${styles.btn} ${styles.audienceAddBtn}`}
                style={{ fontSize: 10, padding: "4px 8px" }}
                onClick={addAudienceSegment}
              >
                + Add audience type
              </button>
            }
          />,
          <>
            {state.audienceSegments && state.audienceSegments.length > 0 ? (
              <div
                className={`${styles.audienceGrid} ${
                  styles[
                    `cols${Math.min(4, state.audienceSegments.length)}` as keyof typeof styles
                  ] ?? ""
                }`}
              >
                {state.audienceSegments.map((seg, i) => (
                  <div key={i} className={styles.audienceCol}>
                    <div className={styles.audienceColHead}>
                      <input
                        type="text"
                        value={seg.name}
                        placeholder={`Audience ${i + 1}`}
                        onChange={(e) =>
                          updateAudienceSegment(i, { name: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ fontSize: 10, padding: "4px 8px" }}
                        onClick={() => removeAudienceSegment(i)}
                        aria-label={`Remove audience ${i + 1}`}
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.field}>
                      <label>Average order / client value</label>
                      <input
                        type="text"
                        value={seg.averageOrderValue}
                        placeholder="e.g. $3,500"
                        onChange={(e) =>
                          updateAudienceSegment(i, {
                            averageOrderValue: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Purchases per client / year</label>
                      <input
                        type="text"
                        value={seg.purchaseFrequency}
                        placeholder="e.g. 2.5"
                        onChange={(e) =>
                          updateAudienceSegment(i, {
                            purchaseFrequency: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Current new leads / month</label>
                      <input
                        type="text"
                        value={seg.newLeadsPerMonth}
                        placeholder="e.g. 25"
                        onChange={(e) =>
                          updateAudienceSegment(i, {
                            newLeadsPerMonth: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Ideal new leads / month</label>
                      <input
                        type="text"
                        value={seg.idealLeadVolume}
                        placeholder="e.g. 60"
                        onChange={(e) =>
                          updateAudienceSegment(i, {
                            idealLeadVolume: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
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
              </>
            )}
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
          </>,
        )}



        {/* 5 · USP & Differentiation */}
        {renderSection(
          "usp",
          <SectionHead
            id="usp"
            num="5"
            title={<>USP &amp; Differentiation</>}
            subtitle="What sets you apart?"
          />,
          <>
            {textareaField(
              "usp",
              "What is your unique selling proposition (USP)?",
              "Why should clients choose you?",
            )}
            <div style={{ marginTop: 12 }}>
              {textareaField(
                "differentiators",
                "What are your main differentiators vs competitors?",
                "e.g. faster turnaround, better support, proprietary process, certifications...",
              )}
            </div>
          </>,
        )}

        {/* 6 · Brand Assets & Voice */}
        {renderSection(
          "brand",
          <SectionHead
            id="brand"
            num="6"
            title={<>Brand Assets &amp; Voice</>}
            subtitle="Logos, colours, fonts and tone"
          />,
          <>
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
          </>,
        )}

        {/* 7 · Tech Stack & Tools */}
        {renderSection(
          "techStack",
          <SectionHead
            id="techStack"
            num="7"
            title={<>Tech Stack &amp; Tools</>}
            subtitle="What systems are you currently using?"
          />,
          <>
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

            <div className={styles.toolsTableTwoCol}>
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
          </>,
        )}

        {/* 8 · Current SEO & Online Presence */}
        {renderSection(
          "seoPresence",
          <SectionHead
            id="seoPresence"
            num="8"
            title={<>Current SEO &amp; Online Presence</>}
            subtitle={<>We handle keyword &amp; competitor research</>}
          />,
          <>
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
          </>,
        )}

        {/* 9 · Social Proof */}
        {renderSection(
          "socialProof",
          <SectionHead
            id="socialProof"
            num="9"
            title={<>Social Proof &amp; Case Studies</>}
            subtitle="Who have you worked with?"
          />,
          <>
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
          </>,
        )}

        {/* 10 · Lead Magnets */}
        {renderSection(
          "leadMagnets",
          <SectionHead
            id="leadMagnets"
            num="10"
            title="Lead Magnets"
            subtitle="Free assets that capture leads"
            rightControls={
              <button
                type="button"
                className={styles.btn}
                style={{ fontSize: 10, padding: "4px 8px" }}
                onClick={addLeadMagnet}
              >
                + Add lead magnet
              </button>
            }
          />,
          <>
            <div>
              {(state.leadMagnets ?? []).map((m, i) => (
                <div key={i} className={styles.leadMagnetRow}>
                  <input
                    type="text"
                    value={m.name}
                    placeholder="Name (e.g. Free SEO audit)"
                    onChange={(e) =>
                      updateLeadMagnet(i, { name: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={m.description}
                    placeholder="Short description"
                    onChange={(e) =>
                      updateLeadMagnet(i, { description: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={m.cta}
                    placeholder="CTA / destination"
                    onChange={(e) =>
                      updateLeadMagnet(i, { cta: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ fontSize: 10, padding: "4px 8px" }}
                    onClick={() => removeLeadMagnet(i)}
                    aria-label={`Remove lead magnet ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              {textareaField(
                "leadMagnetsNotes",
                "Lead magnet strategy notes",
                "How will these be promoted, sequenced, and measured?",
              )}
            </div>
          </>,
        )}

        {/* 11 · Content Strategy */}
        {renderSection(
          "contentStrategy",
          <SectionHead
            id="contentStrategy"
            num="11"
            title="Content Strategy"
            subtitle="What will resonate with your audience?"
          />,
          <>
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
                  <AutoTextarea
                    value={f.question}
                    placeholder="Question"
                    onChange={(e) =>
                      updateFaq(i, { question: e.target.value })
                    }
                  />
                  <AutoTextarea
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
          </>,
        )}

        {/* 12 · Google Ads */}
        {renderSection(
          "googleAds",
          <SectionHead
            id="googleAds"
            num="12"
            title="Google Ads"
            subtitle="Paid search strategy"
          />,
          <>
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
          </>,
        )}

        {/* 13 · Timeline */}
        {renderSection(
          "timeline",
          <SectionHead
            id="timeline"
            num="13"
            title="Timeline"
            subtitle="Launch dates and hard deadlines"
          />,
          <>
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
          </>,
        )}

        {/* 14 · Working Relationship */}
        {renderSection(
          "workingRelationship",
          <SectionHead
            id="workingRelationship"
            num="14"
            title="Working Relationship"
            subtitle="How we operate together"
          />,
          <div className={styles.field}>
            {textareaField(
              "pointOfContact",
              "Point of contact for changes, approvals & asset requests",
              "Name, role, email/phone — who do we go to for content sign-off, logos & asset requests?",
              { minHeight: 80 },
            )}
          </div>,
        )}

        {/* 15 · RACI & Approvals */}
        {renderSection(
          "raci",
          <SectionHead
            id="raci"
            num="15"
            title={<>RACI &amp; Approvals</>}
            subtitle="Who's Responsible, Accountable, Consulted, Informed?"
            rightControls={
              <button
                type="button"
                className={styles.btn}
                style={{ fontSize: 10, padding: "4px 8px" }}
                onClick={addRaciRow}
              >
                + Add task
              </button>
            }
          />,
          <>
            {(state.raciRows ?? []).length > 0 && (
              <div className={styles.raciHead}>
                <span>Task</span>
                <span>R</span>
                <span>A</span>
                <span>C</span>
                <span>I</span>
                <span />
              </div>
            )}
            <div>
              {(state.raciRows ?? []).map((r, i) => (
                <div key={i} className={styles.raciRow}>
                  <input
                    type="text"
                    value={r.task}
                    placeholder="Task / deliverable"
                    onChange={(e) =>
                      updateRaciRow(i, { task: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={r.responsible}
                    placeholder="Responsible"
                    onChange={(e) =>
                      updateRaciRow(i, { responsible: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={r.accountable}
                    placeholder="Accountable"
                    onChange={(e) =>
                      updateRaciRow(i, { accountable: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={r.consulted}
                    placeholder="Consulted"
                    onChange={(e) =>
                      updateRaciRow(i, { consulted: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    value={r.informed}
                    placeholder="Informed"
                    onChange={(e) =>
                      updateRaciRow(i, { informed: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    style={{ fontSize: 10, padding: "4px 8px" }}
                    onClick={() => removeRaciRow(i)}
                    aria-label={`Remove RACI row ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              {textareaField(
                "approvalsNotes",
                "Who approves what?",
                "Note who signs off on creative, copy, ad spend, contracts, etc.",
              )}
            </div>
          </>,
        )}

        {/* 16 · Lead Nurturing */}
        {renderSection(
          "leadNurturing",
          <SectionHead
            id="leadNurturing"
            num="16"
            title="Lead Nurturing"
            subtitle="How leads flow today and where they should"
          />,
          <>
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
          </>,
        )}

        {/* 17 · Discovery Notes */}
        {renderSection(
          "discoveryNotes",
          <SectionHead
            id="discoveryNotes"
            num="17"
            title="Discovery Notes"
            subtitle="Free-form notes for the meeting"
          />,
          <>
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
          </>,
        )}

        {/* 18 · Additional details (compliance only) */}
        {isSectionHidden("additionalDetails") ? (
          <section className={`${styles.section} ${styles.sectionHidden}`}>
            <SectionHead
              id="additionalDetails"
              num="18"
              title="Additional details"
              subtitle="Optional compliance notes"
            />
          </section>
        ) : (
          <section
            className={`${styles.section} ${styles.collapsibleSection}`}
          >
            <button
              type="button"
              className={styles.collapsibleHead}
              onClick={() => setAdditionalDetailsOpen((v) => !v)}
              aria-expanded={additionalDetailsOpen}
            >
              <SectionHead
                id="additionalDetails"
                num="18"
                title="Additional details"
                subtitle="Optional compliance notes"
              />
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
              </div>
            )}
          </section>
        )}

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
