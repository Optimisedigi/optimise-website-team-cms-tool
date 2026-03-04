'use client'

export default function GscIndexingAuditInfo() {
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
      <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>How Indexing Audits Work</h4>

      <p style={{ margin: '0 0 8px' }}>
        This feature inspects <strong>every URL</strong> on a client's site through Google's URL Inspection API
        to build a complete picture of what's indexed and what's not, with specific reasons for each page.
      </p>

      <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>
        <li>
          <strong>Trigger</strong> — Go to <em>Search Console</em> (sidebar), select a GSC-connected client,
          and click <strong>"Run Full Indexing Audit"</strong> in the Indexing Status box.
        </li>
        <li>
          <strong>URL Discovery</strong> — The system finds all URLs from the client's sitemaps
          (parsed recursively) and from search analytics data (last 90 days). These are deduplicated
          and saved here.
        </li>
        <li>
          <strong>Inspection</strong> — Each URL is inspected via the URL Inspection API. Google allows
          roughly 2,000 inspections per day across all properties, so URLs are processed in daily batches.
          The first batch (up to 200 URLs) runs immediately. Remaining batches are picked up automatically
          by the daily cron job.
        </li>
        <li>
          <strong>Results</strong> — Open the <strong>Results</strong> tab to see a summary, breakdown by
          coverage state, and a searchable/filterable table of every URL with its status, last crawl date,
          and crawl agent.
        </li>
      </ol>

      <p style={{ margin: '0 0 4px' }}>
        <strong>Re-running:</strong> Each audit is a snapshot in time. To check again later, trigger a new
        audit from the Search Console page. Previous audits are kept for comparison.
      </p>

      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
        <strong>Statuses:</strong> Discovering (finding URLs) → Inspecting (daily batches running) →
        Completed (all URLs checked). If something goes wrong, it shows as Failed with an error message.
      </p>
    </div>
  )
}
