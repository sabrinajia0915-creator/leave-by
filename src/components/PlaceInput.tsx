import { useEffect, useId, useRef, useState } from 'react'
import { hasMapsKey, placesLib, type PlaceValue } from '../lib/maps'

interface Suggestion {
  id: string
  main: string
  secondary: string
  prediction: google.maps.places.PlacePrediction
}

interface Props {
  label: string
  placeholder: string
  value: PlaceValue | null
  onChange: (v: PlaceValue | null) => void
  /** Show a "use my location" button. */
  allowCurrentLocation?: boolean
}

export function PlaceInput({ label, placeholder, value, onChange, allowCurrentLocation }: Props) {
  const id = useId()
  const [text, setText] = useState(value?.label ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const reqRef = useRef(0)

  // Keep the box in sync when the value is set from outside (saved defaults, geolocation).
  useEffect(() => {
    setText(value?.label ?? '')
  }, [value])

  useEffect(() => {
    if (!hasMapsKey || !open) return
    const q = text.trim()
    if (q.length < 2 || q === value?.label) {
      setSuggestions([])
      return
    }
    const req = ++reqRef.current
    const t = setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await placesLib()
        tokenRef.current ??= new AutocompleteSessionToken()
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: tokenRef.current,
        })
        if (req !== reqRef.current) return
        setSuggestions(
          suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .map((p) => ({
              id: p.placeId,
              main: p.mainText?.toString() ?? p.text.toString(),
              secondary: p.secondaryText?.toString() ?? '',
              prediction: p,
            })),
        )
        setActive(-1)
      } catch {
        if (req === reqRef.current) setSuggestions([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [text, open, value?.label])

  async function choose(s: Suggestion) {
    setOpen(false)
    setSuggestions([])
    const label = s.secondary ? `${s.main}, ${s.secondary}` : s.main
    setText(label)
    try {
      const place = s.prediction.toPlace()
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] })
      onChange({ label, location: place.location?.toJSON(), placeId: s.id })
    } catch {
      onChange({ label, placeId: s.id })
    }
    tokenRef.current = null // session ends after a selection
  }

  function commitText() {
    const t = text.trim()
    if (!t) onChange(null)
    else if (t !== value?.label) onChange({ label: t })
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChange({
          label: 'Current location',
          location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        })
      },
      () => {
        setLocating(false)
        setLocError('Couldn’t get your location. Type an address instead.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }

  const listId = `${id}-list`
  const showList = open && suggestions.length > 0

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="place-row">
        <div className="combo">
          <input
            id={id}
            type="text"
            autoComplete="off"
            placeholder={placeholder}
            value={text}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            onChange={(e) => {
              setText(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Let a click on a suggestion land first.
              setTimeout(() => {
                setOpen(false)
                commitText()
              }, 150)
            }}
            onKeyDown={(e) => {
              if (!showList) {
                if (e.key === 'Enter') commitText()
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, suggestions.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(suggestions[Math.max(active, 0)])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
          {showList && (
            <ul className="suggestions" id={listId} role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(s)
                  }}
                >
                  <span className="s-main">{s.main}</span>
                  {s.secondary && <span className="s-sub">{s.secondary}</span>}
                </li>
              ))}
              <li className="powered" aria-hidden>
                Powered by Google
              </li>
            </ul>
          )}
        </div>
        {allowCurrentLocation && (
          <button
            type="button"
            className="icon-btn"
            onClick={useMyLocation}
            disabled={locating}
            title="Use my current location"
            aria-label="Use my current location"
          >
            {locating ? <span className="spinner" /> : <LocateIcon />}
          </button>
        )}
      </div>
      {locError && <p className="hint error">{locError}</p>}
    </div>
  )
}

function LocateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}
