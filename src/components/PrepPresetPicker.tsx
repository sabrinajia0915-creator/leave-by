import type { PrepPreset } from '../lib/storage'
import { PRESET_MIN_MAX } from '../lib/storage'
import { formatDuration } from '../lib/schedule'

interface Props {
  presets: PrepPreset[]
  /** Selected preset, or null when a custom number is in use. */
  presetId: string | null
  minutes: number
  onPick: (presetId: string | null, minutes: number) => void
}

/** Pick a named prep preset ("Date night · 45 min"), or type a one-off number. */
export function PrepPresetPicker({ presets, presetId, minutes, onPick }: Props) {
  const selected = presets.find((p) => p.id === presetId)
  const custom = !selected

  return (
    <fieldset className="field">
      <legend>Time to get ready</legend>
      <div className="chips">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            aria-pressed={p.id === presetId}
            onClick={() => onPick(p.id, p.minutes)}
          >
            {p.name} · {formatDuration(p.minutes)}
          </button>
        ))}
        {custom ? (
          <label className="chip chip-input" aria-pressed>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={PRESET_MIN_MAX}
              value={minutes}
              aria-label="Time to get ready in minutes"
              onChange={(e) =>
                onPick(null, Math.max(0, Math.min(PRESET_MIN_MAX, Number(e.target.value) || 0)))
              }
            />
            min
          </label>
        ) : (
          <button type="button" className="chip" onClick={() => onPick(null, minutes)}>
            Custom
          </button>
        )}
      </div>
      {selected?.purpose && <p className="hint">{selected.purpose}</p>}
    </fieldset>
  )
}
