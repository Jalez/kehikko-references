import { trackerRowSchema, type TrackerRow } from 'roadmap-module-protocol'

import type { Reference } from './reference.ts'

/**
 * The host's shared tracker reading, turned into rows.
 *
 * ## Where the rows come from now
 *
 * From `tracker.get({ project: true })` — the reading the host keeps for every
 * module standing in a project, GitHub and GitLab together (issue #4). This
 * file used to read four bags out of a reading this app's own server took with
 * `gh`, and so it saw GitHub and nothing else; a GitLab project showed only a
 * hand-imported snapshot nobody could refresh. The rows are the protocol's
 * `TrackerRow` now, specified so that two modules showing one ref read the same
 * fields with the same meanings — see `tracker.ts` in the protocol package.
 *
 * ## The one promise this file keeps
 *
 * **Every row that names a ref becomes exactly one row on screen.** A row that
 * does not parse as a `TrackerRow` — a host a version ahead, a field out of
 * bounds — is not dropped: if it names a ref it is drawn as that ref, marked
 * `unreadable`, with whatever could not be read left as an honest blank. A
 * missing row looks exactly like a row that was never meant to be there, and
 * that is the failure nobody can detect. The one thing that cannot be drawn is
 * an entry with no ref at all, because there is nothing to call it.
 *
 * And each spelling once. The reading answers one row per spelling, so a
 * spelling handed twice is a host repeating itself and the first is kept.
 * Two DIFFERENT spellings of one item — `gh#41` and `gh:owner/repo#41` — are
 * two rows, as the protocol says, because each is what somebody wrote and the
 * scope and the selection look refs up by their spelling.
 *
 * ## A row is a `Sighting`, untranslated
 *
 * `kind`, `state`, `stateReason` and `closedByMerge` are carried across under
 * the same names with the same words, so `sightingOf` in `sift.ts` hands the
 * row straight to the facets module. There is no mapping to get wrong.
 */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A string field, or '' — never `String(v)`, which turns `null` into the word "null" on screen. */
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Only an http(s) address, and only because this string becomes an `href` on
 * a page: a `javascript:` URL out of somebody's tracker would be a script this
 * app volunteered to run. Anything else reads as no link, which is a row you
 * cannot click rather than a row that is gone.
 */
const link = (v: unknown): string | null => {
  const url = str(v)
  return /^https?:\/\//i.test(url) ? url : null
}

/** One row of the reading, as this app draws one. */
function fromRow(row: TrackerRow, merged: ReadonlySet<string>): Reference {
  /* Author first on a change, then assignees: the author is the person
     somebody scanning a list of changes is most often looking for, and the
     list is cut off by width long before it is cut off by length. An issue's
     author is who filed it, which is not who is on it. */
  const people = [...(row.kind === 'change' && row.author ? [row.author] : []), ...row.assignees]
  return {
    key: `${row.tracker}:${row.host}/${row.repo}:${row.kind}:${row.number}:${row.ref}`,
    ref: row.ref,
    kind: row.kind,
    origin: row.tracker,
    state: row.state,
    stateReason: row.stateReason ?? null,
    /* The row's own word when it has one. When it says nothing either way, a
       `closed-by` link to a change this same reading has as merged is the same
       fact read off the other end — never a guess from a title. */
    closedByMerge:
      row.kind === 'issue' &&
      (row.closedByMerge === true ||
        (row.closedByMerge === undefined &&
          row.links.some((one) => one.relation === 'closed-by' && merged.has(one.ref)))),
    draft: row.draft === true,
    title: row.title,
    /* When it last moved, preferring the thing that ended it — merged, then
       closed, then updated — so a pull request merged last year does not sit
       above one whose description was edited this morning. */
    at: row.mergedAt || row.closedAt || row.updatedAt || '',
    url: link(row.url),
    labels: row.labels,
    people: [...new Set(people)],
    unreadable: false,
  }
}

/**
 * A row that named a ref and nothing else this app could trust.
 *
 * Read for what can be read without the schema's say-so — a title, a link —
 * and no state, because a state that could not be read is not `open`.
 */
function unreadableRow(ref: string, raw: Record<string, unknown>): Reference {
  return {
    key: `unreadable:${ref}`,
    ref,
    kind: raw.kind === 'change' ? 'change' : 'issue',
    origin: raw.tracker === 'gitlab' ? 'gitlab' : 'github',
    state: null,
    stateReason: null,
    closedByMerge: false,
    draft: false,
    title: str(raw.title),
    at: str(raw.mergedAt) || str(raw.closedAt) || str(raw.updatedAt),
    url: link(raw.url),
    labels: [],
    people: [],
    unreadable: true,
  }
}

/**
 * Every reference in one reading's `rows`, most recently moved first.
 *
 * `at` is an ISO-8601 instant from the protocol and is compared as a string,
 * which is correct for them and is deliberately not made cleverer: `new
 * Date(...)` over an unparseable string gives `NaN`, and a `NaN` comparator can
 * leave a sort in an order nobody can explain. Rows with no `at` sort last:
 * they are the damaged ones, and the top of the list belongs to what just
 * moved.
 */
export function collect(rows: unknown): Reference[] {
  if (!Array.isArray(rows)) return []
  const parsed = rows.map((raw: unknown) => ({ raw, row: trackerRowSchema.safeParse(raw) }))
  const merged = new Set(
    parsed.flatMap(({ row }) =>
      row.success && row.data.kind === 'change' && row.data.state === 'merged' ? [row.data.ref] : [],
    ),
  )

  const out: Reference[] = []
  const seen = new Set<string>()
  for (const { raw, row } of parsed) {
    const ref = row.success ? row.data.ref : isObject(raw) ? str(raw.ref) : ''
    if (!ref || seen.has(ref)) continue
    seen.add(ref)
    out.push(row.success ? fromRow(row.data, merged) : unreadableRow(ref, raw as Record<string, unknown>))
  }

  return out.sort((a, b) => {
    if (!a.at && !b.at) return 0
    if (!a.at) return 1
    if (!b.at) return -1
    return a.at < b.at ? 1 : a.at > b.at ? -1 : 0
  })
}
