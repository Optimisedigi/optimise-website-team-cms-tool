# Meeting Scheduler — Deployment Guide

## Feature Overview

Calendar coordination tool for scheduling meetings with multiple client contacts. Built 2026-03-31.

**Flow:** Create meeting scheduler in CMS admin → generate available slots from Google Calendar → send invite emails to attendees → each attendee picks days/times via a public link → system finds overlap → auto-books Google Calendar event.

## Pre-Deployment Checklist

### 1. Google Cloud Console Setup

Go to [Google Cloud Console](https://console.cloud.google.com) for the project that owns `GOOGLE_CLIENT_ID` (`953657115626-sh1b7ekl4j4on70bg9chvrs7qrmp3fap`).

**Enable the Calendar API:**
- APIs & Services → Library → search "Google Calendar API" → Enable

**Add Calendar scopes to OAuth consent screen:**
- APIs & Services → OAuth consent screen → Edit App → Scopes
- Add: `https://www.googleapis.com/auth/calendar.readonly`
- Add: `https://www.googleapis.com/auth/calendar.events`

### 2. Vercel Environment Variables

Add to Vercel project settings (Settings → Environment Variables):

```
CALENDAR_REDIRECT_URI=https://cms.optimisedigital.online/api/calendar/callback
```

The feature also uses these existing env vars (no changes needed):
- `GOOGLE_CLIENT_ID` — already set (shared with GSC/GA4/Sheets)
- `GOOGLE_CLIENT_SECRET` — already set
- `BREVO_API_KEY` — already set (for invite/confirmation emails)

Optional env vars (have sensible defaults):
- `SCHEDULE_FROM_EMAIL` — defaults to `meetings@optimisedigital.online`
- `AGENCY_NOTIFICATION_EMAIL` — defaults to `peter@optimisedigital.online` (receives no-match alerts)

### 3. Local .env Update

For local development, add:
```
CALENDAR_REDIRECT_URI=http://localhost:3004/api/calendar/callback
```

### 4. Deploy to Vercel

Push the code. After the deploy completes:

### 5. Run Migration (CRITICAL)

New tables must be created manually (Turso + push:false):

```bash
curl -X POST https://cms.optimisedigital.online/api/migrate \
  -H 'x-api-key: 7e6f15e0c9bf85ea430f691249d68fba91f93e483792dcd4'
```

This creates:
- `meeting_schedulers` — main table
- `meeting_schedulers_attendees` — attendee array sub-table
- `calendar_auth` — global for storing Google Calendar OAuth token
- `payload_locked_documents_rels` → `meeting_schedulers_id` column

**If you skip this, the Meeting Schedulers collection will show a blank page in admin.**

### 6. Regenerate Import Map

After deploy, if admin UI components don't render:

```bash
npx payload generate:importmap
```

Then manually re-add `VercelBlobClientUploadHandler` if it gets dropped (known bug).

### 7. Connect Google Calendar

1. Go to CMS admin → Settings → Google Calendar Auth
2. Click "Connect Google Calendar"
3. Authorize with the agency Google account (Peter's)
4. Verify it shows "Connected (email@...)"

## Post-Deploy Verification

1. Create a Meeting Scheduler (Clients → Meeting Schedulers → Create)
2. Fill in: title, client, date range, at least one attendee
3. Go to "Availability & Result" tab → click "Generate Available Slots"
4. Verify slot count matches your actual calendar availability
5. Go to "Actions" tab → click "Send Scheduling Invites"
6. Check attendee received the email with a `/schedule/[token]` link
7. Open the link — verify progressive day→time picker works
8. Submit availability — verify response is recorded in admin

## Files Created

```
src/globals/CalendarAuth.ts
src/lib/calendar-service.ts
src/lib/schedule-email.ts
src/collections/MeetingSchedulers.ts
src/components/ConnectCalendarButton.tsx
src/components/GenerateSlotsButton.tsx
src/components/SendScheduleInvitesButton.tsx
src/components/ScheduleResponseStatus.tsx
src/components/ScheduleResponseClient.tsx
src/app/(frontend)/api/calendar/connect/route.ts
src/app/(frontend)/api/calendar/callback/route.ts
src/app/(frontend)/api/meeting-schedulers/[id]/generate-slots/route.ts
src/app/(frontend)/api/meeting-schedulers/[id]/send-invites/route.ts
src/app/(frontend)/api/meeting-schedulers/respond/[token]/route.ts
src/app/(frontend)/schedule/[token]/page.tsx
src/migrations/20260401_120000_add_meeting_schedulers.ts
```

## Files Modified

```
src/payload.config.ts — registered MeetingSchedulers collection + CalendarAuth global
src/lib/activity-log.ts — added meeting_scheduled, meeting_confirmed types
src/migrations/index.ts — added migration entry
```

## Troubleshooting

**"Google Calendar not connected" error when generating slots:**
Go to Settings → Google Calendar Auth and connect the account first.

**Blank Meeting Schedulers page in admin:**
Migration hasn't run. Run the curl command from step 5.

**Attendee link shows 404:**
The meeting scheduler record may not have attendee tokens generated. Edit the record and save — the `beforeChange` hook generates tokens automatically.

**No emails arriving:**
Check `BREVO_API_KEY` is set. Check Brevo dashboard for bounces. The sender domain (`optimisedigital.online`) must be verified in Brevo.

**OAuth redirect mismatch:**
Ensure `CALENDAR_REDIRECT_URI` exactly matches the authorized redirect URI in Google Cloud Console. Must include the full path: `/api/calendar/callback`.
