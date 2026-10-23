import type { LinkAction } from "@/lib/content-map/types";
import { BLUE, formatDay, GREEN, MUTED, RED } from "@/lib/content-map/view-model";
import { st } from "./st";
import { DARK_BTN, GHOST_BTN, MONO_LABEL } from "./ui";

export type LinkBusy = "drafting" | "applying";

interface Props {
  action: LinkAction | undefined;
  busy: LinkBusy | undefined;
  error: string | undefined;
  onDraft: (redo: boolean) => void;
  onApply: () => void;
}

const MD_LINK = /\[([^\]\n]{1,200})\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const BOX = "display:flex;flex-direction:column;gap:7px;padding:10px 11px;border-radius:9px;background:oklch(0.97 0.005 85)";
const NOTE = "font-size:12px;line-height:1.45;color:oklch(0.52 0.01 85);text-wrap:pretty";
const TEXT_BTN = "border:0;background:none;padding:0;cursor:pointer;font-size:12px;color:oklch(0.52 0.01 85);text-decoration:underline";

/** The replacement sentence with its new link shown as a link. */
function WithLink({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MD_LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<span key={at} title={m[2]} style={st(`color:${BLUE};text-decoration:underline;text-underline-offset:2px;font-weight:500`)}>{m[1]}</span>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function htmlOf(markdown: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let html = "";
  let last = 0;
  for (const m of markdown.matchAll(MD_LINK)) {
    const at = m.index ?? 0;
    html += esc(markdown.slice(last, at)) + `<a href="${esc(m[2])}">${esc(m[1])}</a>`;
    last = at + m[0].length;
  }
  return html + esc(markdown.slice(last));
}

/** Copy the new sentence as rich text (a real link) with a plain-text fallback. */
async function copySentence(markdown: string): Promise<void> {
  const plain = markdown.replace(MD_LINK, "$1 ($2)");
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([htmlOf(markdown)], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
      return;
    }
    await navigator.clipboard?.writeText(plain);
  } catch {
    /* clipboard blocked: nothing else to do */
  }
}

/** Link edit for an accepted suggestion: draft → before/after → Apply. */
export function LinkEdit({ action, busy, error, onDraft, onApply }: Props) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const live = action?.source === "live-page";
  const label = action?.source === "cms-article" ? "Link edit · in the article" : live ? "Link edit · on the live page" : "Link edit";
  let body: React.ReactNode;
  if (busy === "drafting") {
    body = <div style={st(NOTE)}>Writing the link into the page…</div>;
  } else if (!action) {
    body = (
      <div style={st("display:flex;align-items:center;gap:8px")}>
        <span style={st(`${NOTE};flex:1`)}>Not written in yet.</span>
        <button type="button" onClick={stop(() => onDraft(false))} style={st(GHOST_BTN)}>Write it in</button>
      </div>
    );
  } else if (action.status === "applied") {
    body = (
      <div style={st("display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px")}>
        <span style={st(`font-size:12px;font-weight:500;color:${GREEN}`)}>{live ? "Marked as added on the live page" : "Added to the article"}{action.appliedAt ? ` · ${formatDay(action.appliedAt)}` : ""}</span>
        {action.blogPostId ? <a href={`/admin/collections/blog-posts/${action.blogPostId}`} onClick={(e) => e.stopPropagation()} style={st("font-size:12px")}>Open article</a> : null}
      </div>
    );
  } else if (action.status === "already-linked") {
    body = <div style={st(NOTE)}>{action.note || "The page already links there."}</div>;
  } else if (action.status === "failed") {
    body = (
      <div style={st("display:flex;align-items:flex-start;gap:8px")}>
        <span style={st(`${NOTE};flex:1;color:${RED}`)}>{action.note || "The link couldn't be written in."}</span>
        <button type="button" onClick={stop(() => onDraft(true))} style={st(GHOST_BTN)}>Retry</button>
      </div>
    );
  } else {
    body = (
      <>
        <div style={st("font-size:12px;line-height:1.45;color:oklch(0.52 0.01 85);text-decoration:line-through;text-decoration-color:oklch(0.75 0.01 85)")}>{action.original}</div>
        <div style={st("font-size:12.5px;line-height:1.45")}><WithLink text={action.replacement} /></div>
        {action.note ? <div style={st(NOTE)}>{action.note}</div> : null}
        {live ? <div style={st(NOTE)}>This page isn't a CMS article. Paste the new sentence into the site, then mark it as added.</div> : null}
        <div style={st("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
          <button type="button" disabled={busy === "applying"} onClick={stop(onApply)} style={st(`${DARK_BTN};opacity:${busy === "applying" ? 0.6 : 1}`)}>
            {busy === "applying" ? "Applying…" : live ? "Mark as added" : "Apply to article"}
          </button>
          {live ? <button type="button" onClick={stop(() => void copySentence(action.replacement))} style={st(GHOST_BTN)}>Copy sentence</button> : null}
          <button type="button" onClick={stop(() => onDraft(true))} style={st(TEXT_BTN)}>Redo</button>
          <div style={st("flex:1")} />
          {action.model ? <span style={st(`font:10.5px 'JetBrains Mono',monospace;color:${MUTED}`)}>{action.model}</span> : null}
        </div>
      </>
    );
  }
  return (
    <div data-testid="link-edit" onClick={(e) => e.stopPropagation()} style={st(`${BOX};cursor:default`)}>
      <div style={st(MONO_LABEL)}>{label}</div>
      {body}
      {error ? <div style={st(`font-size:12px;color:${RED}`)}>{error}</div> : null}
    </div>
  );
}
