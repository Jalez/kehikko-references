import { describe, expect, test } from 'bun:test'

import { collect, generatedAt } from '@/live/collect.ts'

/**
 * The promise, under test.
 *
 * Everything here is one assertion in four hundred costumes: a key in a bag
 * becomes a row, whatever is filed under it. The reason this file is longer
 * than the module it tests is that "it drops nothing" cannot be proved by one
 * example — it has to be proved against every kind of thing that would tempt a
 * reasonable implementation into a `continue`.
 */

const reading = (bags: Record<string, unknown>) => ({ generated: '2026-08-27T10:00:00Z', ...bags })

describe('every key becomes a row', () => {
  test('one from each bag, spelled the way people write it', () => {
    const rows = collect(
      reading({
        issues: { '2274': { state: 'opened', title: 'an issue', at: '2026-08-01T00:00:00Z' } },
        mrs: { '1848': { state: 'merged', title: 'a change', at: '2026-08-02T00:00:00Z' } },
        ghIssues: { 'gh#41': { state: 'closed', title: 'a github issue', at: '2026-08-03T00:00:00Z' } },
        ghPrs: { 'gh#2073': { state: 'merged', title: 'a pull request', at: '2026-08-04T00:00:00Z' } },
      }),
    )
    expect(rows.map((row) => row.ref).sort()).toEqual(['!1848', '#2274', 'gh#2073', 'gh#41'])
    expect(rows.map((row) => row.kind).sort()).toEqual(['change', 'change', 'issue', 'issue'])
  })

  test('four hundred references produce four hundred rows', () => {
    const ghIssues: Record<string, unknown> = {}
    for (let n = 1; n <= 400; n += 1) {
      ghIssues[`gh#${n}`] = { state: 'opened', title: `issue ${n}`, at: '2026-08-01T00:00:00Z' }
    }
    expect(collect(reading({ ghIssues }))).toHaveLength(400)
  })

  test('the same number in two bags is two rows, not one', () => {
    /* GitHub numbers issues and pull requests in one sequence. A refresh that
       filed gh#41 in both bags is wrong about something, and the row that would
       be silently swallowed is the failure this app refuses to have. */
    const rows = collect(
      reading({
        ghIssues: { 'gh#41': { state: 'opened', title: 'the issue' } },
        ghPrs: { 'gh#41': { state: 'merged', title: 'the pull request' } },
      }),
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.key)).size).toBe(2)
    expect(rows.map((row) => row.kind).sort()).toEqual(['change', 'issue'])
  })

  test('a reading that is not an object is still a row', () => {
    const rows = collect(reading({ issues: { '1': null, '2': 7, '3': 'nope', '4': [] } }))
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.unreadable)).toBe(true)
    expect(rows.every((row) => row.state === null)).toBe(true)
  })

  test('a state nobody recognises is never drawn as open', () => {
    const [row] = collect(reading({ issues: { '9': { state: 'locked', title: 'x' } } }))
    expect(row?.state).toBeNull()
  })

  test('an entry with nothing in it keeps its identifier', () => {
    const [row] = collect(reading({ mrs: { '5': {} } }))
    expect(row?.ref).toBe('!5')
    expect(row?.title).toBe('')
    expect(row?.url).toBeNull()
    expect(row?.unreadable).toBe(false)
  })

  test('a key that is a prototype name is a row like any other', () => {
    /* The protocol package's hazard, from the enumerating side: `constructor`
       is an ordinary lowercase word and a tracker may file one. What it must
       not do is become an inherited value or vanish. */
    const rows = collect(reading({ ghIssues: { constructor: { state: 'opened', title: 'odd' }, __proto__: {} } }))
    expect(rows.map((row) => row.ref)).toContain('constructor')
  })
})

describe('what is read off one entry', () => {
  test('a link is the tracker’s own, and only ever http', () => {
    const rows = collect(
      reading({
        issues: {
          '1': { url: 'https://gitlab.example/issues/1' },
          '2': { url: 'javascript:alert(1)' },
          '3': { url: 42 },
        },
      }),
    )
    expect(rows.map((row) => row.url)).toEqual(['https://gitlab.example/issues/1', null, null])
  })

  test('people come out as one list: author, assignees, reviewers, deduped', () => {
    const [row] = collect(
      reading({ mrs: { '1': { author: 'ada', assignees: ['ada', 'grace'], reviewers: ['linus', 7] } } }),
    )
    expect(row?.people).toEqual(['ada', 'grace', 'linus'])
  })

  test('draft is only ever what the tracker said', () => {
    const rows = collect(reading({ mrs: { '1': { draft: true }, '2': { title: 'WIP: not a draft flag' } } }))
    expect(rows.map((row) => row.draft).sort()).toEqual([false, true])
  })
})

describe('why a closed thing closed, as far as the reading says', () => {
  test('GitHub’s reason is carried as it arrived, and nothing else invents one', () => {
    const rows = collect(
      reading({
        ghIssues: { 'gh#1': { state: 'closed', stateReason: 'NOT_PLANNED' }, 'gh#2': { state: 'closed' } },
        issues: { '3': { state: 'closed', stateReason: 42 } },
      }),
    )
    const by = Object.fromEntries(rows.map((row) => [row.ref, row]))
    expect(by['gh#1']?.stateReason).toBe('NOT_PLANNED')
    expect(by['gh#2']?.stateReason).toBeNull()
    expect(by['#3']?.stateReason).toBeNull()
  })

  test('a GitLab issue linked to a merged merge request was closed by it', () => {
    const rows = collect(
      reading({
        issues: { '10': { state: 'closed' }, '11': { state: 'closed' }, '12': { state: 'closed' } },
        mrs: { '20': { state: 'merged' }, '21': { state: 'closed' } },
        /* Keyed with and without the sigil, and listing iids as numbers and
           as spelled refs: the refresher's shape is not promised, so both are
           read and nothing else is. */
        links: { '10': [20], '#11': ['!21'], '12': ['nonsense', null] },
      }),
    )
    const by = Object.fromEntries(rows.map((row) => [row.ref, row]))
    expect(by['#10']?.closedByMerge).toBe(true)
    /* Linked to a change that closed without merging: not done. */
    expect(by['#11']?.closedByMerge).toBe(false)
    expect(by['#12']?.closedByMerge).toBe(false)
  })

  test('the same, for GitHub, out of ghLinks', () => {
    const rows = collect(
      reading({
        ghIssues: { 'gh#68': { state: 'closed' } },
        ghPrs: { 'gh#76': { state: 'merged' } },
        ghLinks: { 'gh#68': [76] },
      }),
    )
    expect(rows.find((row) => row.ref === 'gh#68')?.closedByMerge).toBe(true)
    /* Never about a change: a merged change says so in its own state. */
    expect(rows.find((row) => row.ref === 'gh#76')?.closedByMerge).toBe(false)
  })

  test('a row that says so itself is believed', () => {
    const rows = collect(reading({ issues: { '1': { state: 'closed', closedByMerge: true } } }))
    expect(rows[0]?.closedByMerge).toBe(true)
  })
})

describe('order', () => {
  test('most recently moved first, and rows with no date last', () => {
    const rows = collect(
      reading({
        issues: {
          '1': { at: '2026-01-01T00:00:00Z' },
          '2': { at: '2026-06-01T00:00:00Z' },
          '3': {},
          '4': { at: '2026-03-01T00:00:00Z' },
        },
      }),
    )
    expect(rows.map((row) => row.ref)).toEqual(['#2', '#4', '#1', '#3'])
  })
})

describe('the reading itself', () => {
  test('nothing at all is no rows rather than a throw', () => {
    expect(collect(null)).toEqual([])
    expect(collect(undefined)).toEqual([])
    expect(collect('a string')).toEqual([])
    expect(collect([1, 2, 3])).toEqual([])
  })

  test('a reading with no bags is an empty reading, which is a different thing', () => {
    expect(collect({ generated: '2026-08-27T10:00:00Z' })).toEqual([])
    expect(generatedAt({ generated: '2026-08-27T10:00:00Z' })).toBe('2026-08-27T10:00:00Z')
    expect(generatedAt({})).toBeNull()
  })
})
