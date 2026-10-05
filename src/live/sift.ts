import { LIMITS, type Disposition, type FilterChoice, type FilterGroup } from 'kehikot-module-protocol'
import {
  HIDE_GROUP,
  countFacets,
  dispositionOf,
  facetsOf,
  hiddenIn,
  offer as offerFacets,
  sift as siftFacets,
  type Facet,
  type Sighting,
} from 'kehikot-module-protocol/facets'

import type { Reference } from './reference.ts'

/**
 * Narrowing the list, which is the only place this app is allowed to hide a
 * row — and only because somebody asked it to, with the count of what is
 * hidden on screen.
 *
 * That is the whole rule this file exists to keep, and it survived the control
 * leaving. `collect` never drops anything; a filter drops things by definition,
 * so every part of the design here is about making the dropping visible: the
 * count of what matched out of what exists is always drawn, a narrowed list
 * that matches nothing says so in its own words rather than in the words used
 * for a project with no references, and one press puts everything back.
 *
 * ## This file has argued four different things, and this is the fourth
 *
 * **First**, that the module kept all of its filtering, because the protocol
 * had no way for a module to write its own choice back. **Second**, that `kind`
 * and `state` should move to the host's header and the typed query should stay.
 * **Third**, that all of it goes: the protocol grew a `text` kind, so this
 * module offers its groups, holds none of them, and reads every one out of
 * `context.filters`. What that bought was consistency first and about a
 * hundred pixels of chrome as a consequence.
 *
 * **Fourth, and this is what the code does now:** the two single-choice groups
 * for kind and state are gone, replaced by ONE `toggles` group built from the
 * shared ref facets in `kehikot-module-protocol/facets`, and the group that
 * frees is spent on a scope that is on by default.
 *
 * Two reasons, either of which would have been enough. A pair of single
 * choices can only say a cell of their product — "issues" AND "closed" — and
 * the thing people actually wanted was "hide closed MRs/PRs, keep closed
 * issues", because a closed issue is usually finished and a closed change is
 * usually abandoned. And the vocabulary was References' own, so Journeys would
 * have had to copy it and the two copies would have drifted. The facets are the
 * protocol's, so `hide` means the same thing in both containers and is stored
 * under the same group id.
 *
 * Then the cap. `LIMITS.FILTER_GROUPS` is four, and the four were spent —
 * kehikko, kind, state, search — so there was no room for the scope issue #1
 * asked for. Kind and state in one group is what made room.
 *
 * ## What stayed here, and could not have gone
 *
 * **The sifting itself.** The host holds the CHOICE and this holds what it
 * means. The facets module says what `change:closed` is; only this module knows
 * how to read a facet off one of its own rows, and only this one knows which
 * refs the open epic names.
 *
 * **The count.** `37 of 412 shown` is drawn by this module, in this module's
 * words, from numbers only this module can count. It lives in the table's
 * heading; `view/heading.tsx` has the argument.
 *
 * **The order.** It is not a filter: it hides nothing, so it has no business in
 * a control a reader has learned to check when a list looks short. It is on the
 * column headings.
 *
 * ## The counts ride in the labels, and are counted over the whole reading
 *
 * `filterOptionSchema` has no count field, because a separate one would be the
 * host deciding how a count is phrased. So `Everything 412` is one string, and
 * the offer is re-sent whenever the words change.
 *
 * The numbers deliberately ignore the query and each other. A count that
 * narrowed with the query would re-send the whole offer on every keystroke; a
 * count that narrowed with another group would make `closed issues (9)` mean
 * something different depending on what else was pressed, which is a number
 * nobody can act on. `closed issues (9)` means "nine of the references in this
 * project are closed issues", every time — and that includes the scope: the
 * facet counts are of the reading, not of the epic.
 *
 * ## A facet nothing has is not offered, unless it is on
 *
 * A GitHub-only reading has no merged rows, so `merged MRs/PRs (0)` would be a
 * toggle whose press hides nothing. The facets module drops a zero-count facet
 * unless it is currently switched on, so a person can always switch off what
 * they switched on. Two groups are exempt from dropping anything, each for a
 * reason given where it is built: the scope, and the kehikko pick.
 */

/**
 * The refs a scope narrows to, and where they came from.
 *
 * `containers` when one or more containers on the kehikko are picked out, and
 * the refs are the union of what they say they are showing; `epic` otherwise,
 * and the refs are what the open epic names — its steps' refs and its
 * umbrella. See `scopeOf`.
 */
export interface Scope {
  from: 'epic' | 'containers'
  refs: readonly string[]
}

export interface Sifting {
  query: string
  /**
   * The facets switched on in the `hide` group. A row with any of them is
   * hidden. Ids the facets module does not know are already dropped by
   * `hiddenIn`, so a stored choice from a newer or older vocabulary narrows
   * nothing rather than everything.
   */
  hidden: readonly Facet[]
  /**
   * The refs the scope group narrows to, or `null` for "not narrowed by it".
   *
   * ## On by default, which is the first group here that is
   *
   * Issue #1 is the argument. On a real project the list held every one of
   * 466 references while the epic on the canvas named about 80, and a reader
   * could not tell which belonged to the work in front of them. So the
   * fallback of the scope group — the option the host stores by not storing
   * anything — is `epic`, and "Everything" is the press away from it.
   *
   * `null` in two cases: the reader chose Everything, or the scope has nothing
   * to narrow to yet — no epic is open, or what it names has not been read.
   * The second is deliberate: a scope that hid every row while the epic was
   * still being asked about would draw an empty list for the length of a round
   * trip, and one whose read was refused would draw it forever. The heading
   * says which scope is in force, so a list that is NOT narrowed says so too.
   *
   * `[]` is different: an epic that names nothing, or picked containers that
   * show nothing. That hides every row, and `app.tsx` draws `NothingInScope`
   * for it rather than an empty list.
   */
  scope: Scope | null
  /**
   * The refs the kehikko group narrows to, or `null` for "not narrowed to any".
   *
   * ## The group that holds a list rather than a word
   *
   * The others are choices a person made in this container's header. This one
   * is a choice in the header AND a fact from somewhere else: the person turns
   * it on, and WHAT it narrows to is the canvas selection — the references
   * picked out on this kehikko, in this container or in any other. So the
   * choice is read out of `context.filters` like the rest and the list is read
   * out of `context.selection`, and they are folded together here so that
   * nothing downstream has to know there are two sources.
   *
   * `null` and `[]` are different states and the difference is the feature.
   * `null` is the group at rest. `[]` is the group ON with nothing picked on
   * the canvas, which hides every row — and must not be drawn as an empty list,
   * because nothing is wrong: `app.tsx` draws `NothingPicked` for it.
   */
  picked: readonly string[] | null
  /**
   * The marks people have put on why a ref closed, from `context.dispositions`.
   *
   * Not a choice, but it decides which `closed:*` facet a row has — a mark
   * always wins over the tracker's reason — so it travels with the choice, for
   * the reason `picked` does: `sift`, `hides` and `goto` must all read a row's
   * facets the same way, and the only way to make sure they do is to hand them
   * the same value.
   */
  marks: readonly Disposition[]
}

export const EVERYTHING: Sifting = { query: '', hidden: [], scope: null, picked: null, marks: [] }

/**
 * The four group ids, named because three things have to agree on them: the
 * offer, the reading of what the host chose, and the tests. `hide` is the
 * protocol's, because Journeys stores the same group under the same id.
 */
export const SCOPE = 'scope'
export const HIDE = HIDE_GROUP
export const SEARCH = 'search'
export const KEHIKKO = 'kehikko'

/** The scope group's resting option: what the open epic names, or what the picked containers show. */
export const IN_SCOPE = 'epic'
/** The other option of the scope and kehikko groups, and the one every "show me everything" press asks for. */
export const ALL = 'all'

/** The option of the `kehikko` group that narrows to the canvas selection. */
export const PICKED = 'picked'

/**
 * The choice that shows every row: Everything in the scope, every other group
 * at rest.
 *
 * Not `{}`, and that is the one place the default-on scope costs something.
 * `{}` puts every group back to its fallback, and the scope's fallback is the
 * epic — so a "Show all" that sent `{}` would show all of the epic. Every press
 * that promises the whole project sends this instead.
 */
export const SHOW_ALL: FilterChoice = { [SCOPE]: ALL }

/** Whether anything is being hidden by choice. Drives the count and what `goto` has to undo. */
export function narrowing(sifting: Sifting): boolean {
  return (
    sifting.query.trim() !== '' || sifting.hidden.length > 0 || sifting.scope !== null || sifting.picked !== null
  )
}

/**
 * What one row is, in the facets module's terms, or `null` for a row whose
 * state nobody could read.
 *
 * The row itself. The shared tracker reading spells `kind`, `state`,
 * `stateReason` and `closedByMerge` exactly as `Sighting` does, and
 * `collect.ts` carries them across untouched, so there is nothing to map —
 * which is the whole of why the protocol made a row a sighting.
 *
 * `null` is the rule this module has always kept — a state that could not be
 * read is not `open` — carried into the shared vocabulary: a row with no
 * sighting has no facets, and the facets module's `sift` never hides a row
 * with none. Hiding open issues must not hide an unreadable row, and neither
 * must hiding closed ones.
 */
export function sightingOf(row: Reference): Sighting | null {
  if (row.state === null) return null
  return row as Reference & { state: NonNullable<Reference['state']> }
}

/** Every facet one row has, with a person's mark winning over the tracker's reason. */
export function facetsOfRow(row: Reference, marks: readonly Disposition[]): Facet[] {
  const sighting = sightingOf(row)
  if (!sighting) return []
  return facetsOf(sighting, dispositionOf(row.ref, sighting, marks))
}

/**
 * Which scope the `epic` option means right now, or `null` for "nothing to
 * narrow to".
 *
 * Picked-out containers win over the epic, and that order is the protocol's
 * argument for `containers` rather than this module's: a person ticking
 * containers is aiming at them, here and now, and the epic is the standing
 * answer to "what is on this canvas" when nobody is aiming at anything. So
 * `aimed` — the union of the picked containers' `showing.refs`, or `null` when
 * none is picked — is asked first.
 */
export function scopeOf(epicRefs: readonly string[] | null, aimed: readonly string[] | null): Scope | null {
  if (aimed) return { from: 'containers', refs: aimed }
  if (epicRefs) return { from: 'epic', refs: epicRefs }
  return null
}

/** What else the narrowing is read against, besides the choice: four facts from the canvas. */
export interface Canvas {
  /** `context.selection`. */
  selection?: readonly string[]
  /** What the open epic names, or `null` when no epic is open or it has not been read. */
  epicRefs?: readonly string[] | null
  /** The union of the picked containers' `showing.refs`, or `null` when no container is picked out. */
  aimed?: readonly string[] | null
  /** `context.dispositions`. */
  marks?: readonly Disposition[]
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
 * runs on mount, with no rows, and a module that answered `[]` there would erase
 * the remembered choice on every single load. So `read` is the caller's answer
 * to "has a reading actually arrived", and until it has, this returns `null` and
 * the caller sends nothing at all.
 *
 * `hidden` is what the `hide` group has on now, so that a facet counted zero
 * stays offered while it is on — see `offer` in the facets module.
 */
export function offer(
  rows: readonly Reference[],
  read: boolean,
  canvas: Canvas = {},
  hidden: readonly string[] = [],
): FilterGroup[] | null {
  if (!read) return null
  if (rows.length === 0) return []
  const { selection = [], epicRefs = null, aimed = null, marks = [] } = canvas
  const reach = (refs: readonly string[]) => {
    const here = new Set(refs)
    return rows.filter((row) => here.has(row.ref)).length
  }

  /*
   * The scope, which is offered whole — both options, whatever the counts —
   * because its fallback is the option that narrows, and a group whose fallback
   * had been dropped is an offer the protocol's own schema refuses.
   *
   * The `epic` option's word says which scope it means right now, because the
   * same press means two things: what the picked containers show, while any
   * are picked, and what the epic names otherwise. A label that said "This
   * epic" while the list was narrowed to two picked containers would be the
   * header describing a list that is not on screen. When there is nothing to
   * narrow to yet it says so instead of a count, because `This epic 0` would
   * read as "the epic names nothing".
   */
  const scope = scopeOf(epicRefs, aimed)
  const scoped = !scope
    ? 'This epic (not read)'
    : scope.from === 'containers'
      ? `Picked containers ${reach(scope.refs)}`
      : `This epic ${reach(scope.refs)}`
  const scopeGroup: FilterGroup = {
    id: SCOPE,
    label: 'Scope',
    options: [
      { id: IN_SCOPE, label: scoped },
      { id: ALL, label: `Everything ${rows.length}` },
    ],
    fallback: IN_SCOPE,
  }

  /*
   * The kehikko pick, which is always offered whole — both options, whatever
   * the count. Dropping `Picked here 0` when the selection emptied would make
   * the host reconcile the stored choice back to `Everything`, and the filter
   * would silently switch itself OFF and stay off when the next pick arrived.
   * A control that switches itself off is a control the person does not hold.
   *
   * The count is of the ROWS the selection reaches, not of the selection: a
   * pick can name references this project's tracker does not hold.
   */
  const kehikko: FilterGroup = {
    id: KEHIKKO,
    label: 'Kehikko',
    options: [
      { id: ALL, label: `Everything ${rows.length}` },
      { id: PICKED, label: `Picked here ${reach(selection)}` },
    ],
    fallback: ALL,
  }

  /* The shared vocabulary, counted over the whole reading with the marks in
     force — a ref somebody marked `wont-do` is counted under "won't do", not
     under the tracker's guess. */
  const hide = offerFacets({ counts: countFacets(rows, (row) => facetsOfRow(row, marks)), hidden })

  return [
    scopeGroup,
    kehikko,
    hide,
    /*
     * The typed query, whose label is doing two jobs at once: the host uses it
     * as both the input's placeholder and its accessible name, so it says what
     * this search LOOKS AT. No count in it — the number a reader wants about a
     * query changes on every keystroke, and is drawn in the page instead.
     */
    { id: SEARCH, label: 'Filter by number, title, label or person', kind: 'text', options: [] },
  ]
}

/**
 * The whole narrowing, read out of what the host says this container is set to
 * and what the canvas is showing.
 *
 * Lenient about what arrives, and that is required rather than defensive. The
 * host reconciles a stored choice against what a module offers, but it cannot
 * do that before the module has offered anything, and the greeting goes first —
 * so the first choice this page ever receives may name an option from a version
 * of itself that no longer exists. A container stored under the old `kind` and
 * `state` groups arrives as `{ kind: 'issue', state: 'closed' }`; neither is a
 * group this reads any more, so both narrow nothing, and the host prunes them
 * the moment the new offer lands. A `hide` that arrives as a string rather than
 * a list is the resting state too — `hiddenIn` says so.
 *
 * The query is clipped rather than dropped, on the protocol's own bound. A
 * clipped query is still a query; a dropped one is a filter that silently stops
 * working the first time somebody pastes something long into it.
 */
export function siftingOf(chosen: FilterChoice, canvas: Canvas = {}): Sifting {
  const { selection = [], epicRefs = null, aimed = null, marks = [] } = canvas
  const query = chosen[SEARCH]
  return {
    query: typeof query === 'string' ? query.slice(0, LIMITS.FILTER_TEXT) : '',
    hidden: hiddenIn(chosen, HIDE),
    /* Anything but an explicit `all` is the resting option, which narrows. */
    scope: chosen[SCOPE] === ALL ? null : copied(scopeOf(epicRefs, aimed)),
    /* Copied, so that a sifting is a value: the arrays the host handed over are
       state elsewhere and a later context replaces them. */
    picked: chosen[KEHIKKO] === PICKED ? [...selection] : null,
    marks: [...marks],
  }
}

const copied = (scope: Scope | null): Scope | null => (scope ? { from: scope.from, refs: [...scope.refs] } : null)

/**
 * Every word has to match something; the words do not have to match the same
 * thing.
 *
 * `jaakko rbac` finds the change `jaakko` wrote about `rbac` — one word from the
 * people, one from the title — which is how somebody looking for a reference
 * they half remember actually types. The haystack includes the identifier, the
 * title, every label and every person; `1848` finds `!1848`, and so does
 * `!1848`, because the spelling is in the haystack exactly as it is drawn.
 */
function matches(row: Reference, terms: string[]): boolean {
  if (!terms.length) return true
  const hay = [row.ref, row.title, ...row.labels, ...row.people].join(' ').toLowerCase()
  return terms.every((term) => hay.includes(term))
}

/**
 * Whether this narrowing would hide this row.
 *
 * Written in terms of `sift` rather than beside it, because two implementations
 * of "is this row hidden" is exactly the pair that would drift and leave `goto`
 * answering `found: true` about an invisible row.
 */
export function hides(sifting: Sifting, row: Reference): boolean {
  return sift([row], sifting).length === 0
}

/**
 * Whether the kehikko group alone is hiding every row: it is on, and nothing
 * the canvas has picked is in this reading.
 *
 * Asked so that the page can say the right sentence: the remedy for an empty
 * pick is to pick something, not to loosen a menu.
 */
export function nothingPicked(rows: readonly Reference[], sifting: Sifting): boolean {
  if (sifting.picked === null) return false
  return sift(rows, { ...EVERYTHING, picked: sifting.picked }).length === 0
}

/**
 * Whether the scope alone is hiding every row: the epic names nothing this
 * reading holds, or the picked containers show nothing it holds.
 *
 * The same reasoning as `nothingPicked`, and the more common case of the two —
 * an epic whose steps cite GitLab issues over a project whose tracker read only
 * GitHub, say. "Nothing here matches what you asked for" would be wrong about
 * that: nobody asked for anything, because the scope is on by default.
 */
export function nothingInScope(rows: readonly Reference[], sifting: Sifting): boolean {
  if (sifting.scope === null) return false
  return sift(rows, { ...EVERYTHING, scope: sifting.scope }).length === 0
}

/**
 * The rows to draw, in the order `collect` put them.
 *
 * Order is never changed here. A filter that also reordered would mean pressing
 * a toggle moves every remaining row, and the reader loses the place they had
 * just found.
 */
export function sift(rows: readonly Reference[], sifting: Sifting): Reference[] {
  const terms = sifting.query.toLowerCase().split(/\s+/).filter(Boolean)
  const picked = sifting.picked === null ? null : new Set(sifting.picked)
  const scope = sifting.scope === null ? null : new Set(sifting.scope.refs)
  const narrowed = rows.filter((row) => {
    /* Exact strings, on both sides. `gh#41` and `#41` are two different
       references, and every module on this canvas spells them the way this
       list draws them — see `select` in `use-kehikot.ts` — so normalising here
       would show a row for a pick that was never about it. */
    if (scope && !scope.has(row.ref)) return false
    if (picked && !picked.has(row.ref)) return false
    return matches(row, terms)
  })
  /* The toggles through the facets module's own `sift`, so that "a row with no
     facets is never hidden" is its rule and not a copy of it. It keeps order. */
  return siftFacets(narrowed, sifting.hidden, (row) => facetsOfRow(row, sifting.marks)).kept
}
