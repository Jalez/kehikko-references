import { describe, expect, test } from 'bun:test'

import { reading, writing } from '@/live/keep.ts'
import { DEFAULT_ORDER } from '@/live/order.ts'
import { EVERYTHING } from '@/live/sift.ts'

/**
 * What comes back from the host is as trustworthy as anything else off the wire.
 *
 * That is the whole of what this file tests. The host stored a string and never
 * looked inside it, so nothing on the other side is checking the shape, the
 * version, or that the words in it still name filters this app has. The string
 * may have been written months ago by an older version of this program. So the
 * requirement is not "it round-trips" — that is the easy half — but "it never
 * throws and never half-applies", because a page that comes back in a state no
 * code path meant to produce is worse than one that came back fresh.
 */

describe('the round trip', () => {
  test('what is written comes back as what was written', () => {
    const kept = { sifting: { query: 'rbac jaakko', kind: 'change' as const, state: 'merged' as const }, ordering: 'stale' as const }
    expect(reading(writing(kept))).toEqual(kept)
  })

  test('the defaults survive the round trip too, rather than becoming null', () => {
    const kept = { sifting: EVERYTHING, ordering: DEFAULT_ORDER }
    expect(reading(writing(kept))).toEqual(kept)
  })
})

describe('nothing a host hands back can break the page', () => {
  const rubbish = [
    null,
    undefined,
    '',
    'not json at all',
    '[]',
    '"a string"',
    '42',
    '{}',
    '{"v":99,"q":"x","k":"issue","s":"open","o":"ref"}',
  ]

  test.each(rubbish)('%p reads as nothing kept rather than as an error', (value) => {
    expect(() => reading(value as string | null)).not.toThrow()
    expect(reading(value as string | null)).toBeNull()
  })

  test('a field naming a filter that no longer exists falls back to the default, not to itself', () => {
    /* The half-applied case, which is the one worth guarding: the version is
       right and the shape is right, and one value names something this app
       stopped having. A page that carried it through would have a filter whose
       button does not exist and a list narrowed by a rule nobody can see. */
    const held = reading('{"v":1,"q":"x","k":"epics","s":"abandoned","o":"by-vibes"}')
    expect(held).toEqual({ sifting: { query: 'x', kind: 'all', state: 'all' }, ordering: 'moved' })
  })

  test('a query that is not a string becomes an empty one rather than the word "null"', () => {
    expect(reading('{"v":1,"q":null,"k":"issue","s":"all","o":"ref"}')?.sifting.query).toBe('')
    expect(reading('{"v":1,"q":7,"k":"issue","s":"all","o":"ref"}')?.sifting.query).toBe('')
  })
})

describe('what is kept, and what is deliberately not', () => {
  test('the selection is never in it — it is the host’s, and a copy would go stale', () => {
    const written = writing({ sifting: EVERYTHING, ordering: 'kind' })
    expect(written).not.toContain('gh#')
    expect(written).not.toContain('selection')
    expect(written).not.toContain('refs')
  })

  test('an enormous query is clipped rather than refused, and stays under the protocol’s bound', () => {
    /* Four kilobytes is the protocol's limit on this string and nobody types a
       filter that long on purpose — but a paste must not be able to make the
       page unable to save its settings at all. */
    const written = writing({ sifting: { ...EVERYTHING, query: 'x'.repeat(9000) }, ordering: 'moved' })
    expect(written.length).toBeLessThan(4096)
    expect(reading(written)?.sifting.query.length).toBe(500)
  })
})
