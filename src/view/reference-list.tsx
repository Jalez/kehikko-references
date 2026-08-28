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
export function ReferenceList({ rows, landedOn }: { rows: readonly Reference[]; landedOn: string | null }) {
  return (
    <ul className="divide-border">
      {rows.map((row) => (
        <ReferenceRow key={row.key} row={row} landed={row.ref === landedOn} />
      ))}
    </ul>
  )
}
