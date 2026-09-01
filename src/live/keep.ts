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
 * ## What is kept, which is now one thing and used to be four
 *
 * The order, and nothing else. The kind, the state and the typed query have all
 * left, and their absence is the point rather than an omission: all three are
 * held by the HOST now, per container, in the control it draws in the container
 * header and sends back in `context.filters`. The essay at the top of
 * `live/sift.ts` is the whole argument. Keeping a copy of any of them in this
 * string as well would be two memories of one setting, written at different
 * moments by different programs, and the day they disagreed the page would
 * restore one over the other for reasons nobody could reconstruct.
 *
 * The version has gone up twice for exactly that, and the second time is the
 * instructive one. Version 2 dropped the kind and the state; version 3 drops
 * the query. Neither read the older shape in part, and reading it in part is
 * the failure both were avoiding — a remembered filter two thirds applied is a
 * page in a state no code path meant to produce, and it looks exactly like a
 * page that was working.
 *
 * ## So why is this file still here at all
 *
 * Because the ORDER is not a filter. It hides nothing, so it is not something
 * the host draws or remembers, and something has to remember it or a person who
 * sorted by identifier gets recency back on every reload. It is small, it is
 * this module's own, and `state:keep` is exactly the facility for that: the
 * host keeps one opaque string and never looks inside it.
 *
 * ## And what is kept where, in one place
 *
 * The order is here. The kind, the state and the query are the container's,
 * stored by the host per placement. The selection is the canvas's. The
 * auto-refresh interval is the container's too — see `roadmap.refreshable`. The
 * only thing in this list that is a fact about the MODULE rather than about a
 * container or a canvas is the order, which is why it is the only thing left.
 */

/** The shape written today. Bumped when the fields change, never reused. */
const VERSION = 3

export interface Kept {
  ordering: Ordering
}

/**
 * The string to hand the host.
 *
 * Short field names because the protocol bounds this at four kilobytes and, more
 * to the point, because a person reading a host's database should be able to see
 * at a glance that this is a setting and not a document. Two fields now, one of
 * which is the version, which is about as small as this facility gets used —
 * and small is the right size for it: the moment this needed a kilobyte it
 * would be keeping something that belongs in this app's own store.
 */
export function writing(kept: Kept): string {
  return JSON.stringify({ v: VERSION, o: kept.ordering })
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
  return { ordering }
}
