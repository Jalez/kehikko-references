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
    const kept = { ordering: 'stale' as const }
    expect(reading(writing(kept))).toEqual(kept)
  })

  test('the default survives the round trip too, rather than becoming null', () => {
    const kept = { ordering: DEFAULT_ORDER }
    expect(reading(writing(kept))).toEqual(kept)
  })
})

describe('nothing a host hands back can break the page', () => {
  const rubbish = [null, undefined, '', 'not json at all', '[]', '"a string"', '42', '{}', '{"v":99,"o":"ref"}']

  test.each(rubbish)('%p reads as nothing kept rather than as an error', (value) => {
    expect(() => reading(value as string | null)).not.toThrow()
    expect(reading(value as string | null)).toBeNull()
  })

  test('every shape written before the filters moved is dropped whole, not read in half', () => {
    /* The two cases the version bumps exist for, and both are perfectly
       well-formed strings written by earlier versions of this same app.
       Version 1 held the kind, the state and the query; version 2 held the
       query. Reading either in part would restore the order and silently drop
       a filter somebody set — a remembered narrowing, partly applied, which is
       exactly the state this file is here to make impossible. The host holds
       all three now and restores them itself. */
    expect(reading('{"v":1,"q":"rbac","k":"change","s":"merged","o":"stale"}')).toBeNull()
    expect(reading('{"v":2,"q":"rbac","o":"stale"}')).toBeNull()
  })

  test('a field naming an order that no longer exists falls back to the default, not to itself', () => {
    /* The half-applied case, which is the one worth guarding: the version is
       right and the shape is right, and one value names something this app
       stopped having. */
    const held = reading('{"v":3,"o":"by-vibes"}')
    expect(held).toEqual({ ordering: 'moved' })
  })

  test('a field this version does not read is simply not read', () => {
    /* A `q` in a version-3 string can only be a hand edit or a future version
       writing something this one does not understand. Neither is a reason to
       refuse the order beside it, and neither is a reason to apply a query the
       host is the one holding. */
    expect(reading('{"v":3,"q":"rbac","o":"ref"}')).toEqual({ ordering: 'ref' })
  })
})

describe('what is kept, and what is deliberately not', () => {
  test('the selection is never in it — it is the host’s, and a copy would go stale', () => {
    const written = writing({ ordering: 'kind' })
    expect(written).not.toContain('gh#')
    expect(written).not.toContain('selection')
    expect(written).not.toContain('refs')
  })

  test('nor the kind, the state or the query, because the host holds all three', () => {
    /* Two memories of one setting is the failure. The container's filters are
       written down by the host, per container; a copy in here would be restored
       by this page on the next greeting and would fight whatever the header
       said. Asserted on the written string, because that is the artefact that
       would outlive the mistake — and what is left is the order and a version
       number, which is the whole of what this module owns. */
    const written = writing({ ordering: 'kind' })
    const held = JSON.parse(written) as Record<string, unknown>
    expect(Object.keys(held).sort()).toEqual(['o', 'v'])
  })

  test('what is written is far under the protocol’s bound, because there is almost nothing in it', () => {
    /* Four kilobytes is the limit and this is two fields. The bound used to be
       load-bearing, because a pasted query could approach it; with the query
       gone there is nothing here a person can make longer. */
    expect(writing({ ordering: 'moved' }).length).toBeLessThan(64)
  })
})
