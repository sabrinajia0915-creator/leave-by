import { useRef, useState } from 'react'
import { lateMessage } from '../lib/schedule'

interface Props {
  lateMin: number
  arrive: Date
  eventName: string
  /** Shown under the message, e.g. that transit times are an estimate. */
  note?: string
}

/** An editable "running late" text with Send and Copy. */
export function RunningLate({ lateMin, arrive, eventName, note }: Props) {
  // The message follows the clock until you edit it; then your words stick.
  const [edited, setEdited] = useState<string | null>(null)
  const [copied, setCopied] = useState<'' | 'copied' | 'selected'>('')
  const box = useRef<HTMLTextAreaElement>(null)
  const text = edited ?? lateMessage(lateMin, arrive, eventName)

  async function send() {
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`
  }

  async function copy() {
    let result: 'copied' | 'selected' = 'copied'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API blocked: select the text and try the older copy command.
      box.current?.select()
      if (!document.execCommand('copy')) result = 'selected'
    }
    setCopied(result)
    setTimeout(() => setCopied(''), 2500)
  }

  return (
    <div className="late-panel">
      <label htmlFor="late-msg">Let them know</label>
      <textarea
        id="late-msg"
        ref={box}
        rows={3}
        value={text}
        onChange={(e) => setEdited(e.target.value)}
      />
      {note && <p className="hint">{note}</p>}
      {copied === 'selected' && <p className="hint">Text selected. Press ⌘C (or Ctrl+C) to copy.</p>}
      <div className="late-actions">
        <button type="button" className="btn" onClick={send}>
          Send text
        </button>
        <button type="button" className="btn" onClick={copy}>
          {copied === 'copied' ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
