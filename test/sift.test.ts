import { describe, expect, test } from 'bun:test'

import type { Reference } from '@/live/reference.ts'
import { EVERYTHING, narrowing, sift } from '@/live/sift.ts'

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

describe('order survives', () => {
  test('narrowing never reorders what is left', () => {
    const many = [...rows].reverse()
    expect(sift(many, { ...EVERYTHING, query: 'a' }).map((r) => r.ref)).toEqual(
      many.filter((r) => sift([r], { ...EVERYTHING, query: 'a' }).length === 1).map((r) => r.ref),
    )
  })
})
