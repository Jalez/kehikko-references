import type { Reference } from './reference.ts'

/**
 * Putting the rows in an order somebody asked for.
 *
 * ## Separate from the filter, on purpose
 *
 * `sift.ts` says in as many words that it never reorders, and the reason is
 * still good: a filter that also moved things means pressing `Issues` shifts
 * every remaining row and the reader loses the place they had just found. This
 * file is the other half of that sentence rather than a contradiction of it —
 * reordering happens here, when a person asks for it, and nowhere else.
 *
 * Nothing here removes a row. That has to be said out loud in a file that
 * touches the list, because `collect.ts` is emphatic about it and an ordering is
 * the kind of code that grows a `filter` by accident: a comparator that cannot
 * place a value invites somebody to drop it instead. Every order below is total,
 * every row has a place in every one of them, and the ones with nothing to sort
 * by have a place that is defined rather than incidental.
 *
 * ## Only orders the reading can honestly produce
 *
 * A `Reference` carries a ref, a kind, an origin, a state, a title, a date, some
 * labels and some people — and each of those is either something read out of the
 * roadmap's answer or an honest blank. So those are the only things an order may
 * be built from. "By priority" and "by size" are the tempting ones and they are
 * not here, because nothing in the reading says either, and an order that quietly
 * stood in something else for them would be this page inventing a ranking and
 * presenting it as the tracker's.
 *
 * Five orders, and what each is for:
 *
 * - `moved` — most recently moved first. The order `collect` produces and the
 *   one this page has always had. It answers "what is happening", which is the
 *   question a list of live work is usually opened with.
 * - `stale` — least recently moved first. The same field read the other way, and
 *   a genuinely different question: what has been sitting.
 * - `ref` — by identifier. The order somebody has in their head when they are
 *   looking for a number rather than reading the list.
 * - `state` — open work first, then merged, then closed, then whatever could not
 *   be read. Not alphabetical: the sequence is the one work travels along, so
 *   the top of the list is the part that is still moving.
 * - `kind` — issues before changes. The coarsest split there is, and the one
 *   people describe out loud as "the issues and then the MRs".
 *
 * ## Where a missing value goes, and why it is not the extreme
 *
 * **A row with no date sorts last in `moved` AND last in `stale`**, which is the
 * one rule here that looks inconsistent and is the point. Treating an empty date
 * as the smallest string would make undated rows the oldest work in the epic:
 * they would head the `stale` list, which is read as "these have been sitting
 * longest and somebody should look at them", and that is a claim about work
 * nobody made. The reading simply did not carry a date. So a dateless row is at
 * the bottom of both, where it can be seen and is not being asserted about —
 * the same treatment `collect` already gives it, made deliberate rather than
 * incidental.
 *
 * **A row whose state could not be read sorts after `closed`** in `state`, for
 * the same reason and with the same shape: `sift.ts` already refuses to let an
 * unreadable state answer to `opened`, and an order that floated it to the top
 * beside the open work would undo that in a different costume.
 *
 * ## Ties keep the order they came in
 *
 * Every comparator returns 0 when it cannot tell two rows apart, and `sort` in
 * every engine this runs on is stable, so a tie falls back to whatever order the
 * rows arrived in — which is `collect`'s recency. Ordering by `kind` therefore
 * gives issues newest-first and then changes newest-first, rather than two
 * arbitrary heaps. Nothing else has to be spelled out for that to be true, but
 * it does have to be written down, because a future comparator that returned a
 * random tiebreak would silently take it away.
 */

export type Ordering = 'moved' | 'stale' | 'ref' | 'state' | 'kind'

export const DEFAULT_ORDER: Ordering = 'moved'

/** What each order is called on the control that sets it. */
export const ORDER_LABELS: Record<Ordering, string> = {
  moved: 'Recent',
  stale: 'Oldest',
  ref: 'Number',
  state: 'State',
  kind: 'Kind',
}

/** Whether the reader has moved off the order the list arrives in. Drives the label. */
export function reordered(ordering: Ordering): boolean {
  return ordering !== DEFAULT_ORDER
}

/**
 * The line work travels along, as a rank.
 *
 * `opened` is where the work is, `merged` is where it went, `closed` is where it
 * stopped, and a state nobody could read is off the line entirely. A row's state
 * is `null` rather than absent when the reading did not carry one — see
 * `reference.ts` — so 3 is the rank of a fact this app does not have rather than
 * of a fourth kind of work.
 */
const STATE_RANK: Record<string, number> = { opened: 0, merged: 1, closed: 2 }
const stateRank = (row: Reference): number => (row.state === null ? 3 : (STATE_RANK[row.state] ?? 3))

/**
 * One identifier, split into the part that names a tracker and the part that is
 * a number.
 *
 * `#2274`, `!1848` and `gh#131` are three spellings and the sigil is the only
 * thing separating GitLab's issue 41 from its merge request 41. Comparing them
 * as plain strings would interleave the three and would also put `#1000` before
 * `#41`, which is the sort everybody has complained about at least once. So the
 * sigil is compared as text and the digits as a number, and a ref that has no
 * digits at all — a tracker could file anything as a key, and `collect` promises
 * to draw whatever it filed — falls back to comparing the whole string, which is
 * a defined answer rather than a crash.
 */
function refParts(ref: string): { sigil: string; number: number | null } {
  const match = /^(\D*)(\d+)$/.exec(ref)
  if (!match) return { sigil: ref, number: null }
  return { sigil: match[1] ?? '', number: Number(match[2]) }
}

/** Text order that does not depend on the machine's locale, which a list of identifiers must not. */
const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Most recent first, with dateless rows last however the comparison runs.
 *
 * `at` is compared as a string for the reason `collect` compares it as a string:
 * every tracker involved writes ISO-8601, and `new Date()` over something else
 * gives `NaN`, and `NaN` in a comparator produces an ordering the engine is
 * entitled to make a mess of. A string that does not sort puts one row in the
 * wrong place; an inconsistent comparator can leave the whole list in an order
 * nobody can explain.
 */
function byDate(a: Reference, b: Reference, newestFirst: boolean): number {
  if (!a.at && !b.at) return 0
  if (!a.at) return 1
  if (!b.at) return -1
  return newestFirst ? text(b.at, a.at) : text(a.at, b.at)
}

const COMPARE: Record<Ordering, (a: Reference, b: Reference) => number> = {
  moved: (a, b) => byDate(a, b, true),
  stale: (a, b) => byDate(a, b, false),
  ref: (a, b) => {
    const left = refParts(a.ref)
    const right = refParts(b.ref)
    const sigil = text(left.sigil, right.sigil)
    if (sigil !== 0) return sigil
    if (left.number === null || right.number === null) return text(a.ref, b.ref)
    return left.number - right.number
  },
  state: (a, b) => stateRank(a) - stateRank(b),
  /* Issues first, because that is the order people say it in — "the issues and
     then the MRs" — and because an issue is the thing a change is usually about. */
  kind: (a, b) => (a.kind === b.kind ? 0 : a.kind === 'issue' ? -1 : 1),
}

/**
 * The same rows, in the order asked for. Never fewer, never more.
 *
 * A copy rather than a sort in place: the caller's array is the whole reading in
 * `collect`'s order, three other things read it, and a comparator that quietly
 * rearranged it would make the "show all" and the count depend on which control
 * was last touched.
 */
export function order(rows: readonly Reference[], ordering: Ordering): Reference[] {
  return [...rows].sort(COMPARE[ordering])
}
