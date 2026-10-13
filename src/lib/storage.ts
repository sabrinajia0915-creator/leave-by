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
