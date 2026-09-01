import { describe, expect, test } from 'bun:test'

import { LIMITS, filterGroupSchema } from 'roadmap-module-protocol'

import type { Reference } from '@/live/reference.ts'
import { EVERYTHING, hides, narrowing, offer, sift, siftingOf } from '@/live/sift.ts'

/**
 * The filter, which is the only thing in this app permitted to hide a row.
 *
 * So the tests are about two symmetrical failures. It must hide what was asked
 * for — a filter that quietly matches everything is a filter nobody can use —
 * and it must hide nothing else, because the reader's model of what is on this
 * journey is built from a list they believe is complete.
 */

const row = (over: Partial<Reference>): Reference => ({
  key: `k:${over.ref ?? '#1'}`,
  ref: '#1',
  kind: 'issue',
  origin: 'gitlab',
  state: 'opened',
  draft: false,
  title: '',
  at: '2026-08-01T00:00:00Z',
  url: null,
  labels: [],
  people: [],
  unreadable: false,
  ...over,
})

const rows: Reference[] = [
  row({ ref: '#2274', title: 'Talon tapa näkyy pois päältä', labels: ['type::bug'], people: ['ada'] }),
  row({ ref: '!1848', kind: 'change', state: 'merged', title: 'fix(rbac): stop the role editor', people: ['grace'] }),
  row({ ref: 'gh#41', origin: 'github', state: 'closed', title: 'connected apps', labels: ['area::db'] }),
  row({ ref: 'gh#99', origin: 'github', kind: 'change', state: null, title: 'a state nobody could read' }),
]

describe('nothing is hidden until something is asked', () => {
  test('the empty filter is every row, in the order it was given', () => {
    expect(sift(rows, EVERYTHING).map((r) => r.ref)).toEqual(['#2274', '!1848', 'gh#41', 'gh#99'])
    expect(narrowing(EVERYTHING)).toBe(false)
  })

  test('whitespace is not a question', () => {
    expect(sift(rows, { ...EVERYTHING, query: '   ' })).toHaveLength(4)
    expect(narrowing({ ...EVERYTHING, query: '   ' })).toBe(false)
  })
})

describe('what the query looks at', () => {
  test('the identifier, with or without its sigil', () => {
    expect(sift(rows, { ...EVERYTHING, query: '1848' }).map((r) => r.ref)).toEqual(['!1848'])
    expect(sift(rows, { ...EVERYTHING, query: '!1848' }).map((r) => r.ref)).toEqual(['!1848'])
  })

  test('the title, a label and a person', () => {
    expect(sift(rows, { ...EVERYTHING, query: 'role editor' }).map((r) => r.ref)).toEqual(['!1848'])
    expect(sift(rows, { ...EVERYTHING, query: 'area::db' }).map((r) => r.ref)).toEqual(['gh#41'])
    expect(sift(rows, { ...EVERYTHING, query: 'ADA' }).map((r) => r.ref)).toEqual(['#2274'])
  })

  test('two words may match two different fields', () => {
    /* How somebody types when they half remember a thing: a name and a word. */
    expect(sift(rows, { ...EVERYTHING, query: 'grace rbac' }).map((r) => r.ref)).toEqual(['!1848'])
  })

  test('a word that matches nothing hides everything, and says nothing else', () => {
    expect(sift(rows, { ...EVERYTHING, query: 'grace bug' })).toHaveLength(0)
  })
})

describe('kind and state', () => {
  test('issues and changes', () => {
    expect(sift(rows, { ...EVERYTHING, kind: 'issue' }).map((r) => r.ref)).toEqual(['#2274', 'gh#41'])
    expect(sift(rows, { ...EVERYTHING, kind: 'change' }).map((r) => r.ref)).toEqual(['!1848', 'gh#99'])
  })

  test('a state nobody could read is not open', () => {
    /* The assertion this file exists for. Asking for open work must never turn
       up a reference whose state was unreadable — that is the app inventing the
       one fact somebody came to check. */
    expect(sift(rows, { ...EVERYTHING, state: 'opened' }).map((r) => r.ref)).toEqual(['#2274'])
    expect(sift(rows, { ...EVERYTHING, state: 'all' }).map((r) => r.ref)).toContain('gh#99')
  })

  test('the filters compose', () => {
    expect(sift(rows, { query: 'a', kind: 'change', state: 'merged' }).map((r) => r.ref)).toEqual(['!1848'])
  })
})

describe('what is offered to the host, which is all of the narrowing now', () => {
  test('nothing at all until a reading has arrived, which is not the same as nothing to offer', () => {
    /* The distinction the whole feature turns on. An empty offer is a CLAIM the
       host acts on by pruning this container's stored choice; `null` is "I have
       nothing to say yet" and is not sent. Making the claim on mount, before a
       reading, erased the remembered filter on every load in the module this was
       found in. */
    expect(offer(rows, false)).toBeNull()
    expect(offer([], false)).toBeNull()
    /* And a project whose tracker genuinely holds nothing HAS nothing to be
       narrowed by, so the control goes away rather than offering `Issues 0`. */
    expect(offer([], true)).toEqual([])
  })

  test('the counts are in the labels, because the protocol has no count field', () => {
    const groups = offer(rows, true)!
    expect(groups.map((group) => group.id)).toEqual(['kind', 'state', 'search'])
    expect(groups[0]?.options).toEqual([
      { id: 'all', label: 'All 4' },
      { id: 'issue', label: 'Issues 2' },
      { id: 'change', label: 'Changes 2' },
    ])
    /* `Any` counts the row whose state nobody could read; nothing else does. The
       same rule `sift` keeps below, kept in the words as well. */
    expect(groups[1]?.options).toEqual([
      { id: 'all', label: 'Any 4' },
      { id: 'opened', label: 'Open 1' },
      { id: 'merged', label: 'Merged 1' },
      { id: 'closed', label: 'Closed 1' },
    ])
  })

  test('an option nothing matches is not offered, and the fallback never goes', () => {
    const only = [rows[0]!]
    const groups = offer(only, true)!
    expect(groups[0]?.options.map((option) => option.id)).toEqual(['all', 'issue'])
    expect(groups[1]?.options.map((option) => option.id)).toEqual(['all', 'opened'])
    /* The typed group is exempt, and the protocol is the reason: it has no
       options to be missing and no fallback to fall to. Its resting state is
       the empty string, which is spelled by being absent from the choice. */
    for (const group of groups.filter((one) => one.kind !== 'text')) {
      expect(group.options.some((option) => option.id === group.fallback)).toBe(true)
    }
  })

  test('the third group is the query, and it says what this search looks at', () => {
    /* The label is the input's placeholder AND its accessible name, so it has
       to name the fields — which is the one thing no host could have written.
       And it carries no count: the number a reader wants about a query changes
       on every keystroke, and the count is drawn in the page instead. */
    const search = offer(rows, true)!.find((group) => group.id === 'search')!
    expect(search.kind).toBe('text')
    expect(search.options).toEqual([])
    expect(search.fallback).toBeUndefined()
    expect(search.label).toContain('number')
    expect(search.label).toContain('person')
    expect(search.label.length).toBeLessThanOrEqual(LIMITS.FILTER_LABEL)
  })

  test('every group is one the protocol would accept, checked against its own schema', () => {
    /* The cheapest possible way to find out that this module has written an
       offer no host will take — a label over the bound, a fallback naming an
       option that was dropped — and to find it here rather than in somebody
       else's log. */
    for (const group of offer(rows, true)!) {
      expect(filterGroupSchema.safeParse(group).success).toBe(true)
    }
  })
})

describe('reading back what the host chose', () => {
  test('all three groups are read out of one record', () => {
    /* The query among them, which is the change: this page holds no part of its
       own narrowing any more. */
    expect(siftingOf({ kind: 'change', state: 'merged', search: 'rbac jaakko' })).toEqual({
      query: 'rbac jaakko',
      kind: 'change',
      state: 'merged',
    })
  })

  test('anything else is the resting option rather than a page narrowed by a rule nobody can see', () => {
    /* The host reconciles a stored choice against what a module offers, and it
       cannot do that before the module has offered anything — the greeting goes
       first. So the first choice this page ever receives may name an option from
       a version of itself that no longer exists. */
    expect(siftingOf({ kind: 'epics', state: 'abandoned' })).toEqual(EVERYTHING)
    expect(siftingOf({})).toEqual(EVERYTHING)
  })

  test('a query longer than the protocol allows is clipped rather than dropped', () => {
    /* A clipped query is still a query. A dropped one is a filter that silently
       stops working the first time somebody pastes something long. */
    const long = 'x'.repeat(LIMITS.FILTER_TEXT + 100)
    expect(siftingOf({ search: long }).query).toHaveLength(LIMITS.FILTER_TEXT)
  })

  test('anything narrowed at all is narrowed, whichever group did it', () => {
    /* `goto` asks this to decide whether it has to ask the host for anything at
       all before it can honestly answer `found: true`. */
    expect(narrowing({ ...EVERYTHING, query: 'rbac' })).toBe(true)
    expect(narrowing({ ...EVERYTHING, state: 'closed' })).toBe(true)
    expect(narrowing(EVERYTHING)).toBe(false)
  })

  test('one row is asked about with the same function the list is', () => {
    const closed = rows.find((row) => row.state === 'closed')!
    expect(hides({ ...EVERYTHING, state: 'opened' }, closed)).toBe(true)
    expect(hides(EVERYTHING, closed)).toBe(false)
  })
})

describe('order survives', () => {
  test('narrowing never reorders what is left', () => {
    const many = [...rows].reverse()
    expect(sift(many, { ...EVERYTHING, query: 'a' }).map((r) => r.ref)).toEqual(
      many.filter((r) => sift([r], { ...EVERYTHING, query: 'a' }).length === 1).map((r) => r.ref),
    )
  })
})
