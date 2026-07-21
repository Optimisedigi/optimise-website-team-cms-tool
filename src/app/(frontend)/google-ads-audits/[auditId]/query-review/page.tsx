import QueryReviewClient from './QueryReviewClient'
export default async function Page({ params }: { params: Promise<{ auditId: string }> }) { const { auditId } = await params; return <QueryReviewClient auditId={auditId} /> }
