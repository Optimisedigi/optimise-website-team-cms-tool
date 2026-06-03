'use client'

import { useEffect, useState } from 'react'

interface FunnelStage {
  stage: string
  label: string
  count: number
}

interface ChannelData {
  channel: string
  label: string
  color: string
  total: number
  active: number
  won: number
  lost: number
  totalValue: number
  wonValue: number
  conversionRate: number
  avgDaysToClose: number
  stages: Record<string, number>
}

interface SalesFunnelData {
  summary: {
    totalLeads: number
    totalWon: number
    totalLost: number
    totalActive: number
    totalPipelineValue: number
    totalWonValue: number
    overallConversionRate: number
    bestChannel: { label: string; conversionRate: number } | null
  }
  funnel: FunnelStage[]
  channels: ChannelData[]
  stageLabels: Record<string, string>
  ga4Connected?: boolean
}

const FUNNEL_COLORS = ['#213843', '#1f7fad', '#2c97c9', '#468D8B', '#74B3A8']
const STAGE_ORDER = ['new_lead', 'contacted', 'meeting_booked', 'proposal_sent', 'contract_sent', 'client']

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function stageCount(funnel: FunnelStage[], stage: string): number {
  return funnel.find((item) => item.stage === stage)?.count || 0
}

function channelStageCount(channel: ChannelData, stages: string[]): number {
  return stages.reduce((sum, stage) => sum + (channel.stages[stage] || 0), 0)
}

function buildMockStages(data: SalesFunnelData): Array<{ label: string; count: number; color: string }> {
  const leads = data.summary.totalLeads || stageCount(data.funnel, 'new_lead') || data.funnel[0]?.count || 0
  const qualified =
    stageCount(data.funnel, 'contacted') + stageCount(data.funnel, 'meeting_booked') ||
    data.funnel.find((item) => ['qualified', 'meeting_booked', 'contacted'].includes(item.stage))?.count ||
    0
  const proposals = stageCount(data.funnel, 'proposal_sent') + stageCount(data.funnel, 'contract_sent') + stageCount(data.funnel, 'client')
  const auditDelivered = stageCount(data.funnel, 'contract_sent') + stageCount(data.funnel, 'client')
  const won = stageCount(data.funnel, 'client') || data.summary.totalWon

  return [
    { label: 'Leads', count: leads, color: FUNNEL_COLORS[0] },
    { label: 'Qualified', count: qualified, color: FUNNEL_COLORS[1] },
    { label: 'Proposal Sent', count: proposals, color: FUNNEL_COLORS[2] },
    { label: 'Audit Delivered', count: auditDelivered, color: FUNNEL_COLORS[3] },
    { label: 'Won (Client)', count: won, color: FUNNEL_COLORS[4] },
  ]
}

function winRateClass(rate: number): string {
  if (rate >= 50) return 'od-pill od-pill--green'
  if (rate >= 25) return 'od-pill od-pill--amber'
  return 'od-pill od-pill--red'
}

const SalesFunnelDashboard = () => {
  const [data, setData] = useState<SalesFunnelData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/sales-funnel?period=90d')
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (payload && !payload.error) setData(payload)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading && !data) {
    return (
      <div className="od-mock-funnel" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading sales funnel data...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="od-mock-funnel" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 13 }}>No sales funnel data available.</p>
      </div>
    )
  }

  const stages = buildMockStages(data)
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1)
  const conversions = [
    { label: 'Lead → Qualified', rate: safeRate(stages[1]?.count || 0, stages[0]?.count || 0) },
    { label: 'Qualified → Proposal', rate: safeRate(stages[2]?.count || 0, stages[1]?.count || 0) },
    { label: 'Proposal → Won', rate: safeRate(stages[4]?.count || 0, stages[2]?.count || 0) },
  ]
  const donutRate = data.summary.overallConversionRate || safeRate(stages[4]?.count || 0, stages[0]?.count || 0)

  return (
    <div className="od-mock-funnel">
      <div className="od-band">
        <div className="od-band__text">
          <span className="od-band__eyebrow">Pipeline</span>
          <h2>Sales Funnel</h2>
        </div>
        <div className="od-band__spacer" />
        <span className="od-box__period">Lead → Client · last 90 days</span>
      </div>

      <div className="od-mock-funnel__grid">
        <div className="od-box">
          <div className="od-box__body od-card-pad">
            <div className="od-mock-funnel__bars">
              {stages.map((stage) => (
                <div key={stage.label} className="od-mock-funnel__bar-row">
                  <div className="od-mock-funnel__bar-label">{stage.label}</div>
                  <div className="od-mock-funnel__bar-track">
                    <div
                      className="od-mock-funnel__bar"
                      style={{ width: `${Math.max((stage.count / maxCount) * 100, 8)}%`, background: stage.color }}
                    >
                      {stage.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="od-box od-conversion">
          <div className="od-box__head">
            <span className="od-box__title">Conversion</span>
          </div>
          <div className="od-box__body od-card-pad od-conversion__body">
            <div
              className="od-conversion__donut"
              style={{ background: `conic-gradient(#468D8B 0 ${donutRate}%, #eef0f3 ${donutRate}% 100%)` }}
            >
              <div className="od-conversion__center">
                <strong>{donutRate}%</strong>
                <span>WIN RATE</span>
              </div>
            </div>
            <div className="od-conversion__rows">
              {conversions.map((conversion) => (
                <div key={conversion.label} className="od-conversion__row">
                  <span>{conversion.label}</span>
                  <strong>{conversion.rate}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="od-box">
        <div className="od-box__head">
          <span className="od-box__title">Lead Channel Performance</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="od-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Leads</th>
                <th className="num">Qualified</th>
                <th className="num">Proposals</th>
                <th className="num">Won</th>
                <th className="num">Win Rate</th>
                <th className="num">Avg Deal</th>
                <th className="num">Pipeline Value</th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((channel) => {
                const qualified = channelStageCount(channel, ['contacted', 'meeting_booked'])
                const proposals = channelStageCount(channel, ['proposal_sent', 'contract_sent', 'client'])
                const avgDeal = channel.won > 0 ? Math.round(channel.wonValue / channel.won) : 0
                const pipelineValue = Math.max(channel.totalValue - channel.wonValue, 0)
                return (
                  <tr key={channel.channel}>
                    <td>
                      <span className="od-mock-funnel__channel">
                        <span style={{ background: channel.color }} />
                        {channel.label}
                      </span>
                    </td>
                    <td className="num">{channel.total}</td>
                    <td className="num">{qualified}</td>
                    <td className="num">{proposals}</td>
                    <td className="num">{channel.won}</td>
                    <td className="num"><span className={winRateClass(channel.conversionRate)}>{channel.conversionRate}%</span></td>
                    <td className="num">${avgDeal.toLocaleString()}</td>
                    <td className="num">${pipelineValue.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default SalesFunnelDashboard
