// Talks to our own /api routes, which call Google on the server so the API key
// never reaches the browser.

export type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING'

export interface PlaceValue {
  label: string
  location?: { lat: number; lng: number }
  placeId?: string
}

export interface Suggestion {
  placeId: string
  main: string
  secondary: string
}

export interface TravelResult {
  durationMin: number
  distanceMeters?: number
  /** Transit only: when you must walk out the door to catch the first vehicle. */
  departAt?: Date
  /** Whether the driving time accounts for predicted traffic. */
  trafficAware: boolean
  /** Short human summary, e.g. "Bus 38 → Red Line". */
  summary?: string
}

/** Error codes returned by the API routes. */
export type ApiErrorCode =
  | 'not_configured' | 'no_route' | 'denied' | 'upstream' | 'rate_limited' | 'bad_request' | 'network'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  constructor(code: ApiErrorCode) {
    super(code)
    this.code = code
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('network')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data.error as ApiErrorCode) ?? 'upstream')
  return data as T
}

export async function fetchSuggestions(input: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const { suggestions } = await post<{ suggestions: Suggestion[] }>('/api/autocomplete', { input }, signal)
  return suggestions
}

const toWaypoint = (p: PlaceValue) =>
  p.placeId ? { placeId: p.placeId } : p.location ? { ...p.location } : { address: p.label }

const cache = new Map<string, Promise<TravelResult>>()

/**
 * Travel time from origin to destination, aiming to arrive by `arriveBy`.
 * Results are cached per origin/destination/mode/time.
 */
export function getTravel(
  origin: PlaceValue,
  destination: PlaceValue,
  mode: TravelMode,
  arriveBy: Date,
): Promise<TravelResult> {
  // Walking and cycling don't depend on time of day, so don't key on it.
  const timeKey = mode === 'WALKING' || mode === 'BICYCLING' ? '' : arriveBy.toISOString()
  const body = { origin: toWaypoint(origin), destination: toWaypoint(destination), mode, arriveBy: arriveBy.toISOString() }
  const key = JSON.stringify([body.origin, body.destination, mode, timeKey])
  let p = cache.get(key)
  if (!p) {
    p = post<Omit<TravelResult, 'departAt'> & { departAt?: string }>('/api/route', body).then((r) => ({
      ...r,
      departAt: r.departAt ? new Date(r.departAt) : undefined,
    }))
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

const MAPS_MODE: Record<TravelMode, string> = {
  DRIVING: 'driving',
  TRANSIT: 'transit',
  WALKING: 'walking',
  BICYCLING: 'bicycling',
}

/** A link that opens the same trip in Google Maps. */
export function directionsUrl(origin: PlaceValue | null, destination: PlaceValue, mode: TravelMode) {
  const q = new URLSearchParams({ api: '1', destination: destination.label, travelmode: MAPS_MODE[mode] })
  if (destination.placeId) q.set('destination_place_id', destination.placeId)
  if (origin) {
    q.set('origin', origin.location ? `${origin.location.lat},${origin.location.lng}` : origin.label)
    if (origin.placeId) q.set('origin_place_id', origin.placeId)
  }
  return `https://www.google.com/maps/dir/?${q}`
}

const usesMiles = typeof navigator !== 'undefined' && /^en-(US|GB|LR|MM)$/i.test(navigator.language)

export function formatDistance(meters: number) {
  if (!usesMiles) return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
  const miles = meters / 1609.344
  return miles < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
}
