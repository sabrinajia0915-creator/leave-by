import { format, isSameDay } from 'date-fns'
import type { TravelMode } from '../lib/maps'
import { RunningLate } from './RunningLate'
import {
  formatDuration,
  formatRelative,
  getPhase,
  lateEstimate,
  type Phase,
  type Schedule,
} from '../lib/schedule'

const MODE_VERB: Record<TravelMode, string> = {
  DRIVING: 'Drive',
  TRANSIT: 'Transit',
  WALKING: 'Walk',
  BICYCLING: 'Bike',
}

const fmtTime = (d: Date) => format(d, 'h:mm a')

interface Props {
  schedule: Schedule
  now: Date
  mode: TravelMode
  eventName: string
  prepMin: number
  /** Name of the prep preset in use, if any. */
  prepLabel?: string
  /** e.g. "Every Tuesday" for a weekly event. */
  repeatLabel?: string
  bufferMin: number
  parkingMin: number
  travelNote?: string
  mapsUrl?: string
  onAddToCalendar: () => void
  onShare: () => void
}

const PHASE_COPY: Record<Phase, (s: Schedule, now: Date) => string> = {
  'before-prep': (s, now) => `Start getting ready ${formatRelative(s.startPrep, now)}`,
  prep: (s, now) => `Time to get ready — leave ${formatRelative(s.leaveBy, now)}`,
  'leave-now': (s, now) =>
    s.leaveBy > now ? `Head out soon — ${formatRelative(s.leaveBy, now)}` : 'Leave now',
  late: (s, now) => {
    const lateBy = Math.round((now.getTime() - s.leaveBy.getTime()) / 60_000)
    return `You’re ${formatDuration(lateBy)} behind — leave right away`
  },
  past: () => 'This event has already started',
}

export function ResultCard(props: Props) {
  const { schedule: s, now, mode, eventName, prepMin, prepLabel, repeatLabel, bufferMin, parkingMin, travelNote, mapsUrl } = props
  const phase = getPhase(s, now)
  const late = phase === 'late' ? lateEstimate(s, now, parkingMin) : null
  const showDate = !isSameDay(s.startPrep, now)
  const showParking = mode === 'DRIVING' && parkingMin > 0
  const transitEarly =
    mode === 'TRANSIT' && s.arriveAt.getTime() < s.arriveBy.getTime() - 60_000

  const steps: { key: string; time: Date; title: string; detail: string; current: boolean; late?: boolean }[] = [
    {
      key: 'prep',
      time: s.startPrep,
      title: 'Start getting ready',
      detail: `${prepLabel ? `${prepLabel} · ` : ''}${formatDuration(prepMin)} to get ready`,
      current: phase === 'prep' || phase === 'before-prep',
    },
    {
      key: 'leave',
      time: s.leaveBy,
      title: 'Leave',
      detail: `${MODE_VERB[mode]} ${formatDuration(s.travelMin)}${travelNote ? ` · ${travelNote}` : ''}`,
      current: phase === 'leave-now' || phase === 'late',
    },
    ...(showParking
      ? [{
          key: 'park',
          time: new Date(s.arriveAt.getTime() - parkingMin * 60_000),
          title: 'Park',
          detail: `${formatDuration(parkingMin)} to park and walk in`,
          current: false,
        }]
      : []),
    {
      key: 'arrive',
      time: late ? late.arrive : s.arriveAt,
      title: late ? 'Arrive (if you leave now)' : 'Arrive',
      detail: late
        ? late.lateMin > 0
          ? `About ${formatDuration(late.lateMin)} late`
          : `${formatDuration(-late.lateMin)} before it starts`
        : transitEarly
        ? `${formatDuration((s.eventTime.getTime() - s.arriveAt.getTime()) / 60_000)} before it starts`
        : bufferMin > 0
          ? `${formatDuration(bufferMin)} to spare`
          : 'Right on time',
      current: false,
      late: !!late && late.lateMin > 0,
    },
    {
      key: 'event',
      time: s.eventTime,
      title: eventName.trim() || 'Event starts',
      detail: format(s.eventTime, 'EEEE, MMM d'),
      current: false,
    },
  ]

  return (
    <section className={`result phase-${phase}`} aria-live="polite">
      <div className="headline">
        <p className="eyebrow">
          Leave by
          {repeatLabel && <span className="repeat-tag"> · {repeatLabel}, next {format(s.eventTime, 'EEE, MMM d')}</span>}
        </p>
        <p className="big-time">
          {fmtTime(s.leaveBy)}
          {showDate && <span className="big-date">{format(s.leaveBy, 'EEE, MMM d')}</span>}
        </p>
        <p className="status">
          <span className="status-dot" />
          {late
            ? late.lateMin > 0
              ? `Leave now — you'll arrive about ${formatDuration(late.lateMin)} late`
              : `Leave now — you'll still make it with ${formatDuration(-late.lateMin)} to spare`
            : PHASE_COPY[phase](s, now)}
        </p>
        {late && (
          <RunningLate
            lateMin={late.lateMin}
            arrive={late.arrive}
            eventName={eventName}
            note={mode === 'TRANSIT' ? 'Estimate: assumes the next ride takes as long as the one you missed.' : undefined}
          />
        )}
      </div>

      <div className="summary-pair">
        <div>
          <span className="k">Get ready</span>
          <span className="v">{fmtTime(s.startPrep)}</span>
        </div>
        <div>
          <span className="k">{late ? 'If you leave now' : 'Arrive'}</span>
          <span className={late && late.lateMin > 0 ? 'v late' : 'v'}>
            {fmtTime(late ? late.arrive : s.arriveAt)}
          </span>
        </div>
      </div>

      <ol className="timeline">
        {steps.map((st) => (
          <li key={st.key} className={[st.current && 'current', st.late && 'late'].filter(Boolean).join(' ') || undefined}>
            <time dateTime={st.time.toISOString()}>{fmtTime(st.time)}</time>
            <span className="dot" aria-hidden />
            <div>
              <strong>{st.title}</strong>
              <span>{st.detail}</span>
            </div>
          </li>
        ))}
      </ol>

      <details className="math">
        <summary>How this was worked out</summary>
        <dl>
          <div><dt>Event</dt><dd>{fmtTime(s.eventTime)}</dd></div>
          {bufferMin > 0 && <div><dt>− Arrive early</dt><dd>{formatDuration(bufferMin)}</dd></div>}
          {showParking && <div><dt>− Parking & walking in</dt><dd>{formatDuration(parkingMin)}</dd></div>}
          {mode === 'TRANSIT' && s.arriveAt < s.arriveBy ? (
            <div><dt>− Next transit option that gets you there</dt><dd>leave {fmtTime(s.leaveBy)}</dd></div>
          ) : (
            <div><dt>− {MODE_VERB[mode]} time</dt><dd>{formatDuration(s.travelMin)}</dd></div>
          )}
          <div className="sub"><dt>= Leave by</dt><dd>{fmtTime(s.leaveBy)}</dd></div>
          <div><dt>− Getting ready</dt><dd>{formatDuration(prepMin)}</dd></div>
          <div className="total"><dt>= Start getting ready</dt><dd>{fmtTime(s.startPrep)}</dd></div>
        </dl>
        <p className="hint">Start to finish: {formatDuration(s.totalMin)}.</p>
      </details>

      <div className="actions">
        {mapsUrl && (
          <a className="btn" href={mapsUrl} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
        )}
        <button type="button" className="btn" onClick={props.onAddToCalendar}>
          Add reminders to calendar
        </button>
        <button type="button" className="btn btn-share" onClick={props.onShare}>
          Share my plan ✦
        </button>
      </div>
    </section>
  )
}
