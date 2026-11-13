import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { AddressOpenResult } from 'kehikot-module-protocol'

import { facesColumns } from '@/live/faces.ts'
import { rowFit, type RowFit } from '@/live/fit.ts'
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
  onOpenLink,
  width,
  fresh,
  onSeen,
}: {
  /** The refs somebody else acted on since this kehikko last saw them (`live/activity.ts`). */
  fresh?: ReadonlySet<string>
  /** A row's bell was pressed: its activity is seen. */
  onSeen?: (ref: string) => void
  rows: readonly Reference[]
  /** The list's width in CSS pixels, when the caller knows it (a test); otherwise measured here. */
  width?: number
  landedOn: string | null
  /**
   * The canvas's selection, as refs, straight from `kehikot.context`.
   *
   * A `Set` is built once here rather than an `includes` per row: a selection
   * of forty against four hundred rows is sixteen thousand string comparisons
   * on every render, and this component renders on every keystroke in the
   * filter. It is also the reason this arrives as an array and not as a `Set` —
   * the array is what the wire carries and what a test can write down.
   *
   * Membership is by `ref` and not by `key`, and that is the protocol's choice
   * rather than this file's: a selection travels as refs, and two rows that
   * spell themselves the same would tick together. That is the honest
   * rendering of a selection that genuinely cannot tell them apart, and it is
   * better than picking one of the two arbitrarily.
   */
  selection: readonly string[]
  onPick: (ref: string) => void
  onToggle: (ref: string) => void
  /** Hand a marker's link (a pipeline) to the canvas (`address.open`), or null to follow it in a new tab. The row's own open icon never uses it. */
  onOpenLink?: ((url: string) => Promise<AddressOpenResult | null>) | null
}) {
  const picked = new Set(selection)
  /* How tightly the rows are drawn comes from this list's own width, never the
     window's: a container is resized by dragging its corner on the canvas
     (`live/fit.ts`). Measured before paint, so a narrow list never flashes wide. */
  const list = useRef<HTMLUListElement>(null)
  /* The fit, not the width, is held: dragging a corner re-renders the rows only when a threshold is crossed. */
  const [measured, setMeasured] = useState<RowFit>('wide')
  useLayoutEffect(() => {
    const element = list.current
    const Observer = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (width !== undefined || !element || !Observer) return
    const observer = new Observer((entries) => {
      const box = entries[entries.length - 1]?.contentRect
      if (box) setMeasured(rowFit(box.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [width])
  const fit = width !== undefined ? rowFit(width) : measured
  /* The faces columns are as wide as this list needs (`facesColumns`), set
     once here and read by every row's markers and empty slots. */
  const columns = facesColumns(rows)
  const widths = { '--faces-assigned': `${columns.assigned}px`, '--faces-review': `${columns.review}px` } as CSSProperties
  return (
    <div role="table" aria-label="Issues and pull requests" aria-rowcount={rows.length + 1}>
    {/* The column names, for a screen reader: a table says what each cell is. */}
    <div role="rowgroup" className="sr-only">
      <div role="row">
        <span role="columnheader">Selected</span>
        <span role="columnheader">Reference</span>
        <span role="columnheader">Relation</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Copy</span>
      </div>
    </div>
    <ul role="rowgroup" ref={list} data-fit={fit} className="divide-border" style={widths}>
      {rows.map((row) => (
        <ReferenceRow
          key={row.key}
          row={row}
          landed={row.ref === landedOn}
          selected={picked.has(row.ref)}
          onPick={onPick}
          onToggle={onToggle}
          onOpenLink={onOpenLink ?? null}
          fit={fit}
          fresh={fresh?.has(row.ref) ?? false}
          onSeen={onSeen}
        />
      ))}
    </ul>
    </div>
  )
}
