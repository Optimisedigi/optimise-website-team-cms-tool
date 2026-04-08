"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import "./edit.css";

type KeywordItem = { keyword: string; searchVolume: number; category: string };
type QuestionItem = { question: string; cluster: string; crKeyword: string };

interface Props {
  proposalId: string;
  slug: string;
  businessName: string;
  competitors: string[];
  keywords: KeywordItem[];
  contentQuestions: QuestionItem[];
  excludedCompetitorDomains: string[];
  excludedKeywords: string[];
  excludedContentQuestions: string[];
  slideNotes: Record<string, string>;
}

export default function EditablePresentation(props: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [excludedComps, setExcludedComps] = useState(
    new Set(props.excludedCompetitorDomains),
  );
  const [excludedKws, setExcludedKws] = useState(
    new Set(props.excludedKeywords.map((k) => k.toLowerCase())),
  );
  const [excludedQuestions, setExcludedQuestions] = useState(
    new Set(props.excludedContentQuestions),
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    props.slideNotes,
  );
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    competitors: true,
    keywords: false,
    questions: false,
    notes: false,
  });
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refreshIframe = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.location.reload();
    } catch {
      // Cross-origin fallback
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    }
  }, []);

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      setSaving(true);
      try {
        await fetch(`/api/proposals/${props.proposalId}/edit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        });
        refreshIframe();
      } catch (err) {
        console.error("[Edit] Save failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [props.proposalId, refreshIframe],
  );

  const toggleCompetitor = useCallback(
    (domain: string) => {
      setExcludedComps((prev) => {
        const next = new Set(prev);
        if (next.has(domain)) next.delete(domain);
        else next.add(domain);
        save({ excludedCompetitorDomains: Array.from(next) });
        return next;
      });
    },
    [save],
  );

  const toggleKeyword = useCallback(
    (keyword: string) => {
      const key = keyword.toLowerCase();
      setExcludedKws((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        save({ excludedKeywords: Array.from(next) });
        return next;
      });
    },
    [save],
  );

  const toggleQuestion = useCallback(
    (question: string) => {
      setExcludedQuestions((prev) => {
        const next = new Set(prev);
        if (next.has(question)) next.delete(question);
        else next.add(question);
        save({ excludedContentQuestions: Array.from(next) });
        return next;
      });
    },
    [save],
  );

  const updateNote = useCallback(
    (slideNum: string, text: string) => {
      setNotes((prev) => ({ ...prev, [slideNum]: text }));
      // Debounce save
      if (noteTimers.current[slideNum]) clearTimeout(noteTimers.current[slideNum]);
      noteTimers.current[slideNum] = setTimeout(() => {
        setNotes((current) => {
          save({ slideNotes: current });
          return current;
        });
      }, 500);
    },
    [save],
  );

  // Cleanup timers
  useEffect(() => {
    const timers = noteTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Group keywords by category
  const kwByCategory = new Map<string, KeywordItem[]>();
  for (const kw of props.keywords) {
    const list = kwByCategory.get(kw.category) ?? [];
    list.push(kw);
    kwByCategory.set(kw.category, list);
  }

  // Group questions by content research keyword
  const qByKeyword = new Map<string, QuestionItem[]>();
  for (const q of props.contentQuestions) {
    const list = qByKeyword.get(q.crKeyword) ?? [];
    list.push(q);
    qByKeyword.set(q.crKeyword, list);
  }

  const SLIDE_LABELS: Record<string, string> = {
    "5": "Mission Brief",
    "6": "Keywords Analysis",
    "7": "Competitor Analysis",
    "8": "CRO Overview",
    "9": "CRO Recommendations",
    "10": "SEO Overview",
    "11": "Technical & Page Results",
    "12": "SEO Recommendations",
    "13": "Content Research",
    "14": "Competitor Ads",
    "15": "Mission Control",
    "16": "Flight Plan",
    "17": "Mission Resources",
    "18": "Launch Requirements",
  };

  return (
    <div className="edit-layout">
      <iframe
        ref={iframeRef}
        src={`/proposals/${props.slug}`}
        className="edit-iframe"
        title="Proposal Preview"
      />
      <aside className="edit-sidebar">
        <div className="edit-sidebar-header">
          <h2 className="edit-sidebar-title">{props.businessName}</h2>
          <span className="edit-sidebar-subtitle">Edit View</span>
          {saving && <span className="edit-saving">Saving...</span>}
        </div>

        {/* Competitors */}
        <div className="edit-section">
          <button
            className="edit-section-toggle"
            onClick={() => toggleSection("competitors")}
          >
            <span className="edit-section-arrow">
              {expandedSections.competitors ? "▾" : "▸"}
            </span>
            <span>Competitors</span>
            <span className="edit-section-count">
              {props.competitors.length - excludedComps.size}/
              {props.competitors.length}
            </span>
          </button>
          {expandedSections.competitors && (
            <div className="edit-section-content">
              {props.competitors.map((domain) => (
                <label key={domain} className="edit-toggle-row">
                  <input
                    type="checkbox"
                    checked={!excludedComps.has(domain)}
                    onChange={() => toggleCompetitor(domain)}
                  />
                  <span
                    className={
                      excludedComps.has(domain) ? "edit-item-excluded" : ""
                    }
                  >
                    {domain}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Keywords */}
        <div className="edit-section">
          <button
            className="edit-section-toggle"
            onClick={() => toggleSection("keywords")}
          >
            <span className="edit-section-arrow">
              {expandedSections.keywords ? "▾" : "▸"}
            </span>
            <span>Keywords</span>
            <span className="edit-section-count">
              {props.keywords.length - excludedKws.size}/{props.keywords.length}
            </span>
          </button>
          {expandedSections.keywords && (
            <div className="edit-section-content">
              {Array.from(kwByCategory.entries()).map(
                ([category, keywords]) => (
                  <div key={category} className="edit-subsection">
                    <div className="edit-subsection-label">{category}</div>
                    {keywords.map((kw) => (
                      <label
                        key={`${category}-${kw.keyword}`}
                        className="edit-toggle-row"
                      >
                        <input
                          type="checkbox"
                          checked={!excludedKws.has(kw.keyword.toLowerCase())}
                          onChange={() => toggleKeyword(kw.keyword)}
                        />
                        <span
                          className={
                            excludedKws.has(kw.keyword.toLowerCase())
                              ? "edit-item-excluded"
                              : ""
                          }
                        >
                          {kw.keyword}
                        </span>
                        {kw.searchVolume > 0 && (
                          <span className="edit-kw-volume">
                            {kw.searchVolume.toLocaleString()}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Content Questions */}
        {props.contentQuestions.length > 0 && (
          <div className="edit-section">
            <button
              className="edit-section-toggle"
              onClick={() => toggleSection("questions")}
            >
              <span className="edit-section-arrow">
                {expandedSections.questions ? "▾" : "▸"}
              </span>
              <span>Content Questions</span>
              <span className="edit-section-count">
                {props.contentQuestions.length - excludedQuestions.size}/
                {props.contentQuestions.length}
              </span>
            </button>
            {expandedSections.questions && (
              <div className="edit-section-content">
                {Array.from(qByKeyword.entries()).map(
                  ([crKeyword, questions]) => (
                    <div key={crKeyword} className="edit-subsection">
                      <div className="edit-subsection-label">{crKeyword}</div>
                      {questions.map((q, i) => (
                        <label
                          key={`${crKeyword}-${i}`}
                          className="edit-toggle-row"
                        >
                          <input
                            type="checkbox"
                            checked={!excludedQuestions.has(q.question)}
                            onChange={() => toggleQuestion(q.question)}
                          />
                          <span
                            className={
                              excludedQuestions.has(q.question)
                                ? "edit-item-excluded"
                                : ""
                            }
                          >
                            {q.question}
                          </span>
                        </label>
                      ))}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {/* Slide Notes */}
        <div className="edit-section">
          <button
            className="edit-section-toggle"
            onClick={() => toggleSection("notes")}
          >
            <span className="edit-section-arrow">
              {expandedSections.notes ? "▾" : "▸"}
            </span>
            <span>Slide Notes</span>
            <span className="edit-section-count">
              {Object.values(notes).filter(Boolean).length} notes
            </span>
          </button>
          {expandedSections.notes && (
            <div className="edit-section-content">
              {Object.entries(SLIDE_LABELS).map(([num, label]) => (
                <div key={num} className="edit-note-block">
                  <label className="edit-note-label">
                    Slide {num}: {label}
                  </label>
                  <textarea
                    className="edit-note-textarea"
                    placeholder="Add a note..."
                    value={notes[num] ?? ""}
                    onChange={(e) => updateNote(num, e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
