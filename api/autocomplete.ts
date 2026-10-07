import { autocomplete } from './_lib/google.js'
import { errorResponse, guard, json } from './_lib/guard.js'

// Typing a place makes a request every few keystrokes, so allow a fair number.
const LIMIT = { max: 120, windowMs: 10 * 60_000 }

export async function POST(req: Request): Promise<Response> {
  const g = await guard(req, 'autocomplete', LIMIT)
  if ('error' in g) return g.error

  const { input } = g.body
  if (typeof input !== 'string' || input.trim().length < 2 || input.length > 200) {
    return json({ error: 'bad_request' }, 400)
  }

  try {
    return json({ suggestions: await autocomplete(input.trim()) })
  } catch (e) {
    return errorResponse(e)
  }
}
