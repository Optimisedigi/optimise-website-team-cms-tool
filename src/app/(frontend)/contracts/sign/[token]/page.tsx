'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface ContractInfo {
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

function formatCurrency(amount: number, currency = 'AUD'): string {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-AU'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
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

export default function ContractSignPage() {
  const params = useParams()
  const token = params?.token as string

  const [contract, setContract] = useState<ContractInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)
  const [completedAgencySignature, setCompletedAgencySignature] = useState<string | null>(null)
  const [completedAgencySignerName, setCompletedAgencySignerName] = useState<string | null>(null)

  // Editable client fields
  const [clientDisplayName, setClientDisplayName] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientWebsite, setClientWebsite] = useState('')

  // Signature
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw')
  const [typedSignature, setTypedSignature] = useState('')
  const [signingDate, setSigningDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0] // YYYY-MM-DD
  })
  const [consent, setConsent] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)

  // Scroll ref for "Click to Sign" button
  const signatureRef = useRef<HTMLDivElement>(null)

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/contracts/sign/${token}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          if (data.completed) {
            setCompleted(true)
            setSignedPdfUrl(data.signedPdfUrl)
            setCompletedAgencySignature(data.agencySignature || null)
            setCompletedAgencySignerName(data.agencySignerName || null)
          } else {
            setError(data.error || 'Failed to load contract')
          }
          return
        }
        setContract(data)
        setClientDisplayName(data.clientName || '')
        setSignerName(data.clientContactName || '')
        setSignerTitle(data.clientTitle || '')
        setClientEmail(data.clientEmail || '')
        setClientPhone(data.clientPhone || '')
        setClientWebsite(data.clientWebsite || '')
      })
      .catch(() => setError('Failed to load contract'))
      .finally(() => setLoading(false))
  }, [token])

  // Canvas drawing
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }, [getPos])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
    setHasDrawnSignature(true)
  }, [isDrawing, getPos])

  const endDraw = useCallback(() => {
    setIsDrawing(false)
  }, [])

  const clearSignature = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !canvasRef.current) return
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasDrawnSignature(false)
  }, [])

  const hasValidSignature = signatureMode === 'draw' ? hasDrawnSignature : typedSignature.trim().length > 0

  const getSignatureData = (): { signature: string; signatureType: 'drawn' | 'typed' } => {
    if (signatureMode === 'draw') {
      const canvas = canvasRef.current
      return {
        signature: canvas ? canvas.toDataURL('image/png') : '',
        signatureType: 'drawn',
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 100
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 400, 100)
    ctx.font = 'italic 32px Georgia, serif'
    ctx.fillStyle = '#111'
    ctx.fillText(typedSignature, 20, 60)
    return {
      signature: canvas.toDataURL('image/png'),
      signatureType: 'typed',
    }
  }

  const handleSubmit = async () => {
    if (!hasValidSignature || !signerName || !consent) return

    const { signature, signatureType } = getSignatureData()

    setSigning(true)
    setSignError(null)
    try {
      const res = await fetch(`/api/contracts/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          signatureType,
          signerName,
          signerTitle,
          clientEmail,
          clientPhone,
          clientWebsite,
          signingDate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to sign')
      setCompleted(true)
      setSignedPdfUrl(data.signedPdfUrl)
      setCompletedAgencySignature(data.agencySignature || null)
      setCompletedAgencySignerName(data.agencySignerName || null)
    } catch (e: any) {
      setSignError(e.message)
    } finally {
      setSigning(false)
    }
  }

  // Styles
  const pageStyle: React.CSSProperties = {
    background: '#e5e7eb',
    minHeight: '100vh',
    padding: '40px 16px',
  }

  const docStyle: React.CSSProperties = {
    maxWidth: 800,
    margin: '0 auto',
    background: '#fff',
    padding: '60px 50px',
    fontFamily: 'Helvetica, Arial, sans-serif',
    color: '#111',
    lineHeight: 1.6,
    fontSize: 14,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  }

  const hrStyle: React.CSSProperties = {
    border: 'none',
    borderTop: '1px solid #ccc',
    margin: '28px 0',
  }

  const hrThickStyle: React.CSSProperties = {
    border: 'none',
    borderTop: '2px solid #111',
    margin: '30px 0',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 4,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fafafa',
  }

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 4,
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...docStyle, textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: 16 }}>Loading contract...</p>
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div style={pageStyle}>
        <div style={{ ...docStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, color: '#059669' }}>&#10003;</div>
          <h1 style={{ fontSize: 24, color: '#059669', marginBottom: 8 }}>Contract Signed</h1>
          <p style={{ color: '#666', marginBottom: 24 }}>
            Both parties have signed. A copy has been emailed to you.
          </p>
          {completedAgencySignature && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                <strong>Signed by</strong>: {completedAgencySignerName || 'Optimise Digital'}
              </p>
              <div style={{ background: '#fff', display: 'inline-block', padding: 4, borderRadius: 4 }}>
                <img
                  src={completedAgencySignature}
                  alt="Agency signature"
                  style={{ maxWidth: 154, height: 'auto', display: 'block' }}
                />
              </div>
            </div>
          )}
          {signedPdfUrl && (
            <a
              href={signedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                background: '#059669',
                color: '#fff',
                padding: '12px 28px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Download Signed PDF
            </a>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...docStyle, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, color: '#dc2626', marginBottom: 8 }}>Unable to Load Contract</h1>
          <p style={{ color: '#666' }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!contract) return null

  const agencyName = 'Optimise Digital'
  const agencyContactName = contract.agencyContactName || 'Peter Tu'
  const agencyContactEmail = contract.agencyContactEmail || 'peter@optimisedigital.online'
  const agencyContactPhone = contract.agencyContactPhone || '0493053188'
  // Agency contact title — same person as the signer in practice, so we reuse
  // agencySignerTitle rather than maintaining a parallel field.
  const agencyContactTitle = contract.agencySignerTitle || ''
  const currency = contract.currency || 'AUD'
  const setupAmount = formatCurrency(contract.setupFee ?? 0, currency)
  const retainerAmount = formatCurrency(contract.monthlyRetainer ?? 0, currency)
  const hostingAmount = contract.monthlyHosting ? formatCurrency(contract.monthlyHosting, currency) : null

  return (
    <div style={pageStyle}>
      <div className="signing-doc" style={docStyle}>
        {/* Logo */}
        <img
          src="/logo.png"
          alt="Optimise Digital"
          style={{ width: 252, marginBottom: 20 }}
        />

        <hr style={hrThickStyle} />

        {/* Cover — generous spacing around the agency/client names. */}
        <p style={{ fontSize: 16, margin: '0 0 18px' }}>Contract Agreement</p>
        <p style={{ fontSize: 16, margin: '0 0 8px' }}>Between</p>
        <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 28px' }}>Optimise Digital Pty Ltd</p>
        <p style={{ fontSize: 16, margin: '0 0 8px' }}>And</p>
        <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 28px' }}>{clientDisplayName}</p>

        <hr style={hrThickStyle} />

        {/* This contract is between */}
        <p style={{ fontSize: 15, margin: '0 0 6px' }}>
          <em><strong>This contract is between:</strong></em>
        </p>
        <p style={{ fontSize: 15, margin: '0 0 10px' }}>
          <strong>Client:</strong> {clientDisplayName}
        </p>

        {/* Client detail fields - callout box */}
        <div style={{
          borderLeft: '4px solid #f97316',
          background: '#fff7ed',
          padding: '16px 20px',
          borderRadius: 6,
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#f97316', margin: '0 0 12px' }}>
            Please check and update your details below
          </p>
          {/* Two-column grid on tablet/desktop, single column on mobile.
              Each cell stacks label above input so long labels/values never
              get cut off. Mobile breakpoint defined in the <style> block below. */}
          <div className="signing-fields-grid">
            <label className="signing-field">
              <span style={fieldLabelStyle}>Company Name</span>
              <input
                type="text"
                value={clientDisplayName}
                onChange={(e) => setClientDisplayName(e.target.value)}
                placeholder="Enter business name"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Name</span>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your name"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Phone</span>
              <input
                type="text"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Enter phone"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Title</span>
              <input
                type="text"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="Enter your title"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Email</span>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="Enter email"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Website</span>
              <input
                type="text"
                value={clientWebsite}
                onChange={(e) => setClientWebsite(e.target.value)}
                placeholder="Enter website"
                style={inputStyle}
              />
            </label>
          </div>
          {/* Click to Sign button */}
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <button
              type="button"
              onClick={() => signatureRef.current?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderRadius: 4,
                background: '#f97316',
                color: '#fff',
                cursor: 'pointer',
                opacity: 0.7,
              }}
            >
              Click to Sign
            </button>
          </div>
        </div>

        {/* Service Provider - clearly separated */}
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

        <hr style={hrThickStyle} />

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

        <hr style={hrThickStyle} />

        {/* Acceptance and Signature */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Acceptance and Signature:</h2>
        <p style={{ margin: '0 0 24px' }}>
          By signing below, both parties consent to executing this agreement electronically under the Electronic Transactions Act 1999 (Cth) and agree that electronic signatures are the legal equivalent of manual signatures. Both parties agree to the terms and conditions outlined in this contract.
        </p>

        {/* Client signature - callout box */}
        <div
          ref={signatureRef}
          style={{
            borderLeft: '4px solid #f97316',
            background: '#fff7ed',
            padding: '16px 20px',
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: '#f97316', margin: '0 0 12px' }}>
            Please sign below
          </p>

          <p style={{ fontSize: 15, margin: '0 0 12px' }}>
            <strong>Client</strong>: {clientDisplayName}
          </p>

          {/* Signature mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setSignatureMode('draw')}
              style={{
                padding: '6px 16px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: signatureMode === 'draw' ? '#111' : '#fff',
                color: signatureMode === 'draw' ? '#fff' : '#333',
                cursor: 'pointer',
              }}
            >
              Draw
            </button>
            <button
              type="button"
              onClick={() => setSignatureMode('type')}
              style={{
                padding: '6px 16px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: signatureMode === 'type' ? '#111' : '#fff',
                color: signatureMode === 'type' ? '#fff' : '#333',
                cursor: 'pointer',
              }}
            >
              Type
            </button>
          </div>

          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              {signatureMode === 'draw' ? (
                <>
                  <p style={{ fontSize: 14, margin: '0 0 4px' }}><strong>Signature:</strong></p>
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={120}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      display: 'block',
                      background: '#fff',
                      touchAction: 'none',
                      width: '100%',
                      maxWidth: 400,
                      height: 'auto',
                      cursor: 'crosshair',
                    }}
                  />
                  <button
                    type="button"
                    onClick={clearSignature}
                    style={{
                      marginTop: 6,
                      padding: '4px 12px',
                      fontSize: 12,
                      border: '1px solid #d1d5db',
                      borderRadius: 3,
                      background: '#fff',
                      color: '#666',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </>
              ) : (
                <div>
                  <p style={{ fontSize: 14, margin: '0 0 4px' }}><strong>Signature:</strong></p>
                  <input
                    type="text"
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    placeholder="Type your full name"
                    style={{
                      ...inputStyle,
                      fontFamily: 'Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: 22,
                      padding: '16px 12px',
                      maxWidth: 400,
                    }}
                  />
                </div>
              )}
              <div style={{ fontSize: 14, margin: '10px 0 2px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span><strong>Name</strong>: {signerName || '[Name]'}</span>
                {/* Title is captured higher up the page in the client-detail
                    edit box; surface it here next to Name + Date so it ends
                    up on the final signed PDF row. */}
                {signerTitle && (
                  <span><strong>Title</strong>: {signerTitle}</span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <strong>Date</strong>:
                  <input
                    type="date"
                    value={signingDate}
                    onChange={(e) => setSigningDate(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 14,
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: '#fff',
                      color: '#111',
                    }}
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Consent + Submit */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>
                I consent to entering into this agreement electronically under the Electronic Transactions Act 1999 (Cth).
                I agree that my electronic signature is the legal equivalent of my manual signature on this contract.
                I have read and agree to the terms outlined above.
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={signing || !hasValidSignature || !signerName || !consent}
            style={{
              marginTop: 16,
              padding: '14px 40px',
              fontSize: 16,
              fontWeight: 700,
              border: 'none',
              borderRadius: 6,
              background: signing || !hasValidSignature || !signerName || !consent ? '#94a3b8' : '#f97316',
              color: '#fff',
              cursor: signing || !hasValidSignature || !signerName || !consent ? 'not-allowed' : 'pointer',
              boxShadow: signing || !hasValidSignature || !signerName || !consent ? 'none' : '0 2px 8px rgba(249,115,22,0.3)',
            }}
          >
            {signing ? 'Signing...' : 'Sign Contract'}
          </button>

          {signError && (
            <p style={{ margin: '12px 0 0', fontSize: 14, color: '#dc2626' }}>{signError}</p>
          )}
        </div>

        {/* Service Provider signature */}
        <p style={{ fontSize: 15, margin: '30px 0 12px' }}>
          <strong>Service Provider</strong>: Optimise Digital Pty Ltd
        </p>
        <div style={{ display: 'flex', gap: 40 }}>
          <div>
            <p style={{ fontSize: 14, margin: '0 0 4px' }}><strong>Signature:</strong></p>
            {contract.agencySignature && (
              <div style={{ background: '#ffffff', display: 'inline-block', padding: 8, borderRadius: 4 }}>
                <img
                  src={contract.agencySignature}
                  alt="Agency signature"
                  style={{ maxWidth: 154, height: 'auto', display: 'block', background: '#ffffff' }}
                />
              </div>
            )}
            <p style={{ fontSize: 14, margin: '6px 0 0' }}>
              <strong>Name</strong>: {contract.agencySignerName || 'Peter Tu'}{' '}
              {contract.agencySignerTitle && (
                <>
                  <strong>Title</strong>: {contract.agencySignerTitle}{' '}
                </>
              )}
              <strong>Date</strong>: {contract.agencySignedAt ? formatDate(contract.agencySignedAt) : formatDate(contract.contractDate)}
            </p>
          </div>
        </div>

        {/* Document-integrity footer — mirrors the PDF footer so the signing
            page and the generated PDF tell the client the same thing. */}
        <p
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: '1px solid #e5e7eb',
            fontSize: 11,
            lineHeight: 1.5,
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          This document was digitally signed via Optimise Digital&apos;s contract
          management system. A SHA-256 hash of this document is stored for
          integrity verification. Signed documents are retained for a minimum
          of 7 years in accordance with Australian record-keeping requirements.
        </p>
      </div>

      {/* Scope content styles for rich text */}
      <style>{`
        /* Client-details grid: 2 cols on tablet+ (≥ 600px), 1 col on phones. */
        .signing-fields-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 16px;
        }
        .signing-field { display: block; }
        @media (max-width: 599px) {
          .signing-fields-grid { grid-template-columns: 1fr; }
          /* Tighter page padding on phones so the contract content uses
             more of the viewport. */
          .signing-doc { padding: 24px 16px !important; }
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
    </div>
  )
}
