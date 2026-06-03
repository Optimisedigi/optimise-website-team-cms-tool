import React from 'react'
import { Shell } from '../_components/Shell'
import { Field, Tabs, SaveBar } from '../_components/form'

export default function GoogleAdsPreview(): React.ReactElement {
  return (
    <Shell
      activeKey="google-ads"
      crumbs={[{ label: 'Google Ads' }, { label: 'Clients' }, { label: 'Acme Corp', strong: true }]}
      searchPlaceholder="Search…"
      collapseGlyph="⇤"
      pagePaddingTop={12}
    >
      {/* Detail header */}
      <div className="detail-head">
        <div className="logo">A</div>
        <div>
          <h1>Acme Corp</h1>
          <div className="meta">
            <span>🌐 acme.com</span>
            <span>🎯 955-493-5739</span>
            <span className="pill green">Active</span>
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn primary">▶ Run Google Ads Audit</button>
      </div>

      {/* Tabs */}
      <Tabs tabs={['Dashboard', 'Audits', 'Negative Keywords', 'Campaigns', 'Ad Copy']} />

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
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-soft)', margin: '22px 0' }} />

      {/* Section: Status & Locations */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Status &amp; Locations</h2>
            <p>Publishing state and physical presence. Locations unlock Google Maps listings below.</p>
          </div>
          <div className="field-card">
            <div className="toggle-row">
              <div className="info">
                <b>Is Active</b>
                <small>Enable content publishing for this client</small>
              </div>
              <div className="switch" />
            </div>
            <div className="toggle-row">
              <div className="info">
                <b>Has Physical Locations</b>
                <small>Does this business operate physical premises?</small>
              </div>
              <div className="switch" />
            </div>
            <div className="toggle-row">
              <div className="info">
                <b>Agency Account</b>
                <small>Hide revenue calculations for this record</small>
              </div>
              <div className="switch off" />
            </div>
            <div className="frow c3" style={{ marginTop: 16 }}>
              <Field label="Number of Locations" value="3" />
              <Field label="Conversion Goal" value="Lead Generation" select />
              <Field label="Secondary Goal" value="Phone Calls" select />
            </div>
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-soft)', margin: '22px 0' }} />

      {/* Section: Contacts */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Contacts &amp; Managers</h2>
            <p>Primary contact, additional stakeholders and the Optimise account managers assigned to this client.</p>
          </div>
          <div className="field-card">
            <div className="frow c2">
              <Field label="Contact Name" value="Jane Doe" />
              <Field label="Contact Email" value="jane@acme.com" />
            </div>

            <div className="subhead" style={{ marginTop: 22 }}>
              <h4>Additional Contacts</h4>
              <div className="line" />
            </div>
            <div className="array-row">
              <div className="field" style={{ margin: 0 }}>
                <div className="input filled">Mark Lee</div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="input filled">mark@acme.com</div>
              </div>
              <div className="del">🗑</div>
            </div>
            <div className="array-row">
              <div className="field" style={{ margin: 0 }}>
                <div className="input filled">Priya Shah · Marketing Dir.</div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="input filled">priya@acme.com</div>
              </div>
              <div className="del">🗑</div>
            </div>
            <div className="add-row">＋ Add contact</div>

            <div className="subhead" style={{ marginTop: 22 }}>
              <h4>Account Managers</h4>
              <div className="line" />
            </div>
            <div className="array-row">
              <div className="field" style={{ margin: 0 }}>
                <div className="input filled">Peter Tu</div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="input filled">peter@optimisedigital.online</div>
              </div>
              <div className="del">🗑</div>
            </div>
            <div className="add-row">＋ Add manager</div>
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-soft)', margin: '22px 0' }} />

      {/* Section: Google Ads & Acquisition */}
      <div className="sec">
        <div className="form-grid">
          <div className="sec-aside">
            <h2>Google Ads &amp; Acquisition</h2>
            <p>Account linkage (needs MCC access) and where this client came from for attribution.</p>
          </div>
          <div className="field-card">
            <div className="frow c2">
              <Field label="Google Ads Customer ID" value="955-493-5739" hint="Client must grant MCC access" />
              <Field label="External CMS" value="Not applicable" select selectMuted />
            </div>
            <div className="frow c2" style={{ marginTop: 16 }}>
              <Field label="Acquisition Channel" value="Referral Partner" select />
              <Field label="Acquisition Detail" value="BNI — North Sydney chapter" />
            </div>
          </div>
        </div>
      </div>

      <SaveBar />
    </Shell>
  )
}
