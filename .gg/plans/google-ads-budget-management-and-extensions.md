# Google Ads Budget Management & Ad Extensions

## Context

The platform already has:
- **Campaign Proposal**: Approved campaign structure with keywords, ad groups, targeting
- **Ad Copy**: RSA (Responsive Search Ads) with headlines + descriptions
- **Deployment**: Ad copy deployed to Google Ads via Growth Tools service

**What's missing:**
1. **Budget Management**: Set/manage campaign budgets, bid strategies, view performance metrics
2. **Ad Extensions**: Sitelinks and Structured Snippets (pull existing, create new, assign to campaigns/ad groups)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CMS (Payload)                            │
├─────────────────────────────────────────────────────────────┤
│  GoogleAdsAudits Collection                                  │
│  └── NEW: Budget Management Tab (inline)                     │
│  └── NEW: Ad Extensions Tab (inline)                         │
│                                                              │
│  NEW: GoogleAdsCampaignBudgets Collection                    │
│  ├── campaignId, campaignName                                │
│  ├── dailyBudget, bidStrategy                                │
│  └── performanceMetrics (impressions, clicks, CPC, conversions)│
│                                                              │
│  NEW: GoogleAdsAdExtensions Collection                       │
│  ├── extensionType (sitelink | structured_snippet)            │
│  ├── extensionData (JSON per type)                          │
│  ├── level (account | campaign | ad_group)                   │
│  └── assignedCampaigns, assignedAdGroups                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Growth Tools Service                       │
├─────────────────────────────────────────────────────────────┤
│  EXISTING: /api/google-ads/comprehensive-audit             │
│  EXISTING: /api/google-ads/build-campaigns                  │
│  EXISTING: /api/google-ads/deploy-ad-copy                   │
│  EXISTING: /api/google-ads/dashboard/*                      │
│                                                              │
│  NEW: /api/google-ads/campaign-budgets/*                   │
│  ├── GET  /list          → list campaign budgets + metrics  │
│  ├── POST /update        → update budget/bid strategy        │
│                                                              │
│  NEW: /api/google-ads/ad-extensions/*                       │
│  ├── GET  /list          → list existing extensions          │
│  ├── POST /create        → create new extension               │
│  ├── POST /assign        → assign extension to campaign/AG   │
│  └── GET  /types         → available extension types/headers │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Google Ads API v21
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Google Ads API                             │
├─────────────────────────────────────────────────────────────┤
│  CampaignBudgetService    → manage budgets                    │
│  CampaignBiddingStrategy  → bidding strategies                │
│  AssetService             → create assets (sitelinks, etc)   │
│  CampaignAssetSet         → link assets to campaigns          │
│  AdGroupAssetSet          → link assets to ad groups         │
│  GoogleAdsRow (Reporting) → performance metrics              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models

### 1. Campaign Budget (CMS Storage)

```typescript
interface CampaignBudget {
  id: string;                    // UUID
  auditId: string;               // FK to google-ads-audits
  customerId: string;
  
  // Campaign reference
  campaignId: string;             // Google Ads campaign ID
  campaignName: string;
  adGroupId?: string;             // Optional: ad group specific budget
  adGroupName?: string;
  
  // Budget settings
  dailyBudget: number;            // Daily budget in account currency
  bidStrategy: BidStrategyType;
  bidStrategyId?: string;         // For targetCPA, MaximizeConversions, etc.
  
  // Manual bid override (if ad group level)
  manualCpcBid?: number;
  
  // Targeting
  locationIds?: string[];         // Geo target IDs
  locationNames?: string[];        // Human-readable names
  
  // Performance (refreshed from API)
  metricsLastUpdated: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

type BidStrategyType = 
  | 'manual_cpc'
  | 'maximize_conversions'
  | 'maximize_conversion_value'
  | 'target_cpa'
  | 'target_roas'
  | 'target_impressions'
  | 'maximize_clicks';
```

### 2. Ad Extension (CMS Storage)

```typescript
interface AdExtension {
  id: string;                    // UUID
  auditId: string;               // FK to google-ads-audits
  customerId: string;
  
  // Extension type
  extensionType: 'sitelink' | 'structured_snippet';
  
  // Extension data (varies by type)
  extensionData: SitelinkData | StructuredSnippetData;
  
  // Level & assignments
  level: 'account' | 'campaign' | 'ad_group';
  
  // Google Ads IDs (populated after deploy)
  assetId?: string;              // Google Ads asset ID
  assetSetId?: string;            // AssetSet ID after linking
  
  // Assignment targets
  assignedCampaigns: { campaignId: string; campaignName: string }[];
  assignedAdGroups: { adGroupId: string; adGroupName: string; campaignId: string }[];
  
  // Status
  status: 'draft' | 'deployed' | 'paused' | 'error';
  deployedAt?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

interface SitelinkData {
  linkText: string;               // Max 25 chars
  linkUrl: string;                // Landing page URL
  description1?: string;          // Max 35 chars (optional line 1)
  description2?: string;          // Max 35 chars (optional line 2)
}

interface StructuredSnippetData {
  header: string;                 // e.g., "Destinations", "Services", "Brands"
  values: string[];               // 3-10 values, max 25 chars each
}

// Pre-defined headers per Google
const STRUCTURED_SNIPPET_HEADERS = [
  'Destinations', 'Services', 'Brands', 'Schools', 'Neighborhoods',
  'Types', 'Collections', 'Hotels', 'Insurance Coverage', 'Models',
  'Entertainment', 'Activities', 'Natural Landmarks', 'Featured Items',
  'Product Types', 'Services Offered', 'Programs', 'Events', '灵巧',
  'Departments', 'Amenities', 'Styles', 'Artists', 'Owned', 'Offered',
  'Diets', 'Curriculums', 'Insurance Products', 'Properties', 'Communities',
  'Shows', 'Outlets', 'Programs', 'Clubs', 'Events', 'Species',
  'Services', 'Conditions', 'Coverage', 'Plans', 'Therapists',
  'Forms', 'Guides', 'Specializations', 'Features', 'Benefits',
  'Rooms', 'Menu Items', 'Car Rental Categories', 'Service Options',
  'Aircraft', 'Travel Classes', 'Hotels', 'Rental Dates', 'Pickup Types',
  'Insurance Products', 'Coverage Options', 'Therapy Types', 'Specialty',
  'Services', 'Membership Types', 'Venue Types', 'Entertainment Types',
  'Training Types', 'Insurance Types', 'Service Categories', 'Store Types',
  'Aircraft Types', 'Travel Options', 'Hotel Types', 'Dining Options',
];
```

---

## Growth Tools Endpoints (Backend)

### Budget Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/google-ads/campaign-budgets/list` | GET | List campaigns with budgets + 30-day metrics |
| `/api/google-ads/campaign-budgets/update` | POST | Update budget, bid strategy, or targeting |
| `/api/google-ads/campaign-budgets/get-metrics` | GET | Refresh metrics for specific campaigns |

### Ad Extensions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/google-ads/ad-extensions/list` | GET | List existing extensions in account |
| `/api/google-ads/ad-extensions/create` | POST | Create new extension (asset) |
| `/api/google-ads/ad-extensions/assign` | POST | Assign extension to campaign/ad group |
| `/api/google-ads/ad-extensions/headers` | GET | List valid structured snippet headers |
| `/api/google-ads/ad-extensions/sync` | POST | Sync extensions from account to CMS |

---

## CMS API Routes (Frontend)

### Budget Management

```
POST /api/google-ads-budgets/[id]/list
  → GET  /campaigns with budgets + metrics
  → Updates GoogleAdsCampaignBudgets collection

POST /api/google-ads-budgets/[id]/update
  Body: { campaignId, dailyBudget?, bidStrategy?, locationIds? }
  → Calls Growth Tools to update Google Ads
  → Updates collection

POST /api/google-ads-budgets/[id]/refresh-metrics
  → Pulls fresh 30-day metrics from Google Ads
  → Updates collection
```

### Ad Extensions

```
GET /api/google-ads-extensions/[id]/list
  → List extensions from Growth Tools + CMS

POST /api/google-ads-extensions/[id]/create
  Body: { extensionType, extensionData, level }
  → Creates asset in Google Ads
  → Stores in GoogleAdsAdExtensions collection

POST /api/google-ads-extensions/[id]/assign
  Body: { extensionId, campaignIds?, adGroupIds? }
  → Creates CampaignAssetSet/AdGroupAssetSet links
  → Updates collection

POST /api/google-ads-extensions/[id]/sync
  → Pulls all extensions from account
  → Creates/updates CMS records
```

---

## UI Components

### 1. Budget Management Tab (in GoogleAdsAudits)

**File**: `src/components/GoogleAdsBudgetManagement.tsx`

**Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│  [Sync from Google Ads]  [Date Range: Last 30 days ▼]        │
├──────────────────────────────────────────────────────────────┤
│  Total Budget: $X,XXX/day │ Total Spend: $XX,XXX │ X conv.  │
├──────────────────────────────────────────────────────────────┤
│  Campaign / Ad Group    │ Budget │ Bid Strategy │ Perf. Metrics│
│  ─────────────────────────────────────────────────────────  │
│  ▼ Search - UK Services │ $100/d │ Target CPA   │ ...         │
│    └─ Plumber London    │ $20/d  │ Manual CPC   │ ...         │
│    └─ Electrician UK    │ $25/d  │ Manual CPC   │ ...         │
│  ▼ Shopping - Products  │ $150/d │ Maximize Conv│ ...         │
│  ─────────────────────────────────────────────────────────  │
│  [Edit Budget] [Change Bid Strategy] [Set Locations]        │
└──────────────────────────────────────────────────────────────┘
```

**Features**:
- Expandable campaign tree (campaigns → ad groups)
- Inline editing for budget and bid strategy
- Pulls 30-day metrics: impressions, clicks, avg CPC, conversions
- Location targeting section
- "Sync from Google Ads" to pull latest

### 2. Ad Extensions Tab (in GoogleAdsAudits)

**File**: `src/components/GoogleAdsAdExtensions.tsx`

**Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│  [Sync Extensions]  [Create Sitelink]  [Create Snippet]      │
├──────────────────────────────────────────────────────────────┤
│  SITELINKS                                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Name          │ URL                   │ Level  │ Status │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ About Us      │ /about                │ Acct   │ Active │ │
│  │ Contact       │ /contact              │ Camp 1 │ Active │ │
│  └────────────────────────────────────────────────────────┘ │
│  [Edit] [Assign to Campaign] [Delete]                        │
├──────────────────────────────────────────────────────────────┤
│  STRUCTURED SNIPPETS                                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Header: Services                                        │ │
│  │ Values: Plumbing | Gas | Electrical | Drain | Bathrooms  │ │
│  │ Level: Account │ Status: Active │ Campaigns: All       │ │
│  └────────────────────────────────────────────────────────┘ │
│  [Edit Values] [Assign to Campaign] [Delete]                  │
└──────────────────────────────────────────────────────────────┘
```

**Features**:
- Tabs: Sitelinks | Structured Snippets | All
- Pull existing extensions from Google Ads
- Create new extensions inline
- Assign to campaigns/ad groups via dropdown
- Preview how extensions will appear

### 3. Create/Edit Dialogs

**Sitelink Dialog** (`src/components/GoogleAdsSitelinkDialog.tsx`):
- Link Text (25 char limit)
- Landing Page URL
- Description Line 1 (35 char, optional)
- Description Line 2 (35 char, optional)
- Preview of how sitelink will appear

**Structured Snippet Dialog** (`src/components/GoogleAdsSnippetDialog.tsx`):
- Header dropdown (pre-populated with valid headers)
- Values input (tag-style, 3-10 values, 25 char each)
- Preview of how snippet will appear

### 4. Campaign Targeting Modal

**File**: `src/components/GoogleAdsLocationTargeting.tsx`

- Location search (autocomplete from Google)
- Multi-select locations
- Location type: People in your targeted location / People searching for your location
- Bidding modifiers per location

---

## File Changes

### New Collections

1. **`src/collections/GoogleAdsCampaignBudgets.ts`**
   - Campaign budget storage and management

2. **`src/collections/GoogleAdsAdExtensions.ts`**
   - Ad extension storage and assignments

### New API Routes

3. **`src/app/(frontend)/api/google-ads-budgets/[id]/list/route.ts`**
4. **`src/app/(frontend)/api/google-ads-budgets/[id]/update/route.ts`**
5. **`src/app/(frontend)/api/google-ads-budgets/[id]/refresh-metrics/route.ts`**
6. **`src/app/(frontend)/api/google-ads-extensions/[id]/list/route.ts`**
7. **`src/app/(frontend)/api/google-ads-extensions/[id]/create/route.ts`**
8. **`src/app/(frontend)/api/google-ads-extensions/[id]/assign/route.ts`**
9. **`src/app/(frontend)/api/google-ads-extensions/[id]/sync/route.ts`**

### New Components

10. **`src/components/GoogleAdsBudgetManagement.tsx`**
11. **`src/components/GoogleAdsAdExtensions.tsx`**
12. **`src/components/GoogleAdsSitelinkDialog.tsx`**
13. **`src/components/GoogleAdsSnippetDialog.tsx`**
14. **`src/components/GoogleAdsLocationTargeting.tsx`**
15. **`src/components/GoogleAdsMetricsTable.tsx`**

### Update Existing

16. **`src/collections/GoogleAdsAudits.ts`**
    - Add "Budget Management" tab
    - Add "Ad Extensions" tab

17. **`src/lib/dashboard-types.ts`**
    - Add `CampaignBudget` and `AdExtension` types

18. **`payload-types.ts`** (auto-generated)
    - Regenerate after collection changes

---

## Implementation Steps

### Phase 1: Data Layer

1. Create `GoogleAdsCampaignBudgets` collection
2. Create `GoogleAdsAdExtensions` collection
3. Add tabs to `GoogleAdsAudits` collection pointing to new components
4. Add types to `dashboard-types.ts`

### Phase 2: Backend Routes

5. Create budget list API route (proxy to Growth Tools)
6. Create budget update API route
7. Create extension list API route
8. Create extension create API route
9. Create extension assign API route
10. Create sync API routes

### Phase 3: UI Components

11. Build `GoogleAdsMetricsTable` component
12. Build `GoogleAdsBudgetManagement` component
13. Build `GoogleAdsSitelinkDialog` component
14. Build `GoogleAdsSnippetDialog` component
15. Build `GoogleAdsLocationTargeting` component
16. Build `GoogleAdsAdExtensions` component

### Phase 4: Integration

17. Wire up all API routes in components
18. Add inline tabs to GoogleAdsAudits collection
19. Test end-to-end flow

### Phase 5: Growth Tools Backend (Separate PR)

20. Implement Growth Tools endpoints for budget management
21. Implement Growth Tools endpoints for ad extensions
22. Test with actual Google Ads API

---

## Dependencies on Growth Tools

This feature requires Growth Tools to implement these endpoints:

```
POST /api/google-ads/campaign-budgets/list
  Body: { customerId, dateRange? }
  Response: { campaigns: CampaignBudget[], metrics: Metrics[] }

POST /api/google-ads/campaign-budgets/update
  Body: { customerId, campaignId, dailyBudget?, bidStrategy?, locationIds? }
  Response: { success: boolean, campaign: CampaignBudget }

GET  /api/google-ads/campaign-budgets/metrics
  Query: customerId, campaignIds[], dateRange
  Response: { metrics: { campaignId, impressions, clicks, avgCpc, conversions }[] }

GET  /api/google-ads/ad-extensions/list
  Query: customerId, extensionType?
  Response: { extensions: Extension[] }

POST /api/google-ads/ad-extensions/create
  Body: { customerId, extensionType, extensionData, level }
  Response: { assetId, assetSetId }

POST /api/google-ads/ad-extensions/assign
  Body: { customerId, assetId, campaignIds[], adGroupIds[] }
  Response: { success: boolean }
```

---

## Verification

1. **Unit tests** for each API route handler
2. **TypeScript compilation** passes
3. **Admin UI loads** without errors
4. **Manual testing**:
   - Create a new sitelink → appears in list
   - Assign sitelink to campaign → verified in Google Ads UI
   - Update campaign budget → reflected in Google Ads
   - View metrics → 30-day data matches Google Ads reporting

---

## Estimated Effort

| Component | Estimated Time |
|-----------|----------------|
| Collections + Types | 2 hours |
| API Routes | 4 hours |
| UI Components | 8 hours |
| Growth Tools endpoints | 6 hours |
| Testing + Integration | 4 hours |
| **Total** | **~24 hours** |
