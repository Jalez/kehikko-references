import type { TrackerRow } from 'kehikot-module-protocol'

/**
 * Work that is PART of an issue, as opposed to work that closes it (protocol
 * 2.26.0, `contributes` and `contributedBy`).
 *
 * A merge request that says "Part of #3912" delivers a piece of #3912 and
 * leaves it open. Before 2.26.0 a host had only `closes` for that, so the
 * issue read as done when the merge request merged; now the tie is in two
 * fields of its own, never in `links`, and it never makes an issue closed,
 * `closedByMerge` or `closed-by`. This file only reads the tie. Nothing here
 * is consulted by anything that counts done: `closedByMerge` in `collect.ts`
 * reads `closed-by` links and nothing else, and the `closed:*` facets read
 * the row's own state.
 *
 * ## Both ends, read together
 *
 * The change says what it is part of (`contributes`); the issue says which
 * changes are part of it (`contributedBy`). A host fills both, but a reading
 * is a set of rows read at moments, so each end is made from both: a change
 * is part of every issue its own `contributes` names and every issue whose
 * `contributedBy` names it. Exact strings, as everywhere in this module.
 *
 * A ref the change also `closes` is not a contribution — the protocol says a
 * host never repeats it, and this keeps it so if one did: closing wins.
 *
 * An older host sends neither field, and then nothing here says anything.
 */

/** What one row is tied to: the issues a change is part of, the changes that are part of an issue. */
export interface Ties {
  partOf: string[]
  contributions: string[]
}

/** Every row's ties, by ref, worked out over the whole reading. Rows with none are not in the map. */
export function tiesOf(rows: readonly TrackerRow[]): Map<string, Ties> {
  const partOf = new Map<string, Set<string>>()
  const contributions = new Map<string, Set<string>>()
  const closes = new Map(rows.map((row) => [row.ref, new Set(row.links.map((one) => one.ref))]))
  const tie = (change: string, issue: string) => {
    if (!change || !issue || change === issue) return
    /* Closing wins: a ref linked either way between the two is not "part of". */
    if (closes.get(change)?.has(issue) || closes.get(issue)?.has(change)) return
    if (!partOf.has(change)) partOf.set(change, new Set())
    partOf.get(change)!.add(issue)
    if (!contributions.has(issue)) contributions.set(issue, new Set())
    contributions.get(issue)!.add(change)
  }
  for (const row of rows) {
    if (row.kind === 'change') for (const issue of row.contributes ?? []) tie(row.ref, issue)
    if (row.kind === 'issue') for (const change of row.contributedBy ?? []) tie(change, row.ref)
  }
  const out = new Map<string, Ties>()
  for (const row of rows) {
    const up = row.kind === 'change' ? [...(partOf.get(row.ref) ?? [])] : []
    const down = row.kind === 'issue' ? [...(contributions.get(row.ref) ?? [])] : []
    if (up.length || down.length) out.set(row.ref, { partOf: up, contributions: down })
  }
  return out
}

/**
 * What "This epic" reaches: the refs the epic names, and every change on the
 * list that is part of one of them — so `!3907`, "Part of #3912", is shown
 * with `#3912` rather than looking missing. Only that way round: an epic that
 * names a change does not take in the issue the change is part of.
 *
 * The same array back when nothing is added, so a reading with no ties (an
 * older host) leaves the scope exactly as it was.
 */
export function withContributions(
  named: readonly string[],
  rows: readonly { ref: string; partOf?: readonly string[] }[],
): readonly string[] {
  const here = new Set(named)
  const added = rows.filter((row) => !here.has(row.ref) && row.partOf?.some((issue) => here.has(issue)))
  if (!added.length) return named
  return [...named, ...new Set(added.map((row) => row.ref))]
}

/** The tie in words, for the row: `part of #3912` on a change, `has contributions from !3907` on an issue. */
export function tieSaid(row: { partOf?: readonly string[]; contributions?: readonly string[] }): string {
  const said: string[] = []
  if (row.partOf?.length) said.push(`part of ${row.partOf.join(', ')}`)
  if (row.contributions?.length) said.push(`has contributions from ${row.contributions.join(', ')}`)
  return said.join('; ')
}
