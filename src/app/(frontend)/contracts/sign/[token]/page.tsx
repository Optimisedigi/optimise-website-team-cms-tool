'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  ContractBodySections,
  ContractDocumentStyles,
  ContractEffectiveDates,
  ContractHeaderAndCover,
  ContractServiceProvider,
  contractFontClassName,
  docStyle,
  formatDate,
  hrThickStyle,
  pageStyle,
  type ContractInfo,
} from '../../_shared/contract-document'

export default function ContractSignPage() {
  const params = useParams()
  const token = params?.token as string

  const [contract, setContract] = useState<ContractInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [linkExpired, setLinkExpired] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)
  const [completedAgencySignature, setCompletedAgencySignature] = useState<string | null>(null)
  const [completedAgencySignerName, setCompletedAgencySignerName] = useState<string | null>(null)

  // Editable client fields
  const [clientDisplayName, setClientDisplayName] = useState('')
  const [clientTradingName, setClientTradingName] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientWebsite, setClientWebsite] = useState('')
  const [clientAcn, setClientAcn] = useState('')
  const [clientBusinessAddress, setClientBusinessAddress] = useState('')

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
            if (data.code === 'contract_link_expired') {
              setLinkExpired(true)
            }
            setError(data.error || 'Failed to load contract')
          }
          return
        }
        setContract(data)
        setClientDisplayName(data.clientName || '')
        setClientTradingName(data.clientTradingName || '')
        setSignerName(data.clientContactName || '')
        setSignerTitle(data.clientTitle || '')
        setClientEmail(data.clientEmail || '')
        setClientPhone(data.clientPhone || '')
        setClientWebsite(data.clientWebsite || '')
        setClientAcn(data.clientAcn || '')
        setClientBusinessAddress(data.clientBusinessAddress || '')
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
          clientName: clientDisplayName,
          clientTradingName,
          signerName,
          signerTitle,
          clientEmail,
          clientPhone,
          clientWebsite,
          clientAcn,
          clientBusinessAddress,
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #aebbb3',
    borderRadius: 2,
    boxSizing: 'border-box',
    background: '#fff',
    color: '#141d18',
    fontFamily: 'var(--contract-sans), sans-serif',
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
          {linkExpired ? (
            <>
              <h1 style={{ fontSize: 24, color: '#111827', marginBottom: 8 }}>Sorry, this link has expired</h1>
              <p style={{ color: '#666', margin: 0 }}>
                Please reach out to your Optimise Digital team member for a new link.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 20, color: '#dc2626', marginBottom: 8 }}>Unable to Load Contract</h1>
              <p style={{ color: '#666' }}>{error}</p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!contract) return null


  return (
    <main className={contractFontClassName} style={pageStyle}>
      <article className="signing-doc" style={docStyle}>
        <ContractHeaderAndCover contract={contract} clientDisplayName={clientDisplayName} />

        <hr style={hrThickStyle} />

        {/* This contract is between */}
        <p style={{ fontSize: 15, margin: '0 0 6px' }}>
          <em><strong>This contract is between:</strong></em>
        </p>
        <p style={{ fontSize: 15, margin: '0 0 10px' }}>
          <strong>Client:</strong> {clientDisplayName}
        </p>

        {/* Client detail fields - callout box */}
        <section className="contract-action-card">
          <p className="contract-action-title">
            Please review your details below before signing
          </p>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 14px' }}>
            Any edits you make here will be saved and reflected in the final signed contract.
          </p>
          {/* Two-column grid on tablet/desktop, single column on mobile.
              Each cell stacks label above input so long labels/values never
              get cut off. Mobile breakpoint defined in the <style> block below. */}
          <div className="signing-fields-grid">
            <label className="signing-field">
              <span style={fieldLabelStyle}>Company Name (Legal Entity)</span>
              <input
                type="text"
                value={clientDisplayName}
                onChange={(e) => setClientDisplayName(e.target.value)}
                placeholder="Enter legal business name"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Trading Name (if different)</span>
              <input
                type="text"
                value={clientTradingName}
                onChange={(e) => setClientTradingName(e.target.value)}
                placeholder=""
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Contact Name</span>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your name"
                style={inputStyle}
              />
            </label>
            <label className="signing-field">
              <span style={fieldLabelStyle}>Position / Title</span>
              <input
                type="text"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="e.g. Managing Director"
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
            <label className="signing-field">
              <span style={fieldLabelStyle}>ACN / ABN</span>
              <input
                type="text"
                value={clientAcn}
                onChange={(e) => setClientAcn(e.target.value)}
                placeholder="Enter ACN or ABN"
                style={inputStyle}
              />
            </label>
            {/* Business address spans both columns on desktop — it's a
                multiline textarea so it needs more room than the single-line
                inputs. The grid-column override below pairs with the
                .signing-fields-grid CSS in the <style> block. */}
            <label className="signing-field signing-field--wide">
              <span style={fieldLabelStyle}>Business address</span>
              <textarea
                value={clientBusinessAddress}
                onChange={(e) => setClientBusinessAddress(e.target.value)}
                placeholder="Enter business address"
                rows={2}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
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
                background: '#1b4332',
                color: '#fff',
                cursor: 'pointer',
                opacity: 0.7,
              }}
            >
              Click to Sign
            </button>
          </div>
        </section>

        <ContractServiceProvider contract={contract} />

        <ContractEffectiveDates contract={contract} />

        <hr style={hrThickStyle} />

        <ContractBodySections contract={contract} />

        <hr style={hrThickStyle} />

        {/* Acceptance and Signature */}
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Acceptance and Signature:</h2>
        <p style={{ margin: '0 0 24px' }}>
          By signing below, both parties consent to executing this agreement electronically under the Electronic Transactions Act 1999 (Cth) and agree that electronic signatures are the legal equivalent of manual signatures. Both parties agree to the terms and conditions outlined in this contract.
        </p>

        {/* Client signature - callout box */}
        <section
          ref={signatureRef}
          className="contract-action-card contract-signature-card"
        >
          <p className="contract-action-title">
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
              aria-pressed={signatureMode === 'draw'}
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
              aria-pressed={signatureMode === 'type'}
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
              background: signing || !hasValidSignature || !signerName || !consent ? '#94a3b8' : '#1b4332',
              color: '#fff',
              cursor: signing || !hasValidSignature || !signerName || !consent ? 'not-allowed' : 'pointer',
              boxShadow: signing || !hasValidSignature || !signerName || !consent ? 'none' : '0 2px 8px rgba(27,67,50,0.24)',
            }}
          >
            {signing ? 'Signing...' : 'Sign Contract'}
          </button>

          {signError && (
            <p style={{ margin: '12px 0 0', fontSize: 14, color: '#dc2626' }}>{signError}</p>
          )}
        </section>

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
      </article>

      <ContractDocumentStyles />
    </main>
  )
}
