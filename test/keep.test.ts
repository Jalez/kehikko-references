import { describe, expect, test } from 'bun:test'

import { reading, writing } from '@/live/keep.ts'
import { DEFAULT_ORDER } from '@/live/order.ts'

/**
 * What comes back from the host is as trustworthy as anything else off the wire.
 *
 * That is the whole of what this file tests. The host stored a string and never
 * looked inside it, so nothing on the other side is checking the shape, the
 * version, or that the words in it still name settings this app has. The string
 * may have been written months ago by an older version of this program. So the
 * requirement is not "it round-trips" — that is the easy half — but "it never
 * throws and never half-applies", because a page that comes back in a state no
 * code path meant to produce is worse than one that came back fresh.
 */

describe('the round trip', () => {
  test('what is written comes back as what was written', () => {
    const kept = { query: 'rbac jaakko', ordering: 'stale' as const }
    expect(reading(writing(kept))).toEqual(kept)
  })

  test('the defaults survive the round trip too, rather than becoming null', () => {
    const kept = { query: '', ordering: DEFAULT_ORDER }
    expect(reading(writing(kept))).toEqual(kept)
  })
})

describe('nothing a host hands back can break the page', () => {
  const rubbish = [null, undefined, '', 'not json at all', '[]', '"a string"', '42', '{}', '{"v":99,"q":"x","o":"ref"}']

  test.each(rubbish)('%p reads as nothing kept rather than as an error', (value) => {
    expect(() => reading(value as string | null)).not.toThrow()
    expect(reading(value as string | null)).toBeNull()
  })

  test('the shape written before the filters moved is dropped whole, not read in half', () => {
    /* The case version 2 exists for. This is a perfectly well-formed string
       written by the version of this app that held the kind and the state
       itself. Reading it as a partial match would restore the query and the
       order and silently drop the other two — a remembered filter, two thirds
       applied, which is exactly the state this file is here to make impossible.
       The host holds the kind and the state now and restores them itself. */
    expect(reading('{"v":1,"q":"rbac","k":"change","s":"merged","o":"stale"}')).toBeNull()
  })

  test('a field naming an order that no longer exists falls back to the default, not to itself', () => {
    /* The half-applied case, which is the one worth guarding: the version is
       right and the shape is right, and one value names something this app
       stopped having. */
    const held = reading('{"v":2,"q":"x","o":"by-vibes"}')
    expect(held).toEqual({ query: 'x', ordering: 'moved' })
  })

  test('a query that is not a string becomes an empty one rather than the word "null"', () => {
    expect(reading('{"v":2,"q":null,"o":"ref"}')?.query).toBe('')
    expect(reading('{"v":2,"q":7,"o":"ref"}')?.query).toBe('')
  })
})

describe('what is kept, and what is deliberately not', () => {
  test('the selection is never in it — it is the host’s, and a copy would go stale', () => {
    const written = writing({ query: '', ordering: 'kind' })
    expect(written).not.toContain('gh#')
    expect(written).not.toContain('selection')
    expect(written).not.toContain('refs')
  })

  test('the kind and the state are never in it either, because the host holds them now', () => {
    /* Two memories of one setting is the failure. The container's filters are
       written down by the host, per container; a copy in here would be restored
       by this page on the next greeting and would fight whatever the header
       said. Asserted on the written string, because that is the artefact that
       would outlive the mistake. */
    const written = writing({ query: 'anything', ordering: 'kind' })
    const held = JSON.parse(written) as Record<string, unknown>
    expect(Object.keys(held).sort()).toEqual(['o', 'q', 'v'])
  })

  test('an enormous query is clipped rather than refused, and stays under the protocol’s bound', () => {
    /* Four kilobytes is the protocol's limit on this string and nobody types a
       filter that long on purpose — but a paste must not be able to make the
       page unable to save its settings at all. */
    const written = writing({ query: 'x'.repeat(9000), ordering: 'moved' })
    expect(written.length).toBeLessThan(4096)
    expect(reading(written)?.query.length).toBe(500)
  })
})
