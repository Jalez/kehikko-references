import { DEFAULT_ORDER, ORDER_LABELS, type Ordering } from './order.ts'

/**
 * What this page asks the roadmap to remember for it, and how it reads it back.
 *
 * ## Why the host holds it and this app does not
 *
 * A module framed without `allow-same-origin` runs on an opaque origin, where
 * `localStorage` does not return nothing — it throws. This app declares storage
 * now, for a reason that has nothing to do with settings (see `manifest.ts`), so
 * it COULD keep this itself and deliberately does not: the host holding one
 * opaque string it cannot read was never a workaround for the sandbox, it was
 * the right shape. The protocol's `state.set` keeps a string for one module and
 * hands the same string back in the greeting, having never looked inside it.
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
 * default rather than a broken control. A remembered setting that half-applies
 * is worse than one that was forgotten, because the second is a fresh start and
 * the first is a page in a state no code path meant to produce.
 *
 * `v` is a version and it is checked. When the shape changes, the number goes
 * up, and every string written before that is dropped whole rather than being
 * half-read into the new shape.
 *
 * ## What is kept, which is now two things and used to be four
 *
 * The order, and the text query. The kind and the state are no longer here, and
 * their absence is the point rather than an omission: they are held by the HOST
 * now, per container, in the control it draws in the container header and sends
 * back in `context.filters`. The essay at the top of `live/sift.ts` is why they
 * moved. Keeping a copy of them in this string as well would be two memories of
 * one setting, written at different moments by different programs, and the day
 * they disagreed the page would restore one over the other for reasons nobody
 * could reconstruct.
 *
 * `VERSION` went to 2 for exactly that. A string written by the old shape names
 * a kind and a state this app no longer applies, and reading it as a partial
 * match would leave a reader's remembered filter half-restored — the query and
 * the order back, the kind and the state silently dropped. The version check
 * drops it whole instead, and the page opens in its defaults, which is a state
 * it is already correct in and which the host's own memory of the two groups
 * then narrows again on its own.
 *
 * The query is the arguable one to keep, because it is the strongest filter here
 * and this string is kept per MODULE rather than per epic: a phrase typed while
 * reading one epic comes back over another, where it may match nothing, and the
 * reader sees a project that looks empty. It is kept anyway, and the reason is
 * that this page already carries the two things that make that survivable and
 * carries them for exactly this failure — the count that always names both
 * numbers, and the paragraph that says the filter is hiding all of them and
 * offers to clear it. Dropping the query would be dropping the one filter people
 * most often want back, in order to avoid a situation the page already explains
 * in its own words.
 *
 * Nothing about the SELECTION is kept here either, and for the same family of
 * reason as the kind and the state: it is the host's, it is a fact about the
 * canvas rather than about this module, and a copy of it in here would be a
 * second answer going stale on its own schedule.
 */

/** The shape written today. Bumped when the fields change, never reused. */
const VERSION = 2

export interface Kept {
  query: string
  ordering: Ordering
}

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
    q: kept.query.slice(0, 500),
    o: kept.ordering,
  })
}

/**
 * What the host handed back, as far as it can be believed.
 *
 * Null for anything this app cannot use — no string, not JSON, a version it does
 * not write any more, a field naming an order that no longer exists. The caller
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

  const ordering = (Object.keys(ORDER_LABELS) as Ordering[]).find((value) => value === held.o) ?? DEFAULT_ORDER
  return {
    query: typeof held.q === 'string' ? held.q.slice(0, 500) : '',
    ordering,
  }
}
