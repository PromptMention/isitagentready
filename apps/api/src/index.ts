import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { scanSite } from '@isitagentready/core'

const app = new Hono()

app.use('/api/*', cors())

app.get('/health', (c) => c.json({ ok: true, service: 'isitagentready-api' }))

app.post('/api/scan', async (c) => {
  const rawBody: unknown = await c.req.json().catch(() => null)
  const url = typeof rawBody === 'object' && rawBody !== null && 'url' in rawBody && typeof rawBody.url === 'string'
    ? rawBody.url
    : undefined

  if (!url) {
    return c.json({ error: 'url is required' }, 400)
  }

  try {
    const report = await scanSite(url)
    return c.json(report)
  } catch (error) {
    return c.json({
      error: 'scan_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

export default app
