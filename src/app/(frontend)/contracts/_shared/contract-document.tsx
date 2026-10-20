'use client'

/**
 * Read-only contract document pieces shared by the public signing page
 * (/contracts/sign/[token]) and the draft review page
 * (/contracts/review/[token]), so both always show the same wording.
 * Moved verbatim from the signing page.
 */
import type React from 'react'
import { Schibsted_Grotesk, Source_Serif_4 } from 'next/font/google'

const contractSans = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--contract-sans',
  display: 'swap',
})

const contractSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--contract-serif',
  display: 'swap',
})

export const contractFontClassName = `${contractSans.variable} ${contractSerif.variable}`

export interface ContractInfo {
  contractTitle: string
  clientName: string
  clientContactName?: string
  clientEmail: string
  clientTitle?: string
  clientPhone?: string
  clientWebsite?: string
  contractDate: string
  contractStartDate?: string
  contractEndDate?: string
  effectiveDateConfirmed?: boolean
  effectiveDateOnDeposit?: boolean
  clientAcn?: string
  clientBusinessAddress?: string
  monthlyRetainer?: number
  setupFee?: number
  hideSetupFee?: boolean
  monthlyHosting?: number
  annualHosting?: number
  additionalWork?: Array<{ projectName?: string | null; amount?: number | null }>
  currency?: string
  contractTerm?: string
  paymentTerms?: string
  scopeOfWork?: string
  scopeOfWorkHtml?: string
  pricingNotes?: string
  pricingNotesHtml?: string
  paymentTermsOverride?: string
  paymentTermsOverrideHtml?: string
  terminationOverride?: string
  terminationOverrideHtml?: string
  annualReviewEnabled?: boolean
  annualReviewIntroHtml?: string
  annualReviewTierTable?: { headers: string[]; rows: string[][] } | null
  annualReviewNoticeHtml?: string
  annualReviewGoodFaithReviewHtml?: string
  annualReviewAcceptanceHtml?: string
  agencyContactName?: string
  agencyContactEmail?: string
  agencyContactPhone?: string
  agencySignerName?: string
  agencySignerTitle?: string
  agencySignature?: string
  agencySignedAt?: string
}

const CURRENCY_LOCALE: Record<string, string> = {
  AUD: 'en-AU',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-IE',
  NZD: 'en-NZ',
  CAD: 'en-CA',
  SGD: 'en-SG',
}

export function formatCurrency(amount: number, currency = 'AUD'): string {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-AU'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export const pageStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#f3f1ec',
  minHeight: '100vh',
  padding: '40px 16px',
}

export const docStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  background: '#fff',
  padding: '54px 64px 46px',
  fontFamily: 'var(--contract-serif), Georgia, serif',
  color: '#141d18',
  lineHeight: 1.65,
  fontSize: 15,
  boxShadow: '0 14px 44px rgba(27, 44, 35, 0.10)',
}

export const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #d8ded9',
  margin: '32px 0',
}

export const hrThickStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '3px solid #1b4332',
  margin: '34px 0',
}

function agencyContact(contract: ContractInfo) {
  return {
    agencyContactName: contract.agencyContactName || 'Peter Tu',
    agencyContactEmail: contract.agencyContactEmail || 'peter@optimisedigital.online',
    agencyContactPhone: contract.agencyContactPhone || '0493053188',
    // Agency contact title — same person as the signer in practice, so we reuse
    // agencySignerTitle rather than maintaining a parallel field.
    agencyContactTitle: contract.agencySignerTitle || '',
  }
}

export function ContractHeaderAndCover({ contract, clientDisplayName }: { contract: ContractInfo; clientDisplayName: string }) {
  return (
    <>
      <header className="contract-header">
        <img
          className="contract-logo"
          src="/contract-logo.png"
          alt="Optimise Digital"
        />
        <span>Contract Agreement</span>
      </header>

      <section className="contract-cover" aria-labelledby="contract-title">
        <div className="contract-cover-copy">
          <h1 id="contract-title">{contract.contractTitle || 'Contract Agreement'}</h1>
          <p className="contract-intro">
            Between Optimise Digital Pty Ltd and {clientDisplayName}.
          </p>
        </div>

        <dl className="contract-summary">
          <div><dt>Prepared for</dt><dd>{clientDisplayName}</dd></div>
          <div><dt>Prepared by</dt><dd>Optimise Digital Pty Ltd</dd></div>
          <div><dt>Effective date</dt><dd>{formatDate(contract.contractDate)}</dd></div>
          <div><dt>Engagement</dt><dd>{contract.contractTitle || 'Digital services'}</dd></div>
        </dl>
      </section>
    </>
  )
}

export function ContractServiceProvider({ contract }: { contract: ContractInfo }) {
  const { agencyContactName, agencyContactEmail, agencyContactPhone, agencyContactTitle } = agencyContact(contract)
  return (
    <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        <strong>Service Provider</strong>: Optimise Digital Pty Ltd
      </p>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        <strong>ACN</strong>: 651 821 180
      </p>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        <strong>Address</strong>: 72A Yelverton St, Sydenham NSW 2044
      </p>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        <strong>Contact Person:</strong> {agencyContactName}
        {agencyContactTitle && (
          <>
            {'   '}<strong>Title:</strong> {agencyContactTitle}
          </>
        )}
      </p>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        <strong>Email</strong>: {agencyContactEmail}
      </p>
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        <strong>Phone</strong>: {agencyContactPhone}
      </p>
    </div>
  )
}

export function ContractEffectiveDates({ contract }: { contract: ContractInfo }) {
  return (
    <>
      <p style={{ fontSize: 15, margin: '24px 0 0' }}>
        <strong>Effective Date:</strong> {formatDate(contract.contractDate)}
        {/* Precedence: deposit qualifier wins when ON; otherwise show the
            "to be confirmed" qualifier unless the date is confirmed. */}
        {contract.effectiveDateOnDeposit ? (
          <> <span style={{ color: '#666', fontStyle: 'italic' }}>(the date on which Optimise Digital receives the signed Agreement and the initial 50% deposit)</span></>
        ) : !contract.effectiveDateConfirmed ? (
          <> <span style={{ color: '#666', fontStyle: 'italic' }}>(to be confirmed with client)</span></>
        ) : null}
      </p>

      {/* Optional end date — rendered only when the operator entered one. */}
      {contract.contractEndDate ? (
        <p style={{ fontSize: 15, margin: '6px 0 0' }}>
          <strong>End Date:</strong> {formatDate(contract.contractEndDate)}
        </p>
      ) : null}
    </>
  )
}

export function ContractBodySections({ contract }: { contract: ContractInfo }) {
  const currency = contract.currency || 'AUD'
  const setupAmount = formatCurrency(contract.setupFee ?? 0, currency)
  const retainerAmount = formatCurrency(contract.monthlyRetainer ?? 0, currency)
  const hostingAmount = contract.monthlyHosting ? formatCurrency(contract.monthlyHosting, currency) : null
  return (
    <>
      {/* === Body block (Scope of Work onwards) — reduced font size, tighter bullets === */}
      <div className="contract-body" style={{ fontSize: 13, lineHeight: 1.5 }}>

      {/* Scope of Work - rendered as rich HTML */}
      {(contract.scopeOfWorkHtml || contract.scopeOfWork) && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Scope of Work</h2>
          {contract.scopeOfWorkHtml ? (
            <div
              className="scope-content"
              dangerouslySetInnerHTML={{ __html: contract.scopeOfWorkHtml }}
              style={{ fontSize: 13, lineHeight: 1.5 }}
            />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{contract.scopeOfWork}</div>
          )}
          <hr style={hrStyle} />
        </>
      )}

      {/* Pricing — always rendered. Horizontal-rules-only look matching the design spec. */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Pricing</h2>
      <table style={{ width: '60%', borderCollapse: 'collapse', marginBottom: 14, borderTop: '1px solid #111', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #111' }}>
            <th style={{ padding: '6px 4px', textAlign: 'left', fontWeight: 700 }}>Service</th>
            <th style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>Amount ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {/* Row order (mirrors PDF / DOCX):
              1. Additional Work projects
              2. One-time setup fee (unless hideSetupFee is ON)
              3. Monthly management retainer
              4. Monthly / annual hosting */}
          {Array.isArray(contract.additionalWork) &&
            contract.additionalWork
              .filter((item) => item?.projectName && String(item.projectName).trim() !== '')
              .map((item, i) => (
                <tr key={`aw-${i}`} style={{ borderBottom: '1px solid #d4d4d4' }}>
                  <td style={{ padding: '5px 4px' }}>{item.projectName}</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}>{formatCurrency(item.amount ?? 0, currency)}</td>
                </tr>
              ))}
          {!contract.hideSetupFee && (
            <tr style={{ borderBottom: '1px solid #d4d4d4' }}>
              <td style={{ padding: '5px 4px' }}>One-time setup fee</td>
              <td style={{ padding: '5px 4px', textAlign: 'right' }}>{formatCurrency(contract.setupFee ?? 0, currency)}</td>
            </tr>
          )}
          {contract.monthlyRetainer != null && contract.monthlyRetainer > 0 && (
            <tr style={{ borderBottom: '1px solid #d4d4d4' }}>
              <td style={{ padding: '5px 4px' }}>Monthly management retainer</td>
              <td style={{ padding: '5px 4px', textAlign: 'right' }}>{formatCurrency(contract.monthlyRetainer, currency)}/month</td>
            </tr>
          )}
          {contract.monthlyHosting != null && contract.monthlyHosting > 0 && (
            <tr style={{ borderBottom: '1px solid #d4d4d4' }}>
              <td style={{ padding: '5px 4px' }}>Monthly hosting</td>
              <td style={{ padding: '5px 4px', textAlign: 'right' }}>{formatCurrency(contract.monthlyHosting, currency)}/month</td>
            </tr>
          )}
          {contract.annualHosting != null && contract.annualHosting > 0 && (
            <tr style={{ borderBottom: '1px solid #d4d4d4' }}>
              <td style={{ padding: '5px 4px' }}>Annual hosting</td>
              <td style={{ padding: '5px 4px', textAlign: 'right' }}>{formatCurrency(contract.annualHosting, currency)}/year</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pricing Notes */}
      {(contract.pricingNotesHtml || contract.pricingNotes) && (
        <div style={{ marginTop: 12, marginBottom: 6 }}>
          {contract.pricingNotesHtml ? (
            <div
              className="scope-content"
              dangerouslySetInnerHTML={{ __html: contract.pricingNotesHtml }}
              style={{ fontSize: 13, lineHeight: 1.5 }}
            />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{contract.pricingNotes}</div>
          )}
        </div>
      )}

      <hr style={hrStyle} />

      {/* Payment Terms */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Payment Terms:</h2>
      {contract.paymentTermsOverrideHtml ? (
        <div
          className="scope-content"
          dangerouslySetInnerHTML={{ __html: contract.paymentTermsOverrideHtml }}
          style={{ fontSize: 13, lineHeight: 1.5 }}
        />
      ) : contract.paymentTermsOverride ? (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{contract.paymentTermsOverride}</div>
      ) : (
        <ul style={{ margin: '0 0 6px', paddingLeft: 24, lineHeight: 1.25 }}>
          {!contract.hideSetupFee && (
            <li style={{ marginBottom: 0 }}>The one-time setup fee of {setupAmount} is payable upon signing of this contract.</li>
          )}
          <li style={{ marginBottom: 0 }}>The monthly retainer of {retainerAmount} will be invoiced on the first day of each month. If the engagement begins partway through a calendar month, the first month's retainer will be pro-rated based on the number of remaining days in that month. From the following month onward, the full monthly retainer will be invoiced on the 1st of each month.</li>
          {hostingAmount && (
            <li style={{ marginBottom: 0 }}>The monthly hosting fee of {hostingAmount} will be invoiced alongside the monthly retainer.</li>
          )}
          <li style={{ marginBottom: 0 }}>Invoices are due within 14 days of issue.</li>
          <li style={{ marginBottom: 0 }}>This contract will automatically renew on a rolling monthly basis unless terminated by either party with a 30-day written notice.</li>
        </ul>
      )}

      <hr style={hrStyle} />

      {/* Annual Review & Tier Adjustment (optional) — sits after Payment Terms */}
      {contract.annualReviewEnabled && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Annual Review and Adjustment</h2>
          {contract.annualReviewIntroHtml && (
            <div
              className="scope-content"
              dangerouslySetInnerHTML={{ __html: contract.annualReviewIntroHtml }}
              style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}
            />
          )}
          {contract.annualReviewTierTable && (
            <table
              style={{
                width: '90%',
                borderCollapse: 'collapse',
                borderTop: '1px solid #111',
                margin: '10px 0 14px',
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #111' }}>
                  {contract.annualReviewTierTable.headers.map((header, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '6px 6px',
                        textAlign: 'left',
                        fontWeight: 700,
                        verticalAlign: 'bottom',
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contract.annualReviewTierTable.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid #d4d4d4' }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '5px 4px' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {contract.annualReviewNoticeHtml && (
            <div
              className="scope-content"
              dangerouslySetInnerHTML={{ __html: contract.annualReviewNoticeHtml }}
              style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}
            />
          )}
          {contract.annualReviewGoodFaithReviewHtml && (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 4px' }}>Good Faith Review</h4>
              <div
                className="scope-content"
                dangerouslySetInnerHTML={{ __html: contract.annualReviewGoodFaithReviewHtml }}
                style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}
              />
            </>
          )}
          {contract.annualReviewAcceptanceHtml && (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 4px' }}>Acceptance of Adjustment</h4>
              <div
                className="scope-content"
                dangerouslySetInnerHTML={{ __html: contract.annualReviewAcceptanceHtml }}
                style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}
              />
            </>
          )}
          <hr style={hrStyle} />
        </>
      )}

      {/* Termination */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Termination:</h2>
      {contract.terminationOverrideHtml ? (
        <div
          className="scope-content"
          dangerouslySetInnerHTML={{ __html: contract.terminationOverrideHtml }}
          style={{ fontSize: 13, lineHeight: 1.5 }}
        />
      ) : contract.terminationOverride ? (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{contract.terminationOverride}</div>
      ) : (
        <ul style={{ margin: '0 0 6px', paddingLeft: 24, lineHeight: 1.25 }}>
          <li style={{ marginBottom: 0 }}>Either party may terminate this contract with a 30-day written notice.</li>
          <li style={{ marginBottom: 0 }}>Upon termination, the Client agrees to pay for all services rendered up to the termination date.</li>
          <li style={{ marginBottom: 0 }}>Upon termination, Optimise Digital will provide the Client with full access to and ownership of all Google Ads campaigns, conversion tracking, and assets created during the engagement.</li>
        </ul>
      )}

      <hr style={hrStyle} />

      {/* Confidentiality - exact wording from PDF */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Confidentiality:</h2>
      <ul style={{ margin: '0 0 6px', paddingLeft: 24, lineHeight: 1.5 }}>
        <li>Either party may disclose Confidential Information to the other. &quot;Confidential Information&quot; includes all non-public information about the Disclosing Party&apos;s business, technology, structure, and strategies, whether conveyed orally or in tangible form, and whether or not marked as &quot;confidential.&quot; The Recipient will keep the Confidential Information in trust, not disclose it to others, and ensure that its employees, agents, or any persons under its direction do the same, indefinitely.</li>
      </ul>

      </div>
      {/* === End body block === */}
    </>
  )
}

export function ContractDocumentStyles() {
  return (
    <style>{`
      .signing-doc {
        width: 100%;
        box-sizing: border-box;
        border-top: 8px solid #1b4332;
        overflow-wrap: anywhere;
      }
      .contract-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding-bottom: 22px;
        border-bottom: 1px solid #d8ded9;
        color: #5b6a62;
        font-family: var(--contract-sans), sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .09em;
        text-transform: uppercase;
      }
      .contract-logo {
        display: block;
        width: 131px;
        max-width: 58%;
        height: auto;
      }
      .contract-cover {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(260px, .75fr);
        gap: 52px;
        align-items: end;
        min-height: 420px;
        padding: 64px 0 50px;
      }
      .contract-action-title {
        margin: 0 0 12px;
        color: #1b4332;
        font-family: var(--contract-sans), sans-serif;
        font-size: 12px;
        font-weight: 750;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .contract-cover h1 {
        max-width: 620px;
        margin: 0;
        color: #141d18;
        font-family: var(--contract-sans), sans-serif;
        font-size: clamp(42px, 6vw, 64px);
        line-height: 1.02;
        letter-spacing: -.05em;
        text-wrap: balance;
      }
      .contract-intro {
        max-width: 560px;
        margin: 28px 0 0;
        color: #46534c;
        font-size: 18px;
        line-height: 1.6;
      }
      .contract-summary {
        margin: 0;
        padding: 0;
        border-top: 3px solid #1b4332;
        font-family: var(--contract-sans), sans-serif;
      }
      .contract-summary div {
        padding: 13px 0;
        border-bottom: 1px solid #d8ded9;
      }
      .contract-summary dt {
        margin-bottom: 3px;
        color: #68766e;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .contract-summary dd {
        margin: 0;
        color: #141d18;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
      }
      .signing-doc h2,
      .signing-doc h3,
      .signing-doc h4,
      .signing-doc th,
      .signing-doc button,
      .signing-doc label,
      .signing-doc strong {
        font-family: var(--contract-sans), sans-serif;
      }
      .signing-doc h2 {
        color: #1b4332;
        letter-spacing: -.01em;
      }
      .contract-action-card {
        margin-bottom: 24px;
        padding: 22px 24px;
        border: 1px solid #b9c9bf;
        border-left: 5px solid #1b4332;
        border-radius: 2px;
        background: #f5f8f5;
      }
      .contract-action-title { margin-bottom: 8px; }
      .contract-signature-card { scroll-margin-top: 24px; }
      .signing-doc table {
        width: 100% !important;
        border-top-color: #1b4332 !important;
        font-family: var(--contract-sans), sans-serif;
      }
      .signing-doc thead {
        color: #fff;
        background: #1b4332;
      }
      .signing-doc th { padding: 9px 10px !important; }
      .signing-doc td { padding: 8px 10px !important; }
      .signing-doc input:focus-visible,
      .signing-doc textarea:focus-visible,
      .signing-doc button:focus-visible,
      .signing-doc a:focus-visible {
        outline: 3px solid #d4a017;
        outline-offset: 3px;
      }
      .signing-doc button:not(:disabled) {
        transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
      }
      .signing-doc button:not(:disabled):hover { filter: brightness(.92); }
      /* Client-details grid: 2 cols on tablet+ (≥ 600px), 1 col on phones. */
      .signing-fields-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 16px;
      }
      .signing-field { display: block; }
      /* Wide variant — spans both columns so the business-address textarea
         gets the full width on tablet+; falls back to single column on
         mobile via the grid template below. */
      .signing-field--wide { grid-column: 1 / -1; }
      @media (max-width: 720px) {
        .contract-cover {
          grid-template-columns: 1fr;
          gap: 36px;
          min-height: 0;
          padding: 48px 0 38px;
        }
        .contract-cover h1 { font-size: clamp(36px, 11vw, 44px); }
      }
      @media (max-width: 599px) {
        .signing-fields-grid { grid-template-columns: 1fr; }
        .signing-doc {
          width: calc(100vw - 32px) !important;
          max-width: calc(100vw - 32px) !important;
          padding: 28px 18px !important;
          box-shadow: none !important;
        }
        .contract-header { align-items: flex-start; }
        .contract-header span { max-width: 90px; text-align: right; }
        .contract-logo { max-width: 64%; }
        .contract-action-card { padding: 18px 16px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .signing-doc * { scroll-behavior: auto !important; transition-duration: .01ms !important; }
      }
      @media (forced-colors: active) {
        .signing-doc, .contract-action-card, .contract-summary, .contract-header {
          border-color: CanvasText;
        }
        .signing-doc thead { color: Canvas; background: CanvasText; }
      }
      .scope-content p { margin: 0 0 6px; min-height: 1em; }
      .scope-content p:empty { margin: 0 0 8px; }
      .scope-content h1, .scope-content h2, .scope-content h3, .scope-content h4 { margin: 12px 0 6px; font-weight: 700; }
      .scope-content h1 { font-size: 16px; }
      .scope-content h2 { font-size: 14px; }
      .scope-content h3 { font-size: 13px; }
      .scope-content h4 { font-size: 13px; }
      .scope-content ul { margin: 0 0 6px; padding-left: 24px; list-style-type: disc; }
      .scope-content ol { margin: 0 0 6px; padding-left: 24px; list-style-type: decimal; }
      .scope-content li { margin-bottom: 0; line-height: 1.25; }
      .scope-content li > ul { padding-left: 24px; margin: 4px 0; list-style-type: circle; }
      .scope-content li > ol { padding-left: 24px; margin: 4px 0; list-style-type: lower-alpha; }
      .scope-content strong { font-weight: 700; }
      .scope-content em { font-style: italic; }
    `}</style>
  )
}
