/**
 * How tightly a row is drawn, from the width of the list it is in. Pure.
 *
 * A module's width is its container's, which a person changes by dragging a
 * corner on the canvas: the window never resizes, so this is measured on the
 * list itself (`reference-list.tsx`), never on the viewport.
 *
 * What never goes, at any width: the identifier, the state and the title. The
 * title is truncated with the row's tooltip saying all of it, rather than
 * dropped; under 24rem it used to be dropped, which left a narrow list a column
 * of numbers nobody could read without hovering each.
 *
 * What gives way, in order, as the list narrows:
 *
 * - **Gaps and padding** first: under 20rem the row's insides lose the slack
 *   between the checkbox, the identifier and the title, and the markers sit
 *   edge to edge in 20-pixel boxes instead of 24.
 * - **Faces** next: three faces and `+N` from 20rem, two under that, one under
 *   15rem, each overlapping the next further so only part of each shows. The
 *   `+N` always says how many more, and the marker's label names everyone.
 * - **The state and pipeline glyphs** overlap their boxes under 20rem, read as
 *   one pair; each is still its own focusable mark, and each glyph whole.
 *
 * From 24rem the row is laid out by the CSS container queries on the frame as
 * before (fixed columns, the copy button), and this says `wide`. An unmeasured
 * list (no `ResizeObserver`, the first render) is `wide` too: the CSS still
 * folds a narrow one, only less tightly.
 */

export type RowFit = 'tight' | 'narrow' | 'snug' | 'wide'

/** The widths, in CSS pixels of the list, at which each fit starts. */
export const FIT_FROM = { narrow: 240, snug: 320, wide: 384 } as const

export function rowFit(width: number | null | undefined): RowFit {
  if (width === null || width === undefined || !Number.isFinite(width) || width <= 0) return 'wide'
  if (width < FIT_FROM.narrow) return 'tight'
  if (width < FIT_FROM.snug) return 'narrow'
  if (width < FIT_FROM.wide) return 'snug'
  return 'wide'
}

/** What a row draws at a fit: the pieces the components read. */
export interface FitLook {
  /** Faces a marker draws before `+N`. */
  faces: number
  /** Whether the edges of the faces overlap further, so only part of each shows. */
  facesTight: boolean
  /** Marker boxes 20 pixels, edge to edge, the state and pipeline overlapping. */
  compactMarks: boolean
  /** The row's insides without the slack between checkbox, identifier and title. */
  compactRow: boolean
}

export function fitLook(fit: RowFit): FitLook {
  switch (fit) {
    case 'tight':
      return { faces: 1, facesTight: true, compactMarks: true, compactRow: true }
    case 'narrow':
      return { faces: 2, facesTight: true, compactMarks: true, compactRow: true }
    case 'snug':
      return { faces: 3, facesTight: false, compactMarks: false, compactRow: true }
    default:
      return { faces: 3, facesTight: false, compactMarks: false, compactRow: false }
  }
}
