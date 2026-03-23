'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

const GOOGLE_ADS_SCRIPT = `// ═══════════════════════════════════════════════════════════════
// Negative Keyword Sync — Optimise Digital CMS
// ═══════════════════════════════════════════════════════════════
// This script syncs negative keyword lists from the Optimise Digital
// CMS to this Google Ads account. It runs on a schedule and keeps
// the account's negative keyword lists in sync with the CMS.
//
// Setup:
// 1. Paste this script into Google Ads > Tools > Scripts
// 2. Set the frequency (e.g. daily)
// 3. Authorise and run
// ═══════════════════════════════════════════════════════════════

var CMS_URL = 'https://cms.optimisedigital.online/api/negative-keyword-lists/export';
var CMS_API_KEY = '8f2fa5b8b97ab933ae306ccdfad2ce1df0de16f926e97cb1'; // Read-only key for negative keyword export

function main() {
  var customerId = AdsApp.currentAccount().getCustomerId();
  Logger.log('Syncing negative keywords for customer: ' + customerId);

  // Fetch keyword lists from CMS
  var response = UrlFetchApp.fetch(
    CMS_URL + '?customerId=' + customerId,
    {
      headers: { 'x-api-key': CMS_API_KEY },
      muteHttpExceptions: true
    }
  );

  var data = JSON.parse(response.getContentText());
  if (!data.ok) {
    Logger.log('ERROR: CMS returned error: ' + JSON.stringify(data));
    return;
  }

  Logger.log('Found ' + data.lists.length + ' keyword list(s) for ' + (data.clientName || customerId));

  // Process each list from the CMS
  data.lists.forEach(function(list) {
    // Find or create the negative keyword list
    var existingIterator = AdsApp.negativeKeywordLists()
      .withCondition('Name = "' + list.name + '"')
      .get();
    var negList;

    if (existingIterator.hasNext()) {
      negList = existingIterator.next();
      // Clear existing keywords to do a full sync
      var existing = negList.negativeKeywords().get();
      while (existing.hasNext()) {
        existing.next().remove();
      }
      Logger.log('Cleared existing keywords from list: ' + list.name);
    } else {
      negList = AdsApp.newNegativeKeywordListBuilder()
        .withName(list.name)
        .build()
        .getResult();
      Logger.log('Created new list: ' + list.name);
    }

    // Add keywords with correct match types
    var broad = [], phrase = [], exact = [];
    list.keywords.forEach(function(kw) {
      var matchType = kw.matchType.toLowerCase();
      if (matchType === 'broad') broad.push(kw.keyword);
      else if (matchType === 'phrase') phrase.push('"' + kw.keyword + '"');
      else exact.push('[' + kw.keyword + ']');
    });

    if (broad.length) negList.addNegativeKeywords(broad);
    if (phrase.length) negList.addNegativeKeywords(phrase);
    if (exact.length) negList.addNegativeKeywords(exact);

    Logger.log('Synced ' + list.keywords.length + ' keywords to list: ' + list.name +
      ' (' + broad.length + ' broad, ' + phrase.length + ' phrase, ' + exact.length + ' exact)');

    // Auto-assign to campaigns matching the regex pattern
    if (list.campaignRegex) {
      var pattern = new RegExp(list.campaignRegex);
      var campaigns = AdsApp.campaigns()
        .withCondition('Status = ENABLED')
        .get();
      var assigned = 0;

      while (campaigns.hasNext()) {
        var campaign = campaigns.next();
        if (pattern.test(campaign.getName())) {
          campaign.addNegativeKeywordList(negList);
          assigned++;
        }
      }

      if (assigned > 0) {
        Logger.log('Assigned list "' + list.name + '" to ' + assigned + ' campaign(s)');
      }
    }
  });

  Logger.log('Negative keyword sync complete.');
}`

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function NegativeKeywordListInfo() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any
  const clientObj = typeof data?.client === 'object' ? data?.client : null
  const clientId = clientObj?.id || data?.client
  const listName = data?.name

  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [clientSlug, setClientSlug] = useState<string | null>(clientObj?.slug || null)

  // Fetch client slug if not populated
  useEffect(() => {
    if (clientSlug || !clientId) return
    fetch(`/api/clients/${clientId}?depth=0`)
      .then((r) => r.ok ? r.json() : null)
      .then((c) => { if (c?.slug) setClientSlug(c.slug) })
      .catch(() => {})
  }, [clientId, clientSlug])

  const clientViewUrl = clientSlug && listName
    ? `${window.location.origin}/${clientSlug}/negative-keywords/${slugify(listName)}`
    : null

  const handleCopy = () => {
    navigator.clipboard.writeText(GOOGLE_ADS_SCRIPT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCopyLink = () => {
    if (!clientViewUrl) return
    navigator.clipboard.writeText(clientViewUrl).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  return (
    <div
      style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 8,
        fontSize: 13,
        lineHeight: 1.6,
        color: '#1e3a5f',
      }}
    >
      {/* Client share link */}
      {clientViewUrl && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fff', borderRadius: 6, border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client View Link</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ flex: 1, fontSize: 12, color: '#2563eb', wordBreak: 'break-all' }}>{clientViewUrl}</code>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>
            <a
              href={clientViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #bae6fd',
                background: '#fff',
                color: '#1e3a5f',
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Preview
            </a>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Share this link with the client. They'll need the Client PIN to view.
          </div>
        </div>
      )}

      <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>
        Google Ads Script Setup
      </h4>

      <p style={{ margin: '0 0 8px' }}>
        To sync these negative keywords to Google Ads automatically:
      </p>

      <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
        <li>Open the Google Ads account for this client</li>
        <li>Go to <strong>Tools &amp; Settings &gt; Bulk Actions &gt; Scripts</strong></li>
        <li>Click <strong>+ New Script</strong></li>
        <li><strong>Delete everything</strong> in the script editor (including the default <code>function main() {'{'} {'}'}</code>)</li>
        <li>Paste the full script below (it replaces everything, API key is pre-filled)</li>
        <li>Click <strong>Authorize</strong>, then <strong>Save</strong></li>
        <li>Set the frequency to <strong>Daily</strong> (syncs keywords from CMS once per day)</li>
        <li>Click <strong>Run</strong> to test</li>
      </ol>

      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>
        The script automatically detects the Google Ads customer ID and fetches the correct keyword
        lists from the CMS. Make sure the client's <strong>Google Ads Customer ID</strong> is set on
        their client record in the CMS.
      </p>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowScript(!showScript)}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #bae6fd',
            background: '#fff',
            color: '#1e3a5f',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {showScript ? 'Hide Script' : 'View Google Ads Script'}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy Script'}
        </button>
      </div>

      {showScript && (
        <pre
          style={{
            marginTop: 10,
            padding: 14,
            background: '#1e293b',
            color: '#e2e8f0',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.5,
            overflowX: 'auto',
            whiteSpace: 'pre',
            maxHeight: 400,
          }}
        >
          {GOOGLE_ADS_SCRIPT}
        </pre>
      )}
    </div>
  )
}
