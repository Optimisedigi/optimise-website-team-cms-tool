import React from 'react'
import { Shell } from '../_components/Shell'
import { Icon } from '../_components/Icon'
import { Field, Tabs, SaveBar, ServicePill, Switch } from '../_components/form'

const HR = <hr style={{ border: 'none', borderTop: '1px solid var(--border-soft)', margin: '12px 0' }} />

const STAT_CELL = (label: string, value: React.ReactNode, opts?: { minWidth?: number; valueColor?: string; rightBorder?: boolean }) => (
  <div
    style={{
      background: 'var(--card)',
      padding: '8px 16px',
      minWidth: opts?.minWidth ?? 100,
      borderRight: opts?.rightBorder ? '2px solid var(--border)' : undefined,
    }}
  >
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)', marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', color: opts?.valueColor }}>{value}</div>
  </div>
)

export default function ClientRecordPreview(): React.ReactElement {
  return (
    <Shell
      activeKey="clients"
      crumbs={[{ label: 'Clients' }, { label: 'Acme Corp', strong: true }]}
      collapseGlyph={<Icon name="collapse" size={15} />}
      pagePaddingTop={12}
    >
      {/* Client header */}
      <div className="detail-head" style={{ alignItems: 'flex-start', gap: 16, padding: '12px 16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1>Acme Corp</h1>
              <span className="t-muted" style={{ fontSize: 13 }}>
                🌐 acme.com
              </span>
              <span className="t-muted" style={{ fontSize: 13 }}>
                📍 acme-corp
              </span>
              <span className="pill green">Active</span>
              <span className="pill teal">Recurring</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t3)', marginRight: 2 }}>
                Services
              </span>
              <ServicePill label="Google Ads" defaultOn />
              <ServicePill label="SEO" defaultOn />
              <ServicePill label="Paid Social" />
              <ServicePill label="Website Build" />
              <ServicePill label="Automations" />
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              gap: 1,
              border: '1px solid var(--border)',
              borderRadius: 'var(--r)',
              overflow: 'hidden',
              background: 'var(--border)',
              boxShadow: 'var(--sh-sm)',
              marginTop: 14,
            }}
          >
            {STAT_CELL('Monthly Retainer', '$4,200')}
            {STAT_CELL('Commissions', '$320')}
            {STAT_CELL('One-off Billings', '$750')}
            {STAT_CELL('Total Revenue', '$63,840', { minWidth: 110, valueColor: 'var(--accent)', rightBorder: true })}
            {STAT_CELL("Client Since", "Apr '24", { minWidth: 90 })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={['Business', 'Google Ads', 'SEO', 'Contacts', 'Contracts', 'Invoicing', 'Documents', 'Notes']} />

      {/* Section: Identity */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Business Identity</h2>
            <p>Core naming and the public-facing URL used across proposals, audits and the client hub.</p>
          </div>
          <div className="field-card">
            <div className="frow c3">
              <Field label="Name" opt="*" value="Acme Corp" hint="Legal/business name" />
              <Field label="Trading Name" value="Acme" hint="If different from legal entity" />
              <Field label="Slug" opt="*" value="acme-corp" hint="URL-friendly identifier" />
            </div>
            <div className="frow c3">
              <Field label="Website URL" value="https://acme.com" />
              <Field label="Client PIN" value="4821" hint="4-digit hub access code" />
              <Field label="Website Type" value="Built by Us" select />
            </div>
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border-soft)', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              <div className="toggle-row" style={{ borderBottom: 'none', paddingRight: 16 }}>
                <div className="info">
                  <b>Is Active</b>
                  <small>Enable content publishing for this client</small>
                </div>
                <Switch />
              </div>
              <div className="toggle-row" style={{ borderBottom: 'none', paddingLeft: 16, borderLeft: '1px solid var(--border-soft)' }}>
                <div className="info">
                  <b>Agency Account</b>
                  <small>Hide revenue calculations for this record</small>
                </div>
                <Switch off />
              </div>
              <div className="toggle-row" style={{ paddingRight: 16, borderTop: '1px solid var(--border-soft)' }}>
                <div className="info">
                  <b>Has Physical Locations</b>
                  <small>Does this business operate physical premises?</small>
                </div>
                <Switch />
              </div>
              <div style={{ padding: '10px 0 10px 16px', borderLeft: '1px solid var(--border-soft)', borderTop: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center' }}>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <label style={{ fontSize: 11.5 }}>Number of Locations</label>
                  <div className="input filled" style={{ height: 32, marginTop: 4 }}>
                    3
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {HR}

      {/* Section: Contacts */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Contacts &amp; Managers</h2>
            <p>Primary contact, additional stakeholders and the Optimise account managers assigned to this client.</p>
          </div>
          <div className="field-card">
            <div className="frow c3">
              <Field label="Contact Name" value="Jane Doe" />
              <Field label="Contact Email" value="jane@acme.com" />
              <Field label="Contact Phone" value="+61 2 9000 0000" />
            </div>

            <div className="subhead" style={{ marginTop: 16 }}>
              <h4>Additional Contacts</h4>
              <div className="line" />
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
              <ContactRow name="Mark Lee" title="Operations Manager" email="mark@acme.com" phone="+61 2 9000 0001" />
              <ContactRow name="Priya Shah" title="Marketing Director" email="priya@acme.com" phone="+61 2 9000 0002" topBorder />
            </div>
            <div className="add-row">＋ Add contact</div>

            <div className="subhead" style={{ marginTop: 16 }}>
              <h4>Account Managers</h4>
              <div className="line" />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 0, alignItems: 'center' }}>
                <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-soft)' }}>
                  <div style={{ fontSize: 13 }}>Peter Tu</div>
                </div>
                <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-soft)' }}>
                  <div style={{ fontSize: 13, color: 'var(--t2)' }}>peter@optimisedigital.online</div>
                </div>
                <div style={{ padding: '8px 12px' }}>
                  <span style={{ color: 'var(--t3)', cursor: 'pointer', fontSize: 15 }}>🗑</span>
                </div>
              </div>
            </div>
            <div className="add-row">＋ Add manager</div>
          </div>
        </div>
      </div>

      {HR}

      {/* Section: Billing */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Billing</h2>
            <p>Revenue, retainer history, one-off projects, commissions and historical revenue.</p>
          </div>
          <div className="field-card">
            <div className="frow c2" style={{ marginTop: 14 }}>
              <Field label="Client Type" value="Recurring" select />
              <Field label="Client Start Date" value="2024-04-01" />
            </div>
            <div className="frow c3" style={{ marginTop: 0 }}>
              <Field label="Monthly Retainer" value="$4,200" hint="Net monthly revenue ($)" />
              <Field label="Setup Fee" value="$1,500" hint="One-time, counts toward retainer YTD" />
              <Field label="Revenue Share %" value="100" hint="e.g. 50 for a 50/50 partner split" />
            </div>

            <div className="subhead" style={{ marginTop: 14 }}>
              <h4>One-off Projects</h4>
              <div className="line" />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
              <ProjectHeaderRow />
              <ProjectRow name="Website Rebuild" amount="$3,500" date="12 Jan 2024" border />
              <ProjectRow name="SEO Audit" amount="$750" date="3 Mar 2024" />
            </div>
            <div className="add-row">＋ Add project</div>

            <details style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 14 }}>
              <summary
                style={{
                  padding: '10px 14px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: 'var(--t2)',
                  cursor: 'pointer',
                  listStyle: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--card-2)',
                }}
              >
                ▶ Advanced Billing
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)' }}>— commissions &amp; historical revenue</span>
              </summary>
              <div style={{ padding: 14, borderTop: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div className="subhead" style={{ margin: '0 0 8px' }}>
                    <h4>Referral Commissions</h4>
                    <div className="line" />
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr auto',
                        alignItems: 'center',
                        background: 'var(--card-2)',
                        borderBottom: '1px solid var(--border-soft)',
                        padding: '6px 12px',
                      }}
                    >
                      {['Payee', 'Frequency', 'Type', 'Rate', 'Start', 'End'].map((h) => (
                        <span key={h} style={uppHead}>
                          {h}
                        </span>
                      ))}
                      <span />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr auto', alignItems: 'center', padding: '8px 12px' }}>
                      <div>
                        <div style={{ fontSize: 13 }}>John Smith</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>john@bnisydney.com</div>
                      </div>
                      <span style={cell}>Monthly</span>
                      <span style={cell}>% of retainer</span>
                      <span style={cell}>8%</span>
                      <span style={cell}>Apr &apos;24</span>
                      <span style={cell}>Mar &apos;25</span>
                      <span style={{ color: 'var(--t3)', cursor: 'pointer' }}>🗑</span>
                    </div>
                  </div>
                  <div className="add-row">＋ Add commission</div>
                </div>

                <div>
                  <div className="subhead" style={{ margin: '0 0 8px' }}>
                    <h4>Historical Revenue</h4>
                    <div className="line" />
                    <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500, whiteSpace: 'nowrap' }}>Pre-CMS</span>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr auto',
                        alignItems: 'center',
                        background: 'var(--card-2)',
                        padding: '6px 14px',
                        borderBottom: '1px solid var(--border-soft)',
                      }}
                    >
                      <span style={uppHead}>Year</span>
                      <span style={uppHead}>Amount</span>
                      <span />
                    </div>
                    <YearRow year="2022" amount="$18,400" border />
                    <YearRow year="2023" amount="$24,000" />
                  </div>
                  <div className="add-row">＋ Add year</div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {HR}

      {/* Section: Acquisition */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Acquisition</h2>
            <p>Where this client came from and who referred them.</p>
          </div>
          <div className="field-card">
            <div className="frow c2">
              <Field label="Acquisition Channel" value="Referral Partner" select />
              <Field label="Acquisition Detail" value="BNI — North Sydney chapter" />
            </div>
            <div className="frow c2" style={{ marginTop: 0 }}>
              <Field label="Referred By" value="John Smith" />
              <Field label="Referrer Contact" value="john@bnisydney.com" />
            </div>
          </div>
        </div>
      </div>

      {HR}

      {/* Section: Google Ads */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Google Ads</h2>
            <p>Account linkage. Client must grant MCC access before audits can run.</p>
          </div>
          <div className="field-card">
            <div className="frow c2">
              <Field label="Google Ads Customer ID" value="955-493-5739" hint="Client must grant MCC access" />
              <Field label="External CMS" value="Not applicable" select selectMuted />
            </div>
          </div>
        </div>
      </div>

      <SaveBar />
    </Shell>
  )
}

const uppHead: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--t3)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
}
const cell: React.CSSProperties = { fontSize: 13, color: 'var(--t2)' }

function ContactRow({
  name,
  title,
  email,
  phone,
  topBorder,
}: {
  name: string
  title: string
  email: string
  phone: string
  topBorder?: boolean
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
        gap: 0,
        alignItems: 'center',
        borderTop: topBorder ? '1px solid var(--border-soft)' : undefined,
      }}
    >
      <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-soft)', fontSize: 13 }}>{name}</div>
      <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-soft)', fontSize: 13, color: 'var(--t2)' }}>{title}</div>
      <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-soft)', fontSize: 13, color: 'var(--t2)' }}>{email}</div>
      <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border-soft)', fontSize: 13, color: 'var(--t2)' }}>{phone}</div>
      <div style={{ padding: '8px 12px' }}>
        <span style={{ color: 'var(--t3)', cursor: 'pointer', fontSize: 15 }}>🗑</span>
      </div>
    </div>
  )
}

function ProjectHeaderRow(): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr auto',
        alignItems: 'center',
        background: 'var(--card-2)',
        borderBottom: '1px solid var(--border-soft)',
        padding: '6px 12px',
      }}
    >
      <span style={uppHead}>Project</span>
      <span style={uppHead}>Amount</span>
      <span style={uppHead}>Date</span>
      <span />
    </div>
  )
}

function ProjectRow({ name, amount, date, border }: { name: string; amount: string; date: string; border?: boolean }): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr auto',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: border ? '1px solid var(--border-soft)' : undefined,
      }}
    >
      <span style={{ fontSize: 13 }}>{name}</span>
      <span style={cell}>{amount}</span>
      <span style={cell}>{date}</span>
      <span style={{ color: 'var(--t3)', cursor: 'pointer' }}>🗑</span>
    </div>
  )
}

function YearRow({ year, amount, border }: { year: string; amount: string; border?: boolean }): React.ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr auto',
        alignItems: 'center',
        padding: '8px 14px',
        borderBottom: border ? '1px solid var(--border-soft)' : undefined,
      }}
    >
      <span style={{ fontSize: 13 }}>{year}</span>
      <span style={cell}>{amount}</span>
      <span style={{ color: 'var(--t3)', cursor: 'pointer' }}>🗑</span>
    </div>
  )
}
