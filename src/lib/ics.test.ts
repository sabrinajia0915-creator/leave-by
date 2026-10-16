import { describe, expect, it } from 'vitest'
import { buildIcs } from './ics'
import { buildSchedule } from './schedule'

const s = buildSchedule({
  eventTime: new Date('2026-10-06T19:00'),
  bufferMin: 10,
  prepMin: 45,
  parkingMin: 0,
  travelMin: 25,
})

describe('buildIcs', () => {
  it('names the prep preset in the get-ready event', () => {
    const ics = buildIcs(s, 'Dinner', 'Nopa', 'https://maps.example', {
      id: 'date',
      name: 'Date night',
      minutes: 45,
      purpose: 'Makeup, outfit',
    })
    expect(ics).toContain('DESCRIPTION:Date night — Makeup\\, outfit\\nLeave by')
  })

  it('leaves the description alone without a preset', () => {
    expect(buildIcs(s, 'Dinner', 'Nopa', 'https://maps.example')).toMatch(/DESCRIPTION:Leave by/)
  })
})

describe('buildIcs weekly', () => {
  it('repeats both reminders every week', () => {
    const ics = buildIcs(s, 'Yoga', 'Studio', 'https://maps.example', undefined, { weekly: true })
    expect(ics.match(/RRULE:FREQ=WEEKLY/g)).toHaveLength(2)
    expect(ics).toContain('Repeats weekly')
  })

  it('uses local clock time so daylight saving does not shift it', () => {
    const ics = buildIcs(s, 'Yoga', 'Studio', 'https://maps.example', undefined, { weekly: true })
    // Get ready starts 19:00 − 10 − 25 − 45 = 17:40 local.
    expect(ics).toContain('DTSTART:20261006T174000\r\n')
  })

  it('does not repeat one-off events', () => {
    expect(buildIcs(s, 'Dinner', 'Nopa', 'https://maps.example')).not.toContain('RRULE')
  })
})
