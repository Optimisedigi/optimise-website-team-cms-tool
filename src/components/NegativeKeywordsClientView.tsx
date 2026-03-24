"use client";

import { useState, FormEvent } from "react";

interface Keyword {
  index: number;
  keyword: string;
  matchType: string;
  flaggedForRemoval: boolean;
}

interface KeywordList {
  id: number;
  name: string;
  slug?: string;
  scope: string;
  campaignName: string | null;
  campaigns: string[];
  adGroupName: string | null;
  keywords: Keyword[];
  updatedAt: string;
}

const MATCH_COLORS: Record<string, { bg: string; color: string }> = {
  broad: { bg: "#dbeafe", color: "#1e40af" },
  phrase: { bg: "#e0e7ff", color: "#3730a3" },
  exact: { bg: "#dcfce7", color: "#166534" },
};

export default function NegativeKeywordsClientView({
  clientId,
  clientName,
  clientSlug,
  lists: initialLists,
  activeListSlug,
}: {
  clientId: number;
  clientName: string;
  clientSlug?: string;
  lists: KeywordList[];
  activeListSlug?: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [lists, setLists] = useState(initialLists);
  const [flagging, setFlagging] = useState<string | null>(null);

  const handlePinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPinError("");
    setPinLoading(true);

    try {
      const res = await fetch("/api/negative-keyword-lists/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          listId: lists[0]?.id || 0,
          keywordIndex: -1,
          pin,
        }),
      });
      if (res.status === 403) {
        setPinError("Incorrect PIN");
      } else {
        setUnlocked(true);
      }
    } catch {
      setPinError("Something went wrong. Please try again.");
    } finally {
      setPinLoading(false);
    }
  };

  const handleFlag = async (listId: number, keywordIndex: number, unflag: boolean) => {
    const key = `${listId}-${keywordIndex}`;
    setFlagging(key);

    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              keywords: l.keywords.map((kw) =>
                kw.index === keywordIndex ? { ...kw, flaggedForRemoval: !unflag } : kw
              ),
            }
          : l
      )
    );

    try {
      await fetch("/api/negative-keyword-lists/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, listId, keywordIndex, pin, unflag }),
      });
    } catch {
      setLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? {
                ...l,
                keywords: l.keywords.map((kw) =>
                  kw.index === keywordIndex ? { ...kw, flaggedForRemoval: unflag } : kw
                ),
              }
            : l
        )
      );
    } finally {
      setFlagging(null);
    }
  };

  const flaggedCount = lists.reduce(
    (sum, l) => sum + l.keywords.filter((kw) => kw.flaggedForRemoval).length,
    0
  );

  const lastUpdated = lists.reduce((latest, l) => {
    const d = new Date(l.updatedAt).getTime();
    return d > latest ? d : latest;
  }, 0);

  if (!unlocked) {
    return (
      <div style={pageStyle}>
        <div style={gateCard}>
          <div style={{ marginBottom: 20, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Negative Keywords List</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>{clientName}</p>
          </div>
          <p style={{ fontSize: 14, color: "#6b7280", textAlign: "center", margin: "0 0 20px" }}>
            Enter your PIN to view your negative keyword lists.
          </p>
          <form onSubmit={handlePinSubmit}>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              maxLength={10}
              style={inputStyle}
              autoFocus
            />
            {pinError && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0 0" }}>{pinError}</p>}
            <button type="submit" disabled={pinLoading || !pin} style={submitBtn}>
              {pinLoading ? "Verifying..." : "View Keywords"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", color: "#111827" }}>
            Negative Keywords List
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            {clientName}
            {lastUpdated > 0 && (
              <span> &middot; Last updated {new Date(lastUpdated).toLocaleDateString("en-AU")}</span>
            )}
          </p>
          {flaggedCount > 0 && (
            <p style={{ fontSize: 13, color: "#b45309", margin: "6px 0 0" }}>
              {flaggedCount} keyword{flaggedCount !== 1 ? "s" : ""} flagged for removal review
            </p>
          )}
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px", lineHeight: 1.5 }}>
          These are the negative keywords applied to your Google Ads account to prevent your ads
          from showing for irrelevant searches. If you believe a keyword should be removed, click
          the flag button and our team will review it.
        </p>

        {lists.length === 0 && (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>
            No negative keyword lists configured yet.
          </p>
        )}

        {/* All lists rendered flat — no grouping by scope header since campaigns are shown on each card */}
        {lists.map((list) => (
          <ListCard key={list.id} list={list} onFlag={handleFlag} flagging={flagging} />
        ))}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "24px 0 16px" }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>Managed by</span>
          <img
            src="/optimise-logo-animated.gif"
            alt="Optimise Digital"
            style={{ height: 14, width: "auto" }}
          />
        </div>
      </div>
    </div>
  );
}

function ListCard({
  list,
  onFlag,
  flagging,
}: {
  list: KeywordList;
  onFlag: (listId: number, keywordIndex: number, unflag: boolean) => void;
  flagging: string | null;
}) {
  // Collect all linked campaigns/ad groups
  const linkedCampaigns = list.campaigns.length > 0
    ? list.campaigns
    : list.campaignName ? [list.campaignName] : [];

  return (
    <div
      style={{
        background: "#f3f4f6",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#111827" }}>
          {list.name}
          <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
            {list.keywords.length} keyword{list.keywords.length !== 1 ? "s" : ""}
          </span>
        </h4>

        {/* Scope badge */}
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "2px 8px",
            borderRadius: 4,
            background: list.scope === "account" ? "#dbeafe" : list.scope === "campaign" ? "#e0e7ff" : "#fef3c7",
            color: list.scope === "account" ? "#1e40af" : list.scope === "campaign" ? "#3730a3" : "#92400e",
          }}>
            {list.scope === "account" ? "Account Level" : list.scope === "campaign" ? "Campaign Level" : "Ad Group Level"}
          </span>

          {/* Campaign/ad group pills */}
          {linkedCampaigns.map((name) => (
            <span
              key={name}
              style={{
                fontSize: 10,
                fontWeight: 400,
                padding: "1px 6px",
                borderRadius: 8,
                background: "#f0f7ff",
                color: "#2563eb",
                border: "1px solid #bfdbfe",
                lineHeight: 1.4,
              }}
            >
              {name}
            </span>
          ))}
          {list.adGroupName && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                padding: "1px 6px",
                borderRadius: 8,
                background: "#f0f7ff",
                color: "#2563eb",
                border: "1px solid #bfdbfe",
                lineHeight: 1.4,
              }}
            >
              {list.adGroupName}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {list.keywords.map((kw) => {
          const mc = MATCH_COLORS[kw.matchType] || MATCH_COLORS.broad;
          const isFlagging = flagging === `${list.id}-${kw.index}`;
          return (
            <div
              key={kw.index}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.3,
                background: kw.flaggedForRemoval ? "#fef2f2" : "#ffffff",
                border: `1px solid ${kw.flaggedForRemoval ? "#fecaca" : "#e5e7eb"}`,
                textDecoration: kw.flaggedForRemoval ? "line-through" : "none",
                color: kw.flaggedForRemoval ? "#9ca3af" : "#374151",
                opacity: isFlagging ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: mc.color,
                  background: mc.bg,
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {kw.matchType}
              </span>
              <span>{kw.keyword}</span>
              <button
                type="button"
                onClick={() => onFlag(list.id, kw.index, kw.flaggedForRemoval)}
                disabled={isFlagging}
                title={kw.flaggedForRemoval ? "Unflag this keyword" : "Flag for removal"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: kw.flaggedForRemoval ? "#22c55e" : "#9ca3af",
                  padding: "0 2px",
                }}
              >
                {kw.flaggedForRemoval ? "\u21A9" : "\u2691"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#ffffff",
  padding: "20px 20px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const gateCard: React.CSSProperties = {
  maxWidth: 380,
  margin: "80px auto 0",
  background: "#fff",
  borderRadius: 12,
  padding: 32,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 16,
  textAlign: "center",
  letterSpacing: "0.2em",
  boxSizing: "border-box",
};

const submitBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  marginTop: 12,
  border: "none",
  borderRadius: 6,
  background: "#2563eb",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
