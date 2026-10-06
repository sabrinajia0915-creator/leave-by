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
