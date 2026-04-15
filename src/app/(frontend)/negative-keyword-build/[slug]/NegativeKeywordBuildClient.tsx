'use client'

import NegativeKeywordPinGate from '@/components/NegativeKeywordPinGate'
import NegativeKeywordEditorContent from '@/components/NegativeKeywordEditorContent'

export default function NegativeKeywordBuildClient({ slug, businessName }: { slug: string; businessName?: string }) {
  return (
    <NegativeKeywordPinGate slug={slug} businessName={businessName}>
      {(data, pin) => <NegativeKeywordEditorContent data={data} pin={pin} />}
    </NegativeKeywordPinGate>
  )
}
