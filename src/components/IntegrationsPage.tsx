'use client'

import { useEffect, useState } from 'react'
import RocketSplash from './RocketSplash'

interface ClientOption {
  id: string
  name: string
  slug: string
  gscConnected: boolean
  ga4Connected: boolean
}

const IntegrationsPage = () => {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [ga4Disconnecting, setGa4Disconnecting] = useState(false)

  useEffect(() => {
    fetch('/api/clients/list')
      .then((r) => {
        if (!r.ok) {
          console.error('[Integrations] API returned', r.status, r.statusText)
          return null
        }
        return r.json()
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setClients(data)
          // Default to Optimise Digital (agency) if present, otherwise first client
          const agency = data.find((c: ClientOption) => c.name.toLowerCase().includes('optimise digital'))
          setSelectedClientId(agency ? agency.id : data[0].id)
        }
        setLoading(false)
      })
      .catch((err) => { console.error('[Integrations] fetch error:', err); setLoading(false) })
  }, [])

  const selectedClient = clients.find((c) => String(c.id) === String(selectedClientId)) || null

  const handleConnect = () => {
    if (!selectedClient) return
    window.location.href = `/api/gsc/connect?clientId=${selectedClient.id}`
  }

  const handleDisconnect = async () => {
    if (!selectedClient || disconnecting) return
    setDisconnecting(true)
    try {
      await fetch('/api/gsc/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient.id }),
      })
      setClients((prev) =>
        prev.map((c) => c.id === selectedClient.id ? { ...c, gscConnected: false } : c),
      )
    } catch { /* ignore */ } finally {
      setDisconnecting(false)
    }
  }

  const handleGa4Connect = () => {
    if (!selectedClient) return
    window.location.href = `/api/ga4/connect?clientId=${selectedClient.id}`
  }

  const handleGa4Disconnect = async () => {
    if (!selectedClient || ga4Disconnecting) return
    setGa4Disconnecting(true)
    try {
      await fetch('/api/ga4/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient.id }),
      })
      setClients((prev) =>
        prev.map((c) => c.id === selectedClient.id ? { ...c, ga4Connected: false } : c),
      )
    } catch { /* ignore */ } finally {
      setGa4Disconnecting(false)
    }
  }

  if (loading) {
    return <RocketSplash />
  }

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">Integrations</h2>
      <p className="od-settings__subtitle">Manage platform connections for your agency.</p>

      {/* Client Picker */}
      {clients.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginRight: 8 }}>
            Client:
          </label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="od-gsc-page__date-input"
            style={{ minWidth: 200 }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.gscConnected ? ' (GSC)' : ''}{c.ga4Connected ? ' (GA4)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

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
            {selectedClient?.gscConnected ? (
              <>
                <span className="od-settings__status od-settings__status--connected">Connected</span>
                <button className="od-settings__btn od-settings__btn--danger" onClick={handleDisconnect} disabled={disconnecting} type="button">
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </>
            ) : (
              <>
                <span className="od-settings__status">Not Connected</span>
                <button className="od-settings__btn od-settings__btn--primary" onClick={handleConnect} disabled={!selectedClient} type="button">
                  Connect
                </button>
              </>
            )}
          </div>
        </div>

        {/* Google Analytics */}
        <div className="od-settings__card">
          <div className="od-settings__card-header">
            <div className="od-settings__card-icon">GA4</div>
            <div>
              <div className="od-settings__card-name">Google Analytics</div>
              <div className="od-settings__card-desc">Website traffic, conversions, and user behavior</div>
            </div>
          </div>
          <div className="od-settings__card-footer">
            {selectedClient?.ga4Connected ? (
              <>
                <span className="od-settings__status od-settings__status--connected">Connected</span>
                <button className="od-settings__btn od-settings__btn--danger" onClick={handleGa4Disconnect} disabled={ga4Disconnecting} type="button">
                  {ga4Disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </>
            ) : (
              <>
                <span className="od-settings__status">Not Connected</span>
                <button className="od-settings__btn od-settings__btn--primary" onClick={handleGa4Connect} disabled={!selectedClient} type="button">
                  Connect
                </button>
              </>
            )}
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
