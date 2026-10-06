import type { Schedule } from './schedule'

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

function vevent(uid: string, start: Date, end: Date, summary: string, description: string, location?: string) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@leave-by`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
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
export function buildIcs(s: Schedule, eventName: string, destination: string, mapsUrl: string) {
  const name = eventName.trim() || 'your event'
  const id = `${s.eventTime.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Leave By//EN',
    'CALSCALE:GREGORIAN',
    ...vevent(`prep-${id}`, s.startPrep, s.leaveBy, `Start getting ready for ${name}`, `Leave by ${s.leaveBy.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`),
    ...vevent(`leave-${id}`, s.leaveBy, s.arriveAt, `Leave now for ${name}`, `Directions: ${mapsUrl}`, destination),
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
