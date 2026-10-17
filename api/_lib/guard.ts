// Request checks shared by the API routes: method, origin, rate limit, JSON body.

import { GoogleError } from './google.js'

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Fixed-window rate limit per client IP. Kept in memory, so it is per server
 * instance — a speed bump against abuse, with Google quotas as the hard cap.
 */
function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k)
    }
    return false
  }
  b.count++
  return b.count > limit
}

function clientIp(req: Request) {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

function sameSite(origin: string | null, url: string) {
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(url).host
  } catch {
    return false
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Runs the common checks and parses the JSON body. Returns either the body or
 * an error Response to send back as-is.
 */
export async function guard(
  req: Request,
  name: string,
  limit: { max: number; windowMs: number },
): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  if (req.method !== 'POST') return { error: json({ error: 'method_not_allowed' }, 405) }

  // Browsers always send Origin on POST: require it to be this site, so other
  // websites and bare scripts can't use our Google key. ("null" or garbage → 403.)
  if (!sameSite(req.headers.get('origin'), req.url)) {
    return { error: json({ error: 'forbidden' }, 403) }
  }
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return { error: json({ error: 'bad_request' }, 415) }
  }

  if (rateLimited(`${name}:${clientIp(req)}`, limit.max, limit.windowMs)) {
    return { error: json({ error: 'rate_limited' }, 429) }
  }

  const text = await req.text()
  if (text.length > 4096) return { error: json({ error: 'bad_request' }, 413) }
  try {
    const body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return { body }
  } catch {
    return { error: json({ error: 'bad_request' }, 400) }
  }
}

/** Turns a thrown error into a response without leaking upstream details. */
export function errorResponse(e: unknown) {
  if (e instanceof GoogleError) {
    console.error(`[google] ${e.code}: ${e.message}`)
    const status = { not_configured: 503, no_route: 404, denied: 502, upstream: 502 }[e.code]
    return json({ error: e.code }, status)
  }
  console.error(e)
  return json({ error: 'upstream' }, 502)
}

/** For tests. */
export function resetRateLimits() {
  buckets.clear()
}
