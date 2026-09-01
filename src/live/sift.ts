import { LIMITS, type FilterChoice, type FilterGroup } from 'roadmap-module-protocol'

import type { Reference } from './reference.ts'

/**
 * Narrowing the list, which is the only place this app is allowed to hide a
 * row — and only because somebody asked it to, in the current second, with the
 * count of what is hidden on screen.
 *
 * That is the whole rule this file exists to keep, and it survived the control
 * leaving. `collect` never drops anything; a filter drops things by definition,
 * so every part of the design here is about making the dropping visible: the
 * count of what matched out of what exists is always drawn, a narrowed list
 * that matches nothing says so in its own words rather than in the words used
 * for a project with no references, and one press puts everything back.
 *
 * ## This file has argued three different things, and this is the third
 *
 * **First**, that the module kept all of its filtering, because the protocol
 * had no way for a module to write its own choice back. Two behaviours here
 * depended on being able to: `view.goto`, which answers "go to `gh#105`" by
 * clearing whatever is hiding that row, and the Clear that promised one press
 * would put everything back. With `kind` and `state` held by the host and no
 * way to write them, both would have become two thirds true.
 *
 * **Second**, that `kind` and `state` should move and the typed query should
 * stay. `filters.set` had arrived, so the two costs above were payable; and
 * `filterGroupSchema` could not express free text, saying so in its own words —
 * a text box in a 220-pixel container header needs room, focus and a keyboard.
 * That left this module drawing one input in a row of its own chrome for the
 * sake of one control, and a person looking in two places for one filter.
 *
 * **Third, and this is what the code does now: all three go.** The protocol
 * grew a `text` kind, and the argument that had refused one turned out to be
 * about a text box in the header STRIP rather than about the feature — the
 * control is a MENU, which has its own width, its own focus scope and as many
 * rows as it likes. So this module offers three groups, holds none of them, and
 * reads all three out of `context.filters`.
 *
 * What that bought is not pixels, and the honest note from the second version
 * survives: moving `kind` and `state` alone bought nothing at 220 pixels,
 * because the toolbar stayed for the query. Moving the query is what let the
 * toolbar go, and the header with it — about a hundred pixels of chrome over a
 * list that had three hundred to divide. The reason the owner gave was
 * consistency, twice, and the room came as a consequence rather than as the
 * argument.
 *
 * ## What stayed here, and could not have gone
 *
 * **The sifting itself.** The host holds the CHOICE and this holds what it
 * means. Nothing in `filterOptionSchema` tells a host that `opened` is a state
 * or that a query looks at labels and people as well as titles, and nothing
 * should: the host draws a menu and reports a press, and the meaning stays with
 * the program that wrote the words.
 *
 * **The count.** `37 of 412 shown` is drawn by this module, in this module's
 * words, from numbers only this module can count — the host sees rows it does
 * not render, in a document it cannot read, in a frame on another origin. It
 * lives in the table's heading now; `view/heading.tsx` has the argument.
 *
 * **The order.** It is not a filter: it hides nothing, so it has no business in
 * a control a reader has learned to check when a list looks short. It went to
 * the column headings, where somebody looking at a table expects it.
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
 * with the other group would make `Open 9` mean something different depending
 * on whether `Issues` was pressed, which is a number nobody can act on.
 * `Issues 17` means "seventeen of the references in this project are issues",
 * every time.
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
 *
 * The query group is exempt from that, and the protocol is the reason: a text
 * group has no options to be missing and no fallback to fall to. Its resting
 * state is the empty string, which is spelled by not being in the record at all.
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
 * The three group ids, named because three things have to agree on them: the
 * offer, the reading of what the host chose, and the tests.
 */
export const KIND = 'kind'
export const STATE = 'state'
export const SEARCH = 'search'

/** Whether anything is being hidden by choice. Drives the count and what `goto` has to undo. */
export function narrowing(sifting: Sifting): boolean {
  return sifting.query.trim() !== '' || sifting.kind !== 'all' || sifting.state !== 'all'
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
 *
 * The guard matters more now than it did when two groups were at stake: what
 * would be erased includes somebody's typed query.
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
    /*
     * The typed query, whose label is doing two jobs at once.
     *
     * A `text` group has one string for a person to read, and the host uses it
     * as both the input's placeholder and its accessible name. So it has to say
     * what this search LOOKS AT, which is the one thing no host could have
     * written: "by number, title, label or person" is a sentence about this
     * module's own rows. `FILTER_LABEL` is 48 characters and this is 40.
     *
     * No count in it, unlike the two above. The number a reader wants about a
     * query is how much it is hiding, and that changes on every keystroke — a
     * count here would re-send the whole offer per letter to keep a number
     * current in a menu that is, at that moment, open in front of them. The
     * count is drawn in the page instead, where this module is re-rendering
     * anyway and where there is room to say what it is a count OF.
     */
    { id: SEARCH, label: 'Filter by number, title, label or person', kind: 'text', options: [] },
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
 * The whole narrowing, read out of what the host says this container is set to.
 *
 * Every part of it now, where this used to take a locally held query as well.
 * There is no local copy of any of it, for the same reason there is no local
 * copy of the selection: a second answer would go stale on its own schedule, and
 * a page that drew what it asked for rather than what the host settled on would
 * disagree with the header in exactly the cases that matter.
 *
 * Lenient about what arrives, and that is required rather than defensive. The
 * host reconciles a stored choice against what a module offers, but it cannot do
 * that before the module has offered anything, and the greeting goes first — so
 * the first choice this page ever receives may name an option from a version of
 * itself that no longer exists. Anything unrecognised is the resting option,
 * which is a state the page is already correct in.
 *
 * The query is clipped rather than dropped, on the protocol's own bound. A
 * clipped query is still a query; a dropped one is a filter that silently stops
 * working the first time somebody pastes something long into it.
 */
export function siftingOf(chosen: FilterChoice): Sifting {
  const kind = chosen[KIND]
  const state = chosen[STATE]
  const query = chosen[SEARCH]
  return {
    query: typeof query === 'string' ? query.slice(0, LIMITS.FILTER_TEXT) : '',
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
