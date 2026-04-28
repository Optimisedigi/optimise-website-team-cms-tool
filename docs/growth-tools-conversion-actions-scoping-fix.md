# Growth Tools Fix Spec — Scope `availableConversionActions` to the Operating Customer

**Status:** Bug confirmed in production (28 April 2026).
**Affected endpoint:** `GET /api/google-ads/dashboard/{slug}` (and any other endpoints that return `availableConversionActions`).
**Severity:** High — surfaces conversion actions from other MCC clients in a given client's dashboard, leaks data across accounts, and makes the conversion-action filter unusable.

---

## Summary

Growth Tools' Google Ads dashboard endpoint accepts a `customerId` query parameter and correctly uses it for metric queries (`kpis`, `monthlyTrend`, `campaignBreakdown`, etc.). However, the **`availableConversionActions`** field it returns is **not scoped to that `customerId`** — it returns conversion actions from across the entire MCC (every child account the MCC has access to).

The fix is to ensure the `conversion_action` GAQL query uses the request's `customerId` as the **operating customer** (the account whose data is being queried), not the MCC manager / `login-customer-id`.

---

## Reproduction (already done)

Probe script in CMS repo: `scripts/probe-conversion-actions.ts`.

**Run:**
```bash
node --env-file=.env --import tsx scripts/probe-conversion-actions.ts berendsen-client
```

**What the CMS sends to Growth Tools:**
```
GET https://website-growth-tools-production.up.railway.app/api/google-ads/dashboard/berendsen-client
    ?range=this_month
    &customerId=8230563869
    &clientName=Berendsen
    &brandKeywords=Berendsen%0Afluid+power%0A

Headers:
  x-internal-key: <set>
```

**What Growth Tools returned (relevant excerpt):**
```json
{
  "customerId": "8230563869",
  "availableConversionActions": [
    "Darwin Irrigation - GA4 (web) click___email",
    "Darwin Irrigation - GA4 (web) completed_purchase",
    "Form - Stalker Pumps (https://www.mtp.com.au/)",
    "https://www.pacifichydraulics.com.au/ - GA4 (web) mailto_click",
    "https://www.thehydraulicwarehouse.com.au - GA4 (web) purchase",
    "www.ozpump.com.au - GA4 (web) click___email",
    "Mackay Tracking (www.berendsen.com.au)",
    "Sydney Tracking (www.berendsen.com.au)",
    "...83 actions total"
  ]
}
```

The `customerId` Berendsen uses is `8230563869`. The response correctly **echoes** that customerId, so Growth Tools is receiving the parameter — it's just not applying it to the `conversion_action` query.

The leaked actions visibly belong to other MCC clients:
- **Water Dynamics / Darwin Irrigation** — `Darwin Irrigation - GA4 (web) ...`, `Water Dynamics - GA4 (web) ...`, `01 - Reporting - Water Dynamics`
- **Malcolm Thompson Pumps** — `Form - Stalker Pumps (mtp.com.au)`, `Pump Installation - Malcolm Thompson Pumps`, `Wholesale Enquiry Form (mtp.com.au)`, `Request a Quote (mtp.com.au)`
- **EPG Engines** — `Enquiry (www.epgengines.com.au)`, `Warranty Claim Form (www.epgengines.com.au)`, `http://www.epgengines.com.au - GA4 ...`
- **Pacific Hydraulics** — `https://www.pacifichydraulics.com.au/ - GA4 ...`, `Mailto Click`, `PDF Download`, `Phone Call Tracking`, `Product Enquiry`
- **The Hydraulic Warehouse** — `https://www.thehydraulicwarehouse.com.au - GA4 ...`, `New Account Enquiries`, `Thank you Goal`
- **Ozpump** — `www.ozpump.com.au - GA4 ...`, `Form - Contact Us (www.ozpump.com.au)`, `Form - Enquire Now (www.ozpump.com.au)`

Berendsen's own actions are present too (`Mackay Tracking`, `Sydney Tracking`, `Newcastle Tracking`, `Perth Tracking`, `Townsville Tracking`, `https://berendsen.com.au - GA4 (web) form_submit`), but they're mixed in with everything else in the MCC.

**Total returned for Berendsen:** 83 conversion actions across at least 7 different client accounts.
**Expected:** ~5–10 conversion actions, only those tied to customer `8230563869`.

---

## Root Cause (best guess based on the symptom)

Most likely one of these two patterns:

### Pattern A — Wrong operating customer

The `conversion_action` query is being run with the **MCC's customer ID** as the operating customer, e.g.:

```ts
// BUG: queries the manager account, which exposes
// all conversion actions visible to the MCC.
const customer = client.Customer({ customer_id: MCC_CUSTOMER_ID, login_customer_id: MCC_CUSTOMER_ID });
const actions = await customer.query(`SELECT conversion_action.name FROM conversion_action`);
```

In this case the query runs against the manager and returns conversion actions across the manager hierarchy.

### Pattern B — Joining `customer_client` without filtering

The query is something like:

```sql
SELECT conversion_action.name, customer_client.id
FROM customer_client
WHERE customer_client.manager = false
```

…which returns every conversion action across every child of the MCC.

### What it should be

The query needs to run with the **child `customerId`** (the value passed in via the request) as the **operating customer** — the same way `kpis`, `monthlyTrend`, etc. are clearly already doing it (those metrics come back correct).

```ts
const customer = client.Customer({
  customer_id: requestCustomerId,        // <-- 8230563869 for Berendsen
  login_customer_id: MCC_CUSTOMER_ID,    // MCC stays as login customer for auth
});

const rows = await customer.query(`
  SELECT
    conversion_action.id,
    conversion_action.name,
    conversion_action.status,
    conversion_action.primary_for_goal
  FROM conversion_action
  WHERE conversion_action.status = 'ENABLED'
`);

const availableConversionActions = rows.map(r => r.conversion_action.name);
```

This will return only the conversion actions defined on customer `8230563869` (Berendsen).

---

## Required Changes

### 1. Endpoint — `GET /api/google-ads/dashboard/{slug}`

The handler must:

1. Read `customerId` from the query string (already does this — it's used for KPI queries).
2. Use that `customerId` as the **operating customer** for the `conversion_action` GAQL query.
3. Keep the MCC ID as `login_customer_id` only (for auth context).
4. Return `availableConversionActions` containing **only** actions from that operating customer.

### 2. Endpoint — `POST /api/google-ads/campaign-budgets/list`

Same fix needs to apply here (and to any other endpoint that returns conversion-action lists or filters by them). The CMS will start sending `conversionActions` filters into this endpoint shortly — see `docs/growth-tools-google-ads-budget-extensions.md`. The list of available actions returned in the budget response (and the filtering Growth Tools applies internally) must also be scoped to the request's `customerId`.

The same fix likely applies to:
- `GET /api/google-ads/dashboard/{slug}/quality-scores` (if it returns or filters by conversion actions)
- Any internal helper / shared function used to load conversion actions for a customer

### 3. Audit other places where conversion actions are loaded

Search the Growth Tools codebase for `conversion_action` and verify every call site uses the request-scoped `customerId`, not the MCC ID, as the operating customer.

---

## Verification

After deploying the fix, re-run the probe from the CMS repo:

```bash
node --env-file=.env --import tsx scripts/probe-conversion-actions.ts berendsen-client
```

**Expected output (STEP 3):** A short list (single-digit to low-double-digit) of conversion actions, every one of which clearly relates to Berendsen's own websites/properties. No `mtp.com.au`, `pacifichydraulics.com.au`, `ozpump.com.au`, `thehydraulicwarehouse.com.au`, `epgengines.com.au`, `Darwin Irrigation`, or `Water Dynamics` actions should appear.

Run it for each of the four production clients to confirm:

| Slug                | customerId   | Expected conversion-action domains |
|---------------------|--------------|-------------------------------------|
| `berendsen-client`  | `8230563869` | berendsen.com.au only               |
| `mtp-client`        | `1840834992` | mtp.com.au only                     |
| `profiterole`       | `1613038647` | profiterolepatisserie.com.au only   |
| `optimise-digital`  | `6591013898` | optimisedigital.com.au only         |

If any client's returned list contains another client's conversion actions, the fix isn't complete.

---

## Why this also matters for the Budget Management bug

Separately, the CMS Budget Management tab is showing **0 conversions** for all campaigns. Once `availableConversionActions` is properly scoped per-customer, the CMS will be able to wire the existing `client.dashboardConversionActions` setting through to `/api/google-ads/campaign-budgets/list` so Growth Tools can sum conversions filtered to those actions. Without scoping, the CMS can't safely send a filter (the dropdown would show every other client's actions, defeating the purpose).

So this fix is a **prerequisite** for resolving the "0 conversions in Budget Management" issue end-to-end.

---

## Contact

CMS-side reproduction script and evidence: `content-cms` repo, `scripts/probe-conversion-actions.ts`.

CMS handler that calls this endpoint:
- `src/app/(frontend)/google-dashboard/[slug]/page.tsx` (server-side initial fetch)
- `src/app/(frontend)/api/dashboard/data/route.ts` (client-side range/filter changes)
