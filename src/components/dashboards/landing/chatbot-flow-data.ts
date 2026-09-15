export type ChatbotFlowTab = {
  id: "overview" | "ready" | "readiness" | "research" | "recovery";
  label: string;
  description: string;
};

export type ChatbotFlowNode = {
  id: string;
  title: string;
  body: string;
  question?: string;
  answers?: string[];
  state: "entry" | "question" | "action" | "outcome" | "recovery" | "decision";
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type ChatbotFlowEdge = { from: string; to: string; label?: string };
export type ChatbotFlowPath = { tab: ChatbotFlowTab; nodes: ChatbotFlowNode[]; edges: ChatbotFlowEdge[] };

const tab = (id: ChatbotFlowTab["id"], label: string, description: string): ChatbotFlowTab => ({ id, label, description });
const node = (
  id: string,
  title: string,
  body: string,
  state: ChatbotFlowNode["state"],
  x: number,
  y: number,
  options: Pick<ChatbotFlowNode, "question" | "answers" | "width" | "height"> = {},
): ChatbotFlowNode => ({ id, title, body, state, x, y, ...options });
const edge = (from: string, to: string, label?: string): ChatbotFlowEdge => ({ from, to, label });

const readinessAnswers = ["0 · Not in place yet", "1 · Partly in place", "2 · Consistently in place"];

export const CHATBOT_FLOW_PATHS: ChatbotFlowPath[] = [
  {
    tab: tab("overview", "Overview", "Choose one starting answer to open its complete conversation branch."),
    nodes: [
      node("welcome", "Opening message", "Hi, I’m Away’s team assistant. I can help you plan a hire, check whether your business is ready, or answer questions about offshore teams.", "entry", 60, 250, {
        question: "What would you like help with today?",
        answers: ["I’m ready to hire", "Assess our readiness", "I’m researching offshore teams"],
        width: 390,
        height: 230,
      }),
      node("ready", "Ready to hire", "Opens the qualification, market and booking branch.", "decision", 650, 40, { question: "I’m ready to hire", width: 330, height: 145 }),
      node("assess", "Assess readiness", "Opens the five-question readiness score and recommendations.", "decision", 650, 255, { question: "Assess our readiness", width: 330, height: 145 }),
      node("research", "Researching", "Opens guidance, checklist delivery and optional follow-up.", "decision", 650, 470, { question: "I’m researching offshore teams", width: 330, height: 145 }),
      node("secondary", "Available throughout", "Visitors can always change direction without losing their place.", "action", 1190, 250, {
        question: "What would you like to do next?",
        answers: ["Book a call", "Ask another question", "Return to the main menu", "Finish"],
        width: 380,
        height: 230,
      }),
    ],
    edges: [edge("welcome", "ready", "I’m ready to hire"), edge("welcome", "assess", "Assess our readiness"), edge("welcome", "research", "I’m researching"), edge("ready", "secondary"), edge("assess", "secondary"), edge("research", "secondary")],
  },
  {
    tab: tab("ready", "Ready to hire", "The exact qualification questions, choices, booking route and recovery."),
    nodes: [
      node("role", "Question 1 · Role", "Use optional free text when none of the choices fit.", "question", 40, 220, {
        question: "What kind of role are you looking to hire?",
        answers: ["Virtual assistant / administration", "Sales or customer support", "Marketing", "Finance or operations", "Something else"],
        width: 360,
        height: 260,
      }),
      node("size", "Question 2 · Team size", "This helps Away recommend the right hiring approach.", "question", 560, 220, {
        question: "How many people are you looking to hire?",
        answers: ["1 person", "2–3 people", "4 or more", "I’m not sure yet"],
        width: 340,
        height: 235,
      }),
      node("timing", "Question 3 · Timing", "Every answer continues; uncertainty never creates a dead end.", "question", 1060, 220, {
        question: "When would you like your new team member to start?",
        answers: ["As soon as possible", "Within 1–3 months", "Later than 3 months", "I’m not sure yet"],
        width: 350,
        height: 235,
      }),
      node("market", "Question 4 · Market", "Skip this question when the visitor’s market is already known.", "decision", 1570, 220, {
        question: "Which market is your business hiring for?",
        answers: ["Australia", "United Kingdom", "Another market"],
        width: 340,
        height: 220,
      }),
      node("destination", "Booking owner", "Australia and UK use their approved owners. Another market must use the confirmed international owner.", "decision", 2070, 80, {
        question: "Would you like to speak with the relevant hiring specialist?",
        answers: ["Yes, show available times", "Not yet, send me the checklist", "Return to the main menu"],
        width: 380,
        height: 235,
      }),
      node("book", "Embedded booking", "Show the calendar inside the conversation and keep the visitor’s answers.", "action", 2590, 80, {
        question: "Choose a time that works for you.",
        answers: ["Available calendar times", "None of these times work", "I’ll book later"],
        width: 370,
        height: 220,
      }),
      node("checklist", "After booking", "Confirm the booking, then offer practical preparation material.", "outcome", 3110, 20, {
        question: "Would you also like our offshore hiring readiness checklist?",
        answers: ["Yes, send the checklist", "No thanks", "Ask another question"],
        width: 380,
        height: 220,
      }),
      node("calendar", "Calendar unavailable", "Never dead-end when scheduling is unavailable.", "recovery", 3110, 350, {
        question: "The calendar isn’t available right now. What would you prefer?",
        answers: ["Try the calendar again", "Ask the Away team to contact me", "Get the checklist instead", "Return to the main menu"],
        width: 390,
        height: 250,
      }),
    ],
    edges: [edge("role", "size"), edge("size", "timing"), edge("timing", "market", "Market unknown"), edge("timing", "destination", "Market already known"), edge("market", "destination", "Australia, UK or another market"), edge("destination", "book", "Show available times"), edge("destination", "checklist", "Send checklist"), edge("book", "checklist", "Booking confirmed"), edge("book", "calendar", "Calendar fails")],
  },
  {
    tab: tab("readiness", "Readiness check", "Five exact questions cover the ten readiness areas and route by score."),
    nodes: [
      node("intro", "Readiness check introduction", "Each answer scores 0, 1 or 2. The result is guidance, not a final assessment.", "entry", 30, 260, {
        question: "Would you like to check how ready your business is to hire offshore?",
        answers: ["Yes, start the five questions", "Tell me how scoring works", "Return to the main menu"], width: 390, height: 230,
      }),
      node("q1", "Question 1 · Role and onboarding", "Covers PDF readiness areas 1 + 6.", "question", 570, 20, { question: "Do you have a clearly defined role and a repeatable onboarding plan?", answers: readinessAnswers, width: 390, height: 220 }),
      node("q2", "Question 2 · Tasks and processes", "Covers PDF readiness areas 2 + 3.", "question", 570, 330, { question: "Have you documented the tasks, tools and processes this person will use?", answers: readinessAnswers, width: 390, height: 220 }),
      node("q3", "Question 3 · Management and feedback", "Covers PDF readiness areas 4 + 8.", "question", 570, 640, { question: "Does someone own day-to-day management, quality checks and feedback?", answers: readinessAnswers, width: 390, height: 220 }),
      node("q4", "Question 4 · Communication and success", "Covers PDF readiness areas 5 + 9.", "question", 1110, 150, { question: "Are working hours, communication rhythms and success measures agreed?", answers: readinessAnswers, width: 390, height: 220 }),
      node("q5", "Question 5 · Access and development", "Covers PDF readiness areas 7 + 10.", "question", 1110, 470, { question: "Are system access, security and the first 90 days of development planned?", answers: readinessAnswers, width: 390, height: 220 }),
      node("score", "Calculate readiness score", "Add the five answers. Proposal routing guidance only; validate final scoring and advice before launch.", "decision", 1650, 290, { width: 380, height: 180 }),
      node("high", "8–10 · Ready to proceed", "Your foundations look strong enough to discuss the role and hiring plan.", "outcome", 2190, 20, { question: "What would you like to do next?", answers: ["Book a hiring call", "Get the checklist", "Ask another question"], width: 380, height: 220 }),
      node("mid", "4–7 · Build the foundations", "A few practical gaps should be tightened before hiring.", "outcome", 2190, 330, { question: "What would help most?", answers: ["Get the checklist", "Book a planning call", "Review my answers"], width: 380, height: 220 }),
      node("low", "0–3 · Start with essentials", "Build the role, process and management basics before committing to a hire.", "outcome", 2190, 640, { question: "What would help most?", answers: ["Get the checklist", "Book a supportive planning call", "Review my answers"], width: 380, height: 220 }),
    ],
    edges: [edge("intro", "q1", "Start"), edge("q1", "q2"), edge("q2", "q3"), edge("q3", "q4"), edge("q4", "q5"), edge("q5", "score"), edge("score", "high", "8–10"), edge("score", "mid", "4–7"), edge("score", "low", "0–3")],
  },
  {
    tab: tab("research", "Research", "Exact research choices, guidance, checklist delivery and separate consent."),
    nodes: [
      node("topic", "Question 1 · Topic", "Answer the selected topic concisely before offering the next step.", "question", 30, 220, {
        question: "What would you like to understand about building an offshore team?",
        answers: ["Typical costs", "How the hiring process works", "Choosing the right team structure", "Managing a remote team", "Something else"],
        width: 400,
        height: 265,
      }),
      node("answer", "Helpful answer", "Give proposal-approved guidance for the chosen topic. Do not force qualification.", "action", 590, 220, {
        question: "Was that helpful, or would you like to go deeper?",
        answers: ["Show me the readiness checklist", "I have another question", "I’m ready to discuss hiring", "That’s all for now"],
        width: 390,
        height: 250,
      }),
      node("offer", "Checklist offer", "Checklist access never depends on marketing consent.", "decision", 1140, 220, {
        question: "Would you like the offshore hiring readiness checklist?",
        answers: ["Yes, email it to me", "Open it without email", "No thanks"],
        width: 370,
        height: 220,
      }),
      node("email", "Email address", "Validate the address and retain the entered value when correction is needed.", "question", 1670, 50, {
        question: "What email address should we send the checklist to?",
        answers: ["Enter email address", "Open the checklist without email", "Return to the main menu"],
        width: 390,
        height: 220,
      }),
      node("invalid", "Invalid email", "Explain the expected format without clearing the visitor’s answer.", "recovery", 1670, 350, {
        question: "That email address doesn’t look complete. Would you like to correct it?",
        answers: ["Correct my email", "Open the checklist without email", "Ask for help"],
        width: 390,
        height: 220,
      }),
      node("access", "Checklist access", "Show immediate access even if email delivery fails.", "outcome", 2220, 100, {
        question: "Your checklist is ready. What would you like to do next?",
        answers: ["Open the checklist", "Book a call", "Take the readiness check", "Ask another question"],
        width: 390,
        height: 245,
      }),
      node("consent", "Separate follow-up consent", "Ask after delivery, never preselect it, and do not change checklist access.", "decision", 2770, 100, {
        question: "Can Away Digital Teams follow up with useful hiring advice?",
        answers: ["Yes, I’d like relevant follow-up", "No thanks"],
        width: 390,
        height: 210,
      }),
      node("failure", "Delivery unavailable", "Keep immediate checklist access and offer a useful recovery.", "recovery", 2220, 420, {
        question: "Email delivery didn’t work. What would you prefer?",
        answers: ["Try sending again", "Open the checklist now", "Ask the Away team to contact me"],
        width: 390,
        height: 220,
      }),
    ],
    edges: [edge("topic", "answer"), edge("answer", "offer", "Checklist"), edge("offer", "email", "Email it"), edge("offer", "access", "Open now"), edge("email", "invalid", "Invalid address"), edge("invalid", "email", "Correct email"), edge("email", "access", "Sent"), edge("email", "failure", "Delivery fails"), edge("failure", "access", "Continue now"), edge("access", "consent", "Checklist delivered")],
  },
  {
    tab: tab("recovery", "Recovery", "Exact recovery prompts keep every supported interruption useful."),
    nodes: [
      node("input", "Conversation interruption", "Route from the point of failure while preserving known answers.", "entry", 30, 280, {
        question: "What happened?",
        answers: ["I entered something unexpected", "I want a person", "The calendar failed", "The email failed", "I came back later"],
        width: 390,
        height: 250,
      }),
      node("unknown", "Unexpected answer", "Ask once more with clear choices, then offer human help.", "recovery", 580, 20, { question: "I didn’t understand that. Which option is closest?", answers: ["Show the choices again", "Ask another question", "Speak to a person", "Main menu"], width: 390, height: 235 }),
      node("human", "Human requested", "Preserve the conversation context when handing off.", "recovery", 580, 350, { question: "How would you like the Away team to help?", answers: ["Book a call", "Ask the team to contact me", "Keep using the assistant"], width: 390, height: 220 }),
      node("technical", "Calendar or email failure", "Explain the failure plainly; never imply success.", "recovery", 580, 680, { question: "That action didn’t complete. What would you like to do?", answers: ["Try again", "Continue without it", "Ask the Away team to contact me", "Main menu"], width: 390, height: 235 }),
      node("returning", "Returning visitor", "Restore known context, but let the visitor restart.", "recovery", 1130, 150, { question: "Welcome back. Would you like to continue where you left off?", answers: ["Continue", "Start again", "Main menu"], width: 390, height: 220 }),
      node("destinations", "Safe destinations", "Every recovery offers a useful next step and never dead-ends.", "outcome", 1690, 280, { question: "What would you like to do next?", answers: ["Continue this path", "Book a call", "Ask another question", "Return to the main menu", "Finish"], width: 400, height: 250 }),
    ],
    edges: [edge("input", "unknown", "Unexpected input"), edge("input", "human", "Human requested"), edge("input", "technical", "Calendar or email fails"), edge("input", "returning", "Returning visitor"), edge("unknown", "destinations"), edge("human", "destinations"), edge("technical", "destinations"), edge("returning", "destinations")],
  },
];

export const CHATBOT_FLOW_TABS = CHATBOT_FLOW_PATHS.map((path) => path.tab);
