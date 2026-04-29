'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDocumentInfo } from '@payloadcms/ui';
import GoogleAdsSitelinkDialog from './GoogleAdsSitelinkDialog';
import GoogleAdsSnippetDialog from './GoogleAdsSnippetDialog';

interface Extension {
  id: string;
  extensionType: 'sitelink' | 'structured_snippet';
  sitelinkText?: string;
  sitelinkUrl?: string;
  sitelinkDescription1?: string;
  sitelinkDescription2?: string;
  snippetHeader?: string;
  snippetValues?: string;
  level: 'account' | 'campaign' | 'ad_group';
  status: 'draft' | 'deployed' | 'paused' | 'error';
  assignedCampaigns?: Array<{ campaignId: string; campaignName: string }>;
  assignedAdGroups?: Array<{ adGroupId: string; adGroupName: string; campaignId: string }>;
  assetId?: string;
  deployedAt?: string;
}

const GoogleAdsAdExtensionsInner = () => {
  const { id } = useDocumentInfo();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'sitelink' | 'structured_snippet'>('all');
  const [showSitelinkDialog, setShowSitelinkDialog] = useState(false);
  const [showSnippetDialog, setShowSnippetDialog] = useState(false);
  const [editingExtension, setEditingExtension] = useState<Extension | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);

  const fetchExtensions = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const url = new URL(`/api/google-ads-extensions/${id}/list`, window.location.origin);
      if (activeTab !== 'all') {
        url.searchParams.set('extensionType', activeTab);
      }

      const res = await fetch(url.toString(), {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed (${res.status})`);
      }

      const data = await res.json();
      setExtensions(data.cmsExtensions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, activeTab]);

  const handleSync = useCallback(async () => {
    if (!id) return;
    setSyncing(true);
    setError(null);

    try {
      const res = await fetch(`/api/google-ads-extensions/${id}/sync`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Sync failed (${res.status})`);
      }

      setSuccess(`Synced ${data.total} extensions (${data.created} created, ${data.updated} updated)`);
      fetchExtensions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }, [id, fetchExtensions]);

  const handleCreateSitelink = useCallback(async (data: {
    linkText: string;
    linkUrl: string;
    description1?: string;
    description2?: string;
  }) => {
    if (!id) return;

    try {
      const res = await fetch(`/api/google-ads-extensions/${id}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          extensionType: 'sitelink',
          level: 'account',
          sitelinkText: data.linkText,
          sitelinkUrl: data.linkUrl,
          sitelinkDescription1: data.description1,
          sitelinkDescription2: data.description2,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed (${res.status})`);
      }

      setSuccess('Sitelink created successfully');
      fetchExtensions();
      setShowSitelinkDialog(false);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id, fetchExtensions]);

  const handleCreateSnippet = useCallback(async (data: {
    header: string;
    values: string[];
  }) => {
    if (!id) return;

    try {
      const res = await fetch(`/api/google-ads-extensions/${id}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          extensionType: 'structured_snippet',
          level: 'account',
          snippetHeader: data.header,
          snippetValues: data.values,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed (${res.status})`);
      }

      setSuccess('Structured snippet created successfully');
      fetchExtensions();
      setShowSnippetDialog(false);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id, fetchExtensions]);

  const handleDeploy = useCallback(async (extension: Extension) => {
    if (!id || !extension.id) return;
    
    setDeploying(extension.id);
    setError(null);

    try {
      const res = await fetch(`/api/google-ads-extensions/${id}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          extensionType: extension.extensionType,
          level: extension.level,
          sitelinkText: extension.sitelinkText,
          sitelinkUrl: extension.sitelinkUrl,
          sitelinkDescription1: extension.sitelinkDescription1,
          sitelinkDescription2: extension.sitelinkDescription2,
          snippetHeader: extension.snippetHeader,
          snippetValues: extension.snippetValues?.split('\n').filter(Boolean),
        }),
      });

      if (!res.ok) {
        throw new Error(`Deploy failed (${res.status})`);
      }

      setSuccess(`${extension.extensionType === 'sitelink' ? 'Sitelink' : 'Snippet'} deployed to Google Ads`);
      fetchExtensions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeploying(null);
    }
  }, [id, fetchExtensions]);

  const handleDelete = useCallback(async (extension: Extension) => {
    if (!id || !extension.id) return;
    if (!confirm(`Delete this ${extension.extensionType}?`)) return;

    try {
      const res = await fetch(`/api/google-ads-extensions/${id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ extensionId: extension.id }),
      });

      if (!res.ok) {
        throw new Error(`Delete failed (${res.status})`);
      }

      setSuccess('Extension deleted');
      fetchExtensions();
    } catch (e: any) {
      setError(e.message);
    }
  }, [id, fetchExtensions]);

  useEffect(() => {
    if (id) {
      fetchExtensions();
    }
  }, [id, fetchExtensions]);

  const filteredExtensions = extensions.filter(ext => 
    activeTab === 'all' || ext.extensionType === activeTab
  );

  const sitelinks = filteredExtensions.filter(e => e.extensionType === 'sitelink');
  const snippets = filteredExtensions.filter(e => e.extensionType === 'structured_snippet');

  return (
    <div style={{ padding: '16px 0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
            Ad Extensions
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Create and manage sitelinks and structured snippets.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSync}
            disabled={loading || syncing}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? 'Syncing...' : 'Sync from Google Ads'}
          </button>
          <button
            onClick={() => setShowSitelinkDialog(true)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            + Sitelink
          </button>
          <button
            onClick={() => setShowSnippetDialog(true)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            + Snippet
          </button>
        </div>
      </div>

      {/* Error/Success display */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            marginBottom: 16,
            color: '#dc2626',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            marginBottom: 16,
            color: '#166534',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {[
          { key: 'all', label: 'All', count: extensions.length },
          { key: 'sitelink', label: 'Sitelinks', count: sitelinks.length },
          { key: 'structured_snippet', label: 'Structured Snippets', count: snippets.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: 'none',
              color: activeTab === tab.key ? '#2563eb' : '#64748b',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Extensions List */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading...</div>
      ) : filteredExtensions.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px dashed #d1d5db',
            color: '#64748b',
          }}
        >
          No {activeTab === 'all' ? '' : activeTab === 'sitelink' ? 'sitelinks' : 'structured snippets'} found.
          <br />
          Create one or sync from Google Ads.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sitelinks */}
          {activeTab !== 'structured_snippet' && sitelinks.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
                Sitelinks
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {sitelinks.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    extension={ext}
                    onDeploy={() => handleDeploy(ext)}
                    onDelete={() => handleDelete(ext)}
                    deploying={deploying === ext.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Structured Snippets */}
          {activeTab !== 'sitelink' && snippets.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
                Structured Snippets
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {snippets.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    extension={ext}
                    onDeploy={() => handleDeploy(ext)}
                    onDelete={() => handleDelete(ext)}
                    deploying={deploying === ext.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <GoogleAdsSitelinkDialog
        isOpen={showSitelinkDialog}
        onClose={() => setShowSitelinkDialog(false)}
        onSave={handleCreateSitelink}
        mode="create"
      />

      <GoogleAdsSnippetDialog
        isOpen={showSnippetDialog}
        onClose={() => setShowSnippetDialog(false)}
        onSave={handleCreateSnippet}
        mode="create"
      />
    </div>
  );
};

// Extension Card Component
function ExtensionCard({
  extension,
  onDeploy,
  onDelete,
  deploying,
}: {
  extension: Extension;
  onDeploy: () => void;
  onDelete: () => void;
  deploying: boolean;
}) {
  const isSitelink = extension.extensionType === 'sitelink';

  return (
    <div
      style={{
        padding: 16,
        background: '#fff',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        {/* Content */}
        <div style={{ flex: 1 }}>
          {isSitelink ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>
                  {extension.sitelinkText || '(No text)'}
                </span>
                <StatusBadge status={extension.status} />
              </div>
              <div style={{ fontSize: 12, color: '#006621', marginBottom: 4 }}>
                {extension.sitelinkUrl}
              </div>
              {(extension.sitelinkDescription1 || extension.sitelinkDescription2) && (
                <div style={{ fontSize: 12, color: '#545454', marginTop: 4 }}>
                  {extension.sitelinkDescription1 && <div>{extension.sitelinkDescription1}</div>}
                  {extension.sitelinkDescription2 && <div>{extension.sitelinkDescription2}</div>}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>
                  {extension.snippetHeader || '(No header)'}
                </span>
                <StatusBadge status={extension.status} />
              </div>
              <div style={{ fontSize: 12, color: '#545454', marginTop: 4 }}>
                {extension.snippetValues?.split('\n').filter(Boolean).join(' | ') || '(No values)'}
              </div>
            </>
          )}

          {/* Meta info */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
            <span>Level: {extension.level}</span>
            {extension.assetId && <span>Asset ID: {extension.assetId}</span>}
            {extension.deployedAt && (
              <span>Deployed: {new Date(extension.deployedAt).toLocaleDateString()}</span>
            )}
          </div>

          {/* Assignments */}
          {extension.assignedCampaigns && extension.assignedCampaigns.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              <strong>Campaigns:</strong> {extension.assignedCampaigns.map(c => c.campaignName).join(', ')}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {extension.status === 'draft' && (
            <button
              onClick={onDeploy}
              disabled={deploying}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                background: deploying ? '#6366f1' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: deploying ? 'not-allowed' : 'pointer',
              }}
            >
              {deploying ? 'Deploying...' : 'Deploy'}
            </button>
          )}
          <button
            onClick={onDelete}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Preview */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: '#f8fafc',
          borderRadius: 6,
          fontSize: 12,
          color: '#545454',
        }}
      >
        <strong style={{ color: '#64748b' }}>Preview:</strong>{' '}
        {isSitelink ? (
          <>
            <span style={{ color: '#1a0dab' }}>{extension.sitelinkText || 'Link Text'}</span>
            {extension.sitelinkDescription1 && <span style={{ display: 'block' }}>{extension.sitelinkDescription1}</span>}
            {extension.sitelinkDescription2 && <span style={{ display: 'block' }}>{extension.sitelinkDescription2}</span>}
          </>
        ) : (
          <>
            <span style={{ fontWeight: 600 }}>{extension.snippetHeader || 'Header'}:</span>{' '}
            {extension.snippetValues?.split('\n').filter(Boolean).join(' | ')}
          </>
        )}
      </div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: Extension['status'] }) {
  const colors: Record<string, { bg: string; text: string }> = {
    draft: { bg: '#f1f5f9', text: '#64748b' },
    deployed: { bg: '#dcfce7', text: '#166534' },
    paused: { bg: '#fef3c7', text: '#92400e' },
    error: { bg: '#fee2e2', text: '#991b1b' },
  };

  const color = colors[status] || colors.draft;

  return (
    <span
      style={{
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        borderRadius: 4,
        background: color.bg,
        color: color.text,
        textTransform: 'uppercase',
      }}
    >
      {status}
    </span>
  );
}

const GoogleAdsAdExtensions = () => {
  const [renderError, setRenderError] = useState<string | null>(null);

  if (renderError) {
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Ad Extensions error: {renderError}
      </div>
    );
  }

  try {
    return <GoogleAdsAdExtensionsInner />;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!renderError) setRenderError(msg);
    return (
      <div style={{ padding: 12, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
        Ad Extensions error: {msg}
      </div>
    );
  }
};

export default GoogleAdsAdExtensions;
