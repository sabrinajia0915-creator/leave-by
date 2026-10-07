// Server-only Google Maps calls. The API key never leaves the server.

export type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING'
export const TRAVEL_MODES: readonly TravelMode[] = ['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING']

/** Where a trip starts or ends: a Google place, a coordinate, or free text. */
export type Waypoint =
  | { placeId: string }
  | { lat: number; lng: number }
  | { address: string }

export interface Suggestion {
  placeId: string
  main: string
  secondary: string
}

export interface TravelResult {
  durationMin: number
  distanceMeters?: number
  /** Transit only: when to walk out the door to catch the first vehicle (ISO). */
  departAt?: string
  trafficAware: boolean
  summary?: string
}

export class GoogleError extends Error {
  readonly code: 'not_configured' | 'no_route' | 'denied' | 'upstream'
  constructor(code: GoogleError['code'], message: string) {
    super(message)
    this.code = code
  }
}

const MIN = 60_000

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new GoogleError('not_configured', 'GOOGLE_MAPS_SERVER_KEY is not set')
  return key
}

async function googleFetch(url: string, body: unknown, fieldMask?: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
      ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
    },
    body: JSON.stringify(body),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg: string = data?.error?.message ?? `HTTP ${res.status}`
    const denied = res.status === 401 || res.status === 403 || /denied|blocked|not been used|disabled|billing/i.test(msg)
    throw new GoogleError(denied ? 'denied' : 'upstream', msg)
  }
  return data
}

// ---------- Places autocomplete ----------

export async function autocomplete(input: string): Promise<Suggestion[]> {
  const data = await googleFetch('https://places.googleapis.com/v1/places:autocomplete', { input })
  type Raw = {
    placePrediction?: {
      placeId: string
      text?: { text: string }
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
    }
  }
  return ((data.suggestions ?? []) as Raw[])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<Raw['placePrediction']> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }))
}

// ---------- Routes ----------

const ROUTES_MODE: Record<TravelMode, string> = {
  DRIVING: 'DRIVE',
  TRANSIT: 'TRANSIT',
  WALKING: 'WALK',
  BICYCLING: 'BICYCLE',
}

function toGoogleWaypoint(w: Waypoint) {
  if ('placeId' in w) return { placeId: w.placeId }
  if ('lat' in w) return { location: { latLng: { latitude: w.lat, longitude: w.lng } } }
  return { address: w.address }
}

/** "1234s" → milliseconds */
const parseDuration = (d?: string) => (d ? parseFloat(d) * 1000 : 0)

export interface RawRoute {
  duration?: string
  distanceMeters?: number
  legs?: {
    steps?: {
      staticDuration?: string
      transitDetails?: {
        stopDetails?: { departureTime?: string; arrivalTime?: string }
        transitLine?: { name?: string; nameShort?: string }
      }
    }[]
  }[]
}

async function computeRoute(origin: Waypoint, destination: Waypoint, mode: TravelMode, extra: object, fieldMask: string) {
  const data = await googleFetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      origin: toGoogleWaypoint(origin),
      destination: toGoogleWaypoint(destination),
      travelMode: ROUTES_MODE[mode],
      ...extra,
    },
    fieldMask,
  )
  const route = (data.routes as RawRoute[] | undefined)?.[0]
  if (!route) throw new GoogleError('no_route', 'No route found')
  return route
}

const BASIC_FIELDS = 'routes.duration,routes.distanceMeters'
const TRANSIT_FIELDS =
  'routes.duration,routes.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails'

/** Travel time from origin to destination, aiming to arrive by `arriveBy`. */
export async function travel(
  origin: Waypoint,
  destination: Waypoint,
  mode: TravelMode,
  arriveBy: Date,
  now = new Date(),
): Promise<TravelResult> {
  if (mode === 'TRANSIT') {
    // Transit supports "arrive by" directly, but only for future times.
    const extra = arriveBy > now ? { arrivalTime: arriveBy.toISOString() } : {}
    const route = await computeRoute(origin, destination, mode, extra, TRANSIT_FIELDS)
    return transitResult(route, arriveBy)
  }

  if (mode === 'DRIVING') {
    // Traffic predictions need a departure time, not an arrival time, so
    // estimate the departure and refine it.
    let route = await computeRoute(origin, destination, mode, { routingPreference: 'TRAFFIC_UNAWARE' }, BASIC_FIELDS)
    let durMs = parseDuration(route.duration)
    let trafficAware = false
    for (let i = 0; i < 3; i++) {
      const departure = new Date(arriveBy.getTime() - durMs)
      // Google can only predict traffic for future departures.
      if (departure.getTime() < now.getTime() + MIN) break
      route = await computeRoute(
        origin,
        destination,
        mode,
        { routingPreference: 'TRAFFIC_AWARE', departureTime: departure.toISOString() },
        BASIC_FIELDS,
      )
      const next = parseDuration(route.duration) || durMs
      trafficAware = true
      const settled = Math.abs(next - durMs) < 2 * MIN
      durMs = next
      if (settled) break
    }
    return { durationMin: Math.ceil(durMs / MIN), distanceMeters: route.distanceMeters, trafficAware }
  }

  const route = await computeRoute(origin, destination, mode, {}, BASIC_FIELDS)
  return {
    durationMin: Math.ceil(parseDuration(route.duration) / MIN),
    distanceMeters: route.distanceMeters,
    trafficAware: false,
  }
}

export function transitResult(route: RawRoute, arriveBy: Date): TravelResult {
  const steps = (route.legs ?? []).flatMap((l) => l.steps ?? [])
  const transitIdx = steps.map((s, i) => (s.transitDetails ? i : -1)).filter((i) => i >= 0)
  const durMs = parseDuration(route.duration)

  if (transitIdx.length === 0) {
    return {
      durationMin: Math.ceil(durMs / MIN),
      distanceMeters: route.distanceMeters,
      trafficAware: false,
      summary: 'Walking only',
    }
  }

  const sumWalk = (from: number, to: number) =>
    steps.slice(from, to).reduce((t, s) => t + parseDuration(s.staticDuration), 0)

  const firstIdx = transitIdx[0]
  const lastIdx = transitIdx[transitIdx.length - 1]
  const firstDep = steps[firstIdx].transitDetails?.stopDetails?.departureTime
  const lastArr = steps[lastIdx].transitDetails?.stopDetails?.arrivalTime

  const departAt = firstDep
    ? new Date(new Date(firstDep).getTime() - sumWalk(0, firstIdx))
    : new Date(arriveBy.getTime() - durMs)
  const arriveAt = lastArr
    ? new Date(new Date(lastArr).getTime() + sumWalk(lastIdx + 1, steps.length))
    : new Date(departAt.getTime() + durMs)

  const summary = transitIdx
    .map((i) => {
      const line = steps[i].transitDetails?.transitLine
      return line?.nameShort || line?.name || 'Transit'
    })
    .join(' → ')

  return {
    durationMin: Math.ceil((arriveAt.getTime() - departAt.getTime()) / MIN),
    distanceMeters: route.distanceMeters,
    departAt: departAt.toISOString(),
    trafficAware: false,
    summary,
  }
}
