'use client'

import { useState } from 'react'

const REPORTED_PRIMARY_CONVERSIONS = 967
const PDF_DOWNLOADS = 492
const CONVERSIONS_WITHOUT_PDFS = REPORTED_PRIMARY_CONVERSIONS - PDF_DOWNLOADS
const CPA_WITHOUT_PDFS = 70
const CPA_WITH_PDFS = 34

export default function PdfConversionAccounting() {
  const [includePdfDownloads, setIncludePdfDownloads] = useState(false)
  const cpa = includePdfDownloads ? CPA_WITH_PDFS : CPA_WITHOUT_PDFS

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto w-full">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Reported primary conversions
        </div>
        <div className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
          {REPORTED_PRIMARY_CONVERSIONS}
        </div>
      </div>

      <button
        type="button"
        aria-pressed={includePdfDownloads}
        onClick={() => setIncludePdfDownloads((included) => !included)}
        className={`relative rounded-lg border p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 ${
          includePdfDownloads
            ? 'border-rose-400 bg-rose-100 text-rose-950'
            : 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100'
        }`}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider">PDF downloads</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">
          {includePdfDownloads ? '+' : '-'}
          {PDF_DOWNLOADS}
        </div>
        <div className="mt-1 text-[10px] font-medium">
          {includePdfDownloads ? 'Included in CPA' : 'Excluded from CPA'}
        </div>
        <span
          aria-hidden="true"
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-rose-700"
        >
          Press ↑
        </span>
      </button>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
          Conversions without PDFs
        </div>
        <div className="mt-1 text-3xl font-bold text-emerald-900 tabular-nums">
          {CONVERSIONS_WITHOUT_PDFS}
        </div>
      </div>

      <div
        className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center"
        aria-live="polite"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
          {includePdfDownloads ? 'Inflated CPA' : 'Actual CPA'}
        </div>
        <div className="mt-1 text-3xl font-bold text-blue-900 tabular-nums">${cpa}</div>
        <div className="mt-1 text-[10px] text-blue-800">
          {includePdfDownloads ? 'with PDF downloads' : 'without PDF downloads'}
        </div>
      </div>
    </div>
  )
}
