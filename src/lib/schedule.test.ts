import { describe, expect, it } from 'vitest'
import { buildSchedule, formatDuration, formatRelative, getPhase, lateEstimate, lateMessage } from './schedule'

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

describe('lateEstimate', () => {
  const s = buildSchedule({
    eventTime: at('2026-10-06T19:00'),
    bufferMin: 10,
    prepMin: 30,
    parkingMin: 5,
    travelMin: 20,
  })

  it('counts minutes late against the event start', () => {
    const { arrive, lateMin } = lateEstimate(s, at('2026-10-06T18:47'), 5)
    expect(arrive).toEqual(at('2026-10-06T19:12'))
    expect(lateMin).toBe(12)
  })

  it('is zero or negative when the buffer still covers it', () => {
    expect(lateEstimate(s, at('2026-10-06T18:32'), 5).lateMin).toBe(-3)
  })
})

describe('lateMessage', () => {
  const arrive = at('2026-10-06T19:12')

  it('rounds up to the next 5 minutes and names the event', () => {
    expect(lateMessage(12, arrive, ' Yoga ')).toBe(
      "Running about 15 min late for Yoga, I'll be there around 7:12 PM. Sorry!",
    )
    expect(lateMessage(1, arrive, 'Yoga')).toMatch(/^Running about 5 min late/)
    expect(lateMessage(10, arrive, 'Yoga')).toMatch(/^Running about 10 min late/)
  })

  it('leaves out the event name when there is none', () => {
    expect(lateMessage(7, arrive, '')).toBe(
      "Running about 10 min late, I'll be there around 7:12 PM. Sorry!",
    )
  })

  it('says on my way when still on time', () => {
    expect(lateMessage(-3, arrive, 'dinner')).toBe("On my way to dinner, I'll be there around 7:12 PM.")
  })
})
