import { describe, expect, test } from 'bun:test'

import { answer } from '../doors.ts'

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
