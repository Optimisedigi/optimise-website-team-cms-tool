export type ChatbotFlowTab = {
  id: "overview" | "ready" | "readiness" | "research" | "job-seeker" | "recovery";
  label: string;
  description: string;
};

export type ChatbotFlowNode = {
  id: string;
  title: string;
  body: string;
  state: "entry" | "question" | "action" | "outcome" | "recovery" | "decision";
  x: number;
  y: number;
  width?: number;
};

export type ChatbotFlowEdge = {
  from: string;
  to: string;
  label?: string;
};

export type ChatbotFlowPath = {
  tab: ChatbotFlowTab;
  nodes: ChatbotFlowNode[];
  edges: ChatbotFlowEdge[];
};

const tab = (id: ChatbotFlowTab["id"], label: string, description: string): ChatbotFlowTab => ({ id, label, description });
const node = (id: string, title: string, body: string, state: ChatbotFlowNode["state"], x: number, y: number, width = 250): ChatbotFlowNode => ({ id, title, body, state, x, y, width });
const edge = (from: string, to: string, label?: string): ChatbotFlowEdge => ({ from, to, label });

export const CHATBOT_FLOW_PATHS: ChatbotFlowPath[] = [
  {
    tab: tab("overview", "Overview", "Entry routes and persistent ways to change direction."),
    nodes: [
      node("welcome", "Welcome", "Greet the visitor and explain how Away can help.", "entry", 40, 250),
      node("ready", "Ready to hire", "Qualify a current hiring need.", "decision", 390, 20),
      node("assess", "Assess readiness", "Complete the 10-step readiness check.", "decision", 390, 180),
      node("research", "Researching", "Explore practical guidance before deciding.", "decision", 390, 340),
      node("jobs", "Looking for work", "Route candidates to careers, never sales.", "decision", 390, 500),
      node("secondary", "Persistent secondary actions", "Book a call · Ask another question · Return to menu · Finish", "action", 760, 250, 290),
    ],
    edges: [edge("welcome", "ready", "I’m ready to hire"), edge("welcome", "assess", "Assess our readiness"), edge("welcome", "research", "I’m researching"), edge("welcome", "jobs", "I’m looking for work"), edge("ready", "secondary"), edge("assess", "secondary"), edge("research", "secondary"), edge("jobs", "secondary")],
  },
  {
    tab: tab("ready", "Ready to hire", "Qualification, market routing, booking, and calendar recovery."),
    nodes: [
      node("role", "Role needed", "Choose a role or enter optional role text.", "question", 20, 180),
      node("size", "Team size", "Confirm the expected team size.", "question", 340, 180),
      node("timing", "Hiring timing", "Now · 1–3 months · Later · Not sure", "question", 660, 180),
      node("market", "Market", "Ask only when the visitor’s market is unknown.", "decision", 980, 180),
      node("au", "Australia destination", "Route to the approved Australia owner.", "outcome", 1300, 20),
      node("uk", "United Kingdom destination", "Route to the approved UK owner.", "outcome", 1300, 180),
      node("intl", "International destination", "Implementation decision: confirm the international owner.", "recovery", 1300, 340),
      node("book", "Embedded booking", "Keep the visitor in the conversation while selecting a time.", "action", 1650, 180),
      node("checklist", "Post-booking checklist", "Offer the readiness checklist after booking.", "outcome", 1980, 100),
      node("calendar", "Calendar unavailable", "Offer a retry, human follow-up, or checklist. Never dead-end.", "recovery", 1980, 300),
    ],
    edges: [edge("role", "size"), edge("size", "timing"), edge("timing", "market", "Market unknown"), edge("timing", "au", "Known: Australia"), edge("timing", "uk", "Known: UK"), edge("timing", "intl", "Known: other"), edge("market", "au", "Australia"), edge("market", "uk", "United Kingdom"), edge("market", "intl", "Other market"), edge("au", "book"), edge("uk", "book"), edge("intl", "book"), edge("book", "checklist", "Booked"), edge("book", "calendar", "Calendar fails")],
  },
  {
    tab: tab("readiness", "Readiness check", "Five paired questions cover PDF steps 1–10 and route by score."),
    nodes: [
      node("intro", "Readiness check", "Answer five paired questions using the common 0–2 answer scale.", "entry", 20, 230),
      node("q1", "Question 1 · PDF 1 + 6", "0 Not in place · 1 Partly in place · 2 Consistently in place", "question", 340, 20, 280),
      node("q2", "Question 2 · PDF 2 + 3", "0 Not in place · 1 Partly in place · 2 Consistently in place", "question", 340, 150, 280),
      node("q3", "Question 3 · PDF 4 + 8", "0 Not in place · 1 Partly in place · 2 Consistently in place", "question", 340, 280, 280),
      node("q4", "Question 4 · PDF 5 + 9", "0 Not in place · 1 Partly in place · 2 Consistently in place", "question", 340, 410, 280),
      node("q5", "Question 5 · PDF 7 + 10", "0 Not in place · 1 Partly in place · 2 Consistently in place", "question", 340, 540, 280),
      node("score", "Calculate score", "Proposal routing guidance only. Final implementation must validate scoring and advice.", "decision", 720, 230, 300),
      node("high", "8–10 · Ready", "Recommend booking; also offer the checklist.", "outcome", 1110, 40),
      node("mid", "4–7 · Build foundations", "Offer the checklist and an optional booking.", "outcome", 1110, 230),
      node("low", "0–3 · Start with essentials", "Offer the checklist and a supportive booking route.", "outcome", 1110, 420),
      node("book", "Book a call", "Open the embedded booking route.", "action", 1470, 160),
      node("checklist", "Get the checklist", "Continue to checklist delivery.", "action", 1470, 360),
    ],
    edges: [edge("intro", "q1"), edge("intro", "q2"), edge("intro", "q3"), edge("intro", "q4"), edge("intro", "q5"), edge("q1", "score"), edge("q2", "score"), edge("q3", "score"), edge("q4", "score"), edge("q5", "score"), edge("score", "high", "8–10"), edge("score", "mid", "4–7"), edge("score", "low", "0–3"), edge("high", "book"), edge("high", "checklist"), edge("mid", "book"), edge("mid", "checklist"), edge("low", "book"), edge("low", "checklist")],
  },
  {
    tab: tab("research", "Research", "Guidance, checklist delivery, separate consent, and next actions."),
    nodes: [
      node("topic", "Choose a research topic", "Costs · Hiring process · Team structure · Remote collaboration · Other", "question", 20, 220, 280),
      node("answer", "Answer the topic", "Give concise proposal-approved guidance, then offer useful next steps.", "action", 370, 220, 280),
      node("offer", "Checklist", "Email the checklist or skip delivery.", "decision", 720, 220),
      node("email", "Email address", "Validate the address before attempting delivery.", "question", 1040, 80),
      node("invalid", "Invalid email", "Explain the format and keep the entered value for correction.", "recovery", 1040, 300),
      node("access", "Immediate checklist access", "Show access even if email delivery fails.", "outcome", 1380, 80),
      node("failure", "Delivery failure", "Keep immediate access and offer retry or human help.", "recovery", 1380, 300),
      node("consent", "Separate follow-up consent", "Ask after delivery. No preselection and no effect on checklist access.", "decision", 1720, 80, 280),
      node("next", "Choose next step", "Book · Readiness check · Ask another question · Finish", "outcome", 2070, 180, 280),
    ],
    edges: [edge("topic", "answer"), edge("answer", "offer"), edge("offer", "email", "Email it"), edge("offer", "next", "Skip"), edge("email", "invalid", "Invalid"), edge("invalid", "email", "Correct"), edge("email", "access", "Valid"), edge("email", "failure", "Delivery fails"), edge("failure", "access", "Continue now"), edge("access", "consent"), edge("consent", "next", "Yes or no")],
  },
  {
    tab: tab("job-seeker", "Job seeker", "A clear careers route with no sales-lead qualification."),
    nodes: [
      node("identify", "Looking for work", "Acknowledge that this path is for candidates.", "entry", 30, 150),
      node("rule", "No sales qualification", "Do not ask hiring budget, company size, timing, or market questions.", "decision", 380, 150, 290),
      node("careers", "Careers destination", "Implementation decision: confirm the approved careers destination.", "recovery", 760, 60, 290),
      node("return", "Return to main menu", "Let visitors change direction without restarting.", "action", 760, 250, 290),
    ],
    edges: [edge("identify", "rule"), edge("rule", "careers", "View opportunities"), edge("rule", "return", "Not what I need")],
  },
  {
    tab: tab("recovery", "Recovery", "Known requests, failures, return visits, and every no-dead-end route."),
    nodes: [
      node("input", "Unexpected input", "Classify the request without inventing an answer.", "entry", 20, 260),
      node("known", "Known free text", "Map a clear request to the matching authored route.", "action", 350, 20),
      node("unknown", "Unsupported or unknown", "Say what is understood, do not guess, and show supported choices.", "recovery", 350, 150),
      node("human", "Human requested", "Capture the minimum contact details and explain the handoff.", "recovery", 350, 280),
      node("market", "Unknown market", "Ask the market, then use an approved owner. International owner remains a decision.", "recovery", 350, 410),
      node("calendar", "Calendar failure", "Retry · Human follow-up · Checklist", "recovery", 750, 20),
      node("email", "Email failure", "Immediate access · Retry · Human help", "recovery", 750, 150),
      node("returning", "Returning known contact", "Welcome back without exposing stored personal details; allow correction.", "decision", 750, 280),
      node("abandon", "Abandonment nudge", "One quiet reminder, then leave the visitor in control.", "decision", 750, 410),
      node("destinations", "Useful destination", "Book · Checklist · Readiness · Main menu · Human help · Finish", "outcome", 1150, 220, 300),
    ],
    edges: [edge("input", "known", "Recognised"), edge("input", "unknown", "Not recognised"), edge("input", "human", "Human help"), edge("input", "market", "Market needed"), edge("input", "calendar", "Calendar fails"), edge("input", "email", "Email fails"), edge("input", "returning", "Known contact returns"), edge("input", "abandon", "Conversation pauses"), edge("known", "destinations"), edge("unknown", "destinations"), edge("human", "destinations"), edge("market", "destinations"), edge("calendar", "destinations"), edge("email", "destinations"), edge("returning", "destinations"), edge("abandon", "destinations")],
  },
];

export const CHATBOT_FLOW_TABS = CHATBOT_FLOW_PATHS.map((path) => path.tab);

export function getChatbotFlowPath(id: ChatbotFlowTab["id"]): ChatbotFlowPath {
  return CHATBOT_FLOW_PATHS.find((path) => path.tab.id === id) ?? CHATBOT_FLOW_PATHS[0];
}
