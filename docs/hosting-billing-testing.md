# Driving hosting billing in dev (admin → client → Stripe)

How to run the feature yourself locally: issue an offer as an admin, then act as the client who receives the payment link, so you can refine the flow.

Stripe test mode only (`sk_test_…` in `.env.local`). A live key here would create real customers and subscriptions.

---

## Local state as of the last run

| Thing | Value |
| --- | --- |
| Test client | `Cipher Health (local test)` — clients id **8**, contact `stripe-test@example.test` |
| Global settings | currency `aud`, surcharge **1.75% + 30c**, notice **30 days** |
| Plan | `Care Plan — Standard` — monthly **9900c**, annual **106920c**, active |
| Client 8 | already has live test subscription `sub_1TxIYg…`, status `active`, renews `2026-08-26` |

So the config work is already done — you can go straight to issuing an offer. Expected client-facing totals with those numbers:

- Monthly: $99.00 + $2.07 surcharge = **$101.07/month**
- Annual: $1,069.20 + $19.35 surcharge = **$1,088.55/year**

---

## 1. Start the two processes

```bash
# terminal 1
npm run dev                       # http://localhost:3004

# terminal 2 — --api-key is REQUIRED. Without it the CLI uses its own login
# session, which points at a different Stripe account, and your events never arrive.
stripe listen --api-key "$STRIPE_SECRET_KEY" \
  --forward-to localhost:3004/api/stripe/webhook
```

If the `whsec_…` printed by `stripe listen` differs from `STRIPE_WEBHOOK_SECRET` in `.env.local`, update it and **restart `npm run dev`**. A stale secret fails signature checks and the client record silently never updates.

---

## 2. As the admin: issue the payment link

1. Log in at `http://localhost:3004/admin`.
2. Open the client → **Billing** tab → **Hosting subscription** panel.
   - Fresh run: use a **new** test client so you are not re-offering to one that already has a subscription. Give it a **contact email you can open** (Contacts & Managers → contact email) — the recipient field is read-only and mirrors it.
   - Reusing client 8 is fine for UI-only tweaks; just expect its existing subscription to still be there.
3. Set:
   - **Plan name** → `Care Plan — Standard` (auto-fills allowance + both fee fields), or **Custom plan** to type your own.
   - **Monthly fee** → dollars; annual auto-sets to `monthly × 12`. Need a discounted annual? Edit the plan in the global instead.
   - **Default billing option** → Monthly or Annual. This is only preselected; the client can switch on the payment page. The frequency they pay with is recorded on the client when Stripe confirms the subscription.
4. Click **Create hosting offer** → confirm. It saves the client first, then creates the offer.
5. Status line shows the expiry; click **Open client payment link** (or copy the URL).

**There is no offer email.** Nothing sends the link to the client — the admin copies it out of this panel and sends it manually. If you want emailed delivery, that's a feature gap to build, not a config toggle.

Each new offer **revokes** the previous one and closes its open Stripe page, so old links die immediately. It is refused while the client already has a live subscription (see section 9).

---

## 3. As the client: pay

Open the link in a **private/incognito window** — that's the real client experience (no CMS session, and it proves the token gate works).

You should see: client name, plan name, the allowance as a bulleted list, a Monthly/Annual choice (the admin's default preselected), hosting fee, card processing surcharge and total for the selected option, a debit notice, then the renewal + capacity clause.

1. **Continue to Stripe** → Stripe Checkout, showing one recurring line item: the plan name at the total (hosting + surcharge combined). Monthly shows a smaller pro-rata amount today, "then … per month starting on" the next 1st.
2. Pay with `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
3. Land on `/hosting-pay/success`.

Other client paths worth walking while refining:
- Cancel in Stripe → `/hosting-pay/cancel`; reopening the link with the same option resumes the **same** Stripe session. Picking the other option expires it and opens a new one.
- Reopen after paying → `410`, "already been used".
- Expired/revoked/garbage token → "Payment link unavailable".

---

## 4. Back as the admin: confirm write-back

Watch terminal 2 for `checkout.session.completed`, `customer.subscription.created`, `invoice.paid` — all `200`.

The stored fields are hidden in the admin UI, so read them via the API or SQLite:

```bash
sqlite3 -line content.db "select hosting_subscription_stripe_subscription_id,
  hosting_subscription_subscription_status, hosting_subscription_current_period_end,
  hosting_subscription_stripe_customer_id from clients where id=8;"

sqlite3 content.db "select id,client_id,status,expires_at from hosting_payment_offers order by id desc limit 5;"
```

Expect subscription id + `active` + a renewal date, and the offer flipping `checkout_pending` → `completed`.

> Note: offer **1** on client 8 is still `checkout_pending` even though its subscription is active — the offer only completes when `checkout.session.completed` carries `hostingOfferId` metadata. Worth confirming on your next run.

---

## 5. Reset between runs

Fastest clean slate: create another test client and issue a fresh offer. To reuse one instead, stop the dev server, then clear its hosting fields:

```bash
sqlite3 content.db "update clients set
  hosting_subscription_stripe_subscription_id=null,
  hosting_subscription_stripe_customer_id=null,
  hosting_subscription_stripe_hosting_item_id=null,
  hosting_subscription_stripe_surcharge_item_id=null,
  hosting_subscription_subscription_status=null,
  hosting_subscription_current_period_end=null,
  hosting_subscription_provider_event_id=null,
  hosting_subscription_provider_event_created_at=null,
  hosting_subscription_active_offer_id=null
  where id=8;"
```

Cancel the old subscription in the Stripe **test** dashboard so it stops generating invoices. Test-mode data is disposable otherwise.

---

## 6. Tweaking the config (global settings)

`/admin/globals/hosting-billing-settings` — Finance group, visible only to users with the `hosting-billing-settings` feature.

- **Billing**: `currency` (three lowercase ISO letters), `cardSurchargePercentage` (0–99.99), `cardSurchargeFixedCents`, `surchargeEffectiveFrom`, `minimumNoticeDays`. Surcharge is grossed up: `ceil((base + fixed) / (1 - pct/100)) - base`.
- **Hosting plans**: `name`, `description`, `includedAllowance` (shown to the client), `monthlyBaseCents`, `annualBaseCents`, `active`. Edits affect **future offers only** — issued offers and live subscriptions keep their snapshot, so re-issue an offer to see plan changes.
- **Client terms**: `capacityChangeClause` (rendered on the public page), `noticeEmailSubject`, `noticeEmailBody`. Supports `{{clientName}}`, `{{currentPrice}}`, `{{newPrice}}`, `{{effectiveDate}}`, `{{reason}}`.

Production surcharge values need finance/legal sign-off — keep dev numbers obviously fake.

---

## 7. Optional: price change + sweep

Only relevant once a subscription exists. Needs the `hosting-billing-settings` feature on your user.

```bash
# schedule — effectiveAt must EXACTLY equal the stored renewal date and clear the notice period
curl -s -X POST http://localhost:3004/api/clients/8/hosting-price-changes \
  -H 'Content-Type: application/json' -H "Cookie: payload-token=<admin-token>" \
  -d '{"effectiveAt":"2026-08-26T03:16:58.000Z","monthlyBaseCents":12900,"reason":"Storage above allowance"}'

# apply due changes (hourly cron in prod)
curl -s http://localhost:3004/api/hosting-subscriptions/sweep -H "x-api-key: $AUDIT_API_KEY"
```

The Brevo notice sends **before** anything is stored: if email fails you get `502` and no pending change. The sweep only applies changes that are `pending`, have `noticeSentAt`, and fall within 2 hours of `effectiveAt`. To test without waiting, shift `effectiveAt` to ~now directly in the local database: the admin UI and REST API can no longer edit `priceChanges` (see section 9).

Cancel a pending one: `POST /api/clients/8/hosting-price-changes/<changeId>/cancel`.

---

## 8. Stopping a subscription

On the client's **Billing** tab, the **Current subscription** block (shown once a subscription exists) has:

- **Stop at end of current period**: no further charges; hosting stays paid until the period ends. Reversible with **Undo scheduled stop**.
- **Stop payments immediately**: cancels now. Stripe does not refund automatically.

API: `POST /api/clients/8/hosting-subscription/stop` with `{"action":"end_of_period" | "immediately" | "undo"}` (needs the `hosting-billing-settings` feature, same as price changes; staff without it see the subscription but no stop buttons).

Billing follows the client's **Billing start date** (hosting panel; snapshotted on each offer). Renewals fall on that day each month, or that day and month each year, at 02:00 UTC (shorter months use their last day). Blank or today: charge at sign-up. Future: nothing charged until the start date (Stripe `billing_cycle_anchor`, or a trial ending on it when it is more than one period away, so Stripe shows `trialing`). Past: pro-rata now, renewals pinned to the start day via `billing_cycle_anchor_config`. Offers issued before 2026-10-02 have no start date and bill from sign-up. The client picks monthly or annual on the payment page; the admin interval is only the default, and an annual default makes the email show only the annual price.

To test a future start: set a start date ~2 weeks ahead, create an offer, pay with `4242 4242 4242 4242`, and confirm Stripe shows no charge today and the next invoice on the start date.

The stop endpoint accepts only `Content-Type: application/json` (`415` otherwise), so a form on another site cannot trigger it with a logged-in admin's cookie.

---

## 9. Double-charge and tampering guards

- **One live subscription per client.** "Create hosting offer" returns `409` while the client's subscription is live (any status except `canceled` / `incomplete_expired`). Stop it first, or use a price change.
- **Reissuing a link closes the old Stripe page.** The previous offer's open Checkout session is expired before the offer is revoked. If that session was just paid, or Stripe cannot be reached, the route returns `409` and keeps the old offer untouched.
- **Checkout fails closed.** If Stripe cannot be reached when looking up the existing session, the client gets `503` instead of a second checkout. Only a session Stripe reports as `resource_missing` is replaced. Checkout also returns `409` when the client already has a live subscription.
- **Simultaneous clicks open one session.** The Stripe request key is per checkout attempt, not per option, so a monthly and an annual request arriving together cannot both open sessions; the loser gets `409`.
- **Price changes follow the real frequency.** Scheduling reads monthly/annual from the Stripe subscription itself, and the webhook records it on the client. Item IDs from an ended subscription are never carried over to a new one.
- **Webhook never overwrites a live subscription.** If Stripe reports a different subscription while the recorded one is live, the client record is left unchanged and every admin gets a "Duplicate hosting subscription" bell notification. Cancel and refund the duplicate in Stripe. Its invoices are also ignored, so they can't mark the client as failed.
- **Offers are only marked paid for the client they belong to.**
- **Server-managed fields are locked.** Stripe IDs, subscription status and period, offer bookkeeping, and `priceChanges` can only be written by server routes. Staff edits through the admin or REST API are silently dropped and the saved value is kept. `hosting-payment-offers` records are read-only for everyone (create/update only via the offer and checkout routes). Plan, fees, recipient and default interval stay editable.

---

## Known gaps to refine

- No email delivery of the payment link (admin copies it manually).
- Offer status can stay `checkout_pending` after a successful payment — see §4.
- Per `DESIGN.md`, keyboard, screen-reader, 200% text, forced-colors, reduced-motion and cross-browser passes on `/hosting-pay/[token]` have **not** been done.

Quick maths sanity check any time: `npx vitest run tests/hosting-billing.test.ts` (7 tests).
