import type { PlaceValue, TravelMode } from './maps'

export interface Defaults {
  origin: PlaceValue | null
  mode: TravelMode
  prepMin: number
  bufferMin: number
  parkingMin: number
}

const KEY = 'leave-by:defaults:v1'

export const FALLBACK_DEFAULTS: Defaults = {
  origin: null,
  mode: 'DRIVING',
  prepMin: 30,
  bufferMin: 10,
  parkingMin: 5,
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
