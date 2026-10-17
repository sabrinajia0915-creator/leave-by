import type { Schedule } from './schedule'
import type { PrepPreset } from './storage'

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/**
 * Local "floating" time (no Z), so a weekly reminder stays at the same clock
 * time when daylight saving starts or ends.
 */
const pad = (n: number) => String(n).padStart(2, '0')
const localStamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

function vevent(
  uid: string,
  start: Date,
  end: Date,
  summary: string,
  description: string,
  location?: string,
  weekly?: boolean,
) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@leave-by`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${weekly ? localStamp(start) : stamp(start)}`,
    `DTEND:${weekly ? localStamp(end) : stamp(end)}`,
    ...(weekly ? ['RRULE:FREQ=WEEKLY'] : []),
    `SUMMARY:${escape(summary)}`,
    `DESCRIPTION:${escape(description)}`,
    ...(location ? [`LOCATION:${escape(location)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(summary)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
  ]
}

/** A calendar file with two alarmed blocks: getting ready, and travelling. */
export function buildIcs(
  s: Schedule,
  eventName: string,
  destination: string,
  mapsUrl: string,
  prepPreset?: PrepPreset,
  opts: { weekly?: boolean } = {},
) {
  const name = eventName.trim() || 'your event'
  const prepNote = prepPreset
    ? `${prepPreset.name}${prepPreset.purpose ? ` — ${prepPreset.purpose}` : ''}\n`
    : ''
  const id = `${s.eventTime.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const weeklyNote = opts.weekly ? "\nRepeats weekly; times use this week's travel estimate." : ''
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Leave By//EN',
    'CALSCALE:GREGORIAN',
    ...vevent(`prep-${id}`, s.startPrep, s.leaveBy, `Start getting ready for ${name}`, `${prepNote}Leave by ${s.leaveBy.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.${weeklyNote}`, undefined, opts.weekly),
    ...vevent(`leave-${id}`, s.leaveBy, s.arriveAt, `Leave now for ${name}`, `Directions: ${mapsUrl}${weeklyNote}`, destination, opts.weekly),
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

export function downloadIcs(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * A link that opens Google Calendar with the trip pre-filled: one event from
 * "start getting ready" to arrival, in local time (so weekly repeats don't
 * drift with daylight saving).
 */
export function googleCalendarUrl(
  s: Schedule,
  eventName: string,
  destination: string,
  mapsUrl: string,
  opts: { weekly?: boolean; prepLabel?: string; timeZone?: string } = {},
) {
  const name = eventName.trim() || 'your event'
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const details = [
    `Start getting ready: ${t(s.startPrep)}${opts.prepLabel ? ` (${opts.prepLabel})` : ''}`,
    `Leave by: ${t(s.leaveBy)}`,
    `Arrive: ${t(s.arriveAt)}`,
    `${name} starts: ${t(s.eventTime)}`,
    mapsUrl && `Directions: ${mapsUrl}`,
    opts.weekly && "Repeats weekly; times use this week's travel estimate.",
  ]
    .filter(Boolean)
    .join('\n')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Get ready & go: ${name}`,
    dates: `${localStamp(s.startPrep)}/${localStamp(s.arriveAt)}`,
    ctz: opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    details,
  })
  if (destination) params.set('location', destination)
  if (opts.weekly) params.set('recur', 'RRULE:FREQ=WEEKLY')
  return `https://calendar.google.com/calendar/render?${params}`
}
