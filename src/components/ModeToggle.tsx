import type { TravelMode } from '../lib/maps'

const MODES: { mode: TravelMode; label: string; icon: string }[] = [
  { mode: 'DRIVING', label: 'Drive', icon: 'M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4z M7.5 14.5h.01M16.5 14.5h.01' },
  { mode: 'TRANSIT', label: 'Transit', icon: 'M6 4h12v11H6z M6 10h12 M8 18l-2 3M16 18l2 3 M9 13h.01M15 13h.01 M6 15h12v3H6z' },
  { mode: 'WALKING', label: 'Walk', icon: 'M13 4a1 1 0 1 0 0-.01 M10 21l2-6 3 3v3 M8 11l3-3 3 1 2 3 M11 8l1 7' },
  { mode: 'BICYCLING', label: 'Bike', icon: 'M5.5 17a3.5 3.5 0 1 0 0-.01 M18.5 17a3.5 3.5 0 1 0 0-.01 M5.5 17l4-8h6l3 8 M9.5 9l3 8h-7 M14 6h2.5' },
]

export function ModeToggle({ value, onChange }: { value: TravelMode; onChange: (m: TravelMode) => void }) {
  return (
    <fieldset className="field">
      <legend>How are you getting there?</legend>
      <div className="segmented" role="radiogroup">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={value === m.mode}
            onClick={() => onChange(m.mode)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={m.icon} />
            </svg>
            {m.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
