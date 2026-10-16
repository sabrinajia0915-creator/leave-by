import { format } from 'date-fns'
import type { WeeklyEvent } from '../lib/storage'

interface Props {
  events: WeeklyEvent[]
  activeId: string | null
  onLoad: (e: WeeklyEvent) => void
  onDelete: (id: string) => void
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Tue 7:00 PM" */
function weeklyWhen(e: WeeklyEvent) {
  const [h, m] = e.time.split(':').map(Number)
  return `${DAYS[e.weekday]} ${format(new Date(2000, 0, 1, h, m), 'h:mm a')}`
}

/** Saved weekly events: tap one to fill in the form for its next date. */
export function WeeklyEvents({ events, activeId, onLoad, onDelete }: Props) {
  if (events.length === 0) return null

  return (
    <fieldset className="field">
      <legend>Your weekly events</legend>
      <div className="chips">
        {events.map((e) => (
          <button
            key={e.id}
            type="button"
            className="chip"
            aria-pressed={e.id === activeId}
            onClick={() => onLoad(e)}
          >
            {e.name || e.destination.label.split(',')[0]} · {weeklyWhen(e)}
          </button>
        ))}
      </div>
      <details className="presets-edit">
        <summary>Edit weekly events</summary>
        <ul className="preset-list">
          {events.map((e) => (
            <li key={e.id} className="preset-row">
              <div>
                <strong>{e.name || 'Untitled'}</strong> <span className="muted">· {weeklyWhen(e)}</span>
                <span className="preset-purpose">{e.destination.label}</span>
              </div>
              <button
                type="button"
                className="link danger"
                aria-label={`Delete ${e.name || 'weekly event'}`}
                onClick={() => confirm(`Delete “${e.name || 'this weekly event'}”?`) && onDelete(e.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  )
}
