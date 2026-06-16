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
  var normalizedCustomerId = customerId.replace(/\\D/g, '');
  Logger.log('Syncing negative keywords for customer: ' + customerId);

  // Fetch keyword lists from CMS
  var response = UrlFetchApp.fetch(
    CMS_URL + '?customerId=' + encodeURIComponent(normalizedCustomerId),
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

    // Auto-assign to campaigns matching the pattern (supports plain text or regex)
    if (list.campaignRegex) {
      var regexStr = list.campaignRegex;
      // If plain text (only letters, numbers, spaces, hyphens, underscores), wrap in .*text.*
      if (/^[a-zA-Z0-9 _-]+$/.test(regexStr)) {
        regexStr = '.*' + regexStr + '.*';
      }
      var pattern = new RegExp(regexStr, 'i');
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
  const [showSetup, setShowSetup] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [clientSlug, setClientSlug] = useState<string | null>(clientObj?.slug || null)
  const [origin, setOrigin] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setOrigin(window.location.origin)
  }, [])

  // Fetch client slug if not populated
  useEffect(() => {
    if (clientSlug || !clientId) return
    fetch(`/api/clients/${clientId}?depth=0`)
      .then((r) => r.ok ? r.json() : null)
      .then((c) => { if (c?.slug) setClientSlug(c.slug) })
      .catch(() => {})
  }, [clientId, clientSlug])

  const clientViewUrl = origin && clientSlug && listName
    ? `${origin}/${clientSlug}/negative-keywords/${slugify(listName)}`
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

  const [showHowItWorks, setShowHowItWorks] = useState(false)

  if (!mounted) return null

  if (!data?.id) {
    return (
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 8,
          fontSize: 13,
          lineHeight: 1.5,
          color: '#475569',
        }}
      >
        Save this negative keyword list first. Setup links, bulk keyword tools, and the keyword review table will appear once the record has been created.
      </div>
    )
  }

  return (
    <div
      className="negative-keyword-admin-panel"
      style={{
        position: 'relative',
        zIndex: 1,
        isolation: 'isolate',
        background: '#fff',
        border: '1px solid #d7dce3',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 16,
        fontSize: 14,
        lineHeight: 1.55,
        color: '#1f2937',
        opacity: 1,
        filter: 'none',
        WebkitFilter: 'none',
        boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
      }}
    >
      {/* Dashboard relevancy auto-refresh notice */}
      <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fff', borderRadius: 6, border: '1px solid #bae6fd', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span title="Dashboard cache info" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#0ea5e9', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0, cursor: 'help' }}>?</span>
        <div style={{ fontSize: 12, color: '#1e3a5f', lineHeight: 1.5 }}>
          <strong>Dashboard cache:</strong> any change to the keywords on this list automatically wipes the per-client historical Keyword Relevancy / Non-Converting Spend cache, so past months get re-credited on the next dashboard view. There's also a <em>Refresh history</em> button on the Progress tab if you ever want to force a re-pull manually.
        </div>
      </div>

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

      {/* ── How It Works ── */}
      <button
        type="button"
        onClick={() => setShowHowItWorks(!showHowItWorks)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 14,
          fontWeight: 700,
          color: '#1e3a5f',
          marginBottom: showHowItWorks ? 0 : 10,
        }}
      >
        <span style={{ fontSize: 10 }}>{showHowItWorks ? '\u25BC' : '\u25B6'}</span>
        How This Works (Team Guide)
      </button>

      {showHowItWorks && (
        <div style={{ marginTop: 8, marginBottom: 14, padding: '14px 16px', background: '#fff', borderRadius: 6, border: '1px solid #bae6fd' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#0c4a6e' }}>Overview</h4>
          <p style={{ margin: '0 0 10px' }}>
            Negative keyword lists are managed <strong>here in the CMS</strong> and then <strong>automatically synced to Google Ads</strong> via a script that runs on a daily schedule inside the client's Google Ads account.
            You don't need to manually add keywords in Google Ads — the CMS is the single source of truth.
          </p>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>Step-by-Step: Adding Negative Keywords</h4>
          <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
            <li><strong>Create or open a list</strong> — Each client can have multiple lists (e.g. "Brand Terms", "Competitor Terms"). Pick the right one or create a new one.</li>
            <li><strong>Set the scope</strong> — Choose <em>Account Level</em> (applies everywhere), <em>Campaign Level</em> (specific campaigns only), or <em>Ad Group Level</em>.</li>
            <li><strong>Set a Regex</strong> (optional) — this controls which campaigns the script attaches the list to. Leave it blank if you only want the list created/synced in Google Ads and will attach it manually. Use <code>.*</code> for all campaigns, <code>Brand</code> for campaigns containing “Brand”, <code>Brand|Generic</code> for either word, or <code>^(?!.*Vietnam).*</code> for all campaigns except ones containing “Vietnam”.</li>
            <li><strong>Add keywords</strong> — Use the <em>Bulk Add Keywords</em> button below. Paste one keyword per line. Default is exact match. Wrap in single quotes for phrase match: <code>'keyword'</code>.</li>
            <li><strong>Save the list</strong> — Make sure "Is Active" is checked (sidebar). Inactive lists are excluded from the sync.</li>
            <li><strong>Wait for the sync</strong> — The Google Ads script runs <strong>daily</strong> and pulls the latest keywords from the CMS automatically. No manual push needed.</li>
          </ol>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>Is It Automated or Manual?</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #bae6fd' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Action</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>How</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e0f2fe' }}>
                <td style={{ padding: '4px 8px' }}>Adding/editing/removing keywords in the CMS</td>
                <td style={{ padding: '4px 8px' }}><strong>Manual</strong> — you do this here in the list editor</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e0f2fe' }}>
                <td style={{ padding: '4px 8px' }}>Pushing keywords to Google Ads</td>
                <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — the Google Ads script syncs daily (no action needed)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e0f2fe' }}>
                <td style={{ padding: '4px 8px' }}>Assigning lists to campaigns</td>
                <td style={{ padding: '4px 8px' }}><strong>Automated</strong> — the script uses the Regex field to auto-assign</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e0f2fe' }}>
                <td style={{ padding: '4px 8px' }}>Client flagging keywords for removal</td>
                <td style={{ padding: '4px 8px' }}><strong>Self-service</strong> — client uses the Client View link (PIN-protected)</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px' }}>Reviewing client-flagged keywords</td>
                <td style={{ padding: '4px 8px' }}><strong>Manual</strong> — you review flagged keywords in the table below and decide to remove or keep</td>
              </tr>
            </tbody>
          </table>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>How the Sync Works (Behind the Scenes)</h4>
          <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
            <li>A Google Ads Script is installed in the client's Google Ads account (one-time setup — see "Google Ads Script Setup" below).</li>
            <li>The script runs on a <strong>daily schedule</strong> inside Google Ads.</li>
            <li>Each run, it calls our CMS export API: <code>/api/negative-keyword-lists/export?customerId=...</code></li>
            <li>The API returns all <strong>active</strong> lists for that client (identified by their Google Ads Customer ID).</li>
            <li>The script creates or updates the negative keyword lists in Google Ads, clearing old keywords and replacing with the latest from the CMS.</li>
            <li>If a Regex is set, the script also auto-assigns the list to any enabled campaigns matching the pattern. If it is blank, the script still syncs the list and keywords but does not attach it to campaigns.</li>
          </ol>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>Client Flagging Flow</h4>
          <ol style={{ margin: '0 0 14px', paddingLeft: 20 }}>
            <li>Share the <strong>Client View Link</strong> (shown above) with the client.</li>
            <li>The client enters their <strong>Client PIN</strong> to view their negative keyword lists.</li>
            <li>They can click the flag icon on any keyword they think should be removed.</li>
            <li>Flagged keywords appear with a <span style={{ color: '#dc2626' }}>strikethrough</span> and a "Flagged" checkbox here in the CMS.</li>
            <li>You review the flagged keywords in the table below — either remove them (delete) or unflag them (uncheck the Flagged checkbox) if they should stay.</li>
            <li>Next sync, any removed keywords will be gone from Google Ads. Unflagged keywords remain.</li>
          </ol>

          <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>Prerequisites Checklist</h4>
          <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
            <li>Client's <strong>Google Ads Customer ID</strong> is set on their client record in the CMS</li>
            <li>The <strong>Google Ads Script</strong> is installed in their Google Ads account (one-time setup)</li>
            <li>The script is set to run <strong>Daily</strong> and has been authorised</li>
            <li>The list is <strong>Active</strong> (checkbox in the sidebar)</li>
            <li>For client flagging: the client has a <strong>Client PIN</strong> set on their client record</li>
          </ul>

          <div style={{ fontSize: 11, color: '#64748b', padding: '8px 10px', background: '#f0f9ff', borderRadius: 4, border: '1px solid #e0f2fe' }}>
            <strong>💡 Tip:</strong> If you need keywords live in Google Ads immediately (can't wait for the daily sync), you can go to Google Ads &gt; Scripts and manually click <strong>Run</strong> on the sync script to trigger it instantly.
          </div>
        </div>
      )}

      {/* ── Google Ads Script Setup ── */}
      <button
        type="button"
        onClick={() => setShowSetup(!showSetup)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 14,
          fontWeight: 700,
          color: '#1e3a5f',
        }}
      >
        <span style={{ fontSize: 10 }}>{showSetup ? '\u25BC' : '\u25B6'}</span>
        Google Ads Script Setup
      </button>

      {showSetup && (
        <div style={{ marginTop: 8 }}>
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
      )}
    </div>
  )
}
