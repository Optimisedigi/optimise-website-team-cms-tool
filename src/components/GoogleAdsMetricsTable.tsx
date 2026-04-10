'use client';

import { useState, useCallback } from 'react';

interface MetricsRow {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  costPerConversion?: number | null;
}

interface GoogleAdsMetricsTableProps {
  metrics: MetricsRow[];
  loading?: boolean;
  onRefresh?: () => void;
  dateRange?: string;
}

const formatNumber = (n: number | undefined | null, decimals = 0): string => {
  if (n == null || isNaN(n)) return '—';
  if (decimals > 0) return n.toFixed(decimals);
  return n.toLocaleString();
};

const formatCurrency = (n: number | undefined | null): string => {
  if (n == null || isNaN(n)) return '—';
  return `$${n.toFixed(2)}`;
};

export default function GoogleAdsMetricsTable({
  metrics,
  loading = false,
  onRefresh,
  dateRange = 'Last 30 Days',
}: GoogleAdsMetricsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
  const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
  const totalConversions = metrics.reduce((sum, m) => sum + (m.conversions || 0), 0);
  const totalSpend = metrics.reduce(
    (sum, m) => sum + (m.clicks || 0) * (m.avgCpc || 0),
    0
  );
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const toggleRow = useCallback((campaignId: string) => {
    setExpandedRow((prev) => (prev === campaignId ? null : campaignId));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
            Campaign Performance
          </h3>
          <span
            style={{
              fontSize: 12,
              padding: '2px 8px',
              background: '#f1f5f9',
              borderRadius: 4,
              color: '#64748b',
            }}
          >
            {dateRange}
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 500,
              background: loading ? '#94a3b8' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Metrics'}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Impressions', value: formatNumber(totalImpressions), color: '#6366f1' },
          { label: 'Clicks', value: formatNumber(totalClicks), color: '#2563eb' },
          { label: 'Avg. CPC', value: formatCurrency(avgCpc), color: '#059669' },
          { label: 'Conversions', value: formatNumber(totalConversions), color: '#d97706' },
          { label: 'Avg. CPA', value: formatCurrency(avgCpa), color: '#dc2626' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: '12px 16px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                Campaign
              </th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                Impressions
              </th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                Clicks
              </th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                Avg. CPC
              </th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                Conversions
              </th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                CPA
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: 'center',
                    padding: '32px 12px',
                    color: '#64748b',
                  }}
                >
                  {loading ? 'Loading metrics...' : 'No campaign data available. Click "Sync from Google Ads" to pull data.'}
                </td>
              </tr>
            ) : (
              metrics.map((row) => {
                const isExpanded = expandedRow === row.campaignId;
                const spend = (row.clicks || 0) * (row.avgCpc || 0);
                const cpa =
                  row.conversions && row.conversions > 0
                    ? spend / row.conversions
                    : null;

                return (
                  <tr
                    key={row.campaignId}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isExpanded ? '#f8fafc' : 'transparent',
                    }}
                    onClick={() => toggleRow(row.campaignId)}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#1e293b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 10,
                            color: '#94a3b8',
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                            display: 'inline-block',
                          }}
                        >
                          ▶
                        </span>
                        {row.campaignName}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                      {formatNumber(row.impressions)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                      {formatNumber(row.clicks)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                      {formatCurrency(row.avgCpc)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                      {formatNumber(row.conversions)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                      {cpa !== null ? formatCurrency(cpa) : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {metrics.length > 0 && (
        <p
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#94a3b8',
            fontStyle: 'italic',
          }}
        >
          Click on a row to expand details. CPA calculated as spend / conversions.
        </p>
      )}
    </div>
  );
}
