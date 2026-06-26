import type { Payload } from 'payload'

const COLLECTION = 'client-proposal-keyword-research-jobs' as const

type KeywordResearchJobStatus = 'running' | 'completed' | 'failed'

export type KeywordResearchJob = {
  id: string | number
  status: KeywordResearchJobStatus
  createdAt: string
  completedAt?: string | null
  result?: unknown
  error?: string | null
}

export async function createKeywordResearchJob(payload: Payload): Promise<KeywordResearchJob> {
  return payload.create({
    collection: COLLECTION,
    data: { status: 'running' },
    overrideAccess: true,
  }) as Promise<KeywordResearchJob>
}

export async function getKeywordResearchJob(payload: Payload, id: string): Promise<KeywordResearchJob | null> {
  try {
    return (await payload.findByID({
      collection: COLLECTION,
      id,
      overrideAccess: true,
    })) as KeywordResearchJob
  } catch {
    return null
  }
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export async function completeKeywordResearchJob(payload: Payload, id: string | number, result: unknown) {
  await payload.update({
    collection: COLLECTION,
    id,
    data: {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: toJsonValue(result) as any,
      error: null,
    },
    overrideAccess: true,
  })
}

export async function failKeywordResearchJob(payload: Payload, id: string | number, error: string) {
  await payload.update({
    collection: COLLECTION,
    id,
    data: {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    },
    overrideAccess: true,
  })
}

export async function pruneKeywordResearchJobs(payload: Payload) {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const oldJobs = await payload.find({
    collection: COLLECTION,
    where: {
      createdAt: {
        less_than: cutoff,
      },
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  await Promise.all(
    oldJobs.docs.map((job) =>
      payload.delete({
        collection: COLLECTION,
        id: job.id,
        overrideAccess: true,
      }),
    ),
  )
}
