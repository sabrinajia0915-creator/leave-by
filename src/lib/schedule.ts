const MIN = 60_000

export interface ScheduleInput {
  eventTime: Date
  /** How early you want to be there, in minutes. */
  bufferMin: number
  /** Time to get ready before leaving, in minutes. */
  prepMin: number
  /** Parking / walking in from the car, in minutes (driving only). */
  parkingMin: number
  /** Door-to-door travel time, in minutes. */
  travelMin: number
  /**
   * A fixed departure time, when the trip has one (e.g. transit: you have to
   * catch a specific bus). Overrides the backward calculation of leaveBy.
   */
  departAt?: Date
}

export interface Schedule {
  eventTime: Date
  /** When you want to be there (event time minus buffer). */
  arriveBy: Date
  /** When you'll actually arrive if you leave on time. */
  arriveAt: Date
  leaveBy: Date
  startPrep: Date
  travelMin: number
  /** Total minutes from starting to get ready until the event. */
  totalMin: number
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const { eventTime, bufferMin, prepMin, parkingMin, travelMin, departAt } = input
  const arriveBy = new Date(eventTime.getTime() - bufferMin * MIN)
  const leaveBy = departAt
    ? new Date(departAt.getTime())
    : new Date(arriveBy.getTime() - (travelMin + parkingMin) * MIN)
  const arriveAt = new Date(leaveBy.getTime() + (travelMin + parkingMin) * MIN)
  const startPrep = new Date(leaveBy.getTime() - prepMin * MIN)
  return {
    eventTime,
    arriveBy,
    arriveAt,
    leaveBy,
    startPrep,
    travelMin,
    totalMin: Math.round((eventTime.getTime() - startPrep.getTime()) / MIN),
  }
}

export type Phase = 'before-prep' | 'prep' | 'leave-now' | 'late' | 'past'

/** Where `now` falls on the schedule. */
export function getPhase(s: Schedule, now: Date): Phase {
  const t = now.getTime()
  if (t >= s.eventTime.getTime()) return 'past'
  if (t > s.leaveBy.getTime() + MIN) return 'late'
  if (t >= s.leaveBy.getTime() - 5 * MIN) return 'leave-now'
  if (t >= s.startPrep.getTime()) return 'prep'
  return 'before-prep'
}

/** "45 min", "1 h", "1 h 05 min" */
export function formatDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')} min`
}

/** "in 1 h 05 min", "in 3 min", "now", "12 min ago" */
export function formatRelative(target: Date, now: Date): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / MIN)
  if (diffMin === 0) return 'now'
  if (diffMin > 0) {
    if (diffMin >= 48 * 60) return `in ${Math.round(diffMin / (24 * 60))} days`
    return `in ${formatDuration(diffMin)}`
  }
  return `${formatDuration(-diffMin)} ago`
}

/** If you leave right now: when you'd arrive, and how late that is (≤ 0 = still on time). */
export function lateEstimate(s: Schedule, now: Date, parkingMin: number) {
  const arrive = new Date(now.getTime() + (s.travelMin + parkingMin) * MIN)
  return { arrive, lateMin: Math.round((arrive.getTime() - s.eventTime.getTime()) / MIN) }
}

const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** A ready-to-send text, with the lateness rounded up to the next 5 minutes. */
export function lateMessage(lateMin: number, arrive: Date, eventName: string): string {
  const name = eventName.trim()
  if (lateMin <= 0) return `On my way${name ? ` to ${name}` : ''}, I'll be there around ${clock(arrive)}.`
  const rounded = Math.ceil(lateMin / 5) * 5
  return `Running about ${rounded} min late${name ? ` for ${name}` : ''}, I'll be there around ${clock(arrive)}. Sorry!`
}

/** The next time a weekly event starts: today if it hasn't started yet, else a later day. */
export function nextOccurrence(weekday: number, time: string, now: Date): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  d.setDate(d.getDate() + ((weekday - now.getDay() + 7) % 7))
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7)
  return d
}
