import type { Kind, Origin, Reference, State } from './reference.ts'

/**
 * What a roadmap answered `live.get` with, turned into rows.
 *
 * ## The one promise this file keeps
 *
 * **Every key in every bag becomes exactly one row.** Not "every well-formed
 * key", not "every key we could read a title for". Somebody is here looking for
 * one reference among four hundred, and the failure they cannot detect is the
 * one where it was never drawn: an empty result is visibly empty, a wrong title
 * is visibly wrong, and a missing row looks exactly like a row that was never
 * meant to be there. So there is no `filter` in this file, no `continue` that
 * skips an entry, and no early return over a value that disappointed us. A
 * value that is not an object still has a key, and a key is a reference.
 *
 * Everything unreadable becomes an honest blank on the row — a null state, an
 * empty title, no link — and `unreadable` is set so the page can say which rows
 * arrived damaged rather than leaving somebody to wonder why one line is bare.
 *
 * ## Where the shapes come from
 *
 * Four bags, and which bag a thing was in is the ONLY thing that says what it
 * is. GitHub numbers issues and pull requests in one sequence, so `gh#41` is
 * unreadable on its own; the refresh that filed it knew, and filing is how it
 * told us. Parsing the ref to decide would be this app guessing at a fact it
 * was handed.
 *
 * GitLab's two bags are keyed by the bare number and GitHub's two by the ref as
 * written, which is how the roadmap files them; the spellings are rebuilt here
 * to match how people say them out loud. That asymmetry is not ours and is not
 * tidied, because tidying it would mean this app and the roadmap disagree about
 * what a key is.
 *
 * ## `Object.entries`, and the hazard it sidesteps
 *
 * The protocol package's essay on `MODULE_ID` is about lookups keyed by a
 * stranger's string — `record[key]` answering with something inherited when the
 * key is `constructor`. This file never looks anything up by a key from the
 * wire: it enumerates. `Object.entries` returns own enumerable properties and
 * nothing from a prototype, so a bag containing a key called `constructor` is a
 * row about `constructor`, which is a lie a tracker told rather than one this
 * code invented. The distinction is worth stating because the code LOOKS like
 * the hazardous shape and is not.
 */

/** The four bags, in the order their rows are first collected. */
const BAGS = [
  { bag: 'issues', origin: 'gitlab', kind: 'issue', spell: (k: string) => `#${k}` },
  { bag: 'mrs', origin: 'gitlab', kind: 'change', spell: (k: string) => `!${k}` },
  { bag: 'ghIssues', origin: 'github', kind: 'issue', spell: (k: string) => k },
  { bag: 'ghPrs', origin: 'github', kind: 'change', spell: (k: string) => k },
] as const satisfies readonly { bag: string; origin: Origin; kind: Kind; spell: (k: string) => string }[]

const STATES: readonly string[] = ['opened', 'closed', 'merged']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A string field, or '' — never `String(v)`, which turns `null` into the word "null" on screen. */
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A list of strings, dropping anything that is not one. A person's name is a string or it is not a name. */
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [])

/**
 * One reading, as far as it can be read.
 *
 * Never throws and never refuses. The caller has already decided this row
 * exists; this only decides how much of it is legible.
 */
function readOne(key: string, raw: unknown, shape: (typeof BAGS)[number], merged: ReadonlySet<string>): Reference {
  const o = isObject(raw) ? raw : {}
  const ref = shape.spell(key)
  const state = str(o.state)
  const url = str(o.url)
  /* Author first, then assignees, then reviewers: on a change the author is the
     person somebody scanning is most often looking for, and the list is cut off
     by width long before it is cut off by length. */
  const people = [...names(o.author ? [o.author] : []), ...names(o.assignees), ...names(o.reviewers)]
  return {
    key: `${shape.bag}:${key}`,
    ref,
    kind: shape.kind,
    origin: shape.origin,
    state: STATES.includes(state) ? (state as State) : null,
    stateReason: str(o.stateReason) || null,
    /* Either the reading says so on the row, or it links the issue to a change
       that is merged. Only ever about an issue: a change that merged is
       `merged`, and the facets module reads that off the state. */
    closedByMerge: shape.kind === 'issue' && (o.closedByMerge === true || merged.has(ref)),
    draft: o.draft === true,
    title: str(o.title),
    at: str(o.at),
    /* Only an http(s) address, and only because this string becomes an `href`
       on a page: a `javascript:` URL out of somebody's tracker would be a
       script this app volunteered to run. Anything else reads as no link,
       which is a row you cannot click rather than a row that is gone. */
    url: /^https?:\/\//i.test(url) ? url : null,
    labels: names(o.labels),
    people: [...new Set(people)],
    unreadable: !isObject(raw),
  }
}

/**
 * Every reference in one reading, most recently moved first.
 *
 * `at` is whatever the tracker wrote and is compared as a string, which is
 * correct for the ISO-8601 timestamps every tracker involved emits and is
 * deliberately not made cleverer: `new Date(...)` over an unparseable string
 * gives `NaN`, `NaN` in a comparator gives an inconsistent ordering, and an
 * inconsistent comparator can leave the sort in an order nobody can explain. A
 * string that does not sort is one row in the wrong place; that is a cost this
 * surface can pay, and a dropped row is not.
 *
 * Rows with no readable `at` sort last rather than first: they are the damaged
 * ones, and the top of the list belongs to what just moved.
 */
export function collect(live: unknown): Reference[] {
  if (!isObject(live)) return []
  const out: Reference[] = []
  const merged = linkedMerges(live)
  for (const shape of BAGS) {
    const bag = live[shape.bag]
    if (!isObject(bag)) continue
    for (const [key, raw] of Object.entries(bag)) out.push(readOne(key, raw, shape, merged))
  }
  return out.sort((a, b) => {
    if (!a.at && !b.at) return 0
    if (!a.at) return 1
    if (!b.at) return -1
    return a.at < b.at ? 1 : a.at > b.at ? -1 : 0
  })
}

/**
 * The issues a reading links to a merged change, as refs.
 *
 * ## Why this is read at all, and why only from what the reading carries
 *
 * GitLab records no reason on a closed issue. What it has is the merge request
 * that closed it, and the roadmap's refresher files that as `links` — issue to
 * the merge requests that name it — beside the bags; GitHub's equivalent is
 * `ghLinks`. A closed issue with a merged change under it is the one closed
 * GitLab issue the facets module can call `done` without a person saying so,
 * which is what `Sighting.closedByMerge` is for.
 *
 * Nothing is guessed. A reading `gh` took in this app has no `links` — it asks
 * for none — so every row from it is `false` here and GitHub's `stateReason`
 * does the work instead. A snapshot imported from the roadmap may carry them,
 * and then they count. Keys are taken with or without their sigil (`12` and
 * `#12`), because the refresher keys GitLab's bags by the bare number and
 * GitHub's by the ref as written; a change is merged only if the reading's own
 * bag says so. Anything that is not that shape is ignored rather than read.
 */
function linkedMerges(live: Record<string, unknown>): Set<string> {
  const out = new Set<string>()
  const pairs = [
    {
      links: live.links,
      changes: live.mrs,
      issue: (k: string) => `#${k.replace(/^#/, '')}`,
      change: (n: string) => n.replace(/^!/, ''),
    },
    {
      links: live.ghLinks,
      changes: live.ghPrs,
      issue: (k: string) => (k.startsWith('gh#') ? k : `gh#${k.replace(/^#/, '')}`),
      change: (n: string) => `gh#${n.replace(/^(gh)?#/, '')}`,
    },
  ]
  for (const { links, changes, issue, change } of pairs) {
    if (!isObject(links) || !isObject(changes)) continue
    for (const [key, listed] of Object.entries(links)) {
      if (!Array.isArray(listed)) continue
      const done = listed.some((n) => {
        if (typeof n !== 'number' && typeof n !== 'string') return false
        const id = change(String(n))
        const found = Object.hasOwn(changes, id) ? changes[id] : undefined
        return isObject(found) && found.state === 'merged'
      })
      if (done) out.add(issue(key))
    }
  }
  return out
}

/** When the reading was taken, as the roadmap wrote it, or null if it did not say. */
export function generatedAt(live: unknown): string | null {
  if (!isObject(live)) return null
  const at = str(live.generated)
  return at || null
}
