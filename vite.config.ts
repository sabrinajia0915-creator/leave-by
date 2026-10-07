import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Serves the Vercel functions in /api during `npm run dev`, so the app works
 * locally without `vercel dev`. Handlers are loaded through Vite, so edits
 * apply without restarting.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([a-z-]+)(?:\?|$)/)
        if (!match) return next()
        // Server-only secrets (no VITE_ prefix) from .env.local, re-read each
        // time so edits to the file apply without a restart.
        Object.assign(process.env, loadEnv(server.config.mode, server.config.root, ''))
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }
          const response: Response = await handler(await toRequest(req))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          if ((e as Error).message?.includes('Failed to load url')) return next()
          server.config.logger.error(String(e))
          res.statusCode = 500
          res.end()
        }
      })
    },
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
