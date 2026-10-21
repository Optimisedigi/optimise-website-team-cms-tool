# Mail (Gmail in the CMS)

A minimal Gmail client at **/admin/mail** (sidebar: **Mail**, above Clients), plus an **Emails** tab on every client profile.

## Rules it follows

- **Least access for the model.** The model is called only from three buttons: *Write with AI* (reply or new draft) and *Summarise to timeline*. Every call goes through `buildMailModelRequest()` (`src/lib/mail/model-request.ts`), which accepts at most one email and rejects lists. For a reply, the server fetches only the selected message by id. A new draft sends no email at all.
- **Nothing is sent without Send.** AI output lands in the compose window (Gmail-style, bottom right), where you can edit it or keep prompting ("shorter", "more formal") until it is right. `/api/mail/send` is only called by the Send button.
- **Voice drafting can't send either.** The mic next to *Write with AI* opens a GPT Realtime 2.1 call (`mode: 'mail'` on `/api/optimate/realtime-secret`). You talk the email through; the agent turns it into a clear instruction and runs the same *Write with AI* request itself, keeps revising as you talk, and reads the draft back when asked (including your own edits). Its only two tools, `write_email_draft` and `read_current_draft` (`src/lib/mail/voice-draft.ts`), run in the browser against the compose window; there is no send, schedule or Gmail tool. The new body autosaves to Drafts like typing does.
- **Same writing style as GmailMate.** Reply and draft prompts load the OptiMate Soul rules for "Email drafting" + "All" (OptiMate Settings → OptiMate Soul), soul only, never pinned account facts, and use the OptiMate **Email Assistant model** (falling back to the autonomous default). Summaries don't use soul.
- **Whole thread is opt-in.** In a reply, ticking **Use whole thread** also sends the earlier messages of that same thread (loaded server-side from the selected email's own thread id, newest 15 messages, about 40k characters max). It is off by default and applies per request; the AI log's email count shows how many emails were sent.
- **Refining keeps the one-email rule.** Each refine sends the earlier prompts and drafts plus the current (edited) draft. That is the user's own text; the only mailbox content is still the one email being replied to, fetched server-side by id.
- **Code does the sorting.** Matching, storing, listing and syncing are plain code (`src/lib/mail/client-matching.ts`, `src/lib/mail/store.ts`). The sync route never calls a model.
- **Every model call is logged** in *Admin → Mail AI Requests*: action, the single Gmail id, `emailCount` (always 0 or 1), model and status. Email content is never logged.
- **Prompts live in one place:** `src/lib/mail/prompts.ts`.

## Client matching

A message is linked to a client when an address on it resolves to that client. Addresses are tried in order: From, then To, then Cc.

- **Client domains** are the client's *Website URL* (with `www.` stripped) plus the domains of the main contact email and the additional contacts. Several domains per client works by adding a contact on each domain.
- **Exact domain.** `jo@inthepicture.com.au` matches `inthepicture.com.au`. `notinthepicture.com.au` does not.
- **Subdomains roll up.** `x@mail.inthepicture.com.au` matches `inthepicture.com.au`. The most specific client domain wins (`shop.bigbrand.com.au` beats `bigbrand.com.au`).
- **Shared providers** (gmail.com, outlook.com, bigpond.com and so on) are never a client domain. Contacts on them match by exact address only.
- **Our own addresses** (the connected mailbox's domain and optimisedigital.online) are ignored, so sent mail matches on its recipients.
- **Ties:** if two clients claim a domain, an active client beats an inactive one. If it's still tied, the email stays unmatched and can be assigned by hand from the reading pane.
- **Your own choice wins.** On an open email, **Client: <name> ▾** sets which client that sender's emails go to, for the address or the whole `@domain`, or *No client*, or back to *Automatic*. It decides the list pill, which client new emails are saved to and *Use client data*. Choosing a client also moves that sender's already-stored, automatically filed emails to it (emails assigned by hand or summarised stay put). Choices are per user, in Payload preferences under `mail-sender-clients` (`src/lib/mail/sender-clients.ts`); **★ Clients** lists them.

## Storage and sync

- `client-emails` holds one row per Gmail message id (unique index, plus a find-before-create), with the message id, thread id, from, to, cc, subject, date, body and Gmail link. Re-syncs never duplicate.
- `client-email-summaries` holds confirmed summaries, each linked to its source email. A row is created only when you click **Add to timeline**.
- `mail-sync-states` holds a per-user Gmail `historyId`. Sync runs when Mail opens, on **Refresh**, and daily from the `/api/mail/sync/cron` Vercel cron (03:30 UTC) for every mailbox that has opened Mail once and still has the Mail feature. The first sync, or one after Gmail expires the history, looks back 14 days (up to 200 messages). After that it uses Gmail's incremental history API. One sync reads at most about 500 new messages; when there are more, the cursor stops at the last one read and the next sync carries on, so nothing is skipped.
- **Not stored:** emails that match no client, emails from your hidden senders, and automated mail (`src/lib/mail/automated-senders.ts`): no-reply / notification style senders, or emails with Auto-Submitted, Precedence bulk/list/junk, List-Id or List-Unsubscribe headers. Assign one by hand if you do want it kept.
- **Cleanup:** Mail → **Hidden** → **Check stored emails** counts stored rows from your own mailbox that are from hidden senders or automated, and deletes them only after you confirm (`/api/mail/cleanup`).
- **Retention:** the daily cron deletes stored emails dated more than 12 months ago.
- **Always kept:** cleanup and retention never delete emails assigned by hand or summarised to a timeline. Gmail itself is never changed.
- Unmatched mail is not stored. It stays in Gmail and shows in the Mail inbox.

## Gmail accounts

Mail shows one Gmail account at a time. The breadcrumb reads *Home / Mail / <email>*, and the email is the account switcher: it lists your main Gmail (the one on your user record, also used by OptiMate and scheduled agent tasks) and any extra accounts, and **+ Add another Gmail account** runs Google sign-in (`/api/gmail/connect?add=1`, account picker shown) and saves the new address to `mail-accounts`. Picking your main address there just reconnects it. **✕** removes an extra account from Mail (Gmail is not changed).

- Every Mail request names the account on screen in the `x-mail-account` header; the server only resolves it against your own accounts (`getValidGmailToken(userId, account)`), and no header means the main Gmail, so OptiMate and crons are unchanged.
- A compose window keeps the account it was opened in, even if you switch while writing.
- Each extra account syncs client emails on its own cursor (on its `mail-accounts` row) when Mail opens it, on Refresh and in the daily cron; its alerts open Mail on that account (`?account=`).
- Scheduled emails and follow-up reminders record their account and are sent/checked from it; the Scheduled and Awaiting reply tabs show the account on screen. If an extra account is removed, its scheduled emails fail instead of going out from another account.
- Migration `20261022_120000_mail_accounts` (also in `runMigrations()`) adds the `mail_accounts` table and an `account` column on `scheduled_emails` and `mail_follow_ups`. Additive only.

## Setup

1. **Reconnect Gmail once.** The `gmail.modify` scope was added so Archive and read/unread work. Until you reconnect, those buttons (and anything else Gmail refuses) show a *Reconnect Gmail* button, which links to `/api/gmail/connect`.
2. **Database.** Local `file:` databases pick up the four new tables automatically through Payload push. Production gets them from migration `20261014_150000_mail_client_emails` (also run by `runMigrations()`) via `POST /api/migrate` after deploy. The change is additive only: no existing table or client data is changed.
3. **Access.** Admins have Mail automatically. Other users need the **Mail** (`nav:mail`) feature ticked on their user record. Non-admins only see emails synced from their own mailbox.

## Client email alerts ("Client email – please read")

A slide-up on every admin page tells you when a known client has emailed you, without opening Gmail.

- **What triggers it.** A sync that stores a *new inbound* email from a matched client (same matching, hidden-sender and automated-mail rules as above). Sent mail, unmatched mail, and mail from hidden or automated senders never alert. Code: `src/lib/mail/client-email-alerts.ts`, called from `syncMailbox`.
- **Who sees it.** Only the person whose mailbox received the email. Each alert is a `notifications` row (kind `client-email-received`) for that user, so it also shows in the top-bar bell.
- **Noise limits.** No alerts on the first 14-day sync or a history-expired re-sync, none for emails older than 24 hours, at most 5 per sync (newest first), and one per Gmail message, ever.
- **Where it shows.** Bottom-right, just above the OptiMate button. When the OptiMate panel is open it moves to the left of the panel (hidden on narrow screens). A new alert opens fully for about 20 seconds, then shrinks to a small chip that stays until you act on it. Click the chip to expand it again.
- **Actions.** **Open email** opens the thread in Mail (`/admin/mail?thread=<id>`). **Dismiss** (or ×) marks it read on the server, so it never comes back in any tab. **Dismiss all** appears when more than one is waiting.
- **How it checks.** `ClientEmailAlert` (mounted by `OptiMateLauncher`) calls `GET /api/mail/client-alerts?sync=1` every 60 seconds while the tab is visible. The route runs the normal incremental sync for your own mailbox at most once every ~55 seconds (across all your tabs), then returns your undismissed alerts. A sync error never breaks the panel. Users without Mail access or without Gmail connected see nothing.
- **Setup.** None beyond Mail itself: Gmail connected and the Mail feature. No new tables or migration: the notification kind is a new select value on an existing text column.

## Client senders and the dashboard panel ("Unread client emails")

The dashboard shows a small **Unread client emails** panel under *GA4 Sessions by Channel*. It lists unread inbox emails from clients: any sender that [client matching](#client-matching) resolves to a client (Website URL domain, contact domains, or an exact contact address on a shared provider), plus senders you starred as clients.

- **Starring.** In Mail, open an email and click **☆ Mark as client**. For a company domain you choose the address or the whole `@domain` (subdomains included), like Hide sender. **★ Client** shows it is starred; click it to unstar. **★ Clients** in the toolbar lists, adds and removes entries. Starred senders get a ★ in the inbox list.
- **Storage.** Same as hidden senders: Payload per-user preferences, key `mail-client-senders` (`src/lib/mail/client-senders.ts`). Per user, no schema change or migration, nothing changed in Gmail. Starring adds senders that automatic client matching doesn't cover (e.g. a client's personal Gmail that isn't a contact).
- **Filtering.** `GET /api/mail/client-unread` searches your own inbox for `is:unread` mail from every client domain/contact address and starred sender (split into several searches of at most 1,500 characters when there are many clients), then re-checks every thread in code: unread, and the sender's actual address is starred or resolves to a client. Auto-matched senders on your hidden list and no-reply style senders are skipped; a starred sender shows even if it is also hidden. With no client senders at all Gmail is not queried. At most 8 rows are returned, newest first; the panel links to Mail when there are more.
- **States.** Loading, an error with Retry, **Connect Gmail** when Gmail isn't connected, a prompt to add a client Website URL or star a sender when there are no client senders at all, and *No unread emails from clients* when nothing matches. Users without the Mail feature don't see the panel. Rows open the thread in Mail (`/admin/mail?thread=<id>`), which marks it read.

## Behaviour notes

- **Unread first, always.** The inbox lists every unread thread before any read one: `/api/mail/inbox` pages through `is:unread` first, then carries on with `-is:unread` in the same page once they run out, so an old unread email never hides on a later page. (A thread you just read stays where it is until the list reloads.)
- **45 emails per page.** Each page of the list holds 45 threads before *Load more* (`MAIL_LIST_PAGE_SIZE`). Gmail pages count messages, and a search can return one thread several times, so the route tops up a short page with up to 4 Gmail requests.
- The search box sits at the top of the email list, above the first email.
- Opening an unread thread marks it read, as Gmail does. **Mark unread** undoes that.
- **Notes in their email.** Replying from an open email, **•••** under your reply shows the email you're replying to in its own editor, so you can type notes (in colour, with the formatting bar) straight into it. It's sent after your reply as a Gmail-style *On …, … wrote:* quote, with your signature below. *Write with AI* and voice only rewrite your reply above it. Hide it again to leave it out.
- **Remind me if no reply** is *Off* unless you choose a number of business days for that email.
- Threads show the newest message first.
- **Reply with AI** replies to the latest message in the thread. Each message also has *Reply to this email*.
- **Save as draft** uses the existing `/api/gmail/draft` route (with `html`, so it keeps formatting, images and files) and updates the same draft on later saves.
- **Rich body.** The compose body is a Lexical editor (`src/components/mail/RichEmailEditor.tsx`). Cmd/Ctrl+B, I and U format text (shortcut keys only, no buttons). Pasted tables from Sheets, Excel, Docs or web pages are kept, and **Insert table** adds an empty one. Pasted or inserted images show inline and are sent as `cid:` inline parts (`src/lib/mail/compose-html.ts`). Pasted non-image files and **Attach files** become attachments. Images and attachments are capped at 3 MB in total per email, because the request body carries them and Vercel limits it to 4.5 MB. The server re-checks everything in `src/lib/mail/compose-content.ts`: it sanitises the HTML, allows only `cid:` or https images, sniffs image bytes, and blocks the file types Gmail blocks.
- **AI revisions** get the body as markdown-lite (tables included) and replace it with the new text, so images and bold/italic/underline in the body are dropped by a revision. Attachments stay.
- **Signature.** Your Gmail signature is previewed under the body and appended by the server on Send / Save as draft.
- **OptiMate drafts open here.** Gmail draft links in OptiMate/GmailMate point to `/admin/mail?draft=<message id>`, which loads the draft (HTML, inline images, attachments; 3 MB max) into the compose window. Sending it deletes the old Gmail draft.
- **Archive** only removes the Inbox label. Nothing is ever deleted, and there are no bulk actions.

## Tests

`tests/lib/mail/`: domain matching, dedupe and re-sync, and model isolation (only the selected email reaches the model, one log row per call, no model call during sync). Also: hidden/automated skipping, the 500-message resume cursor, cleanup and retention (`cleanup.test.ts`), and compose validation.
