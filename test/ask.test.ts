import { describe, expect, test } from 'bun:test'

import { ask, askUrl, type Fetcher } from '@/live/ask.ts'

/**
 * The page's half of the read: one relative fetch, and every way its answer can
 * disappoint.
 *
 * The two halves of this program are separately deployable — the page is served
 * by Vite and reloads on save, the door is middleware that does not — so a page
 * talking to a door that has moved on is the ORDINARY state of a dev server
 * mid-edit rather than a contrived one. Every shape below has been on somebody's
 * screen at some point, and each of them has to read as a sentence rather than
 * as a blank pane.
 */

const answering = (body: unknown, init: { status?: number; text?: string } = {}): Fetcher =>
  () =>
    Promise.resolve(
      new Response(init.text ?? JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

const reading = { generated: '2026-08-27T09:00:00Z', issues: {}, mrs: {}, ghIssues: {}, ghPrs: {} }
const good = { ok: true, project: '/p', reading, from: 'gh', trouble: null, why: null, said: null }

const live = () => new AbortController().signal

describe('where the read goes', () => {
  test('a relative path, so it works at whatever address a host framed this page at', () => {
    expect(askUrl('/Users/x/p', false).startsWith('api/references?')).toBe(true)
  })

  test('the project is encoded, because a folder may contain an ampersand', () => {
    const url = askUrl('/Users/x/a&b#c', false)
    expect(url).toContain(encodeURIComponent('/Users/x/a&b#c'))
    expect(new URLSearchParams(url.split('?')[1]).get('project')).toBe('/Users/x/a&b#c')
  })

  test('fresh is sent only when it is meant, so a log tells the two apart', () => {
    expect(askUrl('/p', false)).not.toContain('fresh')
    expect(askUrl('/p', true)).toContain('fresh=1')
  })
})

describe('reading the answer', () => {
  test('a reading becomes rows, carrying where they came from', async () => {
    const got = await ask('/p', false, live(), answering(good))
    expect(got).toMatchObject({ at: 'read', project: '/p', from: 'gh', trouble: null })
  })

  test('a cached reading says it is cached rather than leaving it to be inferred', async () => {
    const got = await ask('/p', false, live(), answering({ ...good, from: 'cache' }))
    expect(got).toMatchObject({ at: 'read', from: 'cache' })
  })

  test('a trouble with a reading beside it keeps both', async () => {
    const got = await ask(
      '/p',
      true,
      live(),
      answering({ ...good, from: 'cache', trouble: 'offline', why: 'no network', said: 'dial tcp' }),
    )
    expect(got).toMatchObject({ at: 'read', from: 'cache' })
    expect(got?.at === 'read' && got.trouble).toMatchObject({ kind: 'offline', why: 'no network', said: 'dial tcp' })
  })

  test('a trouble with no reading is the whole pane', async () => {
    const got = await ask(
      '/p',
      false,
      live(),
      answering({ ...good, reading: null, from: null, trouble: 'not-a-repo', why: 'no repository here' }),
    )
    expect(got).toMatchObject({ at: 'trouble' })
    expect(got?.at === 'trouble' && got.trouble.kind).toBe('not-a-repo')
  })

  test('a kind this page has never heard of is not drawn as one it has', async () => {
    const got = await ask('/p', false, live(), answering({ ...good, trouble: 'something-new', why: 'x' }))
    expect(got).toMatchObject({ at: 'read', trouble: null })
  })
})

describe('when the door is the thing that failed', () => {
  test('a fetch that rejects is a sentence rather than a blank pane', async () => {
    const got = await ask('/p', false, live(), () => Promise.reject(new Error('Failed to fetch')))
    expect(got).toMatchObject({ at: 'trouble' })
    expect(got?.at === 'trouble' && got.trouble.kind).toBe('door')
    expect(got?.at === 'trouble' && got.trouble.said).toBe('Failed to fetch')
  })

  test('a non-200 names the status, because this program disagreeing with itself is worth seeing', async () => {
    const got = await ask('/p', false, live(), answering(null, { status: 502 }))
    expect(got?.at === 'trouble' && got.trouble.why).toContain('502')
  })

  test('an answer that is not JSON says the two halves are different versions', async () => {
    const got = await ask('/p', false, live(), answering(null, { text: '<!doctype html>' }))
    expect(got?.at === 'trouble' && got.trouble.why).toContain('different versions')
  })

  test('a refusal from the door carries the door’s own words', async () => {
    const got = await ask('/p', false, live(), answering({ ok: false, error: 'ask for a tracker by its path.' }))
    expect(got?.at === 'trouble' && got.trouble.said).toBe('ask for a tracker by its path.')
  })

  test('no reading and no trouble is still a sentence, not a blank', async () => {
    const got = await ask('/p', false, live(), answering({ ...good, reading: null, from: null }))
    expect(got?.at === 'trouble' && got.trouble.why).toContain('without saying why')
  })
})

describe('an abandoned read never becomes the page', () => {
  test('an aborted fetch answers null rather than a trouble', async () => {
    const stop = new AbortController()
    stop.abort()
    const got = await ask('/p', false, stop.signal, () => Promise.reject(new Error('aborted')))
    expect(got).toBeNull()
  })

  test('an answer that lands after the abort is dropped rather than drawn', async () => {
    /* The reader has moved to another project. This answer is about the old one,
       and a page that took it would show a list of the right length under the
       right heading about the wrong repository. */
    const stop = new AbortController()
    const slow: Fetcher = () => {
      stop.abort()
      return Promise.resolve(new Response(JSON.stringify(good)))
    }
    expect(await ask('/p', false, stop.signal, slow)).toBeNull()
  })
})
