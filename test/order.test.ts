import { describe, expect, test } from 'bun:test'

import { collect } from '@/live/collect.ts'
import { DEFAULT_ORDER, ORDER_LABELS, order, reordered, type Ordering } from '@/live/order.ts'

/**
 * The promise from `collect.ts`, held one more time.
 *
 * Every order has to be a permutation and nothing else: same rows, same count,
 * same identifiers, different sequence. That is the assertion that matters most
 * here and it is made against every order rather than against one, because a
 * comparator is exactly the kind of code where a single case is written wrong
 * and nothing else notices.
 *
 * The rest is about the two decisions that are judgement rather than mechanics —
 * where a row with nothing to sort by goes, and whether a tie keeps the order it
 * came in. Both are stated in prose in `order.ts` and prose is not enforcement.
 */

const EVERY: Ordering[] = ['moved', 'stale', 'ref', 'state', 'kind']

/** A reading with all four bags, some rows deliberately damaged. */
const READING = {
  generated: '2026-08-27T09:00:00Z',
  issues: {
    '41': { state: 'opened', title: 'a gitlab issue', at: '2026-08-20T10:00:00Z' },
    '1000': { state: 'closed', title: 'a closed one', at: '2026-08-10T10:00:00Z' },
    '7': { state: 'opened', title: 'no date at all on this one' },
  },
  mrs: {
    '17': { state: 'merged', title: 'a merge request', at: '2026-08-25T10:00:00Z' },
  },
  ghIssues: {
    'gh#131': { state: 'opened', title: 'a github issue', at: '2026-08-26T10:00:00Z' },
    'gh#4': { state: 'something-nobody-can-read', title: 'a state that will not read', at: '2026-08-01T10:00:00Z' },
  },
  ghPrs: {
    'gh#105': { state: 'merged', title: 'a pull request', at: '2026-08-22T10:00:00Z' },
  },
}

const ROWS = collect(READING)
const refsIn = (ordering: Ordering) => order(ROWS, ordering).map((row) => row.ref)

describe('every order is a permutation and never a filter', () => {
  test.each(EVERY)('%s draws every row exactly once', (ordering) => {
    const out = order(ROWS, ordering)
    expect(out).toHaveLength(ROWS.length)
    expect([...out.map((row) => row.key)].sort()).toEqual([...ROWS.map((row) => row.key)].sort())
  })

  test('ordering does not disturb the array it was given', () => {
    /* Three other things read the whole reading — the count, the "show all" and
       `goto` — and a sort in place would make what they see depend on which
       control was pressed last. */
    const before = ROWS.map((row) => row.ref)
    order(ROWS, 'ref')
    expect(ROWS.map((row) => row.ref)).toEqual(before)
  })
})

describe('a row with nothing to sort by has a defined place', () => {
  test('a dateless row is last in moved AND last in stale, rather than the oldest work there is', () => {
    /* The rule that looks inconsistent and is the point: an empty date is not a
       small date. Treating it as one would put undated rows at the head of
       "oldest first", which reads as a claim that they have been sitting
       longest — and nobody made that claim. */
    expect(refsIn('moved').at(-1)).toBe('#7')
    expect(refsIn('stale').at(-1)).toBe('#7')
  })

  test('a state nobody could read sorts after closed, never beside the open work', () => {
    const byState = order(ROWS, 'state')
    expect(byState.at(-1)?.ref).toBe('gh#4')
    expect(byState[0]?.state).toBe('opened')
  })
})

describe('the orders themselves', () => {
  test('moved is newest first and stale is exactly its reverse, dateless rows aside', () => {
    const dated = (ordering: Ordering) => refsIn(ordering).filter((ref) => ref !== '#7')
    expect(dated('moved')).toEqual([...dated('stale')].reverse())
    expect(dated('moved')[0]).toBe('gh#131')
  })

  test('by number, the digits are compared as numbers and the sigil groups them', () => {
    /* `#1000` before `#41` is the sort everybody has complained about once, and
       it is what a plain string comparison gives. */
    const byRef = refsIn('ref')
    expect(byRef.indexOf('#41')).toBeLessThan(byRef.indexOf('#1000'))
    expect(byRef.indexOf('gh#4')).toBeLessThan(byRef.indexOf('gh#105'))
    /* And the three spellings stay in three runs rather than interleaving. */
    const sigils = byRef.map((ref) => /^\D*/.exec(ref)?.[0])
    expect(sigils).toEqual([...new Set(sigils)].flatMap((s) => sigils.filter((other) => other === s)))
  })

  test('by kind puts issues before changes, and keeps recency inside each', () => {
    const byKind = order(ROWS, 'kind')
    const kinds = byKind.map((row) => row.kind)
    expect(kinds.indexOf('change')).toBeGreaterThan(kinds.lastIndexOf('issue') - 1)
    expect(new Set(kinds.slice(0, kinds.indexOf('change')))).toEqual(new Set(['issue']))
    /* The tie falls back to the order `collect` produced, which is recency —
       nothing in the comparator says so, and a stable sort is why it is true. */
    const changes = byKind.filter((row) => row.kind === 'change').map((row) => row.ref)
    expect(changes).toEqual(['!17', 'gh#105'])
  })
})

describe('the default is the order the list has always had', () => {
  test('moved is the default, and reordered says when the reader has left it', () => {
    expect(DEFAULT_ORDER).toBe('moved')
    expect(reordered('moved')).toBe(false)
    expect(reordered('stale')).toBe(true)
  })

  test('the default order is the same sequence collect produces, so nothing moves on load', () => {
    expect(refsIn('moved')).toEqual(ROWS.map((row) => row.ref))
  })

  test('every order has a word for the control that sets it', () => {
    for (const ordering of EVERY) expect(ORDER_LABELS[ordering]).toBeTruthy()
    expect(Object.keys(ORDER_LABELS).sort()).toEqual([...EVERY].sort())
  })
})
