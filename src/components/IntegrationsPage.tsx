'use client'

import { useEffect, useState } from 'react'

interface IntegrationStatus {
  clientId: string | null
  gscConnected: boolean
}

const IntegrationsPage = () => {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => {
        if (!r.ok) {
          console.error('[Integrations] API returned', r.status, r.statusText)
          return null
        }
        return r.json()
      })
      .then((d) => {
        if (d && !d.error) {
          setStatus({
            clientId: d.gsc?.clientId || null,
            gscConnected: d.gsc?.gscConnected || false,
          })
        }
        setLoading(false)
      })
      .catch((err) => { console.error('[Integrations] fetch error:', err); setLoading(false) })
  }, [])

  const handleConnect = () => {
    if (!status?.clientId) return
    window.location.href = `/api/gsc/connect?clientId=${status.clientId}`
  }

  const handleDisconnect = async () => {
    if (!status?.clientId || disconnecting) return
    setDisconnecting(true)
    try {
      await fetch('/api/gsc/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: status.clientId }),
      })
      setStatus({ ...status, gscConnected: false })
    } catch { /* ignore */ } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return <div className="od-settings"><p style={{ color: '#6b7280', padding: '60px 0' }}>Loading...</p></div>
  }

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">Integrations</h2>
      <p className="od-settings__subtitle">Manage platform connections for your agency.</p>

      <div className="od-settings__grid">
        {/* Google Search Console */}
        <div className="od-settings__card">
          <div className="od-settings__card-header">
            <div className="od-settings__card-icon">GSC</div>
            <div>
              <div className="od-settings__card-name">Google Search Console</div>
              <div className="od-settings__card-desc">Search performance, indexing status, and Core Web Vitals</div>
            </div>
          </div>
          <div className="od-settings__card-footer">
            {status?.gscConnected ? (
              <>
                <span className="od-settings__status od-settings__status--connected">Connected</span>
                <button className="od-settings__btn od-settings__btn--danger" onClick={handleDisconnect} disabled={disconnecting} type="button">
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </>
            ) : (
              <>
                <span className="od-settings__status">Not Connected</span>
                <button className="od-settings__btn od-settings__btn--primary" onClick={handleConnect} disabled={!status?.clientId} type="button">
                  Connect
                </button>
              </>
            )}
          </div>
        </div>

        {/* Google Analytics */}
        <div className="od-settings__card od-settings__card--disabled">
          <div className="od-settings__card-header">
            <div className="od-settings__card-icon">GA4</div>
            <div>
              <div className="od-settings__card-name">Google Analytics</div>
              <div className="od-settings__card-desc">Website traffic, conversions, and user behavior</div>
            </div>
          </div>
          <div className="od-settings__card-footer">
            <span className="od-settings__badge">Coming Soon</span>
          </div>
        </div>

        {/* Google Ads */}
        <div className="od-settings__card od-settings__card--disabled">
          <div className="od-settings__card-header">
            <div className="od-settings__card-icon">Ads</div>
            <div>
              <div className="od-settings__card-name">Google Ads</div>
              <div className="od-settings__card-desc">Campaign performance, spend, and conversion tracking</div>
            </div>
          </div>
          <div className="od-settings__card-footer">
            <span className="od-settings__badge">Coming Soon</span>
          </div>
        </div>

        {/* Meta Ads */}
        <div className="od-settings__card od-settings__card--disabled">
          <div className="od-settings__card-header">
            <div className="od-settings__card-icon">Meta</div>
            <div>
              <div className="od-settings__card-name">Meta Ads</div>
              <div className="od-settings__card-desc">Facebook and Instagram ad performance</div>
            </div>
          </div>
          <div className="od-settings__card-footer">
            <span className="od-settings__badge">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default IntegrationsPage
