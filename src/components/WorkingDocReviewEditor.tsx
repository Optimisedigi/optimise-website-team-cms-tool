/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AuditPasswordGate from "@/components/AuditPasswordGate";

const AUTOSAVE_DELAY_MS = 1_500;
const POLL_INTERVAL_MS = 3_000;

export type WorkingDocReviewEditorProps = {
  /** Working-doc slug used for the API route and local recovery key, e.g. "cipher/patient-journey-review". */
  docSlug: string;
  /** Centered document heading shown next to the animated logo. */
  title: string;
  /** Short line under the heading. */
  subtitle: string;
  /** Business name shown on the PIN gate. */
  businessName: string;
  /** Label shown on the PIN gate, defaults to "Partner Working Document". */
  featureLabel?: string;
  /** localStorage key for the remembered reviewer name. Defaults to a slug-derived key. */
  reviewerStorageKey?: string;
  /** Filename for the offline/conflict markdown backup download. */
  backupFileName?: string;
};

type RecoveryRecord = {
  contentMarkdown: string;
  baseRevision: number;
  contentHash: string;
  savedAt: string;
};

type ServerDocument = {
  contentMarkdown: string;
  contentHash: string;
  revision: number;
  lastEditedBy?: string | null;
  lastSavedAt?: string | null;
};

function recoveryKeyFor(docSlug: string) {
  return `working-doc-recovery:${docSlug}`;
}

async function browserContentHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readRecoveryRecord(docSlug: string): RecoveryRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(recoveryKeyFor(docSlug)) || "null") as RecoveryRecord | null;
    return parsed?.contentMarkdown && Number.isInteger(parsed.baseRevision) ? parsed : null;
  } catch {
    return null;
  }
}

export function shouldOfferLocalRecovery(record: RecoveryRecord | null, serverContentHash: string) {
  return Boolean(record?.contentMarkdown && record.contentHash !== serverContentHash);
}

export function incomingRevisionAction(input: {
  dirty: boolean;
  currentRevision: number;
  incomingRevision: number;
}): "none" | "render" | "save" {
  if (input.incomingRevision <= input.currentRevision) return "none";
  return input.dirty ? "save" : "render";
}

export function persistRecoveryRecord(docSlug: string, record: RecoveryRecord) {
  localStorage.setItem(recoveryKeyFor(docSlug), JSON.stringify(record));
}

export function insertReviewNote(app: Element, anchor: Element, note: Element) {
  const content = anchor.classList.contains("content")
    ? anchor
    : anchor.closest(".content") ?? app.querySelector(".content");
  if (!content) return;
  if (anchor === content || !content.contains(anchor)) {
    content.appendChild(note);
    return;
  }
  let directChild = anchor;
  while (directChild.parentElement && directChild.parentElement !== content) {
    directChild = directChild.parentElement;
  }
  directChild.insertAdjacentElement("afterend", note);
}

function displayTime(value?: string | null) {
  if (!value) return "an unknown time";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch] ?? ch);
}

function inline(text: string) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/“([^”]+)”/g, "“$1”");
}

function slugify(text: string, index: number) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `section-${index}`;
}

function isTableLine(line: string) { return /^\s*\|.*\|\s*$/.test(line); }
function isSeparator(line: string) { return /^\s*\|\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?)*\s*\|\s*$/.test(line); }
function splitRow(line: string) { return line.trim().slice(1, -1).split("|").map((cell) => cell.trim()); }
function tableCellText(text: string) { return String(text || "").replace(/\|/g, "/").replace(/\n+/g, " ").trim(); }
function noteTextFrom(note: Element | null | undefined) { return (note?.querySelector(":scope > .review-note-body") as HTMLElement | null)?.innerText.trim() || ""; }

export type ReviewReply = { author: string; text: string };

function repliesFrom(note: Element | null | undefined): ReviewReply[] {
  return [...(note?.querySelectorAll(":scope > .review-note-replies > .review-note-reply") ?? [])].map((reply) => ({
    author: (reply as HTMLElement).dataset.author || "Reviewer",
    text: (reply.querySelector(".review-note-reply-body") as HTMLElement | null)?.innerText.trim() || "",
  }));
}

function replyMarkerSuffix(replies: ReviewReply[]) {
  return replies.length ? ` <!--review-replies:${encodeURIComponent(JSON.stringify(replies))}-->` : "";
}

export function parseReviewerNoteMarkdown(value: string) {
  const match = /^>\s*\*\*Reviewer note(?:\s+—\s+([^:*]+))?:\*\*\s*(.*)$/.exec(value.trim());
  if (!match) return null;
  const replyMarker = /^(.*?)\s*<!--review-replies:([^>]+)-->\s*$/.exec(match[2] || "");
  let replies: ReviewReply[] = [];
  if (replyMarker) {
    try {
      const parsed = JSON.parse(decodeURIComponent(replyMarker[2])) as unknown;
      replies = Array.isArray(parsed) ? parsed.filter((reply): reply is ReviewReply => Boolean(reply && typeof reply === "object" && typeof (reply as ReviewReply).author === "string" && typeof (reply as ReviewReply).text === "string")) : [];
    } catch { /* Ignore malformed legacy reply markers. */ }
  }
  return { author: match[1]?.trim() || "Reviewer", text: (replyMarker?.[1] ?? match[2] ?? "").trim(), replies };
}

function reviewReplyHtml(reply: ReviewReply) {
  return `<div class="review-note-reply" data-author="${esc(reply.author)}"><button class="reply-delete no-print" type="button" aria-label="Delete response from ${esc(reply.author)}">Delete</button><strong>Response — ${esc(reply.author)}</strong><div class="review-note-reply-body" contenteditable="true" role="textbox" data-placeholder="Type response here...">${esc(reply.text.trim())}</div></div>`;
}

function reviewNoteHtml(author: string, noteText = "", replies: ReviewReply[] = []) {
  return `<div class="review-note" data-author="${esc(author)}"><div class="note-actions no-print"><button class="note-reply" type="button">Reply</button><button class="note-delete" type="button" aria-label="Delete reviewer note">Delete</button></div><strong>Reviewer note — ${esc(author)}</strong><div class="review-note-body" contenteditable="true" role="textbox" data-placeholder="Type note here...">${esc(noteText.trim())}</div><div class="review-note-replies">${replies.map(reviewReplyHtml).join("")}</div></div>`;
}

function markdownToHtml(markdown: string, nav: HTMLElement) {
  const lines = markdown.split(/\r?\n/);
  let out = "";
  let i = 0;
  let sectionIndex = 0;
  let currentPanelOpen = false;
  let detailsOpen = false;
  let currentService = "";
  let lastHeading = "";
  function closeDetails() { if (detailsOpen) { out += "</div></details>"; detailsOpen = false; } }
  function closePanel() { closeDetails(); if (currentPanelOpen) { out += "</div></article>"; currentPanelOpen = false; } }
  function openPanel(title: string, level: number) {
    closePanel();
    const id = slugify(title, sectionIndex++);
    const label = level === 1 ? "Service section" : "Review section";
    currentService = title;
    lastHeading = "";
    out += `<article class="panel" id="${id}"><div class="section-head"><span class="badge">${label}</span><h2 class="edit" contenteditable="true">${inline(title)}</h2></div><div class="content">`;
    nav.insertAdjacentHTML("beforeend", `<a href="#${id}">${esc(title)}</a>`);
    currentPanelOpen = true;
  }
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) { i++; continue; }
    if (/^---+$/.test(line.trim())) { closeDetails(); i++; continue; }
    const note = parseReviewerNoteMarkdown(line);
    if (note) { out += reviewNoteHtml(note.author, note.text, note.replies); i++; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level <= 1 || !currentPanelOpen) openPanel(title, level);
      else {
        closeDetails();
        lastHeading = title;
        if (/differences/i.test(title) && /questionnaire|question/i.test(title)) {
          const disclosureTitle = title.replace(/\s*[—-]\s*collapsible\s*$/i, "").trim();
          out += `<details class="compare"><summary><span class="edit disclosure-label" contenteditable="true">${inline(disclosureTitle)}</span><svg class="disclosure-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg></summary><div class="details-content">`;
          detailsOpen = true;
        } else out += `<h3 class="edit" contenteditable="true">${inline(title)}</h3>`;
      }
      i++; continue;
    }
    if (isTableLine(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableLine(lines[i] ?? "")) { rows.push(lines[i] ?? ""); i++; }
      const header = splitRow(rows[0] || "");
      const bodyRows = rows.slice(1).filter((r) => !isSeparator(r)).map(splitRow);
      const isQuestionTable = header.some((cell) => /^question$/i.test(cell));
      if (/journey|form questions|questionnaire/i.test(lastHeading)) out += `<div class="table-service-label">${inline(currentService)}</div>`;
      out += `<div class="table-wrap"><table${isQuestionTable ? " class=\"question-table\"" : ""}><thead><tr>`;
      out += header.map((cell) => `<th class="edit" contenteditable="true">${inline(cell)}</th>`).join("");
      out += "<th class=\"no-print row-tools\">Actions</th></tr></thead><tbody>";
      const addLabel = isQuestionTable ? "Add question after this question" : "Add row after this row";
      for (const row of bodyRows) {
        const tableNote = parseReviewerNoteMarkdown(row[0] || "");
        if (tableNote) {
          out += `<tr class="review-note-row"><td colspan="${header.length + 1}">${reviewNoteHtml(tableNote.author, tableNote.text, tableNote.replies)}</td></tr>`;
          continue;
        }
        out += "<tr>" + header.map((_, idx) => `<td class="edit" contenteditable="true">${inline(row[idx] || "")}</td>`).join("") + `<td class="no-print row-tools"><button class="row-action add-row" type="button" title="${addLabel}" aria-label="${addLabel}">+</button><button class="row-action delete-row" type="button" title="Delete row" aria-label="Delete row">×</button></td></tr>`;
      }
      out += "</tbody></table></div>";
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      out += "<ul>";
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) { out += `<li class="edit" contenteditable="true">${inline((lines[i] ?? "").replace(/^[-*]\s+/, ""))}</li>`; i++; }
      out += "</ul>"; continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      out += "<ol>";
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) { out += `<li class="edit" contenteditable="true">${inline((lines[i] ?? "").replace(/^\d+\.\s+/, ""))}</li>`; i++; }
      out += "</ol>"; continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^#/.test(lines[i] ?? "") && !isTableLine(lines[i] ?? "") && !/^[-*]\s+/.test(lines[i] ?? "") && !/^\d+\.\s+/.test(lines[i] ?? "") && !/^---+$/.test((lines[i] ?? "").trim())) { paragraph.push((lines[i] ?? "").trim()); i++; }
    const text = paragraph.join(" ");
    const cls = /gap|missing|needed|confirm|correct|not exist|no dedicated/i.test(text) ? "edit gap" : "edit";
    out += `<p class="${cls}" contenteditable="true">${inline(text)}</p>`;
  }
  closePanel();
  return out;
}

function serializeNode(node: Element, headingPrefix = "##") {
  let md = "";
  if (node.classList?.contains("review-note")) {
    const author = (node as HTMLElement).dataset.author || "Reviewer";
    md += `> **Reviewer note — ${author}:** ${noteTextFrom(node)}${replyMarkerSuffix(repliesFrom(node))}\n\n`;
  } else if (node.classList?.contains("table-wrap")) md += serializeNode(node.querySelector("table") as Element, headingPrefix);
  else if (node.tagName === "H3") md += `${headingPrefix} ${(node as HTMLElement).innerText.trim()}\n\n`;
  else if (node.tagName === "P") md += `${(node as HTMLElement).innerText.trim()}\n\n`;
  else if (node.tagName === "UL") { node.querySelectorAll(":scope > li").forEach((li) => { md += `- ${(li as HTMLElement).innerText.trim()}\n`; }); md += "\n"; }
  else if (node.tagName === "OL") { node.querySelectorAll(":scope > li").forEach((li, idx) => { md += `${idx + 1}. ${(li as HTMLElement).innerText.trim()}\n`; }); md += "\n"; }
  else if (node.tagName === "TABLE") {
    const headers = [...node.querySelectorAll("thead th:not(.no-print)")].map((th) => (th as HTMLElement).innerText.trim());
    md += `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
    node.querySelectorAll("tbody tr").forEach((tr) => {
      if (tr.classList.contains("review-note-row")) {
        const note = tr.querySelector(".review-note");
        const author = (note as HTMLElement | null)?.dataset.author || "Reviewer";
        const text = tableCellText(noteTextFrom(note));
        md += `| > **Reviewer note — ${tableCellText(author)}:** ${text}${replyMarkerSuffix(repliesFrom(note))} | ${headers.slice(1).map(() => "").join(" | ")} |\n`;
      } else {
        const cells = [...tr.children].filter((td) => !td.classList.contains("no-print"));
        md += `| ${cells.map((td) => tableCellText((td as HTMLElement).innerText.trim())).join(" | ")} |\n`;
      }
    });
    md += "\n";
  } else if (node.tagName === "DETAILS") {
    const summary = (node.querySelector("summary") as HTMLElement | null)?.innerText.trim();
    if (summary) md += `${headingPrefix} ${summary}\n\n`;
    node.querySelectorAll(":scope > .details-content > h3, :scope > .details-content > p, :scope > .details-content > ul, :scope > .details-content > ol, :scope > .details-content > .table-wrap, :scope > .details-content > .review-note").forEach((child) => { md += serializeNode(child, "###"); });
  }
  return md;
}

export function WorkingDocReviewEditor({
  docSlug,
  title,
  subtitle,
  businessName,
  featureLabel = "Partner Working Document",
  reviewerStorageKey,
  backupFileName,
}: WorkingDocReviewEditorProps) {
  const reviewerKey = reviewerStorageKey ?? `working-doc-reviewer:${docSlug}`;
  const backupName = backupFileName ?? `${docSlug.replace(/\//g, "-")}-local-backup.md`;
  const [pin, setPin] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState("Enter the PIN to load the shared working document.");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [changeTick, setChangeTick] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryRecord | null>(null);
  const [conflict, setConflict] = useState<ServerDocument | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const selectedAnchor = useRef<Element | null>(null);
  const serverRevision = useRef(0);
  const serverHash = useRef("");
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const changeGeneration = useRef(0);
  const saveController = useRef<AbortController | null>(null);
  const recoveryGeneration = useRef(0);

  const currentMarkdown = useCallback(() => {
    const app = appRef.current;
    if (!app) return "";
    const clone = app.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".no-print,.toolbar").forEach((n) => n.remove());
    let md = "";
    clone.querySelectorAll(".panel").forEach((panel) => {
      const h2 = (panel.querySelector(".section-head h2") as HTMLElement | null)?.innerText.trim();
      if (h2) md += `# ${h2}\n\n`;
      panel.querySelectorAll(".content > h3, .content > p, .content > ul, .content > ol, .content > .table-wrap, .content > .review-note, .content > details").forEach((node) => { md += serializeNode(node); });
    });
    return md.trim() + "\n";
  }, []);

  const recordLocalChange = useCallback(() => {
    const contentMarkdown = currentMarkdown();
    if (!contentMarkdown.trim()) return;
    dirtyRef.current = true;
    setDirty(true);
    setStatus(navigator.onLine ? "Editing" : "Offline, saved on this device");
    const generation = ++changeGeneration.current;
    const recoveryWrite = ++recoveryGeneration.current;
    const baseRevision = serverRevision.current;
    const savedAt = new Date().toISOString();
    setChangeTick(generation);
    persistRecoveryRecord(docSlug, { contentMarkdown, baseRevision, contentHash: "", savedAt });
    void browserContentHash(contentMarkdown)
      .then((contentHash) => {
        if (recoveryWrite !== recoveryGeneration.current) return;
        persistRecoveryRecord(docSlug, { contentMarkdown, baseRevision, contentHash, savedAt });
      })
      .catch(() => undefined);
  }, [currentMarkdown, docSlug]);

  const signalStructuralChange = useCallback(() => {
    appRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const attachHandlers = useCallback(() => {
    const app = appRef.current;
    if (!app) return;
    const remember = (node: Element) => { selectedAnchor.current = node.closest?.("tr") || node.closest?.(".review-note") || node; };
    app.querySelectorAll(".edit,.review-note,.review-note-body,.review-note-reply-body").forEach((node) => {
      (node as HTMLElement).onfocus = () => remember(node);
      (node as HTMLElement).onclick = (event) => { event.stopPropagation(); remember(node); };
    });
    app.querySelectorAll(".note-delete").forEach((button) => {
      (button as HTMLButtonElement).onclick = (event) => {
        event.stopPropagation();
        const row = button.closest(".review-note-row");
        if (row) row.remove();
        else button.closest(".review-note")?.remove();
        signalStructuralChange();
      };
    });
    app.querySelectorAll(".note-reply").forEach((button) => {
      (button as HTMLButtonElement).onclick = (event) => {
        event.stopPropagation();
        const note = button.closest(".review-note");
        if (!note) return;
        const author = reviewerRef.current?.value.trim() || "Reviewer";
        const reply = document.createElement("div");
        reply.innerHTML = reviewReplyHtml({ author, text: "" });
        const replyElement = reply.firstElementChild;
        note.querySelector(".review-note-replies")?.appendChild(replyElement as Element);
        attachHandlers();
        (replyElement?.querySelector(".review-note-reply-body") as HTMLElement | null)?.focus();
        signalStructuralChange();
      };
    });
    app.querySelectorAll(".reply-delete").forEach((button) => {
      (button as HTMLButtonElement).onclick = (event) => {
        event.stopPropagation();
        button.closest(".review-note-reply")?.remove();
        signalStructuralChange();
      };
    });
    app.querySelectorAll("tbody tr").forEach((row) => {
      (row as HTMLElement).onclick = () => {
        remember(row);
        row.closest("tbody")?.querySelectorAll("tr").forEach((other) => other.classList.remove("selected-row"));
        row.classList.add("selected-row");
      };
    });
    app.querySelectorAll(".add-row").forEach((button) => {
      (button as HTMLButtonElement).onclick = (event) => {
        event.stopPropagation();
        const row = button.closest("tr");
        const table = row?.closest("table");
        if (!row || !table) return;
        const headers = [...table.querySelectorAll("thead th:not(.no-print)")].map((th) => (th as HTMLElement).innerText.trim());
        const questionTable = table.classList.contains("question-table");
        const tr = document.createElement("tr");
        tr.innerHTML = headers.map((header) => {
          const key = header.toLowerCase();
          const value = !questionTable ? "New item" : key === "step" ? "New" : key === "category" ? "New category" : key === "question" ? "New question" : key.includes("type") ? "Text" : key === "required" ? "No" : key.includes("conditional") ? "Always" : "New question detail";
          return `<td class="edit" contenteditable="true">${esc(value)}</td>`;
        }).join("") + `<td class="no-print row-tools"><button class="row-action add-row" type="button">+</button><button class="row-action delete-row" type="button">×</button></td>`;
        row.insertAdjacentElement("afterend", tr);
        attachHandlers();
        tr.click();
        signalStructuralChange();
      };
    });
    app.querySelectorAll(".delete-row").forEach((button) => {
      (button as HTMLButtonElement).onclick = (event) => {
        event.stopPropagation();
        const row = button.closest("tr");
        if (row?.closest("tbody")?.querySelectorAll("tr").length && row.closest("tbody")!.querySelectorAll("tr").length > 1) {
          row.remove();
          signalStructuralChange();
        }
      };
    });
  }, [signalStructuralChange]);

  const renderMarkdown = useCallback((value: string) => {
    if (!appRef.current || !navRef.current) return;
    navRef.current.innerHTML = "";
    appRef.current.innerHTML = markdownToHtml(value, navRef.current);
    attachHandlers();
  }, [attachHandlers]);

  const loadDoc = useCallback(async (unlockedPin: string) => {
    setPin(unlockedPin);
    setStatus("Loading shared document…");
    const response = await fetch(`/api/working-docs/${docSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "load", pin: unlockedPin }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const message = data?.error || "Could not load document.";
      setStatus(message);
      throw new Error(message);
    }
    serverRevision.current = data.revision;
    serverHash.current = data.contentHash;
    dirtyRef.current = false;
    setDirty(false);
    setMarkdown(data.contentMarkdown);
    setStatus(`Saved at ${displayTime(data.lastSavedAt)}${data.lastEditedBy ? ` by ${data.lastEditedBy}` : ""}`);
    const local = readRecoveryRecord(docSlug);
    if (shouldOfferLocalRecovery(local, data.contentHash)) setRecovery(local);
  }, [docSlug]);

  useEffect(() => {
    if (!markdown) return;
    renderMarkdown(markdown);
  }, [markdown, renderMarkdown]);

  useEffect(() => {
    if (reviewerRef.current) reviewerRef.current.value = localStorage.getItem(reviewerKey) || "";
  }, [markdown, reviewerKey]);

  const saveDoc = useCallback(async () => {
    if (!pin || !dirtyRef.current || conflictRef.current || saving) return;
    const reviewerName = reviewerRef.current?.value.trim() || "Reviewer";
    const contentMarkdown = currentMarkdown();
    const generation = changeGeneration.current;
    localStorage.setItem(reviewerKey, reviewerName);
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setStatus("Saving");
    try {
      const response = await fetch(`/api/working-docs/${docSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          pin,
          reviewerName,
          contentMarkdown,
          baseRevision: serverRevision.current,
          localSubmissionId: crypto.randomUUID(),
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.conflict) {
        conflictRef.current = true;
        setConflict(data as ServerDocument);
        setStatus("Conflict, your edits are safe on this device");
        return;
      }
      if (!response.ok || !data.ok) throw new Error(data.error || "Save failed.");
      serverRevision.current = data.revision;
      serverHash.current = data.contentHash;
      if (generation === changeGeneration.current) {
        dirtyRef.current = false;
        setDirty(false);
      }
      setStatus(`Saved at ${displayTime(data.lastSavedAt)} by ${data.lastEditedBy || reviewerName}`);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      dirtyRef.current = true;
      setDirty(true);
      setStatus(navigator.onLine ? "Could not save. Your edits are safe on this device" : "Offline, saved on this device");
    } finally {
      if (saveController.current === controller) {
        saveController.current = null;
        setSaving(false);
      }
    }
  }, [currentMarkdown, docSlug, pin, reviewerKey, saving]);

  const pollDocument = useCallback(async () => {
    if (!pin || document.visibilityState === "hidden") return;
    try {
      const response = await fetch(`/api/working-docs/${docSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load", pin }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) return;
      const action = incomingRevisionAction({
        dirty: dirtyRef.current,
        currentRevision: serverRevision.current,
        incomingRevision: data.revision,
      });
      if (action === "none") return;
      if (action === "save") {
        void saveDoc();
        return;
      }
      serverRevision.current = data.revision;
      serverHash.current = data.contentHash;
      setMarkdown(data.contentMarkdown);
      setStatus(`Saved at ${displayTime(data.lastSavedAt)}${data.lastEditedBy ? ` by ${data.lastEditedBy}` : ""}`);
    } catch {
      if (dirtyRef.current) setStatus("Offline, saved on this device");
    }
  }, [docSlug, pin, saveDoc]);

  useEffect(() => {
    if (!dirty || conflict || !pin || !navigator.onLine) return;
    const timer = window.setTimeout(() => void saveDoc(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [changeTick, conflict, dirty, pin, saveDoc]);

  useEffect(() => {
    if (!pin) return;
    const timer = window.setInterval(() => void pollDocument(), POLL_INTERVAL_MS);
    const refresh = () => dirtyRef.current ? void saveDoc() : void pollDocument();
    const visibilityRefresh = () => void pollDocument();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibilityRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibilityRefresh);
    };
  }, [pin, pollDocument, saveDoc]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      saveController.current?.abort();
      window.removeEventListener("beforeunload", warn);
    };
  }, []);

  function addReviewNote() {
    const app = appRef.current;
    if (!app) return;
    const author = reviewerRef.current?.value.trim() || "Reviewer";
    if (reviewerRef.current) reviewerRef.current.value = author;
    localStorage.setItem(reviewerKey, author);
    const anchor = selectedAnchor.current?.isConnected ? selectedAnchor.current : app.querySelector(".content");
    if (anchor?.tagName === "TR" && anchor.closest("tbody")) {
      const table = anchor.closest("table");
      const colspan = table?.querySelectorAll("thead th").length ?? 1;
      const noteRow = document.createElement("tr");
      noteRow.className = "review-note-row";
      noteRow.innerHTML = `<td colspan="${colspan}">${reviewNoteHtml(author)}</td>`;
      anchor.insertAdjacentElement("afterend", noteRow);
      selectedAnchor.current = noteRow;
      attachHandlers();
      (noteRow.querySelector(".review-note-body") as HTMLElement | null)?.focus();
      signalStructuralChange();
      return;
    }
    const note = document.createElement("div");
    note.innerHTML = reviewNoteHtml(author);
    const noteElement = note.firstElementChild;
    if (anchor && noteElement) insertReviewNote(app, anchor, noteElement);
    selectedAnchor.current = noteElement;
    attachHandlers();
    (noteElement?.querySelector(".review-note-body") as HTMLElement | null)?.focus();
    signalStructuralChange();
  }

  function restoreLocalDraft() {
    if (!recovery) return;
    serverRevision.current = recovery.baseRevision;
    setMarkdown(recovery.contentMarkdown);
    setRecovery(null);
    dirtyRef.current = true;
    setDirty(true);
    changeGeneration.current += 1;
    setChangeTick(changeGeneration.current);
    setStatus("Editing restored local draft");
  }

  function useSharedVersion() {
    setRecovery(null);
    setStatus("Using the shared version. The local recovery copy remains on this device");
  }

  function downloadLocalBackup() {
    const content = currentMarkdown() || recovery?.contentMarkdown || markdown;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = backupName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuditPasswordGate
      auditSlug={docSlug}
      businessName={businessName}
      featureLabel={featureLabel}
      onUnlock={loadDoc}
    >
      <div className="journey-editor">
        <header>
          <div className="topbar">
            <img className="od-logo" src="/optimise-logo-animated.gif" alt="Optimise Digital" />
            <div className="title-brand">
              <div>
                <div className="title-heading">
                  <h1>{title}</h1>
                </div>
                <p className="sub">{subtitle}</p>
              </div>
            </div>
          </div>
          <div className="jumpbar no-print">
            <div className="nav-title">Jump to section</div>
            <nav className="nav" ref={navRef} />
            <div className="actions">
              <input className="reviewer-name" ref={reviewerRef} placeholder="Reviewer name" />
              <button className="secondary" onClick={addReviewNote} type="button">Add note</button>
              <button className="brand" disabled={saving || !markdown || !dirty || Boolean(conflict)} onClick={() => void saveDoc()} type="button">{saving ? "Saving…" : "Save now"}</button>
              <p className="status" aria-live="polite" role="status">{status}</p>
            </div>
          </div>
        </header>
        <main>
          {recovery ? (
            <section className="recovery-banner no-print" aria-labelledby="recovery-heading">
              <div><h2 id="recovery-heading">We found edits saved in this browser</h2><p>These browser edits are from {displayTime(recovery.savedAt)}. Restore them only if work you typed is missing from the shared document below.</p></div>
              <div className="recovery-actions"><button type="button" onClick={restoreLocalDraft}>Restore edits from this browser</button><button className="secondary" type="button" onClick={useSharedVersion}>Keep the shared document</button></div>
            </section>
          ) : null}
          {conflict ? (
            <section className="conflict-banner no-print" role="alert">
              <div><h2>Another person saved a newer version</h2><p>Your edits remain on this device. The shared revision was saved {displayTime(conflict.lastSavedAt)}{conflict.lastEditedBy ? ` by ${conflict.lastEditedBy}` : ""}.</p></div>
              <button type="button" onClick={downloadLocalBackup}>Download local backup (.md)</button>
            </section>
          ) : null}
          {!conflict && dirty && status.startsWith("Offline") ? <button className="no-print" type="button" onClick={downloadLocalBackup}>Download local backup (.md)</button> : null}
          <section ref={appRef} onInput={recordLocalChange} />
        </main>
      </div>
      <style jsx global>{`
        .journey-editor { min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f1f1d; background: #f7f7f4; }
        .journey-editor header { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid #e5e7eb; background: rgba(255,255,255,.94); backdrop-filter: blur(12px); }
        .journey-editor .topbar { position: relative; box-sizing: border-box; min-height: 72px; max-width: 1600px; margin: 0 auto; padding: 16px 20px 10px; display: flex; gap: 16px; align-items: center; justify-content: flex-end; }
        .journey-editor .title-brand { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); min-width: 0; }
        .journey-editor .title-brand > div { text-align: center; }
        .journey-editor .title-heading { width: max-content; margin: 0 auto; }
        .journey-editor .od-logo { position: absolute; top: 23px; left: 20px; display: block; width: auto; height: 18.975px; mix-blend-mode: multiply; }
        .journey-editor h1 { margin: 0; font-size: 22px; line-height: 1.1; letter-spacing: -.03em; }
        .journey-editor .sub, .journey-editor .status { margin: 5px 0 0; color: #6b7280; font-size: 13px; }
        .journey-editor .jumpbar, .journey-editor .nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .journey-editor .actions { display: grid; grid-template-columns: 120px auto auto; gap: 8px; align-items: center; margin-left: auto; transform: translateY(19px); }
        .journey-editor .actions .status { grid-column: 3; margin: 10px 0 0; text-align: right; }
        .journey-editor .jumpbar { max-width: 1600px; margin: 0 auto; padding: 0 20px 33px; }
        .journey-editor .nav-title { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: #6b7280; font-weight: 850; margin-right: 6px; }
        .journey-editor .nav a { display: inline-flex; padding: 8px 11px; color: #1f1f1d; text-decoration: none; border: 1px solid #e5e7eb; border-radius: 999px; background: white; font-size: 13px; line-height: 1.25; }
        .journey-editor main { max-width: 1600px; margin: 0 auto; padding: 28px 20px 80px; }
        .journey-editor button, .journey-editor .button { border: 0; border-radius: 999px; padding: 10px 14px; background: #1f1f1d; color: white; font-weight: 750; cursor: pointer; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
        .journey-editor button:disabled { opacity: .5; cursor: not-allowed; }
        .journey-editor button.secondary { background: white; color: #1f1f1d; border: 1px solid #e5e7eb; }
        .journey-editor button.brand { background: #789489; }
        .journey-editor .reviewer-name { width: 120px; border: 1px solid #e5e7eb; border-radius: 999px; padding: 9px 12px; font-size: 13px; }
        .journey-editor .reviewer-name:focus-visible, .journey-editor button:focus-visible, .journey-editor .nav a:focus-visible { outline: 2px solid #2f5144; outline-offset: 2px; }
        .journey-editor .recovery-banner, .journey-editor .conflict-banner { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 12px 0 18px; padding: 16px 18px; border: 1px solid #b7d2c4; border-radius: 16px; background: #eef7f1; }
        .journey-editor .conflict-banner { border-color: #f59e0b; background: #fffbeb; }
        .journey-editor .recovery-banner h2, .journey-editor .conflict-banner h2 { margin: 0; font-size: 17px; }
        .journey-editor .recovery-banner p, .journey-editor .conflict-banner p { margin: 5px 0 0; font-size: 13px; }
        .journey-editor .recovery-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .journey-editor .panel { border: 1px solid #e5e7eb; border-radius: 24px; background: white; overflow: hidden; box-shadow: 0 10px 30px rgba(31,31,29,.04); margin-bottom: 18px; scroll-margin-top: 150px; }
        .journey-editor .panel > .section-head { padding: 22px 24px; background: linear-gradient(135deg, #eef7f1, white); border-bottom: 1px solid #e5e7eb; }
        .journey-editor .section-head h2 { margin: 0; font-size: 28px; letter-spacing: -.05em; }
        .journey-editor .content { padding: 20px 24px 26px; }
        .journey-editor h3 { margin: 26px 0 10px; font-size: 18px; letter-spacing: -.02em; }
        .journey-editor p, .journey-editor li { line-height: 1.55; }
        .journey-editor p { margin: 10px 0; }
        .journey-editor ul, .journey-editor ol { padding-left: 22px; }
        .journey-editor .edit { outline: 2px solid transparent; border-radius: 8px; min-height: 1em; }
        .journey-editor .edit:focus { outline-color: rgba(120,148,137,.42); background: #fbfffc; }
        .journey-editor table { border-collapse: separate; border-spacing: 0; width: 100%; margin: 12px 0 22px; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; }
        .journey-editor th, .journey-editor td { padding: 11px 12px; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; vertical-align: top; min-width: 90px; }
        .journey-editor th:last-child, .journey-editor td:last-child { border-right: 0; }
        .journey-editor tr:last-child td { border-bottom: 0; }
        .journey-editor th { background: #f5f7f4; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
        .journey-editor tr:nth-child(even) td { background: #fcfcfb; }
        .journey-editor .table-wrap { overflow: auto; border-radius: 16px; }
        .journey-editor .table-service-label { margin: 18px 0 8px; color: #2f5144; font-size: 13px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
        .journey-editor .badge { display: inline-flex; border-radius: 999px; padding: 5px 9px; background: #eef7f1; color: #2f5144; font-size: 12px; font-weight: 800; }
        .journey-editor .gap { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 16px; padding: 12px 14px; }
        .journey-editor .review-note { position: relative; margin: 12px 0 18px; padding: 14px 16px; border: 2px solid #f59e0b; border-left-width: 8px; border-radius: 16px; background: #fffbeb; color: #78350f; box-shadow: 0 8px 18px rgba(245,158,11,.12); min-height: 72px; }
        .journey-editor .review-note strong { display: block; margin-bottom: 6px; padding-right: 76px; color: #92400e; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
        .journey-editor .review-note-body, .journey-editor .review-note-reply-body { cursor: text; outline: 2px solid transparent; border-radius: 8px; min-height: 18px; padding: 0 6px; }
        .journey-editor .note-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; }
        .journey-editor .note-actions button, .journey-editor .reply-delete { padding: 6px 9px; background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; font-size: 12px; }
        .journey-editor .note-actions .note-reply { color: #78350f; border-color: #f59e0b; }
        .journey-editor .review-note-replies { display: grid; gap: 6px; margin-top: 6px; }
        .journey-editor .review-note-reply { position: relative; border-left: 3px solid #d97706; padding: 6px 40px 6px 10px; background: white; color: #4b2e0a; }
        .journey-editor .review-note-reply strong { display: block; margin-bottom: 2px; padding: 0; color: #78350f; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
        .journey-editor .reply-delete { position: absolute; top: 5px; right: 5px; }
        .journey-editor details.compare { margin: 18px 0 24px; border: 1px solid #e5e7eb; border-radius: 18px; background: #fbfffc; overflow: hidden; }
        .journey-editor details.compare > summary { cursor: pointer; padding: 14px 16px; font-weight: 850; list-style: none; background: #eef7f1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .journey-editor details.compare > summary::-webkit-details-marker { display: none; }
        .journey-editor .disclosure-label { flex: 1 1 auto; }
        .journey-editor .disclosure-icon { width: 18px; height: 18px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 160ms ease; }
        .journey-editor details.compare[open] .disclosure-icon { transform: rotate(180deg); }
        .journey-editor .details-content { padding: 14px 16px 2px; }
        .journey-editor tr.selected-row td { background: #eef7f1 !important; }
        .journey-editor .question-table tbody td:first-child { white-space: nowrap; }
        .journey-editor .review-note-row td { background: transparent !important; border-top: 0; border-bottom: 0; padding: 4px 12px; }
        .journey-editor .row-action { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; border-radius: 999px; background: #fff; font-size: 17px; font-weight: 850; line-height: 1; color: #2f5144; border: 1px solid #b7d2c4; }
        .journey-editor .delete-row { color: #9a3412; border-color: #fed7aa; }
        .journey-editor .row-tools { width: 1%; white-space: nowrap; text-align: center; }
        @media (max-width: 1280px) { .journey-editor .topbar { align-items: center; flex-direction: column; } .journey-editor .title-brand { position: relative; top: auto; left: auto; transform: none; } .journey-editor .od-logo { position: static; align-self: flex-start; height: 15.18px; } .journey-editor .recovery-banner, .journey-editor .conflict-banner { align-items: flex-start; flex-direction: column; } }
        @media (max-width: 900px) { .journey-editor .actions { margin-left: 0; transform: none; } }
        @media (max-width: 600px) { .journey-editor .actions { grid-template-columns: 1fr; width: 100%; } .journey-editor .actions .status { grid-column: 1; text-align: left; } }
        @media (prefers-reduced-motion: reduce) { .journey-editor *, .journey-editor *::before, .journey-editor *::after { scroll-behavior: auto !important; transition-duration: 0ms !important; } }
        @media print { .journey-editor header, .journey-editor .toolbar, .journey-editor .no-print { display: none !important; } .journey-editor main { display: block; padding: 0; } .journey-editor .panel { break-inside: avoid; box-shadow: none; } }
      `}</style>
    </AuditPasswordGate>
  );
}
