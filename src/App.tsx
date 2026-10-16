import { useEffect, useMemo, useRef, useState } from 'react'
import { addHours, format, startOfHour } from 'date-fns'
import { ChipPicker } from './components/ChipPicker'
import { ModeToggle } from './components/ModeToggle'
import { PrepPresetPicker } from './components/PrepPresetPicker'
import { WeeklyEvents } from './components/WeeklyEvents'
import { PlaceInput } from './components/PlaceInput'
import { ResultCard } from './components/ResultCard'
import { buildIcs, downloadIcs } from './lib/ics'
import {
  directionsUrl,
  formatDistance,
  getTravel,
  ApiError,
  type PlaceValue,
  type TravelMode,
  type TravelResult,
} from './lib/maps'
import { buildSchedule, formatDuration, nextOccurrence } from './lib/schedule'
import {
  loadDefaults,
  loadPresets,
  loadWeeklyEvents,
  saveDefaults,
  savePresets,
  saveWeeklyEvents,
  type PrepPreset,
  type WeeklyEvent,
} from './lib/storage'

type TravelState =
  | { status: 'idle'; result?: TravelResult }
  | { status: 'loading'; result?: TravelResult }
  | { status: 'ok'; result: TravelResult }
  | { status: 'error'; error: string; result?: TravelResult }

function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const MODE_NOUN: Record<TravelMode, string> = {
  DRIVING: 'drive',
  TRANSIT: 'by transit',
  WALKING: 'walk',
  BICYCLING: 'bike ride',
}

export default function App() {
  const defaults = useMemo(() => loadDefaults(), [])
  const now = useNow()

  const [eventName, setEventName] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState(() => format(addHours(startOfHour(new Date()), 2), 'HH:mm'))
  const [origin, setOrigin] = useState<PlaceValue | null>(defaults.origin)
  const [destination, setDestination] = useState<PlaceValue | null>(null)
  const [mode, setMode] = useState<TravelMode>(defaults.mode)
  const [prepMin, setPrepMin] = useState(defaults.prepMin)
  const [presets, setPresets] = useState<PrepPreset[]>(() => loadPresets())
  // Only keep the remembered preset if it still matches the saved minutes.
  const [prepPresetId, setPrepPresetId] = useState<string | null>(() => {
    const p = presets.find((x) => x.id === defaults.prepPresetId)
    return p && p.minutes === defaults.prepMin ? p.id : null
  })
  const [bufferMin, setBufferMin] = useState(defaults.bufferMin)
  const [parkingMin, setParkingMin] = useState(defaults.parkingMin)
  const [manual, setManual] = useState(false)
  const [manualMin, setManualMin] = useState(20)
  const [travel, setTravel] = useState<TravelState>({ status: 'idle' })
  const [weeklyEvents, setWeeklyEvents] = useState<WeeklyEvent[]>(() => loadWeeklyEvents())
  const [weeklyId, setWeeklyId] = useState<string | null>(null)
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [weeklySaved, setWeeklySaved] = useState(false)

  const eventTime = useMemo(() => {
    if (!date || !time) return null
    const d = new Date(`${date}T${time}`)
    return Number.isNaN(d.getTime()) ? null : d
  }, [date, time])

  const effectiveParking = mode === 'DRIVING' ? parkingMin : 0
  // When the route itself has to end (before parking and the buffer).
  const routeArriveByMs = eventTime
    ? eventTime.getTime() - (bufferMin + effectiveParking) * 60_000
    : null

  // Remember the user's usual settings.
  useEffect(() => {
    const savedOrigin = origin?.label === 'Current location' ? loadDefaults().origin : origin
    saveDefaults({ origin: savedOrigin, mode, prepMin, bufferMin, parkingMin, prepPresetId })
  }, [origin, mode, prepMin, bufferMin, parkingMin, prepPresetId])

  useEffect(() => savePresets(presets), [presets])
  useEffect(() => saveWeeklyEvents(weeklyEvents), [weeklyEvents])

  function loadWeekly(e: WeeklyEvent) {
    setEventName(e.name)
    setDate(format(nextOccurrence(e.weekday, e.time, new Date()), 'yyyy-MM-dd'))
    setTime(e.time)
    setDestination(e.destination)
    if (e.origin) setOrigin(e.origin)
    setMode(e.mode)
    setPrepPresetId(presets.some((p) => p.id === e.prepPresetId) ? e.prepPresetId : null)
    setPrepMin(e.prepMin)
    setBufferMin(e.bufferMin)
    setParkingMin(e.parkingMin)
    setWeeklyId(e.id)
    setRepeatWeekly(true)
    setWeeklySaved(false)
  }

  function saveWeekly() {
    if (!eventTime || !destination) return
    const e: WeeklyEvent = {
      id: weeklyId ?? crypto.randomUUID(),
      name: eventName.trim(),
      weekday: eventTime.getDay(),
      time,
      destination,
      origin: origin?.label === 'Current location' ? null : origin,
      mode,
      prepPresetId,
      prepMin,
      bufferMin,
      parkingMin,
    }
    setWeeklyEvents((list) =>
      list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e],
    )
    setWeeklyId(e.id)
    setWeeklySaved(true)
    setTimeout(() => setWeeklySaved(false), 2500)
  }

  function deleteWeekly(id: string) {
    setWeeklyEvents((list) => list.filter((x) => x.id !== id))
    if (id === weeklyId) {
      setWeeklyId(null)
      setRepeatWeekly(false)
    }
  }

  // Look up travel time whenever the trip changes.
  useEffect(() => {
    if (manual || !origin || !destination || routeArriveByMs == null) {
      setTravel((t) => ({ status: 'idle', result: t.result }))
      return
    }
    let cancelled = false
    setTravel((t) => ({ status: 'loading', result: t.result }))
    const timer = setTimeout(() => {
      getTravel(origin, destination, mode, new Date(routeArriveByMs))
        .then((result) => !cancelled && setTravel({ status: 'ok', result }))
        .catch((e: unknown) => {
          if (cancelled) return
          setTravel({ status: 'error', error: friendlyError(e) })
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [manual, origin, destination, mode, routeArriveByMs])

  const liveResult = travel.status === 'ok' ? travel.result : undefined
  const travelMin = manual ? manualMin : liveResult?.durationMin
  const schedule =
    eventTime && travelMin != null && (manual || destination)
      ? buildSchedule({
          eventTime,
          bufferMin,
          prepMin,
          parkingMin: effectiveParking,
          travelMin,
          departAt: !manual && mode === 'TRANSIT' ? liveResult?.departAt : undefined,
        })
      : null

  const prepPreset = presets.find((p) => p.id === prepPresetId)
  const hasSchedule = schedule != null
  const mapsUrl = destination ? directionsUrl(origin, destination, mode) : undefined

  const travelNote = !manual && liveResult
    ? [
        liveResult.summary,
        liveResult.trafficAware ? 'with predicted traffic' : undefined,
      ].filter(Boolean).join(' · ') || undefined
    : undefined

  // Mobile: show a sticky "Leave by" bar while the result card is off-screen.
  const resultRef = useRef<HTMLDivElement>(null)
  const [resultVisible, setResultVisible] = useState(true)
  useEffect(() => {
    const el = resultRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setResultVisible(e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [hasSchedule])

  function addToCalendar() {
    if (!schedule) return
    const ics = buildIcs(schedule, eventName, destination?.label ?? '', mapsUrl ?? '', prepPreset, {
      weekly: repeatWeekly,
    })
    const slug = (eventName.trim() || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadIcs(ics, `leave-by-${slug || 'event'}.ics`)
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <Logo />
          <span>Leave By</span>
        </div>
        <p className="tagline">Tell it when you need to be there. It tells you when to start.</p>
      </header>

      <main className="layout">
        <form className="card form" onSubmit={(e) => e.preventDefault()}>
          <section>
            <h2 className="step"><span>1</span>What & when</h2>
            <WeeklyEvents
              events={weeklyEvents}
              activeId={weeklyId}
              onLoad={loadWeekly}
              onDelete={deleteWeekly}
            />
            <div className="field">
              <label htmlFor="name">Event <span className="optional">optional</span></label>
              <input
                id="name"
                type="text"
                placeholder="Dinner at Nopa, yoga class, dentist…"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
              />
            </div>
            <div className="row-2">
              <div className="field">
                <label htmlFor="date">Date</label>
                <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="time">Starts at</label>
                <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div className="repeat">
              <label className="check">
                <input
                  type="checkbox"
                  checked={repeatWeekly}
                  onChange={(e) => {
                    setRepeatWeekly(e.target.checked)
                    if (!e.target.checked) setWeeklyId(null)
                  }}
                />
                Repeat every {eventTime ? format(eventTime, 'EEEE') : 'week'}
              </label>
              {repeatWeekly && (
                <button
                  type="button"
                  className="link"
                  disabled={!destination || !eventTime}
                  onClick={saveWeekly}
                >
                  {weeklySaved ? 'Saved ✓' : weeklyId ? 'Update saved event' : 'Save weekly event'}
                </button>
              )}
            </div>
            {repeatWeekly && !destination && <p className="hint">Add where it is to save it.</p>}
          </section>

          <section>
            <h2 className="step"><span>2</span>Where</h2>
            <PlaceInput
              label="Going to"
              placeholder="Search a place or address"
              value={destination}
              onChange={setDestination}
            />
            <PlaceInput
              label="Leaving from"
              placeholder="Home, work, or an address"
              value={origin}
              onChange={setOrigin}
              allowCurrentLocation
            />
            <ModeToggle value={mode} onChange={setMode} />

            {manual ? (
              <div className="field">
                <label htmlFor="manual">Travel time</label>
                <div className="with-suffix">
                  <input
                    id="manual"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1440}
                    value={manualMin}
                    onChange={(e) => setManualMin(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <span>min</span>
                </div>
                <button type="button" className="link" onClick={() => setManual(false)}>
                  Look it up with Google Maps instead
                </button>
              </div>
            ) : (
              <TravelStatus
                travel={travel}
                mode={mode}
                ready={!!origin && !!destination}
                onManual={() => {
                  if (travel.result) setManualMin(travel.result.durationMin)
                  setManual(true)
                }}
              />
            )}
          </section>

          <section>
            <h2 className="step"><span>3</span>Your timing</h2>
            <PrepPresetPicker
              presets={presets}
              presetId={prepPresetId}
              minutes={prepMin}
              onPick={(id, min) => {
                setPrepPresetId(id)
                setPrepMin(min)
              }}
              onPresetsChange={setPresets}
            />
            <ChipPicker
              label="Arrive early by"
              hint="a cushion for surprises"
              options={[0, 5, 10, 15]}
              value={bufferMin}
              onChange={setBufferMin}
            />
            {mode === 'DRIVING' && (
              <ChipPicker
                label="Parking & walking in"
                options={[0, 5, 10, 15]}
                value={parkingMin}
                onChange={setParkingMin}
              />
            )}
          </section>
        </form>

        <div className="result-col" ref={resultRef}>
          {schedule ? (
            <ResultCard
              schedule={schedule}
              now={now}
              mode={mode}
              eventName={eventName}
              prepMin={prepMin}
              prepLabel={prepPreset?.name}
              repeatLabel={repeatWeekly && eventTime ? `Every ${format(eventTime, 'EEEE')}` : undefined}
              bufferMin={bufferMin}
              parkingMin={effectiveParking}
              travelNote={travelNote}
              mapsUrl={mapsUrl}
              onAddToCalendar={addToCalendar}
            />
          ) : (
            <EmptyState loading={travel.status === 'loading'} />
          )}
        </div>
      </main>

      {schedule && !resultVisible && (
        <button
          type="button"
          className="sticky-bar"
          onClick={() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span>Leave by <strong>{format(schedule.leaveBy, 'h:mm a')}</strong></span>
          <span className="muted">Get ready {format(schedule.startPrep, 'h:mm a')} ↓</span>
        </button>
      )}

      <footer className="foot">
        Travel times from Google Maps. Your usual settings are saved on this device only.
      </footer>
    </div>
  )

}

function TravelStatus({
  travel,
  mode,
  ready,
  onManual,
}: {
  travel: TravelState
  mode: TravelMode
  ready: boolean
  onManual: () => void
}) {
  if (!ready) {
    return (
      <p className="travel-status muted">
        Add both places to look up the {MODE_NOUN[mode]}.{' '}
        <button type="button" className="link" onClick={onManual}>Or enter it yourself</button>
      </p>
    )
  }
  if (travel.status === 'loading') {
    return (
      <p className="travel-status">
        <span className="spinner" /> {mode === 'DRIVING' ? 'Checking traffic for that time…' : 'Finding the route…'}
      </p>
    )
  }
  if (travel.status === 'error') {
    return (
      <p className="travel-status error">
        {travel.error}{' '}
        <button type="button" className="link" onClick={onManual}>Enter travel time yourself</button>
      </p>
    )
  }
  if (travel.status === 'ok') {
    const r = travel.result
    return (
      <p className="travel-status ok">
        <strong>{formatDuration(r.durationMin)}</strong> {MODE_NOUN[mode]}
        {r.distanceMeters != null && <> · {formatDistance(r.distanceMeters)}</>}
        {r.trafficAware && <> · with predicted traffic</>}
        {' '}
        <button type="button" className="link" onClick={onManual}>Adjust</button>
      </p>
    )
  }
  return null
}

function friendlyError(e: unknown) {
  switch (e instanceof ApiError ? e.code : 'upstream') {
    case 'no_route':
      return 'Google Maps couldn’t find a route between these places.'
    case 'rate_limited':
      return 'Too many lookups in a short time — wait a few minutes and try again.'
    case 'not_configured':
      return 'Travel-time lookups aren’t set up on the server yet (see README).'
    case 'denied':
      return 'Google Maps rejected the request — check the server API key and that the Routes and Places APIs are enabled.'
    case 'network':
      return 'Couldn’t reach the server — check your connection.'
    default:
      return 'Couldn’t get a travel time right now.'
  }
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <section className="empty">
      <div className="empty-clock" aria-hidden>
        <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <circle cx="32" cy="32" r="26" />
          <path d="M32 18v14l-9 6" />
        </svg>
      </div>
      <h2>{loading ? 'Working it out…' : 'Your timeline shows up here'}</h2>
      <p>Add when the event starts and where it is. You’ll see exactly when to start getting ready and when to walk out the door.</p>
    </section>
  )
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--on-accent)" strokeWidth="2.4" />
      <path d="M16 11v5l-3.5 2.5" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}
