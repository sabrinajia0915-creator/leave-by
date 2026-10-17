import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as autocompletePOST } from '../autocomplete.js'
import { POST as routePOST, parseWaypoint } from '../route.js'
import { transitResult } from './google.js'
import { resetRateLimits } from './guard.js'

const HOST = 'http://leave-by.test'

function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${HOST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: HOST, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Fake Google responding with `routes` (or an error). */
function mockGoogle(handler: (url: string, body: Record<string, unknown>) => unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls.push({ url, body, headers: new Headers(init.headers) })
    return new Response(JSON.stringify(handler(url, body)), { status })
  }))
  return calls
}

beforeEach(() => {
  resetRateLimits()
  vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('request guard', () => {
  it('rejects other websites', async () => {
    const res = await autocompletePOST(req('/api/autocomplete', { input: 'park' }, { Origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
  })

  it('rejects requests with no or a malformed Origin', async () => {
    const noOrigin = new Request(`${HOST}/api/autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'park' }),
    })
    expect((await autocompletePOST(noOrigin)).status).toBe(403)
    expect((await autocompletePOST(req('/api/autocomplete', { input: 'park' }, { Origin: 'null' }))).status).toBe(403)
  })

  it('rejects non-JSON bodies', async () => {
    const res = await autocompletePOST(
      req('/api/autocomplete', 'input=park', { 'Content-Type': 'application/x-www-form-urlencoded' }),
    )
    expect(res.status).toBe(415)
  })

  it('rate limits per client', async () => {
    mockGoogle(() => ({ suggestions: [] }))
    const ip = { 'x-real-ip': '1.2.3.4' }
    for (let i = 0; i < 120; i++) {
      expect((await autocompletePOST(req('/api/autocomplete', { input: 'park' }, ip))).status).toBe(200)
    }
    expect((await autocompletePOST(req('/api/autocomplete', { input: 'park' }, ip))).status).toBe(429)
    // A different client is unaffected.
    expect((await autocompletePOST(req('/api/autocomplete', { input: 'park' }, { 'x-real-ip': '5.6.7.8' }))).status).toBe(200)
  })

  it('reports a missing key without calling Google', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', '')
    const calls = mockGoogle(() => ({}))
    const res = await autocompletePOST(req('/api/autocomplete', { input: 'park' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
    expect(calls).toHaveLength(0)
  })

  it('does not leak Google error details', async () => {
    mockGoogle(() => ({ error: { message: 'API key not valid. Key: test-key' } }), 403)
    const res = await autocompletePOST(req('/api/autocomplete', { input: 'park' }))
    const text = await res.text()
    expect(res.status).toBe(502)
    expect(text).not.toContain('test-key')
  })
})

describe('/api/autocomplete', () => {
  it('sends the key only in the header and maps suggestions', async () => {
    const calls = mockGoogle(() => ({
      suggestions: [{
        placePrediction: {
          placeId: 'abc',
          text: { text: 'Golden Gate Park, San Francisco' },
          structuredFormat: { mainText: { text: 'Golden Gate Park' }, secondaryText: { text: 'San Francisco, CA' } },
        },
      }],
    }))
    const res = await autocompletePOST(req('/api/autocomplete', { input: 'golden gate' }))
    expect(await res.json()).toEqual({
      suggestions: [{ placeId: 'abc', main: 'Golden Gate Park', secondary: 'San Francisco, CA' }],
    })
    expect(calls[0].headers.get('X-Goog-Api-Key')).toBe('test-key')
    expect(calls[0].url).not.toContain('test-key')
  })

  it('validates input', async () => {
    expect((await autocompletePOST(req('/api/autocomplete', { input: 'a' }))).status).toBe(400)
    expect((await autocompletePOST(req('/api/autocomplete', { input: 'x'.repeat(201) }))).status).toBe(400)
  })
})

describe('/api/route', () => {
  const future = () => new Date(Date.now() + 3 * 60 * 60_000).toISOString()

  it('validates waypoints', () => {
    expect(parseWaypoint({ placeId: 'ChIJ_abc-123' })).toEqual({ placeId: 'ChIJ_abc-123' })
    expect(parseWaypoint({ placeId: '../etc' })).toBeNull()
    expect(parseWaypoint({ lat: 37.7, lng: -122.4 })).toEqual({ lat: 37.7, lng: -122.4 })
    expect(parseWaypoint({ lat: 91, lng: 0 })).toBeNull()
    expect(parseWaypoint({ address: ' 1 Main St ' })).toEqual({ address: '1 Main St' })
    expect(parseWaypoint({})).toBeNull()
  })

  it('rejects bad modes and dates', async () => {
    const base = { origin: { placeId: 'a' }, destination: { placeId: 'b' } }
    expect((await routePOST(req('/api/route', { ...base, mode: 'FLYING', arriveBy: future() }))).status).toBe(400)
    expect((await routePOST(req('/api/route', { ...base, mode: 'DRIVING', arriveBy: 'soon' }))).status).toBe(400)
    expect((await routePOST(req('/api/route', { ...base, mode: 'DRIVING', arriveBy: '2099-01-01T00:00:00Z' }))).status).toBe(400)
  })

  it('refines driving time with predicted traffic', async () => {
    const calls = mockGoogle((_url, body) => ({
      routes: [{ duration: body.routingPreference === 'TRAFFIC_AWARE' ? '2400s' : '1380s', distanceMeters: 7400 }],
    }))
    const res = await routePOST(req('/api/route', {
      origin: { placeId: 'a' }, destination: { placeId: 'b' }, mode: 'DRIVING', arriveBy: future(),
    }))
    expect(await res.json()).toEqual({ durationMin: 40, distanceMeters: 7400, trafficAware: true })
    expect(calls[0].body).toMatchObject({ origin: { placeId: 'a' }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' })
    expect(calls[1].body).toMatchObject({ routingPreference: 'TRAFFIC_AWARE' })
    expect(calls.length).toBeLessThanOrEqual(4)
  })

  it('maps "no route" to 404', async () => {
    mockGoogle(() => ({}))
    const res = await routePOST(req('/api/route', {
      origin: { placeId: 'a' }, destination: { placeId: 'b' }, mode: 'WALKING', arriveBy: future(),
    }))
    expect(res.status).toBe(404)
  })
})

describe('transitResult', () => {
  it('leaves early enough to walk to the first stop', () => {
    const r = transitResult(
      {
        duration: '2700s',
        distanceMeters: 9800,
        legs: [{
          steps: [
            { staticDuration: '300s' },
            {
              staticDuration: '1500s',
              transitDetails: {
                stopDetails: { departureTime: '2026-10-06T18:10:00Z', arrivalTime: '2026-10-06T18:35:00Z' },
                transitLine: { nameShort: 'N' },
              },
            },
            { staticDuration: '240s' },
          ],
        }],
      },
      new Date('2026-10-06T18:50:00Z'),
    )
    expect(r.departAt).toBe('2026-10-06T18:05:00.000Z')
    expect(r.durationMin).toBe(34) // 18:05 → 18:39
    expect(r.summary).toBe('N')
  })
})
