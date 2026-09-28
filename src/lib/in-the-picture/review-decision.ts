import { z } from 'zod'
import type { Payload } from 'payload'
import { configuredClientId } from './config'

export const reviewDecisionSchema = z.object({
  version: z.literal(1),
  postId: z.string().regex(/^[1-9]\d{0,14}$/),
  revision: z.string().datetime({ offset: true }),
  decision: z.enum(['approved', 'changes_requested']),
}).strict()

export async function applyReviewDecision(
  payload: Payload,
  decision: z.infer<typeof reviewDecisionSchema>,
): Promise<'applied' | 'conflict'> {
  const clientId = configuredClientId()
  if (!clientId) throw new Error('Sync client not configured')
  const postId = Number(decision.postId)
  if (!Number.isSafeInteger(postId)) return 'conflict'
  const db = (payload.db as unknown as {
    client?: { execute: (statement: { sql: string; args: Array<string | number> }) => Promise<{ rowsAffected: number }> }
  }).client
  if (!db) throw new Error('LibSQL client unavailable')
  // The post and event must still belong to this client, and the reviewed revision
  // must still be current. A duplicate decision is harmless; a contradictory one fails.
  const result = await db.execute({
    sql: `UPDATE blog_sync_events SET state = ?, updated_at = ?
      WHERE client_id = ? AND post_id = ? AND revision = ? AND kind = 'review_requested'
        AND state IN ('delivered', ?)
        AND EXISTS (SELECT 1 FROM blog_posts
          WHERE id = ? AND client_id = ? AND status = 'review' AND website_sync_revision = ?)`,
    args: [decision.decision, new Date().toISOString(), clientId, decision.postId,
      decision.revision, decision.decision, postId, clientId, decision.revision],
  })
  return result.rowsAffected === 1 ? 'applied' : 'conflict'
}
