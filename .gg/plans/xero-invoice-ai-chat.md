# Xero Invoice AI Chat — CMS Invoices Tab

## Problem
Currently, to create/schedule/send invoices, you have to go through the Growth Tools terminal and type API requests manually. If you're on mobile and your computer is off, you can't do anything. You want a simple chat box on the CMS Invoices page where you can type (or speak) natural language like "Create an invoice for Malcolm Thompson Pumps for this month's retainer" and it just works.

## Solution
Add an AI chat panel to the existing `XeroInvoicesPage` component in the CMS. The chat uses Kimi (Moonshot AI) function calling — the user types a message, Kimi decides which Xero action to take, the server executes it against Growth Tools, and returns the result.

### Architecture

```
User (CMS Invoices page)
  ↓ POST /api/xero/chat  { message, history }
  ↓
CMS API route (src/app/(frontend)/api/xero/chat/route.ts)
  → Authenticates via Payload (admin only)
  → Calls Kimi (OpenAI-compatible chat/completions) with tools + user message
  → When Kimi returns finish_reason="tool_calls":
      → Proxies the call to Growth Tools (GROWTH_TOOLS_URL + INTERNAL_API_KEY)
      → Sends the function result back to Kimi as role=tool messages
      → Returns Kimi's final text response
  ↓
User sees: "✅ Created draft invoice INV-0042 for Malcolm Thompson Pumps — $1,350 for April retainer. Schedule it to send on a specific date?"
```

### Why all logic lives in the CMS API route (not Growth Tools)
- Growth Tools already has all the Xero REST endpoints we need
- The CMS route just orchestrates: receive message → Kimi → function call → proxy to Growth Tools → Kimi → respond
- No new Growth Tools code needed
- Auth is handled by Payload (admin user session) — works from mobile browser
- Falls back gracefully: if Growth Tools is down, the chat says so

### Why Kimi
- Already set up: `KIMI_API_KEY`, `KIMI_BASE_URL`, `KIMI_MODEL` env vars exist in Vercel and Railway
- Already used in the CMS for blog prompt generation (`src/app/(frontend)/api/blog-posts/generate-prompt/route.ts`)
- Uses OpenAI-compatible `chat/completions` API — no new SDK needed, just `fetch()`
- Fully supports `tools` / `tool_calls` (OpenAI function calling format)
- No extra dependency — reuses the same pattern as the existing Kimi integration

### Available Xero tools for Kimi

| Function | Growth Tools endpoint | Purpose |
|----------|----------------------|---------|
| `listContacts` | GET /api/xero/contacts | Search/list Xero contacts |
| `listInvoices` | GET /api/xero/invoices | List invoices with filters |
| `getInvoiceSummary` | GET /api/xero/invoices/summary | Get outstanding/overdue summary |
| `createInvoice` | POST /api/xero/invoices | Create a new invoice |
| `approveInvoice` | POST /api/xero/invoices/:id/approve | Approve a draft |
| `sendInvoice` | POST /api/xero/invoices/:id/send | Approve (if draft) + send |
| `scheduleSend` | POST /api/xero/invoices/:id/schedule-send | Schedule for future date |
| `getScheduledSends` | GET /api/xero/scheduled-sends | List scheduled sends |

### Connectivity
- **Primary:** CMS → Growth Tools via `GROWTH_TOOLS_URL` + `INTERNAL_API_KEY` (works when Growth Tools is running on Railway — always on)
- The CMS is deployed on Vercel, Growth Tools on Railway — no dependency on your local machine being on

## Files to change

### CMS (content-cms)
- `src/app/(frontend)/api/xero/chat/route.ts` — **NEW** — AI chat API route with Kimi function calling
- `src/components/XeroInvoicesPage.tsx` — Add chat panel UI below the existing tables
- `src/components/XeroInvoiceChat.css` — **NEW** — Styles for the chat panel

### Growth Tools
- No changes needed — all existing endpoints are sufficient

## Steps

1. Create `src/app/(frontend)/api/xero/chat/route.ts` in the CMS. This POST route: authenticates via `payload.auth()`, takes `{ message: string, history: Array<{role, content}> }` from the body, reads `KIMI_API_KEY` / `KIMI_BASE_URL` / `KIMI_MODEL` from env (same pattern as `generate-prompt/route.ts`), defines 8 tools in the OpenAI `tools` format (type: "function", function: { name, description, parameters }) for listContacts, listInvoices, getInvoiceSummary, createInvoice, approveInvoice, sendInvoice, scheduleSend, getScheduledSends, sets a system message telling Kimi it's an invoice assistant for Optimise Digital that can create/send/schedule Xero invoices and should confirm destructive actions before executing, calls `fetch(KIMI_BASE_URL + '/chat/completions')` with the tools and conversation history, then enters a loop: if the response has `finish_reason === "tool_calls"`, execute each tool_call by proxying to the corresponding Growth Tools endpoint (using `GROWTH_TOOLS_URL` + `INTERNAL_API_KEY` header), collect results, append the assistant message (with tool_calls) and tool results (role: "tool", tool_call_id, content) to messages, call Kimi again, and repeat until Kimi returns a text response (max 5 iterations to prevent infinite loops). Return `{ reply: string, actions: Array<{tool, result}> }`.

2. Create `src/components/XeroInvoiceChat.css` with styles for the chat panel: a collapsible card container at the bottom of the page, a scrollable message area with user/assistant message bubbles (user right-aligned in blue, assistant left-aligned in gray), an input bar at the bottom with a text input, send button, and a loading indicator, mobile-responsive (full-width on small screens). Use the existing `var(--theme-elevation-*)` CSS variables for theme consistency.

3. Add an `InvoiceChatPanel` component to `src/components/XeroInvoicesPage.tsx`. Place it after the Scheduled Sends card. The component has: a collapsed/expanded toggle (collapsed by default, shows "💬 Invoice Assistant" header with expand button), a scrollable messages area, a text input with send button, loading state while waiting for the AI response. On send, POST to `/api/xero/chat` with the message and conversation history, append the assistant's reply to the messages list. After any action that modifies invoices (create/send/schedule), call `fetchData()` to refresh the invoice tables. Include a "clear chat" button in the header.

4. Run `npx tsc --noEmit` in the CMS to verify no type errors, then `npm test` to check tests pass.
