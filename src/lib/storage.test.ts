import { describe, expect, it } from 'vitest'
import { normalizePresets, STARTER_PRESETS } from './storage'

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
