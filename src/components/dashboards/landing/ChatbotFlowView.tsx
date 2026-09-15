"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHATBOT_FLOW_PATHS, type ChatbotFlowNode, type ChatbotFlowTab } from "./chatbot-flow-data";
import styles from "./ChatbotFlowView.module.css";

const NODE_HEIGHT = 108;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;
const PAD = 48;
const STATE_COLOURS: Record<ChatbotFlowNode["state"], string> = {
  entry: "#1d4ed8", question: "#7c3aed", decision: "#a16207", action: "#0369a1", outcome: "#047857", recovery: "#b91c1c",
};

type View = { x: number; y: number; scale: number };

export function ChatbotFlowView() {
  const [selected, setSelected] = useState<ChatbotFlowTab["id"]>("overview");
  const [view, setView] = useState<View>({ x: PAD, y: PAD, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewX: number; viewY: number } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const path = useMemo(() => CHATBOT_FLOW_PATHS.find((candidate) => candidate.tab.id === selected) ?? CHATBOT_FLOW_PATHS[0], [selected]);

  const bounds = useMemo(() => {
    const maxX = Math.max(...path.nodes.map((item) => item.x + (item.width ?? 250)));
    const maxY = Math.max(...path.nodes.map((item) => item.y + NODE_HEIGHT));
    return { width: maxX + PAD, height: maxY + PAD };
  }, [path]);

  const fit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((el.clientWidth - PAD * 2) / bounds.width, (el.clientHeight - PAD * 2) / bounds.height)));
    setView({ x: Math.max(PAD, (el.clientWidth - bounds.width * scale) / 2), y: Math.max(PAD, (el.clientHeight - bounds.height * scale) / 2), scale });
  }, [bounds]);

  const framePath = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (el.clientWidth >= 640) { fit(); return; }
    const scale = 0.72;
    setView({ x: 16, y: (el.clientHeight - bounds.height * scale) / 2, scale });
  }, [bounds, fit]);

  useEffect(() => { framePath(); }, [framePath]);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(framePath);
    observer.observe(el);
    return () => observer.disconnect();
  }, [framePath]);

  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView((current) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor));
      const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return { scale, x: px - worldX * scale, y: py - worldY * scale };
    });
  }, []);

  const reset = useCallback(() => setView({ x: PAD, y: PAD, scale: 1 }), []);
  const selectTab = (id: ChatbotFlowTab["id"]) => { setSelected(id); };

  return (
    <section className={styles.root} aria-label="Away chatbot flow review">
      <div className={styles.tabs} role="tablist" aria-label="Conversation paths">
        {CHATBOT_FLOW_PATHS.map((item, index) => (
          <button key={item.tab.id} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab"
            id={`flow-tab-${item.tab.id}`} aria-controls="flow-panel" aria-selected={selected === item.tab.id} tabIndex={selected === item.tab.id ? 0 : -1}
            className={styles.tab} onClick={() => selectTab(item.tab.id)} onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? CHATBOT_FLOW_PATHS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + CHATBOT_FLOW_PATHS.length) % CHATBOT_FLOW_PATHS.length;
              selectTab(CHATBOT_FLOW_PATHS[next].tab.id);
              tabRefs.current[next]?.focus();
            }}>
            {item.tab.label}
          </button>
        ))}
      </div>
      <div className={styles.toolbar} aria-label="Canvas controls">
        <button type="button" className={styles.control} onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
        <button type="button" className={styles.control} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
        <button type="button" className={styles.control} onClick={fit}>Fit all</button>
        <button type="button" className={styles.control} onClick={reset}>Home</button>
        <span className={styles.pathInfo} id="flow-description">{path.tab.description}</span>
      </div>
      <div ref={viewportRef} id="flow-panel" role="tabpanel" aria-labelledby={`flow-tab-${selected}`} aria-describedby="flow-description flow-instructions"
        className={styles.viewport} data-dragging={dragging} tabIndex={0}
        onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y }; setDragging(true); }}
        onPointerMove={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; setView((current) => ({ ...current, x: drag.viewX + event.clientX - drag.x, y: drag.viewY + event.clientY - drag.y })); }}
        onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; setDragging(false); }}
        onPointerCancel={() => { dragRef.current = null; setDragging(false); }}
        onWheel={(event) => { event.preventDefault(); if (event.ctrlKey || event.metaKey) zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY); else setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY })); }}
        onKeyDown={(event) => {
          const amount = event.shiftKey ? 80 : 36;
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0", "Home"].includes(event.key)) event.preventDefault(); else return;
          if (event.key === "+" || event.key === "=") zoomBy(1.2); else if (event.key === "-") zoomBy(1 / 1.2); else if (event.key === "0") fit(); else if (event.key === "Home") reset();
          else setView((current) => ({ ...current, x: current.x + (event.key === "ArrowLeft" ? amount : event.key === "ArrowRight" ? -amount : 0), y: current.y + (event.key === "ArrowUp" ? amount : event.key === "ArrowDown" ? -amount : 0) }));
        }}>
        <ul className={styles.srOnly} aria-label={`Routes for ${path.tab.label}`}>
          {path.edges.map((item) => {
            const from = path.nodes.find((candidate) => candidate.id === item.from)!;
            const to = path.nodes.find((candidate) => candidate.id === item.to)!;
            return <li key={`route-${item.from}-${item.to}-${item.label ?? "continue"}`}>{from.title} to {to.title}{item.label ? ` when ${item.label}` : ""}</li>;
          })}
        </ul>
        <div data-testid="flow-scene" className={styles.scene} style={{ width: bounds.width, height: bounds.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className={styles.edges} width={bounds.width} height={bounds.height} aria-hidden="true">
            <defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path className={styles.arrow} d="M0,0 L8,4 L0,8 z" /></marker></defs>
            {path.edges.map((item) => {
              const from = path.nodes.find((candidate) => candidate.id === item.from)!;
              const to = path.nodes.find((candidate) => candidate.id === item.to)!;
              const x1 = from.x + (from.width ?? 250), y1 = from.y + NODE_HEIGHT / 2, x2 = to.x, y2 = to.y + NODE_HEIGHT / 2;
              const curve = Math.max(55, Math.abs(x2 - x1) * .45);
              return <path key={`${item.from}-${item.to}-${item.label ?? ""}`} className={styles.edge} markerEnd="url(#flow-arrow)" d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`} />;
            })}
          </svg>
          {path.edges.filter((item) => item.label).map((item) => {
            const from = path.nodes.find((candidate) => candidate.id === item.from)!;
            const to = path.nodes.find((candidate) => candidate.id === item.to)!;
            return <span key={`label-${item.from}-${item.to}`} aria-hidden="true" className={styles.edgeLabel} style={{ left: (from.x + (from.width ?? 250) + to.x) / 2, top: (from.y + to.y + NODE_HEIGHT) / 2 }}>{item.label}</span>;
          })}
          {path.nodes.map((item) => <article key={item.id} className={styles.node} style={{ left: item.x, top: item.y, width: item.width ?? 250, "--state": STATE_COLOURS[item.state] } as React.CSSProperties}>
            <span className={styles.nodeState}>{item.state}</span><h3 className={styles.nodeTitle}>{item.title}</h3><p className={styles.nodeBody}>{item.body}</p>
          </article>)}
        </div>
        <p id="flow-instructions" className={styles.instructions}>Drag or use arrow keys to move. Use the controls, +/−, 0 to fit, or Home to reset. Ctrl/Command + wheel zooms. On touch screens, drag and use the zoom buttons.</p>
      </div>
    </section>
  );
}
