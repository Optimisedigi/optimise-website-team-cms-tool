const NKL_DELETE_PATH = /\/api\/negative-keyword-lists(?:\/|$|\?)/i

export function isNegativeKeywordListDeleteRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'DELETE') return false

  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input instanceof Request
        ? input.url
        : String(input)

  return NKL_DELETE_PATH.test(url)
}

export function confirmNegativeKeywordListDelete(): boolean {
  return window.confirm(
    'Delete this negative keyword list? This cannot be undone. The list must already be empty.',
  )
}

export function wrapFetchWithNegativeKeywordListDeleteConfirm(
  originalFetch: typeof fetch,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (isNegativeKeywordListDeleteRequest(input, init) && !confirmNegativeKeywordListDelete()) {
      return Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'Delete cancelled' }] }), {
        status: 499,
        headers: { 'Content-Type': 'application/json' },
      }))
    }
    return originalFetch(input, init)
  }) as typeof fetch
}
