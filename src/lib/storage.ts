import type { PlaceValue, TravelMode } from './maps'

export interface Defaults {
  origin: PlaceValue | null
  mode: TravelMode
  prepMin: number
  bufferMin: number
  parkingMin: number
  /** The prep preset last picked, or null for a custom number. */
  prepPresetId: string | null
}

const KEY = 'leave-by:defaults:v1'

export const FALLBACK_DEFAULTS: Defaults = {
  origin: null,
  mode: 'DRIVING',
  prepMin: 30,
  bufferMin: 10,
  parkingMin: 5,
  prepPresetId: 'makeup',
}

export function loadDefaults(): Defaults {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return FALLBACK_DEFAULTS
    return { ...FALLBACK_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return FALLBACK_DEFAULTS
  }
}

export function saveDefaults(d: Defaults) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // Storage unavailable (private mode etc.) — defaults just won't persist.
  }
}

/** A named amount of time to get ready, e.g. "Date night", 45 min. */
export interface PrepPreset {
  id: string
  name: string
  minutes: number
  purpose: string
}

export const PRESET_NAME_MAX = 40
export const PRESET_PURPOSE_MAX = 120
export const PRESET_MIN_MAX = 600

const PRESETS_KEY = 'leave-by:prep-presets:v1'

export const STARTER_PRESETS: PrepPreset[] = [
  { id: 'quick', name: 'Quick', minutes: 15, purpose: 'Just grab keys and go' },
  { id: 'hair', name: 'Hair', minutes: 10, purpose: 'Style hair only' },
  { id: 'makeup', name: 'Makeup', minutes: 30, purpose: 'Everyday makeup' },
  { id: 'date', name: 'Date night', minutes: 45, purpose: 'Makeup + outfit for a date' },
]

/** Keep only well-formed presets, trimmed and within limits. */
export function normalizePresets(raw: unknown): PrepPreset[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: PrepPreset[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const { id, name, minutes, purpose } = r as Record<string, unknown>
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    if (typeof name !== 'string' || !name.trim()) continue
    const min = Math.round(Number(minutes))
    if (!Number.isFinite(min)) continue
    seen.add(id)
    out.push({
      id,
      name: name.trim().slice(0, PRESET_NAME_MAX),
      minutes: Math.max(1, Math.min(PRESET_MIN_MAX, min)),
      purpose: typeof purpose === 'string' ? purpose.trim().slice(0, PRESET_PURPOSE_MAX) : '',
    })
  }
  return out
}

export function loadPresets(): PrepPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (!raw) return STARTER_PRESETS
    return normalizePresets(JSON.parse(raw))
  } catch {
    return STARTER_PRESETS
  }
}

export function savePresets(p: PrepPreset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(p))
  } catch {
    // Storage unavailable — presets just won't persist.
  }
}

/** An event that happens every week, e.g. "Yoga", Tuesdays at 7 PM. */
export interface WeeklyEvent {
  id: string
  name: string
  /** 0–6, Sunday–Saturday. */
  weekday: number
  /** Start time, 'HH:mm'. */
  time: string
  destination: PlaceValue
  origin: PlaceValue | null
  mode: TravelMode
  prepPresetId: string | null
  prepMin: number
  bufferMin: number
  parkingMin: number
}

const WEEKLY_KEY = 'leave-by:weekly-events:v1'
const MODES: TravelMode[] = ['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING']

function toPlace(v: unknown): PlaceValue | null {
  if (!v || typeof v !== 'object') return null
  const { label, location, placeId } = v as Record<string, unknown>
  if (typeof label !== 'string' || !label.trim()) return null
  const place: PlaceValue = { label }
  if (typeof placeId === 'string') place.placeId = placeId
  if (location && typeof location === 'object') {
    const { lat, lng } = location as Record<string, unknown>
    if (typeof lat === 'number' && typeof lng === 'number') place.location = { lat, lng }
  }
  return place
}

const minutes = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(PRESET_MIN_MAX, n)) : fallback
}

/** Keep only well-formed weekly events. */
export function normalizeWeeklyEvents(raw: unknown): WeeklyEvent[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: WeeklyEvent[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const e = r as Record<string, unknown>
    const destination = toPlace(e.destination)
    if (typeof e.id !== 'string' || !e.id || seen.has(e.id) || !destination) continue
    if (!Number.isInteger(e.weekday) || (e.weekday as number) < 0 || (e.weekday as number) > 6) continue
    if (typeof e.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) continue
    seen.add(e.id)
    out.push({
      id: e.id,
      name: typeof e.name === 'string' ? e.name.trim().slice(0, 80) : '',
      weekday: e.weekday as number,
      time: e.time,
      destination,
      origin: toPlace(e.origin),
      mode: MODES.includes(e.mode as TravelMode) ? (e.mode as TravelMode) : 'DRIVING',
      prepPresetId: typeof e.prepPresetId === 'string' ? e.prepPresetId : null,
      prepMin: minutes(e.prepMin, 30),
      bufferMin: minutes(e.bufferMin, 10),
      parkingMin: minutes(e.parkingMin, 5),
    })
  }
  return out
}

export function loadWeeklyEvents(): WeeklyEvent[] {
  try {
    const raw = localStorage.getItem(WEEKLY_KEY)
    return raw ? normalizeWeeklyEvents(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function saveWeeklyEvents(events: WeeklyEvent[]) {
  try {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(events))
  } catch {
    // Storage unavailable — weekly events just won't persist.
  }
}
