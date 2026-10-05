import { describe, expect, test } from 'bun:test'
import { TRACKER_REFRESH_WITHIN_MS, methodParams, methodResults } from 'kehikot-module-protocol'
import { HostRefused } from 'kehikot-module-protocol/client'

import { askReading, askRefresh, type Ask } from '@/live/ask.ts'
import { reading, row } from './fixtures.ts'

/**
 * The two questions this app asks of the host about trackers, against a host
 * that is a function.
 *
 * The host side is Jalez/kehikko#25 and is not what is tested here. What is:
 * that the questions are ones the protocol's own schemas accept, and that every
 * answer — a reading, a refusal, a shape from a version apart — becomes a state
 * the page draws rather than a throw.
 */

/** A host answering one way, and a record of what it was asked. */
function host(answer: (method: string) => unknown) {
  const asked: { method: string; params?: Record<string, unknown>; within?: number }[] = []
  const ask: Ask = (method, params, options) => {
    asked.push({ method, params, within: options?.within })
    try {
      return Promise.resolve(answer(method))
    } catch (error) {
      return Promise.reject(error)
    }
  }
  return { ask, asked }
}

const refuse = (reason: 'unknown-method' | 'failed', error: string) => () => {
  throw new HostRefused({ reason, error })
}

describe('asking for the reading', () => {
  test('the question is the whole project, in a shape the protocol accepts', async () => {
    const stub = host(() => reading([row('gh#1')]))
    await askReading(stub.ask)
    expect(stub.asked).toEqual([{ method: 'tracker.get', params: { project: true }, within: undefined }])
    expect(methodParams['tracker.get'].safeParse(stub.asked[0]!.params).success).toBe(true)
  })

  test('a reading comes back whole, with its rows left for collect to read', async () => {
    const answer = reading([row('gh#1'), row('!2'), { ref: 'odd' }], {
      missing: [{ ref: '#9', reason: 'pending' }],
    })
    /* The fixture is a reading the protocol's own result schema accepts, apart
       from the one odd row — which is the point of not parsing rows here. */
    expect(methodResults['tracker.get']!.safeParse({ ...answer, rows: [row('gh#1')] }).success).toBe(true)
    const got = await askReading(host(() => answer).ask)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.reading.at).toBe('2026-08-27T09:12:00Z')
    expect(got.reading.rows).toHaveLength(3)
    expect(got.reading.sources.map((source) => source.repo)).toEqual(['example/repo'])
    expect(got.reading.missing).toEqual([{ ref: '#9', reason: 'pending' }])
  })

  test('an empty answer is the honest nothing-read-yet, not a failure', async () => {
    const got = await askReading(host(() => ({})).ask)
    expect(got).toEqual({ ok: true, reading: { at: null, refreshing: false, sources: [], missing: [], rows: [] } })
  })

  test('a source or a gap a version ahead is left out, not the whole reading', async () => {
    const got = await askReading(
      host(() => reading([], { sources: [{ tracker: 'jira' }] as never, missing: [{ ref: '#1', reason: 'mystery' }] as never })).ask,
    )
    expect(got.ok && got.reading.sources).toEqual([])
    expect(got.ok && got.reading.missing).toEqual([])
  })

  test('a host that has never heard of the question says so, and is not worth asking again', async () => {
    const got = await askReading(host(refuse('unknown-method', 'no such method: tracker.get')).ask)
    expect(got).toMatchObject({ ok: false, trouble: { kind: 'unknown-method', said: 'no such method: tracker.get' } })
  })

  test('a host that says no is quoted', async () => {
    const got = await askReading(host(refuse('failed', 'kehikot.references may not read trackers.')).ask)
    expect(got).toMatchObject({ ok: false, trouble: { kind: 'refused', why: 'kehikot.references may not read trackers.' } })
  })

  test('an answer that is not a reading is a version mismatch, in words', async () => {
    for (const odd of [null, 'a string', { rows: 'nope' }, { at: 'yesterday' }]) {
      const got = await askReading(host(() => odd).ask)
      expect(got).toMatchObject({ ok: false, trouble: { kind: 'unreadable' } })
    }
  })
})

describe('asking for a refresh', () => {
  test('the whole project, with the patience a read of two trackers needs', async () => {
    const stub = host(() => ({ outcome: 'read', at: '2026-08-27T09:13:00Z', why: '' }))
    expect(await askRefresh(stub.ask)).toBeNull()
    expect(stub.asked).toEqual([{ method: 'tracker.refresh', params: { project: true }, within: TRACKER_REFRESH_WITHIN_MS }])
    expect(methodParams['tracker.refresh'].safeParse(stub.asked[0]!.params).success).toBe(true)
  })

  test('a read that failed or was declined comes back as the host’s sentence', async () => {
    expect(await askRefresh(host(() => ({ outcome: 'failed', why: 'gitlab.com could not be reached.' })).ask)).toBe(
      'gitlab.com could not be reached.',
    )
    expect(await askRefresh(host(() => ({ outcome: 'declined', why: '' })).ask)).toContain('declined')
  })

  test('a refusal is a sentence too, never a throw', async () => {
    expect(await askRefresh(host(refuse('failed', 'not on this kehikko')).ask)).toBe('not on this kehikko')
  })
})
