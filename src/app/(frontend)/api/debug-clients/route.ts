import { getPayload } from 'payload'
import config from '@payload-config'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}

  try {
    const payload = await getPayload({ config })

    // Test 1: clients query (the one that was failing)
    try {
      const clients = await payload.find({
        collection: 'clients',
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      results.clients = { success: true, totalDocs: clients.totalDocs }
    } catch (e: unknown) {
      results.clients = { success: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined }
    }

    // Test 2: blog-posts query
    try {
      const posts = await payload.find({
        collection: 'blog-posts',
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      results.blogPosts = { success: true, totalDocs: posts.totalDocs }
    } catch (e: unknown) {
      results.blogPosts = { success: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined }
    }

    // Test 3: users query
    try {
      const users = await payload.find({
        collection: 'users',
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      results.users = { success: true, totalDocs: users.totalDocs }
    } catch (e: unknown) {
      results.users = { success: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined }
    }

    // Test 4: blog-posts with depth=1 (resolves relationships like client)
    try {
      const postsDeep = await payload.find({
        collection: 'blog-posts',
        depth: 1,
        limit: 1,
        overrideAccess: true,
      })
      results.blogPostsDeep = { success: true, totalDocs: postsDeep.totalDocs }
    } catch (e: unknown) {
      results.blogPostsDeep = { success: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined }
    }

    return NextResponse.json(results)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
