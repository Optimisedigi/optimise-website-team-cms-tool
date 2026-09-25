/**
 * Guided chat ("Renee") depth report for the landing dashboard.
 *
 * Built from the landing events the chat sends: `chat_open` (panel opened,
 * `trigger` auto or button), `chat_start` (first answer), `chat_step` (every
 * answer, ids only), `chat_identified` (email given), and `booking_open` /
 * `booking_complete` carrying the chat's own booking id.
 *
 * Everything is counted on distinct sessions, like the page funnel: one person
 * clicking back and forth is still one person at that step.
 */

export const CHAT_BOOKING_ID = "chatbot-scheduler-api";

/** Event types this report reads; the route selects only these. */
export const CHAT_REPORT_EVENT_TYPES = [
  "chat_open",
  "chat_start",
  "chat_step",
  "chat_identified",
  "booking_open",
  "booking_complete",
] as const;

/** One stored event, reduced to the fields the report needs. */
export interface ChatEventRow {
  sessionId: string;
  eventType: string;
  occurredAt: string;
  paid: boolean;
  trigger?: string | null;
  node?: string | null;
  choice?: string | null;
  step?: number | null;
  bookingId?: string | null;
}

export type ChatFunnelKey = "opened" | "started" | "path" | "booking" | "email" | "booked";

export interface ChatFunnelStep {
  key: ChatFunnelKey;
  label: string;
  sessions: number;
  /** Share of the previous step's sessions; null for the first step or a zero base. */
  fromPrevious: number | null;
}

export interface ChatOpenedBy {
  sessions: number;
  started: number;
}

export interface ChatPath {
  choice: string;
  sessions: number;
  gaveEmail: number;
  booked: number;
}

export interface ChatDropOff {
  node: string;
  choice: string | null;
  sessions: number;
  /** Share of all sessions that dropped off, 0-100 with one decimal. */
  share: number;
}

export interface ChatSummary {
  funnel: ChatFunnelStep[];
  openedBy: { auto: ChatOpenedBy; button: ChatOpenedBy };
  paths: ChatPath[];
  dropOff: ChatDropOff[];
  /** Sessions that started, did not give an email or book, and have step data. */
  droppedSessions: number;
}

const FUNNEL: { key: ChatFunnelKey; label: string }[] = [
  { key: "opened", label: "Opened the chat" },
  { key: "started", label: "Started (answered once)" },
  { key: "path", label: "Picked a path" },
  { key: "booking", label: "Reached the booking step" },
  { key: "email", label: "Gave an email" },
  { key: "booked", label: "Booked a call" },
];

const DROP_OFF_LIMIT = 12;

interface SessionState {
  firstOpen: { at: string; trigger: "auto" | "button" } | null;
  started: boolean;
  path: string | null;
  pathAt: string;
  booking: boolean;
  email: boolean;
  booked: boolean;
  last: { at: string; step: number; node: string; choice: string | null } | null;
}

function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Deterministic, pure aggregation of chat events into the panel's figures. */
export function summariseChat(rows: readonly ChatEventRow[]): ChatSummary {
  const sessions = new Map<string, SessionState>();
  const stateFor = (id: string): SessionState => {
    let state = sessions.get(id);
    if (!state) {
      state = {
        firstOpen: null,
        started: false,
        path: null,
        pathAt: "",
        booking: false,
        email: false,
        booked: false,
        last: null,
      };
      sessions.set(id, state);
    }
    return state;
  };

  for (const row of rows) {
    if (!row.sessionId) continue;
    const isChatBooking = row.bookingId === CHAT_BOOKING_ID;
    if ((row.eventType === "booking_open" || row.eventType === "booking_complete") && !isChatBooking) continue;
    const state = stateFor(row.sessionId);

    switch (row.eventType) {
      case "chat_open": {
        const trigger = row.trigger === "auto" ? "auto" : row.trigger === "button" ? "button" : null;
        if (trigger && (!state.firstOpen || row.occurredAt < state.firstOpen.at)) {
          state.firstOpen = { at: row.occurredAt, trigger };
        }
        break;
      }
      case "chat_start":
        state.started = true;
        break;
      case "chat_identified":
        state.email = true;
        break;
      case "booking_open":
        state.booking = true;
        break;
      case "booking_complete":
        state.booking = true;
        state.booked = true;
        break;
      case "chat_step": {
        const node = row.node ?? "";
        if (!node) break;
        const choice = row.choice || null;
        // The first answer at the welcome step is the path; a visitor who goes
        // back and picks again keeps the first pick.
        if (node === "welcome" && choice && (!state.path || row.occurredAt < state.pathAt)) {
          state.path = choice;
          state.pathAt = row.occurredAt;
        }
        if (node === "booking_slot" || node === "booking_contact") state.booking = true;
        const step = typeof row.step === "number" && Number.isFinite(row.step) ? row.step : 0;
        const last = state.last;
        if (!last || row.occurredAt > last.at || (row.occurredAt === last.at && step > last.step)) {
          state.last = { at: row.occurredAt, step, node, choice };
        }
        // An answer implies the chat was started, even if chat_start was lost.
        state.started = true;
        break;
      }
      default:
        break;
    }
  }

  const all = [...sessions.values()];
  const counts: Record<ChatFunnelKey, number> = {
    opened: all.filter((s) => s.firstOpen).length,
    started: all.filter((s) => s.started).length,
    path: all.filter((s) => s.path).length,
    booking: all.filter((s) => s.booking).length,
    email: all.filter((s) => s.email).length,
    booked: all.filter((s) => s.booked).length,
  };
  const funnel = FUNNEL.map((step, index) => {
    const previous = index > 0 ? counts[FUNNEL[index - 1].key] : 0;
    return {
      key: step.key,
      label: step.label,
      sessions: counts[step.key],
      fromPrevious: index > 0 && previous > 0 ? share(counts[step.key], previous) : null,
    };
  });

  const openedBy = (trigger: "auto" | "button"): ChatOpenedBy => {
    const opened = all.filter((s) => s.firstOpen?.trigger === trigger);
    return { sessions: opened.length, started: opened.filter((s) => s.started).length };
  };

  const pathMap = new Map<string, ChatPath>();
  for (const state of all) {
    if (!state.path) continue;
    const entry = pathMap.get(state.path) ?? { choice: state.path, sessions: 0, gaveEmail: 0, booked: 0 };
    entry.sessions += 1;
    if (state.email) entry.gaveEmail += 1;
    if (state.booked) entry.booked += 1;
    pathMap.set(state.path, entry);
  }
  const paths = [...pathMap.values()].sort((a, b) => b.sessions - a.sessions || a.choice.localeCompare(b.choice));

  const dropped = all.filter((s) => s.started && !s.email && !s.booked && s.last);
  const dropMap = new Map<string, ChatDropOff>();
  for (const state of dropped) {
    const last = state.last!;
    const key = `${last.node}\u0000${last.choice ?? ""}`;
    const entry = dropMap.get(key) ?? { node: last.node, choice: last.choice, sessions: 0, share: 0 };
    entry.sessions += 1;
    dropMap.set(key, entry);
  }
  const dropOff = [...dropMap.values()]
    .sort(
      (a, b) =>
        b.sessions - a.sessions || a.node.localeCompare(b.node) || (a.choice ?? "").localeCompare(b.choice ?? ""),
    )
    .slice(0, DROP_OFF_LIMIT)
    .map((entry) => ({ ...entry, share: share(entry.sessions, dropped.length) }));

  return {
    funnel,
    openedBy: { auto: openedBy("auto"), button: openedBy("button") },
    paths,
    dropOff,
    droppedSessions: dropped.length,
  };
}
