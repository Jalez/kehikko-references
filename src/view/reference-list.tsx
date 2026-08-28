import type { Reference } from '@/live/reference.ts'
import { ReferenceRow } from './reference-row.tsx'

/**
 * Every row it was given, in the order it was given them.
 *
 * That sentence is the whole component and it is deliberately not more than
 * that. There is no windowing, no page size, no "load more", no cap on the
 * number drawn — because each of those is a way for a reference to be absent
 * from a list that looks complete, and that is the one failure this surface
 * promises not to have. A slow list is a complaint; a list missing a row is a
 * decision made on bad information.
 *
 * What keeps it fast at four hundred rows is in `reference-row.tsx`: the
 * browser's own `content-visibility`, which skips the work for rows nobody can
 * see while leaving every one of them in the document. Measurements are in this
 * module's README.
 */
export function ReferenceList({
  rows,
  landedOn,
  selection,
  onPick,
  onToggle,
}: {
  rows: readonly Reference[]
  landedOn: string | null
  /**
   * The canvas's selection, as refs, straight from `roadmap.context`.
   *
   * A `Set` is built once here rather than an `includes` per row: a selection
   * of forty against four hundred rows is sixteen thousand string comparisons
   * on every render, and this component renders on every keystroke in the
   * filter. It is also the reason this arrives as an array and not as a `Set` —
   * the array is what the wire carries and what a test can write down.
   *
   * Membership is by `ref` and not by `key`, and that is the protocol's choice
   * rather than this file's: a selection travels as refs, and `gh#41` filed
   * under both `ghIssues` and `ghPrs` is two rows that tick together. That is
   * the honest rendering of a selection that genuinely cannot tell them apart,
   * and it is better than picking one of the two arbitrarily.
   */
  selection: readonly string[]
  onPick: (ref: string) => void
  onToggle: (ref: string) => void
}) {
  const picked = new Set(selection)
  return (
    <ul className="divide-border">
      {rows.map((row) => (
        <ReferenceRow
          key={row.key}
          row={row}
          landed={row.ref === landedOn}
          selected={picked.has(row.ref)}
          onPick={onPick}
          onToggle={onToggle}
        />
      ))}
    </ul>
  )
}
