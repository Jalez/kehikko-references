import { describe, expect, test } from 'bun:test'

import { BUILD_HEADER, WELL_KNOWN, buildStamp } from 'kehikot-module-protocol'
import { doorsFetch } from 'kehikot-module-protocol/serve'

import { BUILD, MANIFEST, answer } from '../doors.ts'

/**
 * The doors this app's own server answers, other than the page.
 *
 * Two now: the manifest, which `vite.config.ts` answers straight from the
 * protocol's path, and the health check. `/api/references` — the one that ran
 * `gh` — is gone with the private reader (issue #4), and the last case here is
 * what would catch it coming back.
 */
describe('the doors themselves', () => {
  test('the health check answers without touching anything', async () => {
    const got = await answer('GET', '/healthz', new URLSearchParams())
    expect(got).toMatchObject({ status: 200, body: { ok: true, id: 'kehikot.references' } })
  })

  test('a path this app knows nothing about is handed back to Vite', async () => {
    expect(await answer('GET', '/nothing-here', new URLSearchParams())).toBeNull()
  })

  test('only GET', async () => {
    expect(await answer('POST', '/healthz', new URLSearchParams())).toMatchObject({ status: 405 })
  })

  test('there is no door that reads a tracker any more', async () => {
    /* The rows are the host's shared reading. A door here running `gh` would be
       a second reader of the same trackers, blind to GitLab. */
    expect(await answer('GET', '/api/references', new URLSearchParams({ project: '/tmp' }))).toBeNull()
  })
})

/**
 * The same doors as a request goes through them: the protocol's `doors()`, with
 * the options `vite.config.ts` names.
 */
describe('through the doors', () => {
  const ours = (path: string) => path === '/healthz' || path === '/health'
  const through = doorsFetch({ manifest: MANIFEST, answer, build: BUILD, ours, page: { title: 'References' } })
  const get = async (path: string) => (await through(new Request(`http://127.0.0.1${path}`)))!

  test('the manifest says which build is answering', async () => {
    const got = await get(WELL_KNOWN)
    expect(await got.json()).toMatchObject({ id: 'kehikot.references', build: { version: BUILD.version, started: BUILD.started } })
  })

  test('the health check carries the build, on both spellings, and every answer is stamped', async () => {
    for (const path of ['/healthz', '/health']) {
      const got = await get(path)
      expect(got.status).toBe(200)
      expect(got.headers.get(BUILD_HEADER)).toBe(buildStamp(BUILD))
      expect(got.headers.get('cache-control')).toBe('no-store')
    }
    expect(await (await get('/healthz')).json()).toMatchObject({ ok: true, build: { started: BUILD.started } })
  })

  test('the page is generated at the entry, never cached, framed only by a host, and carries no ticket', async () => {
    const got = await get(MANIFEST.entry)
    const html = await got.text()
    expect(got.headers.get('cache-control')).toBe('no-store')
    expect(got.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
    expect(html).toContain('<title>References</title>')
    expect(html).toContain('id="build"')
    /* Nothing here writes, so there is nothing for a ticket to fence. */
    expect(html).not.toContain('id="ticket"')
  })
})
