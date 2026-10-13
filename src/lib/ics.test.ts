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
