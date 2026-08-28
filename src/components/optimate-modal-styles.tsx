/**
 * Shared stylesheet for the OptiMate panel (launcher shell, agent picker,
 * account picker and chat).
 *
 * These live as a stylesheet rather than inline styles because the design needs
 * hover/focus states, `::placeholder`, line clamping and a reduced-motion
 * query - none of which inline styles can express. Every class is `om-`
 * prefixed so nothing collides with Payload's admin CSS.
 *
 * Manrope is intentionally NOT fetched from a CDN: the admin is a private,
 * noindex surface and a webfont request per page load is not worth it. The
 * stack falls back to Helvetica/Arial, which is what the design was measured
 * against locally.
 */
export const OPTIMATE_MODAL_CSS = `
.om-panel, .om-chatui {
  --om-font: 'Manrope', Helvetica, Arial, sans-serif;
  --om-ink: #11141a;
  --om-ink-2: #3d434b;
  --om-ink-3: #6b727c;
  --om-mute: #98a0aa;
  --om-line: #e6e9ee;
  --om-line-soft: #f0f2f5;
  --om-blue: #2563eb;
  --om-blue-line: #c3d9f2;
  --om-blue-bg: #f7fbff;
  --om-r-card: 14px;
  --om-shadow-card: 0 1px 2px rgba(16, 20, 28, 0.04);
  --om-shadow-hover: 0 8px 20px rgba(16, 20, 28, 0.08);
}

/* ---------- panel shell ---------- */
.om-panel {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(16, 20, 28, 0.16), 0 2px 6px rgba(16, 20, 28, 0.06),
    0 0 0 1px rgba(16, 20, 28, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: var(--om-font);
  color: var(--om-ink);
  -webkit-font-smoothing: antialiased;
}

/* ---------- header ---------- */
.om-head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: linear-gradient(#181c24, #11141a);
  color: #fff;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
}
.om-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 30%, #d6ecff, #93c4ec);
}
.om-avatar img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  animation: om-bob 3.4s ease-in-out infinite;
}
.om-brand {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.om-head-titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.om-head-sub {
  font-size: 11.5px;
  font-weight: 600;
  color: #9aa1ab;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.om-head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 1px;
}
.om-iconbtn {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #b9bec6;
  font-size: 14px;
  cursor: pointer;
  border: 0;
  background: none;
  padding: 0;
  transition: background 0.16s, color 0.16s;
}
.om-iconbtn.lg { font-size: 17px; }
.om-iconbtn:hover, .om-iconbtn:focus-visible { background: rgba(255, 255, 255, 0.12); color: #fff; }
.om-iconbtn.is-on { background: rgba(255, 255, 255, 0.18); color: #fff; }
.om-iconbtn.is-live { color: #22c55e; }
.om-headlink {
  margin-right: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: none;
  color: #e7eaee;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex: 0 0 auto;
  transition: background 0.16s, border-color 0.16s, color 0.16s;
}
.om-headlink:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}
.om-timer-chip {
  font-family: 'Press Start 2P', 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 0.5px;
  background: rgba(34, 197, 94, 0.18);
  color: #22c55e;
  padding: 3px 6px;
  border-radius: 6px;
}

/* ---------- shared bits ---------- */
.om-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--om-mute);
}
.om-card {
  border: 1px solid var(--om-line);
  border-radius: var(--om-r-card);
  background: #fff;
  box-shadow: var(--om-shadow-card);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: inherit;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s, transform 0.16s;
}
.om-card:hover {
  border-color: var(--om-blue-line);
  background: #f8fbff;
  box-shadow: var(--om-shadow-hover);
  transform: translateY(-1px);
}
.om-chev { margin-left: auto; color: #c2c8d0; font-size: 13px; }
.om-badge {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
}
.om-note { font-size: 12.5px; color: var(--om-mute); margin: 0; }

/* ---------- step 1: agents + quick actions ---------- */
.om-s1 { padding: 20px 18px; display: flex; flex-direction: column; gap: 22px; }
.om-group { display: flex; flex-direction: column; gap: 11px; }
.om-agents { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.om-agent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 16px 8px 14px;
  border: 1px solid var(--om-line);
  border-radius: var(--om-r-card);
  background: #fff;
  box-shadow: var(--om-shadow-card);
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.16s, box-shadow 0.16s, transform 0.16s;
}
.om-agent:hover:not(:disabled) {
  border-color: var(--om-blue-line);
  box-shadow: 0 8px 20px rgba(16, 20, 28, 0.09);
  transform: translateY(-2px);
}
.om-agent:disabled { opacity: 0.5; cursor: not-allowed; }
.om-agent-orb {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 30%, #eaf4ff, #cfe4f7);
}
.om-agent-orb img { width: 44px; height: 44px; object-fit: contain; }
.om-agent span { font-size: 13.5px; font-weight: 700; }
.om-actions { display: flex; flex-direction: column; gap: 8px; }
.om-action {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--om-line);
  border-radius: 13px;
  background: #fff;
  box-shadow: var(--om-shadow-card);
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s;
}
.om-action:hover { border-color: var(--om-blue-line); background: var(--om-blue-bg); }
.om-action-ico {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  font-size: 15px;
}
.om-action b { font-size: 14px; font-weight: 700; }

/* ---------- step 2: account picker ---------- */
.om-s2 {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.om-portfolio {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 12px 18px 0;
  padding: 12px 13px;
  border: 1px solid var(--om-blue-line);
  border-radius: 13px;
  background: linear-gradient(180deg, #f8fbff, #f2f7ff);
  font-family: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.16s, box-shadow 0.16s, transform 0.16s;
}
.om-portfolio:hover {
  border-color: var(--om-blue);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.15);
  transform: translateY(-1px);
}
.om-portfolio-ico {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--om-blue);
  color: #fff;
  font-size: 14px;
}
.om-portfolio-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.om-portfolio-copy b { font-size: 13.5px; font-weight: 800; letter-spacing: -0.005em; }
.om-portfolio-copy span { font-size: 11.5px; color: var(--om-ink-3); }
.om-portfolio-go { margin-left: auto; color: var(--om-blue); font-size: 15px; font-weight: 700; }
.om-s2-top {
  padding: 16px 18px 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--om-line-soft);
  flex-shrink: 0;
}
.om-s2-title { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
.om-s2-title b { font-size: 14.5px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; }
.om-s2-title span { font-size: 11.5px; color: var(--om-mute); white-space: nowrap; }
.om-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--om-line);
  border-radius: 11px;
  background: #fafbfc;
  transition: border-color 0.16s, background 0.16s;
}
.om-search:hover, .om-search:focus-within { border-color: var(--om-blue-line); background: #fff; }
.om-search input {
  border: 0;
  outline: 0;
  background: none;
  min-width: 0;
  width: 100%;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--om-ink);
}
.om-search input::placeholder { color: #a8afb8; }
.om-accounts {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-content: start;
}
.om-accounts-msg { grid-column: 1 / -1; font-size: 12.5px; color: var(--om-mute); margin: 0; }
.om-accounts-msg.is-error { color: #dc2626; }
.om-accounts-loading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}
.om-acct {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid var(--om-line);
  background: #fff;
  border-radius: 13px;
  box-shadow: var(--om-shadow-card);
  font-family: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s, transform 0.16s;
}
.om-acct:hover { transform: translateY(-1px); border-color: var(--om-blue-line); }
.om-acct-box {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 6px;
  border: 1.5px solid #cfd5dd;
  background: #fff;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}
.om-acct-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.om-acct-name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.om-acct-id {
  font-size: 11.5px;
  color: #8a919b;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.om-acct.is-on {
  border-color: var(--om-blue);
  background: #f4f8ff;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.14);
}
.om-acct.is-on .om-acct-box { border-color: var(--om-blue); background: var(--om-blue); }
.om-foot {
  padding: 12px 18px 16px;
  border-top: 1px solid var(--om-line-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  flex-shrink: 0;
}
.om-count { font-size: 12.5px; color: #8a919b; font-weight: 600; }
.om-btnrow { display: flex; gap: 9px; }
.om-btn {
  flex: 1;
  height: 44px;
  border-radius: 13px;
  border: 1px solid var(--om-line);
  background: #fff;
  color: var(--om-ink-2);
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}
.om-btn:hover { border-color: var(--om-blue-line); background: var(--om-blue-bg); }
.om-btn--primary { border: 0; background: #b6bcc4; color: #fff; font-weight: 800; }
.om-btn--primary:disabled { cursor: not-allowed; }
.om-btn--primary.is-ready { background: var(--om-blue); }
.om-btn--primary.is-ready:hover { background: var(--om-blue); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28); }

/* ---------- step 3: chat ---------- */
.om-chatui {
  font-family: var(--om-font);
  color: var(--om-ink);
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.om-subbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--om-line-soft);
}
.om-back {
  flex: 0 0 auto;
  border: 0;
  background: none;
  padding: 0 2px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--om-blue);
  cursor: pointer;
  white-space: nowrap;
}
.om-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px 5px 6px;
  border-radius: 999px;
  background: #f3f5f8;
  font-size: 12.5px;
  font-weight: 700;
  color: #2b3038;
  min-width: 0;
  overflow: hidden;
}
.om-chip-ini {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 999px;
  background: #dbe6f3;
  color: #3d5a80;
  display: grid;
  place-items: center;
  font-size: 9.5px;
  font-weight: 800;
}
.om-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.om-subbar-actions { margin-left: auto; display: flex; gap: 6px; flex: 0 0 auto; }
.om-pill {
  height: 30px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--om-line);
  background: #fff;
  display: flex;
  align-items: center;
  white-space: nowrap;
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--om-ink-2);
  cursor: pointer;
  transition: background 0.16s;
}
.om-pill:hover { background: #f6f7f9; }
.om-pill.is-on { background: #eef4ff; border-color: var(--om-blue-line); }
.om-pill--blue { color: var(--om-blue); }
.om-pill--blue:hover { background: #f2f7ff; }
.om-pill--icon { padding: 0 9px; font-size: 13px; }

.om-empty-chat {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}
.om-hero { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.om-hero-orb {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 30%, #eaf4ff, #cfe4f7);
  box-shadow: 0 8px 22px rgba(60, 110, 170, 0.18);
}
.om-hero-orb img { width: 40px; height: 40px; object-fit: contain; animation: om-bob 3.4s ease-in-out infinite; }
.om-prompts {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 0;
}
.om-prompt { padding: 13px 14px; display: flex; flex-direction: column; gap: 6px; }
.om-prompt-head { display: flex; align-items: center; gap: 8px; }
.om-prompt-head b { font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em; }
.om-prompt-body {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--om-ink-3);
  text-wrap: pretty;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.om-ask { display: flex; align-items: center; gap: 8px; padding: 11px 13px; width: 100%; }
.om-ask-label {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-wrap: pretty;
  min-width: 0;
  /* Starter questions can be a full paragraph (settings allow 240 chars);
     clamp so one long prompt can't push the others out of view. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.om-inputwrap {
  border: 1px solid var(--om-line);
  border-radius: 18px;
  background: #fff;
  padding: 13px 13px 10px;
  box-shadow: var(--om-shadow-card);
  transition: border-color 0.16s, box-shadow 0.16s;
}
.om-inputwrap:hover, .om-inputwrap:focus-within {
  border-color: var(--om-blue-line);
  box-shadow: 0 6px 18px rgba(16, 20, 28, 0.07);
}
.om-inputwrap textarea::placeholder { color: #a8afb8; }
.om-tools { display: flex; align-items: center; gap: 4px; }
.om-tool {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: none;
  padding: 0;
  display: grid;
  place-items: center;
  color: #7c838d;
  cursor: pointer;
  transition: background 0.16s, color 0.16s;
}
.om-tool:hover:not(:disabled) { background: #f3f5f8; color: var(--om-ink); }
.om-tool:disabled { opacity: 0.45; cursor: not-allowed; }
.om-tool.is-on { background: #eef2ff; color: var(--om-blue); }
.om-tool.is-attached { background: #dcfce7; color: #166534; }
.om-hint { margin-left: auto; font-size: 11px; color: #b6bcc4; font-weight: 600; }
.om-send {
  margin-left: 8px;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 0;
  background: var(--om-ink);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(16, 20, 28, 0.22);
  transition: transform 0.16s, box-shadow 0.16s;
}
.om-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(16, 20, 28, 0.28); }
.om-send:disabled { background: #b6bcc4; box-shadow: none; cursor: not-allowed; }
.om-selects { display: flex; gap: 8px; }
.om-select {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: #f3f5f8;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--om-ink-3);
  cursor: pointer;
}
.om-select--wide { flex: 1.4; }

@keyframes om-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@media (prefers-reduced-motion: reduce) {
  .om-avatar img, .om-hero-orb img { animation: none }
}
`

/** Injects the panel stylesheet once per mount point. */
export default function OptiMateModalStyles() {
  return <style>{OPTIMATE_MODAL_CSS}</style>
}
