import type { FilterChoice, FilterGroup } from 'roadmap-module-protocol'

import type { Reference } from './reference.ts'

/**
 * Narrowing the list, which is the only place this app is allowed to hide a
 * row — and only because somebody asked it to, in the current second, with the
 * count of what is hidden on screen.
 *
 * That is the whole rule this file exists to keep, and it did not move when the
 * control did. `collect` never drops anything; a filter drops things by
 * definition, so every part of the design here is about making the dropping
 * visible: the count of what matched out of what exists is always drawn, a
 * narrowed list that matches nothing says so in its own words rather than in the
 * words used for an epic with no references, and one press puts everything back.
 *
 * ## What this file used to say, and why it no longer says it
 *
 * It argued at length that this module kept ALL of its filtering, and the
 * argument was sound on the day it was written. The protocol had grown
 * `roadmap.filters` — a module hands the host a list of groups it can be
 * narrowed by, the host draws one control in the container header, and the
 * choice comes back in `context.filters` — and it had grown only that. The offer
 * went one way. There was no message for a module to write its own choice, and
 * two behaviours on this page depended on being able to:
 *
 * 1. **`goto` clears what is hiding its target.** `src/app.tsx` answers "go to
 *    `!1848`" by clearing the narrowing and scrolling to the row, because
 *    answering `found: true` while the row is filtered out walks a reader to a
 *    page where their reference is invisible.
 * 2. **One press puts everything back.** `Clear` and `NothingMatches` are both
 *    built on that sentence, and a `Clear` that cleared a third of the narrowing
 *    would be a button that does not do what it says.
 *
 * With `kind` and `state` held by the host and no way to write them,
 * `setSifting(EVERYTHING)` would have cleared the query and nothing else. Both
 * would have broken.
 *
 * **The missing message now exists.** `filters.set` takes a WHOLE choice in the
 * same shape `context.filters` sends back, `{}` is the meaningful empty value
 * and is exactly "clear the narrowing", and it is a REQUEST in the same sense
 * `passage.set` is — the module asks, the host decides, and a refusal has to be
 * survivable. So the two costs above are payable now rather than fatal, and they
 * are paid in `app.tsx`: `goto` and `Clear` both ask, both read what came back
 * rather than assuming they got what they asked for, and a `goto` the host
 * declines answers `found: false` with the host's own sentence rather than
 * walking somebody to a row they cannot see. That is the behaviour the old essay
 * was protecting, kept by a different means.
 *
 * ## What was kept here, and why it is not an inconsistency
 *
 * **The free-text query.** `filterGroupSchema` cannot express it, and says so in
 * its own words rather than by omission: a text box in a 220-pixel container
 * header needs room, focus and a keyboard, and a host cannot debounce or
 * interpret somebody else's search. The same schema adds that a module which
 * keeps some of its filtering is a conforming module. So the query stays in the
 * toolbar, with the count beside it and the `Clear` beside that.
 *
 * The reporting stays here too, and would have whatever happened to the control:
 * `37 of 412 shown` is drawn by this module, in this module's words, from
 * numbers only this module can count. The host cannot count rows it does not
 * render.
 *
 * ## The honest note that survives from the old argument
 *
 * Moving these two groups buys **no room** at the width this toolbar was
 * designed for. That was the third cost in the essay this replaces and it was
 * measured rather than assumed: at 220 pixels the bar is now the query input,
 * the order trigger, the count and `Clear`, which is two lines — and it was two
 * lines before, with the kind and state groups collapsed behind one trigger.
 *
 * It is recorded here as a fact and not as a dissent. The owner asked for this
 * twice, and the reason they gave is one the old essay never weighed: every
 * other module in this family offers its enumerable filtering to the container
 * header, and a reader who has learned where a container's filters live should
 * find them in the same place in this one. Consistency across a canvas is a
 * legitimate reason, pixels are not the only currency, and trading a stated
 * preference for sixteen pixels would have been this file deciding a question
 * that was not its to decide.
 *
 * ## The counts ride in the labels, and are counted over the whole reading
 *
 * `filterOptionSchema` says so: there is no count field, because a separate one
 * would be the host deciding how a count is phrased. So `Issues 17` is one
 * string, and the offer is re-sent whenever the words change — which, here, is
 * whenever a reading changes.
 *
 * The numbers deliberately ignore the query and each other. A count that
 * narrowed with the query would re-send the whole offer on every keystroke, to
 * keep a number current in a menu that is usually closed; a count that narrowed
 * with the other group would make `Open 9` mean something different depending on
 * whether `Issues` was pressed, which is a number nobody can act on. `Issues 17`
 * means "seventeen of the references in this project are issues", every time.
 *
 * ## An option nothing matches is not offered
 *
 * A GitHub-only reading has no merged rows in it, so `Merged 0` would be a menu
 * entry whose only possible outcome is an empty list. Options with nothing
 * behind them are left out and the fallback is always kept, which is the same
 * rule `kehikko-learning`'s `wire/scope.ts` keeps for a rung nothing is pointing
 * at. The host reconciles a stored choice naming an option that is no longer
 * offered by falling back, so a reader who had chosen `Merged` and moved to a
 * project with none is returned to `Any` rather than left looking at nothing.
 */

export type KindFilter = 'all' | 'issue' | 'change'
export type StateFilter = 'all' | 'opened' | 'closed' | 'merged'

export interface Sifting {
  query: string
  kind: KindFilter
  state: StateFilter
}

export const EVERYTHING: Sifting = { query: '', kind: 'all', state: 'all' }

/**
 * The two group ids, named because three things have to agree on them: the
 * offer, the reading of what the host chose, and the tests.
 */
export const KIND = 'kind'
export const STATE = 'state'

/** Whether anything is being hidden by choice. Drives the "clear" affordance and the count. */
export function narrowing(sifting: Sifting): boolean {
  return sifting.query.trim() !== '' || sifting.kind !== 'all' || sifting.state !== 'all'
}

/** Whether anything the HOST is holding is hiding rows — what `filters.set({})` would undo. */
export function hostNarrowing(sifting: Sifting): boolean {
  return sifting.kind !== 'all' || sifting.state !== 'all'
}

/**
 * What this module offers to be narrowed by, or `null` for "nothing to say yet".
 *
 * ## Three answers, and the third is the one that is easy to leave out
 *
 * An empty offer is a CLAIM — "there is nothing here to narrow by" — and the
 * host acts on it by withdrawing the control and pruning this container's stored
 * choice. That is right for a project whose tracker is genuinely empty, and it
 * is catastrophic before a reading has arrived: the effect that sends this first
 * runs on mount, with no rows, and a module that answered `[]` there would claim
 * it had nothing to offer at the one moment it could not possibly know. The host
 * would believe it and erase the remembered choice on every single load. The
 * setting would appear to work perfectly and be forgotten every time the page
 * was reloaded.
 *
 * It was found in the checklist module against the real host, and
 * `kehikko-learning`'s `wire/scope.ts` carries the same guard for the same
 * reason. So `read` is the caller's answer to "has a reading actually arrived",
 * and until it has, this returns `null` and the caller sends nothing at all —
 * whatever was last offered stands.
 */
export function offer(rows: readonly Reference[], read: boolean): FilterGroup[] | null {
  if (!read) return null
  if (rows.length === 0) return []

  const kinds = counted(rows, [
    { id: 'all', word: 'All', has: () => true },
    { id: 'issue', word: 'Issues', has: (row) => row.kind === 'issue' },
    { id: 'change', word: 'Changes', has: (row) => row.kind === 'change' },
  ])
  const states = counted(rows, [
    { id: 'all', word: 'Any', has: () => true },
    /* A row whose state could not be read is not `opened`, here as in `sift`
       below: it is counted by `Any` and by nothing else, because a count that
       included it under `Open` would be this page inventing the one fact
       somebody came to check. */
    { id: 'opened', word: 'Open', has: (row) => row.state === 'opened' },
    { id: 'merged', word: 'Merged', has: (row) => row.state === 'merged' },
    { id: 'closed', word: 'Closed', has: (row) => row.state === 'closed' },
  ])

  return [
    { id: KIND, label: 'Kind', options: kinds, fallback: 'all' },
    { id: STATE, label: 'State', options: states, fallback: 'all' },
  ]
}

/** One option, with its number in its label, and dropped when the number is zero. */
function counted(
  rows: readonly Reference[],
  options: { id: string; word: string; has: (row: Reference) => boolean }[],
): { id: string; label: string }[] {
  return options
    .map((option) => ({ id: option.id, word: option.word, count: rows.filter(option.has).length }))
    /* The fallback is never dropped. A group has to have one, and a group whose
       fallback had gone is an offer the protocol's own schema refuses. */
    .filter((option) => option.id === 'all' || option.count > 0)
    .map((option) => ({ id: option.id, label: `${option.word} ${option.count}` }))
}

/**
 * The whole narrowing, from this module's query and the host's choice.
 *
 * Lenient about what the host says, and that is required rather than defensive.
 * The host reconciles a stored choice against what a module offers, but it
 * cannot do that before the module has offered anything, and the greeting goes
 * first — so the first choice this page ever receives may name an option from a
 * version of itself that no longer exists. Anything unrecognised is the resting
 * option, which is a state the page is already correct in.
 */
export function siftingOf(query: string, chosen: FilterChoice): Sifting {
  const kind = chosen[KIND]
  const state = chosen[STATE]
  return {
    query,
    kind: kind === 'issue' || kind === 'change' ? kind : 'all',
    state: state === 'opened' || state === 'closed' || state === 'merged' ? state : 'all',
  }
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
 * Whether this narrowing would hide this row.
 *
 * `goto` asks it about one row, twice: once about what is hiding the target
 * before anything is asked of the host, and once about what the host actually
 * settled on afterwards. Written in terms of `sift` rather than beside it,
 * because two implementations of "is this row hidden" is exactly the pair that
 * would drift and leave `goto` answering `found: true` about an invisible row.
 */
export function hides(sifting: Sifting, row: Reference): boolean {
  return sift([row], sifting).length === 0
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
