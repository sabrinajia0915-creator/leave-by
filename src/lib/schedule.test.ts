import { describe, expect, it } from 'vitest'
import { buildSchedule, formatDuration, formatRelative, getPhase } from './schedule'

const at = (s: string) => new Date(s)

describe('buildSchedule', () => {
  it('works backward from the event time', () => {
    const s = buildSchedule({
      eventTime: at('2026-10-06T19:00'),
      bufferMin: 10,
      prepMin: 30,
      parkingMin: 0,
      travelMin: 25,
    })
    expect(s.arriveBy).toEqual(at('2026-10-06T18:50'))
    expect(s.leaveBy).toEqual(at('2026-10-06T18:25'))
    expect(s.startPrep).toEqual(at('2026-10-06T17:55'))
    expect(s.arriveAt).toEqual(s.arriveBy)
    expect(s.totalMin).toBe(65)
  })

  it('includes parking time in the trip', () => {
    const s = buildSchedule({
      eventTime: at('2026-10-06T09:00'),
      bufferMin: 5,
      prepMin: 45,
      parkingMin: 10,
      travelMin: 20,
    })
    expect(s.leaveBy).toEqual(at('2026-10-06T08:25'))
    expect(s.arriveAt).toEqual(at('2026-10-06T08:55'))
    expect(s.startPrep).toEqual(at('2026-10-06T07:40'))
  })

  it('crosses midnight', () => {
    const s = buildSchedule({
      eventTime: at('2026-10-07T00:15'),
      bufferMin: 0,
      prepMin: 20,
      parkingMin: 0,
      travelMin: 30,
    })
    expect(s.leaveBy).toEqual(at('2026-10-06T23:45'))
    expect(s.startPrep).toEqual(at('2026-10-06T23:25'))
  })

  it('uses a fixed departure (transit) when given', () => {
    const s = buildSchedule({
      eventTime: at('2026-10-06T19:00'),
      bufferMin: 10,
      prepMin: 30,
      parkingMin: 0,
      travelMin: 32,
      departAt: at('2026-10-06T18:12'),
    })
    expect(s.leaveBy).toEqual(at('2026-10-06T18:12'))
    expect(s.arriveAt).toEqual(at('2026-10-06T18:44'))
    expect(s.startPrep).toEqual(at('2026-10-06T17:42'))
  })
})

describe('getPhase', () => {
  const s = buildSchedule({
    eventTime: at('2026-10-06T19:00'),
    bufferMin: 10,
    prepMin: 30,
    parkingMin: 0,
    travelMin: 25,
  })
  it.each([
    ['2026-10-06T17:00', 'before-prep'],
    ['2026-10-06T18:00', 'prep'],
    ['2026-10-06T18:22', 'leave-now'],
    ['2026-10-06T18:40', 'late'],
    ['2026-10-06T19:05', 'past'],
  ])('%s → %s', (now, phase) => {
    expect(getPhase(s, at(now))).toBe(phase)
  })
})

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(65)).toBe('1 h 05 min')
  })
  it('formats relative times', () => {
    const now = at('2026-10-06T12:00')
    expect(formatRelative(at('2026-10-06T13:05'), now)).toBe('in 1 h 05 min')
    expect(formatRelative(at('2026-10-06T11:48'), now)).toBe('12 min ago')
    expect(formatRelative(now, now)).toBe('now')
  })
})
