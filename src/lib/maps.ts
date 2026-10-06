export type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING'

export interface PlaceValue {
  label: string
  location?: google.maps.LatLngLiteral
  placeId?: string
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

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export const hasMapsKey = Boolean(API_KEY && API_KEY.trim())

let loadPromise: Promise<void> | null = null

/** Loads the Maps JS API once (Google's dynamic library loading). */
export function loadMaps(): Promise<void> {
  if (!hasMapsKey) return Promise.reject(new Error('No Google Maps API key configured'))
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve, reject) => {
    const cb = '__leaveByMapsReady'
    ;(window as unknown as Record<string, () => void>)[cb] = () => resolve()
    const s = document.createElement('script')
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY!)}` +
      `&v=weekly&loading=async&callback=${cb}`
    s.async = true
    s.onerror = () => {
      loadPromise = null
      reject(new Error('Could not load Google Maps'))
    }
    document.head.appendChild(s)
  })
  return loadPromise
}

export async function placesLib() {
  await loadMaps()
  return (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
}

async function routesLib() {
  await loadMaps()
  return (await google.maps.importLibrary('routes')) as google.maps.RoutesLibrary
}

// Prefer the place itself: Google then routes to its entrance rather than its
// centre point, which matters for big places like parks and airports.
const toWaypoint = (p: PlaceValue) =>
  p.placeId ? new google.maps.places.Place({ id: p.placeId }) : (p.location ?? p.label)

const cacheId = (p: PlaceValue) => p.placeId ?? p.location ?? p.label

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
  const key = JSON.stringify([cacheId(origin), cacheId(destination), mode, timeKey])
  let p = cache.get(key)
  if (!p) {
    p = computeTravel(origin, destination, mode, arriveBy)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

const MIN = 60_000

async function computeTravel(
  origin: PlaceValue,
  destination: PlaceValue,
  mode: TravelMode,
  arriveBy: Date,
): Promise<TravelResult> {
  const { Route } = await routesLib()
  await placesLib()
  const base = { origin: toWaypoint(origin), destination: toWaypoint(destination), travelMode: mode }

  async function first(req: Partial<google.maps.routes.ComputeRoutesRequest>, fields: string[]) {
    const { routes } = await Route.computeRoutes({ ...base, ...req, fields })
    const route = routes?.[0]
    if (!route) throw new Error('No route found between these places')
    return route
  }

  if (mode === 'TRANSIT') {
    // Transit supports "arrive by" directly. Google only allows times up to
    // 7 days in the past, so fall back to "leave now" for older events.
    const req = arriveBy.getTime() > Date.now() ? { arrivalTime: arriveBy } : {}
    const route = await first(req, ['durationMillis', 'distanceMeters', 'legs'])
    return transitResult(route, arriveBy)
  }

  if (mode === 'DRIVING') {
    // Traffic predictions need a departure time, not an arrival time, so
    // estimate the departure and refine it.
    let route = await first({ routingPreference: 'TRAFFIC_UNAWARE' }, ['durationMillis', 'distanceMeters'])
    let durMs = route.durationMillis ?? 0
    let trafficAware = false
    for (let i = 0; i < 3; i++) {
      const departure = new Date(arriveBy.getTime() - durMs)
      // Google can only predict traffic for future departures.
      if (departure.getTime() < Date.now() + MIN) break
      route = await first(
        { routingPreference: 'TRAFFIC_AWARE', departureTime: departure },
        ['durationMillis', 'distanceMeters'],
      )
      const next = route.durationMillis ?? durMs
      trafficAware = true
      const settled = Math.abs(next - durMs) < 2 * MIN
      durMs = next
      if (settled) break
    }
    return {
      durationMin: Math.ceil(durMs / MIN),
      distanceMeters: route.distanceMeters,
      trafficAware,
    }
  }

  const route = await first({}, ['durationMillis', 'distanceMeters'])
  return {
    durationMin: Math.ceil((route.durationMillis ?? 0) / MIN),
    distanceMeters: route.distanceMeters,
    trafficAware: false,
  }
}

function transitResult(route: google.maps.routes.Route, arriveBy: Date): TravelResult {
  const steps = (route.legs ?? []).flatMap((l) => l.steps ?? [])
  const transitIdx = steps
    .map((s, i) => (s.transitDetails ? i : -1))
    .filter((i) => i >= 0)
  const durMs = route.durationMillis ?? 0

  if (transitIdx.length === 0) {
    // The "transit" route is just walking.
    return {
      durationMin: Math.ceil(durMs / MIN),
      distanceMeters: route.distanceMeters,
      trafficAware: false,
      summary: 'Walking only',
    }
  }

  const sumWalk = (from: number, to: number) =>
    steps.slice(from, to).reduce((t, s) => t + (s.staticDurationMillis ?? 0), 0)

  const firstT = steps[transitIdx[0]].transitDetails!
  const lastIdx = transitIdx[transitIdx.length - 1]
  const lastT = steps[lastIdx].transitDetails!

  const departAt = firstT.departureTime
    ? new Date(firstT.departureTime.getTime() - sumWalk(0, transitIdx[0]))
    : new Date(arriveBy.getTime() - durMs)
  const arriveAt = lastT.arrivalTime
    ? new Date(lastT.arrivalTime.getTime() + sumWalk(lastIdx + 1, steps.length))
    : new Date(departAt.getTime() + durMs)

  const summary = transitIdx
    .map((i) => {
      const line = steps[i].transitDetails!.transitLine
      return line?.shortName || line?.name || 'Transit'
    })
    .join(' → ')

  return {
    durationMin: Math.ceil((arriveAt.getTime() - departAt.getTime()) / MIN),
    distanceMeters: route.distanceMeters,
    departAt,
    trafficAware: false,
    summary,
  }
}

const MAPS_MODE: Record<TravelMode, string> = {
  DRIVING: 'driving',
  TRANSIT: 'transit',
  WALKING: 'walking',
  BICYCLING: 'bicycling',
}

/** A link that opens the same trip in Google Maps. */
export function directionsUrl(origin: PlaceValue | null, destination: PlaceValue, mode: TravelMode) {
  const fmt = (p: PlaceValue) => (p.location ? `${p.location.lat},${p.location.lng}` : p.label)
  const q = new URLSearchParams({ api: '1', destination: destination.label, travelmode: MAPS_MODE[mode] })
  if (destination.placeId) q.set('destination_place_id', destination.placeId)
  if (origin) q.set('origin', fmt(origin))
  return `https://www.google.com/maps/dir/?${q}`
}

const usesMiles = typeof navigator !== 'undefined' && /^en-(US|GB|LR|MM)$/i.test(navigator.language)

export function formatDistance(meters: number) {
  if (!usesMiles) return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
  const miles = meters / 1609.344
  return miles < 0.1 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
}
