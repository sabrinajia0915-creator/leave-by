import { useState, type KeyboardEvent } from 'react'
import type { PrepPreset } from '../lib/storage'
import { PRESET_MIN_MAX, PRESET_NAME_MAX, PRESET_PURPOSE_MAX } from '../lib/storage'
import { formatDuration } from '../lib/schedule'

interface Props {
  presets: PrepPreset[]
  /** Selected preset, or null when a custom number is in use. */
  presetId: string | null
  minutes: number
  onPick: (presetId: string | null, minutes: number) => void
  onPresetsChange: (presets: PrepPreset[]) => void
}

interface Draft {
  name: string
  minutes: string
  purpose: string
}

/** Pick a named prep preset ("Date night · 45 min"), or type a one-off number. */
export function PrepPresetPicker({ presets, presetId, minutes, onPick, onPresetsChange }: Props) {
  const selected = presets.find((p) => p.id === presetId)
  const custom = !selected
  // Which preset is being edited: an id, 'new', or null for none.
  const [editing, setEditing] = useState<string | null>(null)

  function save(draft: Draft) {
    const preset: PrepPreset = {
      id: editing === 'new' || !editing ? crypto.randomUUID() : editing,
      name: draft.name.trim(),
      minutes: Number(draft.minutes),
      purpose: draft.purpose.trim(),
    }
    const exists = presets.some((p) => p.id === preset.id)
    onPresetsChange(exists ? presets.map((p) => (p.id === preset.id ? preset : p)) : [...presets, preset])
    // A new preset is picked straight away; an edit to the picked one applies now.
    if (!exists || preset.id === presetId) onPick(preset.id, preset.minutes)
    setEditing(null)
  }

  function remove(p: PrepPreset) {
    if (!confirm(`Delete “${p.name}”?`)) return
    onPresetsChange(presets.filter((x) => x.id !== p.id))
    // Keep the same time as a custom value so the schedule doesn't jump.
    if (p.id === presetId) onPick(null, minutes)
    if (editing === p.id) setEditing(null)
  }

  return (
    <fieldset className="field">
      <legend>Time to get ready</legend>
      <div className="chips">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            aria-pressed={p.id === presetId}
            onClick={() => onPick(p.id, p.minutes)}
          >
            {p.name} · {formatDuration(p.minutes)}
          </button>
        ))}
        {custom ? (
          <label className="chip chip-input" aria-pressed>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={PRESET_MIN_MAX}
              value={minutes}
              aria-label="Time to get ready in minutes"
              onChange={(e) =>
                onPick(null, Math.max(0, Math.min(PRESET_MIN_MAX, Number(e.target.value) || 0)))
              }
            />
            min
          </label>
        ) : (
          <button type="button" className="chip" onClick={() => onPick(null, minutes)}>
            Custom
          </button>
        )}
      </div>
      {selected?.purpose && <p className="hint">{selected.purpose}</p>}

      <details className="presets-edit" onToggle={(e) => !e.currentTarget.open && setEditing(null)}>
        <summary>Edit presets</summary>
        <ul className="preset-list">
          {presets.map((p) =>
            editing === p.id ? (
              <li key={p.id}>
                <PresetForm
                  initial={{ name: p.name, minutes: String(p.minutes), purpose: p.purpose }}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={p.id} className="preset-row">
                <div>
                  <strong>{p.name}</strong> <span className="muted">· {formatDuration(p.minutes)}</span>
                  {p.purpose && <span className="preset-purpose">{p.purpose}</span>}
                </div>
                <button
                  type="button"
                  className="link"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => setEditing(p.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="link danger"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => remove(p)}
                >
                  Delete
                </button>
              </li>
            ),
          )}
        </ul>
        {editing === 'new' ? (
          <PresetForm
            initial={{ name: '', minutes: '', purpose: '' }}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button type="button" className="link" onClick={() => setEditing('new')}>
            + Add a preset
          </button>
        )}
      </details>
    </fieldset>
  )
}

function PresetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft
  onSave: (d: Draft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')

  function submit() {
    const min = Number(draft.minutes)
    if (!draft.name.trim()) return setError('Give it a name, like “Hair” or “Date night”.')
    if (!Number.isInteger(min) || min < 1 || min > PRESET_MIN_MAX)
      return setError(`Minutes must be a whole number from 1 to ${PRESET_MIN_MAX}.`)
    onSave(draft)
  }

  // Enter saves (the surrounding page form would otherwise swallow it).
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="preset-form" onKeyDown={onEnter}>
      <div className="row-2">
        <div className="field">
          <label>
            Name
            <input
              type="text"
              value={draft.name}
              maxLength={PRESET_NAME_MAX}
              placeholder="Makeup + outfit"
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
        </div>
        <div className="field">
          <label>
            Minutes
            <span className="with-suffix">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={PRESET_MIN_MAX}
                value={draft.minutes}
                placeholder="30"
                onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
              />
              <span>min</span>
            </span>
          </label>
        </div>
      </div>
      <div className="field">
        <label>
          Purpose <span className="optional">optional</span>
          <textarea
            rows={2}
            value={draft.purpose}
            maxLength={PRESET_PURPOSE_MAX}
            placeholder="What this covers, e.g. full makeup and picking an outfit for a date"
            onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
          />
        </label>
      </div>
      {error && (
        <p className="hint error" role="alert">
          {error}
        </p>
      )}
      <div className="preset-form-actions">
        <button type="button" className="btn" onClick={submit}>
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
