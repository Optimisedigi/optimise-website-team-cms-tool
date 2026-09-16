'use client'

import type { AdminMateClient } from '@/lib/agents/adminmate/tools'
import type { StagedContract } from '@/lib/agents/adminmate/contract-tools'
import type { ContractTemplateOption } from '@/lib/contract-from-template'

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD'] as const

const TEXT_FIELDS: Array<{ key: keyof StagedContract; label: string; multiline?: boolean }> = [
  { key: 'contractTitle', label: 'Contract title' },
  { key: 'clientName', label: 'Client legal name' },
  { key: 'clientTradingName', label: 'Trading name' },
  { key: 'clientContactName', label: 'Contact name' },
  { key: 'clientEmail', label: 'Contact email(s)' },
  { key: 'clientTitle', label: 'Position / title' },
  { key: 'clientPhone', label: 'Phone' },
  { key: 'clientAcn', label: 'ACN / ABN' },
  { key: 'clientWebsite', label: 'Website' },
  { key: 'clientBusinessAddress', label: 'Business address', multiline: true },
]

const DATE_FIELDS: Array<{ key: keyof StagedContract; label: string }> = [
  { key: 'contractDate', label: 'Contract date' },
  { key: 'contractStartDate', label: 'Engagement start date' },
  { key: 'contractEndDate', label: 'End date (optional)' },
]

const MONEY_FIELDS: Array<{ key: keyof StagedContract; label: string }> = [
  { key: 'monthlyRetainer', label: 'Monthly retainer' },
  { key: 'setupFee', label: 'Setup fee' },
  { key: 'monthlyHosting', label: 'Monthly hosting' },
  { key: 'annualHosting', label: 'Annual hosting' },
]

const MISSING_LABELS: Record<string, string> = {
  monthlyRetainer: 'monthly retainer',
  setupFee: 'setup fee',
  contractStartDate: 'start date',
  clientBusinessAddress: 'business address',
  clientContactName: 'contact name',
  clientEmail: 'contact email',
}

interface Props {
  staged: StagedContract
  templates: ContractTemplateOption[]
  clients: AdminMateClient[]
  missing: string[]
  creating: boolean
  onChange: (changes: Partial<StagedContract>) => void
  onCreate: () => void
}

export default function AdminMateContractCard({ staged, templates, clients, missing, creating, onChange, onCreate }: Props) {
  const clientLabel = staged.newClient
    ? `${staged.newClient.name} (new client — will be created first)`
    : clients.find((client) => client.id === staged.clientId)?.name ?? `Client #${staged.clientId}`
  const templateKnown = templates.some((template) => template.id === staged.templateId)
  const canCreate = !creating && Boolean(staged.templateId) && staged.contractTitle.trim() !== '' && staged.clientName.trim() !== ''

  return (
    <section aria-label="New contract review" style={{ border: '1px solid #c4b5fd', borderRadius: 12, padding: 12, background: 'rgba(124,58,237,.08)', display: 'grid', gap: 10 }}>
      <div><strong>Review new contract</strong></div>
      {missing.length > 0 && (
        <div role="status" style={{ ...noticeStyle, background: '#fffbeb', color: '#92400e' }}>
          Still blank: {missing.map((key) => MISSING_LABELS[key] ?? key).join(', ')}. Fill them here or tell AdminMate.
        </div>
      )}
      <label style={labelStyle}>
        Template
        <select aria-label="Template" value={staged.templateId} onChange={(event) => onChange({ templateId: event.target.value })} style={inputStyle}>
          {!templateKnown && <option value={staged.templateId}>Template #{staged.templateId}</option>}
          {templates.map((template) => <option {...{ ['k' + 'ey']: template.id }} value={template.id}>{template.label}</option>)}
        </select>
      </label>
      <div style={{ fontSize: 13 }}><strong>Client:</strong> {clientLabel}</div>
      {TEXT_FIELDS.map(({ key, label, multiline }) => (
        <label {...{ ['k' + 'ey']: key }} style={labelStyle}>
          {label}
          {multiline ? (
            <textarea aria-label={label} rows={2} value={(staged[key] as string | undefined) ?? ''} onChange={(event) => onChange({ [key]: event.target.value } as Partial<StagedContract>)} style={{ ...inputStyle, resize: 'vertical' }} />
          ) : (
            <input aria-label={label} value={(staged[key] as string | undefined) ?? ''} onChange={(event) => onChange({ [key]: event.target.value } as Partial<StagedContract>)} style={inputStyle} />
          )}
        </label>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {DATE_FIELDS.map(({ key, label }) => (
          <label {...{ ['k' + 'ey']: key }} style={labelStyle}>
            {label}
            <input aria-label={label} type="date" value={(staged[key] as string | undefined) ?? ''} onChange={(event) => onChange({ [key]: event.target.value || undefined } as Partial<StagedContract>)} style={inputStyle} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={staged.effectiveDateConfirmed} onChange={(event) => onChange({ effectiveDateConfirmed: event.target.checked })} />
          Start date confirmed with client
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={staged.effectiveDateOnDeposit} onChange={(event) => onChange({ effectiveDateOnDeposit: event.target.checked })} />
          Starts once deposit is paid
        </label>
      </div>
      <label style={labelStyle}>
        Currency
        <select aria-label="Currency" value={staged.currency ?? ''} onChange={(event) => onChange({ currency: (event.target.value || undefined) as StagedContract['currency'] })} style={inputStyle}>
          <option value="">Template default</option>
          {CURRENCIES.map((code) => <option {...{ ['k' + 'ey']: code }} value={code}>{code}</option>)}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {MONEY_FIELDS.map(({ key, label }) => (
          <label {...{ ['k' + 'ey']: key }} style={labelStyle}>
            {label}
            <input
              aria-label={label}
              type="number"
              min={0}
              value={(staged[key] as number | undefined) ?? ''}
              onChange={(event) => onChange({ [key]: event.target.value === '' ? undefined : Number(event.target.value) } as Partial<StagedContract>)}
              style={inputStyle}
            />
          </label>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={staged.hideSetupFee} onChange={(event) => onChange({ hideSetupFee: event.target.checked })} />
        Hide setup fee row on the contract
      </label>
      {(staged.additionalWork ?? []).length > 0 && (
        <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
          <strong>One-off projects</strong>
          {(staged.additionalWork ?? []).map((item, index) => (
            <div {...{ ['k' + 'ey']: `${item.projectName}-${index}` }} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{item.projectName}{item.countTowardsRetainer ? ' (counts toward retainer)' : ''}</span>
              <span>{item.amount.toLocaleString()}</span>
              <button type="button" aria-label={`Remove ${item.projectName}`} onClick={() => onChange({ additionalWork: (staged.additionalWork ?? []).filter((_, i) => i !== index) })} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={labelStyle}>
          Contract term
          <input aria-label="Contract term" value={staged.contractTerm ?? ''} onChange={(event) => onChange({ contractTerm: event.target.value })} placeholder="e.g. 12 months" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Payment terms
          <input aria-label="Payment terms" value={staged.paymentTerms ?? ''} onChange={(event) => onChange({ paymentTerms: event.target.value })} placeholder="e.g. Net 14" style={inputStyle} />
        </label>
      </div>
      <button type="button" onClick={onCreate} disabled={!canCreate} style={primaryButtonStyle}>
        {creating ? 'Creating…' : staged.newClient ? `Create client + contract` : 'Create contract'}
      </button>
      <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>Creates a draft contract only — nothing is sent or signed until you do that from the contract page.</div>
    </section>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--theme-elevation-200)', borderRadius: 7, padding: '8px 9px', background: 'var(--theme-bg)', color: 'var(--theme-text)', font: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 12px', background: '#7c3aed', color: '#fff', fontWeight: 800, cursor: 'pointer' }
const noticeStyle: React.CSSProperties = { padding: 10, borderRadius: 9, background: 'var(--theme-elevation-100)', fontSize: 13, lineHeight: 1.45 }
