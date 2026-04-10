# Google Ads Budget Management & Ad Extensions - Growth Tools Implementation

This document provides the full context for implementing the Google Ads Budget Management and Ad Extensions functionality in the Growth Tools service.

---

## Overview

The CMS (Content CMS) is a Payload CMS that manages Google Ads audits and campaigns. It needs to sync with the Google Ads API via Growth Tools to:

1. **Budget Management**: Fetch campaigns, set percentage-based budget allocations, and push budget changes to Google Ads
2. **Ad Extensions**: Create and manage sitelinks and structured snippets

---

## Required Endpoints

### Budget Management Endpoints

#### 1. GET /api/google-ads/campaign-budgets/list

**Purpose**: List all campaigns with their current budgets and 30-day metrics.

**Request Headers**:
- `x-internal-key`: Required for authentication
- `Content-Type`: application/json

**Request Body**:
```json
{
  "customerId": "9554935739",
  "dateRange": "LAST_30_DAYS"
}
```

**Response**:
```json
{
  "success": true,
  "campaigns": [
    {
      "campaignId": "123456789",
      "campaignName": "Brand - UK",
      "campaignStatus": "ENABLED",
      "channelType": "SEARCH",
      "dailyBudget": 50.00,
      "biddingStrategyType": "MANUAL_CPC",
      "biddingStrategyId": null,
      "locationIds": ["20616"],
      "locationNames": ["United Kingdom"],
      "impressions": 125000,
      "clicks": 3200,
      "avgCpc": 1.85,
      "conversions": 45
    }
  ],
  "totalCount": 1
}
```

**Notes**:
- `customerId` is provided without dashes (e.g., "9554935739" not "955-493-5739")
- Include all campaigns regardless of status
- Use Google Ads API `CampaignBudgetService` and `CampaignService`

---

#### 2. POST /api/google-ads/campaign-budgets/update

**Purpose**: Update a single campaign's budget or bid strategy.

**Request Body**:
```json
{
  "customerId": "9554935739",
  "campaignId": "123456789",
  "dailyBudget": 75.00,
  "bidStrategy": "target_cpa",
  "bidStrategyId": "策略ID"
}
```

**Response**:
```json
{
  "success": true,
  "campaign": {
    "campaignId": "123456789",
    "dailyBudget": 75.00,
    "bidStrategy": "target_cpa"
  }
}
```

**Notes**:
- All fields are optional - only include what needs to change
- Use Google Ads API `CampaignBudgetService` to update budgets
- Use `CampaignService` to update bidding strategy

---

#### 3. POST /api/google-ads/campaign-budgets/push

**Purpose**: Push multiple campaign budgets at once (batch operation).

**Request Body**:
```json
{
  "customerId": "9554935739",
  "campaigns": [
    {
      "campaignId": "123456789",
      "dailyBudget": 75.00,
      "bidStrategy": "maximize_conversions"
    },
    {
      "campaignId": "987654321",
      "dailyBudget": 45.00,
      "bidStrategy": "manual_cpc"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "pushedCount": 2,
  "results": [
    { "campaignId": "123456789", "success": true },
    { "campaignId": "987654321", "success": true }
  ]
}
```

**Notes**:
- Process all campaigns in a single operation if possible
- Return partial success if some campaigns fail

---

#### 4. GET /api/google-ads/campaign-budgets/get-metrics

**Purpose**: Get performance metrics for specific campaigns.

**Query Parameters**:
- `customerId`: Google Ads customer ID (required)
- `campaignIds`: Comma-separated campaign IDs (optional, omit for all)
- `dateRange`: LAST_7_DAYS, LAST_30_DAYS, LAST_90_DAYS (default: LAST_30_DAYS)

**Response**:
```json
{
  "success": true,
  "metrics": [
    {
      "campaignId": "123456789",
      "impressions": 125000,
      "clicks": 3200,
      "avgCpc": 1.85,
      "conversions": 45,
      "costPerConversion": 131.11
    }
  ]
}
```

---

### Ad Extensions Endpoints

#### 5. GET /api/google-ads/ad-extensions/list

**Purpose**: List existing ad extensions in the account.

**Query Parameters**:
- `customerId`: Google Ads customer ID (required)
- `extensionType`: sitelink, structured_snippet (optional)

**Response**:
```json
{
  "success": true,
  "extensions": [
    {
      "assetId": "123456789",
      "extensionType": "SITELINK",
      "status": "ACTIVE",
      "level": "ACCOUNT",
      "linkText": "About Us",
      "linkUrl": "https://example.com/about",
      "description1": "Trusted by 1000+ customers",
      "description2": null,
      "campaignAssignments": [
        { "campaignId": "111", "campaignName": "Brand" }
      ],
      "adGroupAssignments": []
    },
    {
      "assetId": "987654321",
      "extensionType": "STRUCTURED_SNIPPET",
      "status": "ACTIVE",
      "level": "ACCOUNT",
      "header": "Services",
      "values": ["Plumbing", "Gas Fitting", "Drain Cleaning"],
      "campaignAssignments": [],
      "adGroupAssignments": []
    }
  ]
}
```

---

#### 6. POST /api/google-ads/ad-extensions/create

**Purpose**: Create a new ad extension in Google Ads.

**Request Body**:
```json
{
  "customerId": "9554935739",
  "extensionType": "sitelink",
  "level": "account",
  "extensionData": {
    "linkText": "Contact Us",
    "linkUrl": "https://example.com/contact",
    "description1": "Get a free quote",
    "description2": "Call us today"
  }
}
```

Or for structured snippets:
```json
{
  "customerId": "9554935739",
  "extensionType": "structured_snippet",
  "level": "account",
  "extensionData": {
    "header": "Services",
    "values": ["Plumbing", "Gas Fitting", "Drain Cleaning", "Hot Water Systems"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "assetId": "123456789",
  "assetSetId": null,
  "message": "Extension created"
}
```

**Notes**:
- Use Google Ads API `AssetService` to create assets
- For sitelinks: `AssetType.SITELINK = 1`
- For structured snippets: `AssetType.STRUCTURED_SNIPPET = 6`

---

#### 7. POST /api/google-ads/ad-extensions/assign

**Purpose**: Assign an extension to campaigns or ad groups.

**Request Body**:
```json
{
  "customerId": "9554935739",
  "assetId": "123456789",
  "campaignIds": ["111222333", "444555666"],
  "adGroupIds": []
}
```

**Response**:
```json
{
  "success": true,
  "assetSetId": "asset_set_123"
}
```

**Notes**:
- Use Google Ads API `CampaignAssetSetService` to link to campaigns
- Use `AdGroupAssetSetService` to link to ad groups
- Create an `AssetSet` first, then add the asset to it

---

#### 8. POST /api/google-ads/ad-extensions/delete

**Purpose**: Delete an extension from Google Ads.

**Request Body**:
```json
{
  "customerId": "9554935739",
  "assetId": "123456789"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Extension deleted"
}
```

---

#### 9. POST /api/google-ads/ad-extensions/sync

**Purpose**: Sync all extensions from Google Ads to CMS.

**Request Body**:
```json
{
  "customerId": "9554935739"
}
```

**Response**:
```json
{
  "success": true,
  "extensions": [...],
  "total": 15,
  "created": 2,
  "updated": 13
}
```

---

## Google Ads API References

### Required Services

1. **CampaignBudgetService** - Manage campaign budgets
2. **CampaignService** - Campaign operations, bid strategies
3. **AssetService** - Create/update ad extensions
4. **CampaignAssetSetService** - Link extensions to campaigns
5. **AdGroupAssetSetService** - Link extensions to ad groups
6. **CampaignService** (with metrics) - Performance reporting

### Key Operations

```python
# Example: Update campaign budget (Python)
campaign_budget_operation = CampaignBudgetOperation()
campaign_budget = campaign_budget_operation.update
campaign_budget.resource_name = f"customers/{customer_id}/campaignBudgets/{budget_id}"
campaign_budget.amount_micros = int(daily_budget * 1_000_000)

client.campaign_budget_service.mutate_campaign_budgets(
    customer_id=customer_id,
    operations=[campaign_budget_operation]
)
```

```python
# Example: Create sitelink asset (Python)
asset_operation = AssetOperation()
asset = asset_operation.create
asset.name = f"sitelink_{uuid4()}"
asset.sitelink.link_text = "About Us"
asset.sitelink.final_url = "https://example.com/about"
asset.sitelink.description_1 = "Trusted by customers"
asset.sitelink.description_2 = "Since 1958"

client.asset_service.mutate_assets(
    customer_id=customer_id,
    operations=[asset_operation]
)
```

---

## Validation Rules

### Budget Percentages
- Must sum to exactly 100% before pushing to Google Ads
- Each percentage: 0-100, allow decimals (e.g., 12.5%)

### Sitelinks
- Link text: 1-25 characters
- URL: Must be valid HTTPS URL
- Description 1: 0-35 characters
- Description 2: 0-35 characters

### Structured Snippets
- Header: Must be one of Google's approved headers
- Values: 3-10 items, each 1-25 characters

---

## Error Handling

All endpoints should return consistent error responses:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE"
}
```

HTTP Status Codes:
- 200: Success
- 400: Bad request (invalid input)
- 401: Unauthorized (missing/invalid API key)
- 404: Resource not found
- 500: Internal server error

---

## Testing Checklist

- [ ] List campaigns returns all campaigns with metrics
- [ ] Update budget changes campaign budget in Google Ads
- [ ] Push budgets batch updates multiple campaigns
- [ ] Get metrics returns accurate 30-day data
- [ ] Create sitelink appears in Google Ads UI
- [ ] Create structured snippet appears in Google Ads UI
- [ ] Assign extension to campaign works
- [ ] Delete extension removes from Google Ads
- [ ] Sync extensions matches Google Ads UI
- [ ] Error handling for invalid customer IDs
- [ ] Error handling for API quota limits

---

## Notes

- The CMS sends `customerId` without dashes (e.g., "9554935739")
- Growth Tools should normalize this before sending to Google Ads API
- All monetary values in CMS are in account currency (dollars)
- All values sent to Google Ads API should be in micros (multiply by 1,000,000)
- Use the Optimise Digital MCC access for all customer operations
