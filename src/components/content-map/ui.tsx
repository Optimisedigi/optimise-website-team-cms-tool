import { st } from "./st";

/** Shared style strings, copied from the design. */
export const MONO_LABEL = "font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:oklch(0.52 0.01 85)";
export const MUTED_TEXT = "font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty";
export const LINK_BTN = "border:0;background:none;padding:3px 0;cursor:pointer;font-size:12.5px;line-height:1.35;text-align:left";
export const GHOST_BTN = "border:1px solid oklch(0.88 0.006 85);background:oklch(0.995 0.002 85);border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px;white-space:nowrap;flex:none";
export const DARK_BTN = "border:0;background:oklch(0.24 0.012 85);color:oklch(0.98 0.004 85);border-radius:7px;padding:6px 11px;cursor:pointer;font-size:12px;font-weight:500";
export const GAP_ITEM = "border:1px solid oklch(0.92 0.006 85);background:oklch(0.995 0.002 85);border-radius:8px;padding:9px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;text-align:left";
export const ACTIVE_TAB = { bg: "#fff", sh: "0 1px 2px rgba(0,0,0,.08)" };

export function Dot({ c, size = 8, extra = "" }: { c: string; size?: number; extra?: string }) {
  return <span style={st(`width:${size}px;height:${size}px;border-radius:50%;flex:none;background:${c};${extra}`)} />;
}

/** Small mono tag: "draft" on draft nodes, "PRIMARY" on the primary authority. */
export function MonoTag({ children, dark = false }: { children: string; dark?: boolean }) {
  return (
    <span
      style={st(
        `font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.06em;padding:1px 5px;border-radius:4px;flex:none;white-space:nowrap;${
          dark ? "background:oklch(0.98 0.004 85 / .16);color:oklch(0.98 0.004 85)" : "background:oklch(0.94 0.006 85);color:oklch(0.52 0.01 85)"
        }`,
      )}
    >
      {children}
    </span>
  );
}
