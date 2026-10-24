import { createContext, useContext } from "react";
import { st } from "./st";
import { GHOST_BTN, MONO_LABEL } from "./ui";

/** An admin document (brief or article) the team opens inside the Write next tab. */
export interface AdminDoc {
  href: string;
  title: string;
}

/** Set by Write next; In progress (rendered inside it) opens docs through it. Absent → plain links. */
export const AdminDocContext = createContext<((doc: AdminDoc) => void) | null>(null);
export const useOpenAdminDoc = () => useContext(AdminDocContext);

/** Overlay with the admin page framed (same origin), plus "Open in new tab ↗" and Close. */
export function AdminDocPanel({ doc, onClose }: { doc: AdminDoc; onClose: () => void }) {
  return (
    <div data-testid="admin-doc-panel" style={st("position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:oklch(0.995 0.002 85);border-left:1px solid oklch(0.9 0.006 85)")}>
      <div style={st("display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid oklch(0.9 0.006 85)")}>
        <span style={st(MONO_LABEL)}>{doc.title}</span>
        <div style={st("flex:1")} />
        <a href={doc.href} target="_blank" rel="noopener noreferrer" style={st("font-size:12px")}>Open in new tab ↗</a>
        <button type="button" onClick={onClose} style={st(GHOST_BTN)}>Close</button>
      </div>
      <iframe title={doc.title} src={doc.href} style={st("flex:1;width:100%;border:0;background:#fff")} />
    </div>
  );
}
