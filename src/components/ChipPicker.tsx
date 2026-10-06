import { useState } from 'react'

interface Props {
  label: string
  hint?: string
  options: number[]
  value: number
  onChange: (v: number) => void
}

/** Pick a number of minutes from preset chips, or type a custom value. */
export function ChipPicker({ label, hint, options, value, onChange }: Props) {
  const [custom, setCustom] = useState(!options.includes(value))

  return (
    <fieldset className="field">
      <legend>
        {label}
        {hint && <span className="legend-hint">{hint}</span>}
      </legend>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className="chip"
            aria-pressed={!custom && value === o}
            onClick={() => {
              setCustom(false)
              onChange(o)
            }}
          >
            {o === 0 ? 'None' : `${o} min`}
          </button>
        ))}
        {custom ? (
          <label className="chip chip-input" aria-pressed>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              value={value}
              autoFocus
              aria-label={`${label} in minutes`}
              onChange={(e) => onChange(Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
            />
            min
          </label>
        ) : (
          <button type="button" className="chip" onClick={() => setCustom(true)}>
            Custom
          </button>
        )}
      </div>
    </fieldset>
  )
}
