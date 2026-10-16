import { describe, expect, it } from 'vitest'
import { normalizePresets, normalizeWeeklyEvents, STARTER_PRESETS } from './storage'

describe('normalizePresets', () => {
  it('keeps valid presets as they are', () => {
    expect(normalizePresets(STARTER_PRESETS)).toEqual(STARTER_PRESETS)
  })

  it('returns nothing for data that is not a list', () => {
    expect(normalizePresets(null)).toEqual([])
    expect(normalizePresets({ id: 'x' })).toEqual([])
  })

  it('drops rows without an id or name, and duplicate ids', () => {
    const out = normalizePresets([
      { id: 'a', name: 'Hair', minutes: 10 },
      { id: 'a', name: 'Hair again', minutes: 20 },
      { id: '', name: 'No id', minutes: 10 },
      { id: 'b', name: '   ', minutes: 10 },
      { id: 'c', name: 'Bad minutes', minutes: 'soon' },
      'junk',
    ])
    expect(out).toEqual([{ id: 'a', name: 'Hair', minutes: 10, purpose: '' }])
  })

  it('trims text and clamps minutes', () => {
    const [p] = normalizePresets([
      { id: 'a', name: '  Brunch  ', minutes: 9999, purpose: '  hair + outfit ' },
    ])
    expect(p).toEqual({ id: 'a', name: 'Brunch', minutes: 600, purpose: 'hair + outfit' })
    expect(normalizePresets([{ id: 'b', name: 'X', minutes: 0 }])[0].minutes).toBe(1)
  })
})

describe('normalizeWeeklyEvents', () => {
  const yoga = {
    id: 'y',
    name: 'Yoga',
    weekday: 2,
    time: '19:00',
    destination: { label: 'Studio', placeId: 'abc', location: { lat: 1, lng: 2 } },
    origin: null,
    mode: 'TRANSIT',
    prepPresetId: 'quick',
    prepMin: 15,
    bufferMin: 10,
    parkingMin: 0,
  }

  it('keeps valid events as they are', () => {
    expect(normalizeWeeklyEvents([yoga])).toEqual([yoga])
  })

  it('drops events with a bad day, time or destination', () => {
    expect(
      normalizeWeeklyEvents([
        { ...yoga, id: 'a', weekday: 7 },
        { ...yoga, id: 'b', time: '7pm' },
        { ...yoga, id: 'c', destination: { label: '' } },
        { ...yoga, id: 'y' },
        { ...yoga, id: 'y' },
      ]).map((e) => e.id),
    ).toEqual(['y'])
  })

  it('fills in sensible values for bad optional fields', () => {
    const [e] = normalizeWeeklyEvents([{ ...yoga, mode: 'TELEPORT', prepMin: 'x', origin: 'home' }])
    expect(e.mode).toBe('DRIVING')
    expect(e.prepMin).toBe(30)
    expect(e.origin).toBeNull()
  })
})
