import { EVERYTHING, type KindFilter, type Sifting, type StateFilter } from './sift.ts'
import { DEFAULT_ORDER, ORDER_LABELS, type Ordering } from './order.ts'

/**
 * What this page asks the roadmap to remember for it, and how it reads it back.
 *
 * ## Why the host holds it and this app does not
 *
 * A module framed without `allow-same-origin` runs on an opaque origin, where
 * `localStorage` does not return nothing — it throws. This app declares no
 * storage, on purpose (see `manifest.ts`), so it has nowhere of its own to keep
 * a filter. The protocol's answer is `state.set`: the host keeps a string for
 * one module and hands the same string back in the greeting, having never
 * looked inside it.
 *
 * That the host never looks inside it is the part this file has to honour. The
 * string is JSON because JSON is what a program reads, not because the host
 * knows it is JSON — nothing on the other side parses this, validates it, or
 * would notice if it changed shape tomorrow. Which means every guarantee about
 * what comes back has to be made here.
 *
 * ## So it is read the way a wire message is read
 *
 * The value in the greeting is a string this app wrote, on an older version of
 * itself, possibly months ago, possibly on a different machine. It is exactly as
 * trustworthy as anything else that arrives over the wire, and `reading()` below
 * treats it that way: it never throws, it checks every field against the values
 * that actually exist today, and anything it cannot vouch for becomes the
 * default rather than a broken control. A remembered filter that half-applies is
 * worse than one that was forgotten, because the second is a fresh start and the
 * first is a page in a state no code path meant to produce.
 *
 * `v` is a version and it is checked. When the shape changes, the number goes
 * up, and every string written before that is dropped whole rather than being
 * half-read into the new shape.
 *
 * ## What is kept, including the query, which is arguable
 *
 * The kind filter, the state filter, the order, and the text query. The first
 * three are uncontroversial — they are settings, and a setting that forgets
 * itself on every reload is a setting people stop using.
 *
 * The query is the arguable one, because it is the strongest filter here and the
 * state is kept per MODULE rather than per epic: a phrase typed while reading
 * one epic comes back over another, where it may match nothing, and the reader
 * sees an epic that looks empty. It is kept anyway, and the reason is that this
 * page already carries the two things that make that survivable and carries them
 * for exactly this failure — the count that always names both numbers, and the
 * paragraph that says the filter is hiding all of them and offers to clear it.
 * Dropping the query would be dropping the one filter people most often want
 * back, in order to avoid a situation the page already explains in its own
 * words.
 *
 * Nothing about the SELECTION is kept here. It is the host's to remember, it is
 * a fact about the canvas rather than about this module, and a copy of it in
 * here would be a second answer going stale on its own schedule.
 */

/** The shape written today. Bumped when the fields change, never reused. */
const VERSION = 1

export interface Kept {
  sifting: Sifting
  ordering: Ordering
}

const KINDS: KindFilter[] = ['all', 'issue', 'change']
const STATES: StateFilter[] = ['all', 'opened', 'closed', 'merged']

/**
 * The string to hand the host.
 *
 * Short field names because the protocol bounds this at four kilobytes and, more
 * to the point, because a person reading a host's database should be able to see
 * at a glance that this is a filter and not a document. The query is clipped
 * rather than refused: a query is not an identifier, a clipped one is still a
 * query, and nobody types four thousand characters into a filter by accident —
 * but a page that could be made unable to save its settings by a paste is a page
 * with a strange bug in it.
 */
export function writing(kept: Kept): string {
  return JSON.stringify({
    v: VERSION,
    q: kept.sifting.query.slice(0, 500),
    k: kept.sifting.kind,
    s: kept.sifting.state,
    o: kept.ordering,
  })
}

/**
 * What the host handed back, as far as it can be believed.
 *
 * Null for anything this app cannot use — no string, not JSON, a version it does
 * not write any more, a field naming a filter that no longer exists. The caller
 * draws its defaults, which is the same thing it does on a first run and is a
 * state the page is already correct in.
 */
export function reading(state: string | null | undefined): Kept | null {
  if (typeof state !== 'string' || state === '') return null
  let raw: unknown
  try {
    raw = JSON.parse(state)
  } catch {
    /* Not a surprise and not an error worth reporting. A host may hand back
       something written by a version of this app that predates JSON here, or by
       a hand-edited database. Either way the answer is the same. */
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const held = raw as Record<string, unknown>
  if (held.v !== VERSION) return null

  const kind = KINDS.find((value) => value === held.k) ?? EVERYTHING.kind
  const state_ = STATES.find((value) => value === held.s) ?? EVERYTHING.state
  const ordering = (Object.keys(ORDER_LABELS) as Ordering[]).find((value) => value === held.o) ?? DEFAULT_ORDER
  return {
    sifting: {
      query: typeof held.q === 'string' ? held.q.slice(0, 500) : '',
      kind,
      state: state_,
    },
    ordering,
  }
}
