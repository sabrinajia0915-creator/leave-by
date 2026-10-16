import { format } from 'date-fns'
import type { Schedule } from './schedule'

export interface ShareCardInput {
  schedule: Schedule
  eventName: string
  place: string
  prepLabel?: string
  prepPurpose?: string
  repeatLabel?: string
}

const W = 1080
const H = 1920
const SERIF = '"Instrument Serif", Georgia, serif'
const SANS = 'Inter, system-ui, sans-serif'
const C = {
  ink: '#2b2420',
  ink2: '#6e625a',
  ink3: '#a39689',
  line: '#ded2c3',
  accent: '#a47e5f',
}

const time = (d: Date) => format(d, 'h:mm a').toLowerCase()

/** Wrap text to a width, returning at most `max` lines (the last one trimmed with …). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  if (lines.length > max) {
    lines.length = max
    lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, '…')
  }
  return lines
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
}

/** A story-sized (9:16) image of the plan, in the app's cream-and-serif style. */
export async function drawShareCard(input: ShareCardInput): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`300px ${SERIF}`),
    document.fonts.load(`italic 96px ${SERIF}`),
    document.fonts.load(`600 30px ${SANS}`),
    document.fonts.load(`400 36px ${SANS}`),
  ]).catch(() => undefined)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const { schedule: s } = input
  const X = 110

  // Background: cream with a soft blush glow.
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#f8f3ec')
  bg.addColorStop(1, '#efe5d8')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.08, 0, W * 0.85, H * 0.08, 700)
  glow.addColorStop(0, 'rgba(240, 212, 196, 0.8)')
  glow.addColorStop(1, 'rgba(240, 212, 196, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'

  // Eyebrow
  ctx.fillStyle = C.accent
  ctx.font = `600 28px ${SANS}`
  spaced(ctx, 6)
  ctx.fillText(input.repeatLabel ? input.repeatLabel.toUpperCase() : 'MY PLAN', X, 230)
  spaced(ctx, 0)

  // Event name
  ctx.fillStyle = C.ink
  ctx.font = `italic 104px ${SERIF}`
  const title = wrap(ctx, input.eventName.trim() || 'Heading out', W - X * 2, 2)
  title.forEach((l, i) => ctx.fillText(l, X, 360 + i * 108))
  let y = 360 + (title.length - 1) * 108

  // Date · place
  ctx.fillStyle = C.ink2
  ctx.font = `400 34px ${SANS}`
  const sub = [format(s.eventTime, 'EEEE, MMMM d'), input.place.split(',')[0]].filter(Boolean).join('  ·  ')
  ctx.fillText(wrap(ctx, sub, W - X * 2, 1)[0], X, y + 80)

  // Big leave-by time
  y += 260
  ctx.fillStyle = C.ink2
  ctx.font = `600 28px ${SANS}`
  spaced(ctx, 6)
  ctx.fillText('LEAVE BY', X, y)
  spaced(ctx, 0)
  ctx.fillStyle = C.ink
  ctx.font = `290px ${SERIF}`
  ctx.fillText(time(s.leaveBy), X - 12, y + 270)

  // Timeline rows
  y += 400
  const rows: [string, Date][] = [
    ['Start getting ready', s.startPrep],
    ['Leave', s.leaveBy],
    ['Arrive', s.arriveAt],
    [input.eventName.trim() || 'It starts', s.eventTime],
  ]
  for (const [label, t] of rows) {
    ctx.strokeStyle = C.line
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(X, y)
    ctx.lineTo(W - X, y)
    ctx.stroke()
    ctx.fillStyle = C.ink2
    ctx.font = `400 34px ${SANS}`
    ctx.fillText(wrap(ctx, label, 520, 1)[0], X, y + 86)
    ctx.fillStyle = C.ink
    ctx.font = `76px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.fillText(time(t), W - X, y + 92)
    ctx.textAlign = 'left'
    y += 136
  }

  // Prep preset pill
  if (input.prepLabel) {
    y += 60
    ctx.font = `500 32px ${SANS}`
    const text = wrap(ctx, [input.prepLabel, input.prepPurpose].filter(Boolean).join(' · '), W - X * 2 - 80, 1)[0]
    const w = ctx.measureText(text).width + 80
    ctx.fillStyle = 'rgba(255, 253, 249, 0.85)'
    ctx.strokeStyle = C.line
    ctx.beginPath()
    ctx.roundRect(X, y, w, 80, 40)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = C.ink
    ctx.fillText(text, X + 40, y + 52)
  }

  // Footer
  ctx.fillStyle = C.ink3
  ctx.font = `italic 44px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.fillText('planned with Leave By', W / 2, H - 120)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make image'))), 'image/png'),
  )
}

/** Open the share sheet with the image, or download it where sharing files isn't supported. */
export async function shareImage(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
