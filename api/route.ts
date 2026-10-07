import { TRAVEL_MODES, travel, type TravelMode, type Waypoint } from './_lib/google.js'
import { errorResponse, guard, json } from './_lib/guard.js'

// One lookup per trip change; driving can make up to 4 Google calls each.
const LIMIT = { max: 40, windowMs: 10 * 60_000 }
const YEAR = 365 * 24 * 60 * 60_000

export function parseWaypoint(v: unknown): Waypoint | null {
  if (!v || typeof v !== 'object') return null
  const w = v as Record<string, unknown>
  if (typeof w.placeId === 'string' && /^[\w-]{1,300}$/.test(w.placeId)) return { placeId: w.placeId }
  if (
    typeof w.lat === 'number' && typeof w.lng === 'number' &&
    Math.abs(w.lat) <= 90 && Math.abs(w.lng) <= 180
  ) {
    return { lat: w.lat, lng: w.lng }
  }
  if (typeof w.address === 'string' && w.address.trim() && w.address.length <= 300) {
    return { address: w.address.trim() }
  }
  return null
}

export async function POST(req: Request): Promise<Response> {
  const g = await guard(req, 'route', LIMIT)
  if ('error' in g) return g.error

  const origin = parseWaypoint(g.body.origin)
  const destination = parseWaypoint(g.body.destination)
  const mode = g.body.mode as TravelMode
  const arriveBy = new Date(typeof g.body.arriveBy === 'string' ? g.body.arriveBy : NaN)

  if (
    !origin || !destination ||
    !TRAVEL_MODES.includes(mode) ||
    Number.isNaN(arriveBy.getTime()) ||
    Math.abs(arriveBy.getTime() - Date.now()) > YEAR
  ) {
    return json({ error: 'bad_request' }, 400)
  }

  try {
    return json(await travel(origin, destination, mode, arriveBy))
  } catch (e) {
    return errorResponse(e)
  }
}
