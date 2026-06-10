# Google Ads API Access Application

This is Optimise Digital's application for a standard Google Ads developer token. We are applying as a standard (not MCC level) holder. The token will only ever be used against Google Ads accounts where the account owner has given us manager link access to `peter@optimisedigital.online`.

## Company name

Optimise Digital. Our site is `optimisedigital.online`.

## Business model

Optimise Digital is an Australian digital marketing agency. We run Google Ads for our clients, who are mostly small to mid sized e commerce and lead generation businesses.

We are an agency, not a business advertising our own products. Every Google Ads account we touch belongs to a client, and access is granted to us through a Google Ads manager link.

We do not resell Google Ads management through our tool and we do not give external agencies access. Only Optimise Digital staff and contractors use the tool, and only to deliver paid media work for our own clients.

## Tool access and use

The tool is our internal content and campaign management system (the CMS), built on Payload CMS and Next.js and hosted at `cms.optimisedigital.online`. It has two surfaces.

The admin surface is for internal use. Staff and contractors use it every day to pull Google Ads performance data, run audits, draft and deploy ad copy, manage negative keyword lists, watch budgets, and review or approve actions that our autonomous agent (OptiMate) proposes.

The client surface is a set of public pages gated by a 4 digit PIN and a per page expiry. We share these for specific workflows:

- Proposals, the campaign plan we send before engagement
- Audit reports, the full account audit we deliver after a deep dive
- Ad Copy preview, generated RSA copy for the client to review and approve before we deploy it
- Negative Keyword List review, proposed negatives with per keyword comments and a submit approval action

Clients never log in. They only see the report or workflow the link points to. We do not expose bulk advertiser data externally.

A scheduled job runs hourly and a second runs twice a day. These sync Google Ads performance data into our database, sync inventory driven changes like budgets and status, and run OptiMate monitoring. Clients that opt in to `auto_apply` mode let OptiMate push approved changes back to Google Ads.

## Tool design

The CMS syncs into our own database and serves reports from there.

The read path is scheduled jobs calling the Google Ads API through `GoogleAdsService.Search` and `SearchStream`. They pull account structure, performance at campaign, ad group, and ad level, quality score, spend, conversion data, search terms, and assets. Results land in our own database (Turso on libSQL).

The write path is what happens when a user takes an action in the admin, like deploying ad copy, adding a negative keyword, changing a budget, pausing a campaign, or approving an OptiMate recommendation. The CMS calls the Google Ads API to apply the change. A small set of actions also happen automatically based on per client rules, for example pausing ads tied to out of stock SKUs.

The reporting UI is what everyone actually sees. Dashboards, audits, and PIN gated client reports all read from our own database, so reports are fast, historical, and stable. They cover configurable date ranges, break down by campaign, ad group, ad, keyword, device, and geo, split brand from non brand spend, and show quality score trends.

The ad copy workflow generates RSA copy per ad group using our prompt templates, lets the team edit it, and shares a PIN gated preview with the client. On approval the CMS deploys the approved RSA into the matching ad group through the Google Ads API and records the deployment status.

The negative keyword workflow analyses recent search terms, surfaces candidate negatives, lets the team curate the list, shares a PIN gated review page with the client, and on approval pushes the final list to the right ad groups and campaigns.

OptiMate is our autonomous agent. It runs twice a day, reads performance, and flags things like CPA spikes, CTR drops, budget pacing issues, low quality score, and search term bleed. The default is `review_first`, which surfaces recommendations for a human to act on. Clients that opt in can run `auto_apply`, which lets OptiMate apply changes directly. Every action is logged in the activity log.

No one outside Optimise Digital can issue requests to the Google Ads API through the tool. The CMS is not a self serve platform.

## API services called

The CMS reads or writes the following Google Ads API resources. It is the union of what the audit pipeline, the sync jobs, the ad copy deployer, the negative keyword builder, the budget pacer, and OptiMate need.

We read through GAQL on `GoogleAdsService.Search` and `SearchStream`:

- `customer` for account metadata
- `campaign` and `campaign_budget` for structure, status, and budgets
- `ad_group` for structure and status
- `ad_group_ad`, `ad_group_ad_asset`, and `ad` for current ads (RSA and ETA) and their assets
- `ad_group_criterion`, `keyword_view`, and `search_term_view` for keywords, negatives, and search terms
- `asset`, `asset_group_asset`, and `asset_set_asset` for images, text assets, and extensions
- `ad_group_asset` and `campaign_asset` for asset linkage on extensions and RSAs
- `conversion_action` and `conversion_upload` for conversion tracking
- `geographic_view` and `user_location_view` for geo performance
- `device_view`, `age_range_view`, and `gender_view` for demographic and device splits
- quality score through `ad_group_criterion.quality_info`
- `change_event` and `change_status` for change history, used for audit and rollback
- `customer_client` (under MCC) for the list of managed client accounts

We write through `GoogleAdsService.Mutate`:

- `CampaignBudgetService` to set or adjust budgets
- `CampaignService` to update campaign status and criteria (geo, audience)
- `AdGroupService` to update ad group status and default CPC
- `AdGroupAdService` to create, update, and remove responsive search ads
- `AdGroupCriterionService` to manage keyword and negative keyword criteria at list, campaign, and ad group level
- `AssetService` to create and update text and image assets used by RSAs and extensions
- `AdGroupAssetService` and `CampaignAssetService` to attach and detach assets
- `ConversionActionService` to create and update conversion actions
- `CustomerService` to read or request customer level metadata like conversion tracking status

Every write is gated. A user takes an explicit action in the admin, a client takes an approved action on a PIN gated page, or an OptiMate recommendation is either pre approved (`auto_apply`) or post approved by a team member. We never write silently.

## Tool mockups

Three screenshots from the CMS are attached on the final pages.

The first is the Google Ads dashboard. It is a client list with per client Google Ads summary cards (spend, conversions, CPA, quality score, OptiMate status) and entry points to audit, ad copy, negative keywords, and account structure.

The second is the account structure view. It drills down from MCC root to customer to campaign to ad group to ad, showing the live data the CMS has synced from the Google Ads API. It demonstrates that the tool mirrors account structure for navigation and reporting.

The third is the ad copy proposal page. It is the client facing PIN gated preview showing generated RSA headlines and descriptions per ad group, with inline comments and an Approve or Request changes action that the CMS uses to gate the `AdGroupAdService` deploy.

If the review team would prefer screenshots of the Google Ads UI itself (the Google Ads dashboard, the Campaigns and Ad groups tree, and the RSA editor with our generated copy populated), we are happy to provide those as supplementary attachments.
