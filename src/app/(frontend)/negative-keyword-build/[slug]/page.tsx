'use client'

import { useParams } from 'next/navigation'
import NegativeKeywordPinGate from '@/components/NegativeKeywordPinGate'
import NegativeKeywordEditorContent from '@/components/NegativeKeywordEditorContent'

export default function NegativeKeywordBuildPage() {
  const params = useParams()
  const slug = params?.slug as string
  if (!slug) return <div>Not found</div>

  return (
    <NegativeKeywordPinGate slug={slug}>
      {(data, pin) => <NegativeKeywordEditorContent data={data} pin={pin} />}
    </NegativeKeywordPinGate>
  )
}
