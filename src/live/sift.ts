import type { Reference } from './reference.ts'

/**
 * Narrowing the list, which is the only place this app is allowed to hide a
 * row — and only because somebody asked it to, in the current second, with the
 * count of what is hidden on screen.
 *
 * That is the whole rule this file exists to keep. `collect` never drops
 * anything; a filter drops things by definition, so every part of the design
 * here is about making the dropping visible: the count of what matched out of
 * what exists is always drawn, a narrowed list that matches nothing says so in
 * its own words rather than in the words used for an epic with no references,
 * and one press puts everything back.
 *
 * ## Why none of this is offered to the host, though two thirds of it could be
 *
 * The protocol grew `roadmap.filters`: a module hands the host a list of groups
 * it can be narrowed by, the host draws one control in the container header, and
 * the choice comes back in `context.filters`. Every other module in this family
 * either took it or had nothing to take. This one has THREE dimensions — `kind`,
 * `state` and a typed query — of which exactly two can be expressed there.
 * Free text cannot, by design and not by oversight: a text box in a 220-pixel
 * header needs room, focus and a keyboard, and a host cannot interpret somebody
 * else's search. `filterGroupSchema` in the protocol package says so in its own
 * words, and adds that a module which keeps all of its filtering is conforming.
 *
 * This module keeps all of it. Splitting it would cost three things, and the
 * first two are not opinions about layout — they are behaviours on this page
 * that would stop working, because **a module cannot set its own filter choice**.
 * The offer goes one way; the choice is the host's and there is deliberately no
 * message for a module to write it. So:
 *
 * 1. **`goto` could no longer clear what is hiding its target.** `src/app.tsx`
 *    answers a host that says "go to `!1848`" by clearing the narrowing and
 *    scrolling to the row, and the essay there gives the reason: answering
 *    `found: true` while the row is filtered out walks a reader to a page where
 *    their reference is invisible, which is worse than the fallback link
 *    `found: false` would have got them. With `kind` and `state` held by the
 *    host, `setSifting(EVERYTHING)` clears the query and nothing else — so a
 *    `goto` naming an issue while the header says `Changes` either lies or
 *    regresses to a refusal. A working feature would be traded for a control
 *    that moved.
 *
 * 2. **"One press puts everything back" would become "one press puts a third of
 *    it back".** That is the rule at the top of this file, and `Clear` and
 *    `NothingMatches` are both built on it. After a split, a reader looking at
 *    an empty list would press the button this app offers for exactly that
 *    situation and still see an empty list, because the thing hiding the rows
 *    is in a strip this page cannot reach. The host may well have its own
 *    reset; two resets in two places for one filter is not the same promise.
 *
 * 3. **It buys no room at the width the toolbar was designed for.** The whole
 *    argument in `view/toolbar.tsx` was measured at 220 pixels, where `kind`
 *    and `state` already collapse into a single trigger that also carries the
 *    order. Take them away and that trigger is still there for the order alone,
 *    beside the same query input, the same count and the same `Clear`. Two
 *    lines before, two lines after. The saving that would justify paying for
 *    the first two costs does not exist.
 *
 * The reporting stays here regardless, and would have even if the control had
 * gone: `37 of 412 shown` is drawn by this module, in this module's words, from
 * numbers only this module can count. The host cannot count rows it does not
 * render, and moving a control was never going to move that.
 *
 * If the query ever goes away — if somebody decides this list is small enough to
 * find things in without typing — then all of what is left is enumerable, all
 * three costs above vanish, and the two groups belong in the header. The
 * decision is about the third dimension, not about the two.
 */

export type KindFilter = 'all' | 'issue' | 'change'
export type StateFilter = 'all' | 'opened' | 'closed' | 'merged'

export interface Sifting {
  query: string
  kind: KindFilter
  state: StateFilter
}

export const EVERYTHING: Sifting = { query: '', kind: 'all', state: 'all' }

/** Whether anything is being hidden by choice. Drives the "clear" affordance and the count. */
export function narrowing(sifting: Sifting): boolean {
  return sifting.query.trim() !== '' || sifting.kind !== 'all' || sifting.state !== 'all'
}

/**
 * Every word has to match something; the words do not have to match the same
 * thing.
 *
 * `jaakko rbac` finds the change `jaakko` wrote about `rbac` — one word from the
 * people, one from the title — which is how somebody looking for a reference
 * they half remember actually types. An implementation that required the whole
 * phrase in one field would find nothing and give no reason for it.
 *
 * The haystack is built once per row per call and includes the identifier, the
 * title, every label and every person. The identifier matters most and is
 * cheapest: `1848` finds `!1848`, and typing `!1848` finds it too, because the
 * spelling is in the haystack exactly as it is drawn.
 */
function matches(row: Reference, terms: string[]): boolean {
  if (!terms.length) return true
  const hay = [row.ref, row.title, ...row.labels, ...row.people].join(' ').toLowerCase()
  return terms.every((term) => hay.includes(term))
}

/**
 * The rows to draw, in the order `collect` put them.
 *
 * Order is never changed here. A filter that also reordered would mean pressing
 * "issues" moves every remaining row, and the reader loses the place they had
 * just found.
 */
export function sift(rows: readonly Reference[], sifting: Sifting): Reference[] {
  const terms = sifting.query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (sifting.kind !== 'all' && row.kind !== sifting.kind) return false
    /* A row whose state could not be read is not `opened`, and asking for open
       rows must not produce it. It survives `all`, where it belongs: it is a
       reference that exists, with a state nobody can see. */
    if (sifting.state !== 'all' && row.state !== sifting.state) return false
    return matches(row, terms)
  })
}
