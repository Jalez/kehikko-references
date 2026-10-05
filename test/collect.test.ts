import { describe, expect, test } from 'bun:test'

import { collect } from '@/live/collect.ts'
import { sightingOf } from '@/live/sift.ts'
import { row } from './fixtures.ts'

/**
 * The promise, under test.
 *
 * Every row of the host's shared reading that names a ref becomes a row on
 * screen, whatever else is wrong with it. The reason this file is longer than
 * the module it tests is that "it drops nothing" cannot be proved by one
 * example — it has to be proved against every kind of thing that would tempt a
 * reasonable implementation into a `continue`.
 */

describe('every row becomes a row', () => {
  test('GitHub and GitLab together, spelled the way the reading spells them', () => {
    const rows = collect([
      row('#2274', { updatedAt: '2026-08-01T00:00:00Z' }),
      row('!1848', { state: 'merged', mergedAt: '2026-08-02T00:00:00Z' }),
      row('gh#41', { state: 'closed', closedAt: '2026-08-03T00:00:00Z' }),
      row('gh#2073', { kind: 'change', state: 'merged', mergedAt: '2026-08-04T00:00:00Z' }),
    ])
    expect(rows.map((one) => one.ref)).toEqual(['gh#2073', 'gh#41', '!1848', '#2274'])
    expect(rows.map((one) => one.origin)).toEqual(['github', 'github', 'gitlab', 'gitlab'])
    expect(rows.map((one) => one.kind)).toEqual(['change', 'issue', 'change', 'issue'])
  })

  test('four hundred references produce four hundred rows', () => {
    expect(collect(Array.from({ length: 400 }, (_, n) => row(`gh#${n + 1}`)))).toHaveLength(400)
  })

  test('two spellings of one item are two rows; one spelling twice is one', () => {
    /* The protocol: a module looks its own string up and finds its own string,
       so `gh#41` and `gh:example/repo#41` are each what somebody wrote. The
       same spelling twice is a host repeating itself. */
    const rows = collect([row('gh#41'), row('gh:example/repo#41'), row('gh#41', { title: 'again' })])
    expect(rows.map((one) => one.ref)).toEqual(['gh#41', 'gh:example/repo#41'])
    expect(new Set(rows.map((one) => one.key)).size).toBe(2)
    expect(rows[0]?.title).not.toBe('again')
  })

  test('a row the schema refuses is still drawn, as unreadable, with no state', () => {
    const rows = collect([
      { ref: 'gh#7', tracker: 'github', state: 'locked', title: 'odd' },
      { ref: '!9', kind: 'change', tracker: 'gitlab', url: 'javascript:alert(1)' },
    ])
    expect(rows.map((one) => one.ref)).toEqual(['gh#7', '!9'])
    expect(rows.every((one) => one.unreadable && one.state === null)).toBe(true)
    expect(rows[0]?.title).toBe('odd')
    expect(rows[1]).toMatchObject({ kind: 'change', origin: 'gitlab', url: null })
    /* And a row with no state has no facets, so no filter can hide it. */
    expect(sightingOf(rows[0]!)).toBeNull()
  })

  test('an entry with no ref at all has nothing to be called, and is the one thing not drawn', () => {
    expect(collect([null, 7, 'nope', {}, { ref: '' }, row('gh#1')]).map((one) => one.ref)).toEqual(['gh#1'])
  })

  test('anything that is not a list is no rows rather than a throw', () => {
    expect(collect(null)).toEqual([])
    expect(collect(undefined)).toEqual([])
    expect(collect('a string')).toEqual([])
    expect(collect({ rows: [] })).toEqual([])
  })
})

describe('what is read off one row', () => {
  test('a link is the tracker’s own, and only ever http', () => {
    const rows = collect([
      row('#1', { url: 'https://gitlab.example/issues/1', updatedAt: '2026-08-03T00:00:00Z' }),
      row('#2', { url: 'javascript:alert(1)', updatedAt: '2026-08-02T00:00:00Z' }),
    ])
    expect(rows.map((one) => one.url)).toEqual(['https://gitlab.example/issues/1', null])
  })

  test('people: a change’s author, then assignees, deduped; an issue’s author is not on it', () => {
    const [change] = collect([row('!1', { author: 'ada', assignees: ['ada', 'grace'] })])
    expect(change?.people).toEqual(['ada', 'grace'])
    const [issue] = collect([row('#1', { author: 'ada', assignees: ['grace'] })])
    expect(issue?.people).toEqual(['grace'])
  })

  test('draft is only ever what the tracker said', () => {
    const rows = collect([row('!1', { draft: true }), row('!2', { title: 'WIP: not a draft flag' })])
    expect(rows.map((one) => one.draft).sort()).toEqual([false, true])
  })

  test('a row is a Sighting as it stands, with nothing translated', () => {
    const [one] = collect([row('gh#3', { state: 'closed', stateReason: 'NOT_PLANNED' })])
    expect(sightingOf(one!)).toMatchObject({ kind: 'issue', state: 'closed', stateReason: 'NOT_PLANNED' })
  })
})

describe('why a closed thing closed, as far as the reading says', () => {
  test('GitHub’s reason is carried as it arrived, and nothing else invents one', () => {
    const rows = collect([
      row('gh#1', { state: 'closed', stateReason: 'NOT_PLANNED' }),
      row('gh#2', { state: 'closed' }),
      row('#3', { state: 'closed' }),
    ])
    const by = Object.fromEntries(rows.map((one) => [one.ref, one]))
    expect(by['gh#1']?.stateReason).toBe('NOT_PLANNED')
    expect(by['gh#2']?.stateReason).toBeNull()
    expect(by['#3']?.stateReason).toBeNull()
  })

  test('a row that says it was closed by a merge is believed, and one that says not is too', () => {
    const rows = collect([
      row('#1', { state: 'closed', closedByMerge: true }),
      row('#2', { state: 'closed', closedByMerge: false, links: [{ ref: '!20', relation: 'closed-by' }] }),
      row('!20', { state: 'merged' }),
    ])
    const by = Object.fromEntries(rows.map((one) => [one.ref, one]))
    expect(by['#1']?.closedByMerge).toBe(true)
    expect(by['#2']?.closedByMerge).toBe(false)
  })

  test('silent on it, a closed-by link to a change merged in the same reading says it', () => {
    const rows = collect([
      row('#10', { state: 'closed', links: [{ ref: '!20', relation: 'closed-by' }] }),
      row('#11', { state: 'closed', links: [{ ref: '!21', relation: 'closed-by' }] }),
      /* A link the other way is a citation, not a delivery. */
      row('#12', { state: 'closed', links: [{ ref: '!20', relation: 'closes' }] }),
      row('!20', { state: 'merged' }),
      row('!21', { state: 'closed' }),
    ])
    const by = Object.fromEntries(rows.map((one) => [one.ref, one]))
    expect(by['#10']?.closedByMerge).toBe(true)
    expect(by['#11']?.closedByMerge).toBe(false)
    expect(by['#12']?.closedByMerge).toBe(false)
    /* Never about a change: a merged change says so in its own state. */
    expect(by['!20']?.closedByMerge).toBe(false)
  })
})

describe('order', () => {
  test('most recently moved first — merged, closed, then updated — and rows with no date last', () => {
    const rows = collect([
      row('#1', { updatedAt: '2026-01-01T00:00:00Z' }),
      row('#2', { updatedAt: '2026-01-01T00:00:00Z', closedAt: '2026-06-01T00:00:00Z', state: 'closed' }),
      row('#3', { updatedAt: null }),
      row('#4', { updatedAt: '2026-03-01T00:00:00Z' }),
    ])
    expect(rows.map((one) => one.ref)).toEqual(['#2', '#4', '#1', '#3'])
  })
})
