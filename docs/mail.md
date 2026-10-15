# Mail (Gmail in the CMS)

A minimal Gmail client at **/admin/mail** (sidebar: **Mail**, above Clients), plus an **Emails** tab on every client profile.

## Rules it follows

- **Least access for the model.** The model is called only from three buttons: *Write with AI* (reply or new draft) and *Summarise to timeline*. Every call goes through `buildMailModelRequest()` (`src/lib/mail/model-request.ts`), which accepts at most one email and rejects lists. For a reply, the server fetches only the selected message by id. A new draft sends no email at all.
- **Nothing is sent without Send.** AI output lands in the compose window (Gmail-style, bottom right), where you can edit it or keep prompting ("shorter", "more formal") until it is right. `/api/mail/send` is only called by the Send button.
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

## Storage and sync

- `client-emails` holds one row per Gmail message id (unique index, plus a find-before-create), with the message id, thread id, from, to, cc, subject, date, body and Gmail link. Re-syncs never duplicate.
- `client-email-summaries` holds confirmed summaries, each linked to its source email. A row is created only when you click **Add to timeline**.
- `mail-sync-states` holds a per-user Gmail `historyId`. Sync runs when Mail opens, on **Refresh**, and daily from the `/api/mail/sync/cron` Vercel cron (03:30 UTC) for every mailbox that has opened Mail once and still has the Mail feature. The first sync, or one after Gmail expires the history, looks back 14 days (up to 200 messages). After that it uses Gmail's incremental history API. One sync reads at most about 500 new messages; when there are more, the cursor stops at the last one read and the next sync carries on, so nothing is skipped.
- **Not stored:** emails that match no client, emails from your hidden senders, and automated mail (`src/lib/mail/automated-senders.ts`): no-reply / notification style senders, or emails with Auto-Submitted, Precedence bulk/list/junk, List-Id or List-Unsubscribe headers. Assign one by hand if you do want it kept.
- **Cleanup:** Mail → **Hidden** → **Check stored emails** counts stored rows from your own mailbox that are from hidden senders or automated, and deletes them only after you confirm (`/api/mail/cleanup`).
- **Retention:** the daily cron deletes stored emails dated more than 12 months ago.
- **Always kept:** cleanup and retention never delete emails assigned by hand or summarised to a timeline. Gmail itself is never changed.
- Unmatched mail is not stored. It stays in Gmail and shows in the Mail inbox.

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

## Behaviour notes

- Opening an unread thread marks it read, as Gmail does. **Mark unread** undoes that.
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
