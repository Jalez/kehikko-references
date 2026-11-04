import { FIT_FROM } from './fit.ts'
import type { Reference } from './reference.ts'

/**
 * The one-up view: in a tiny container, one reference at a time, as a whole
 * card, and a scroll moves to the next card whole. Pure.
 *
 * ## When
 *
 * A list row is 36 pixels, so a container under three rows tall shows two
 * rows and the edge of a third, and none of them says more than its id and a
 * few words. Under {@link ONE_UP_BELOW}`.height` of list height the page draws
 * one card instead, with everything a row hides: the state, the whole title,
 * the stack, CI, the review and the last activity. Also when the list is
 * BOTH narrower than the `tight` fit (`FIT_FROM.narrow`, 240) and shorter than
 * that square: a postage stamp of a container. A tall, narrow list beside a
 * journey stays a list; that is what the tight fit is for.
 *
 * ## In what order
 *
 * Work the person has not seen yet first, newest activity first; then the
 * rest by recent activity; a row with no readable date last. "Seen" is the
 * `Seen` record below, kept per kehikko through `state.set` (`keep.ts`).
 */

/** Below these list sizes, in CSS pixels, the page draws one card at a time. */
export const ONE_UP_BELOW = {
  /** Under three 36-pixel rows tall, whatever the width. */
  height: 108,
  /** Narrower than the tight fit AND shorter than this square. */
  square: FIT_FROM.narrow,
} as const

/** Whether a list this size is drawn one card at a time. An unmeasured list never is. */
export function oneUpFits(width: number | null | undefined, height: number | null | undefined): boolean {
  if (height == null || !Number.isFinite(height) || height <= 0) return false
  if (height < ONE_UP_BELOW.height) return true
  if (width == null || !Number.isFinite(width) || width <= 0) return false
  return width < ONE_UP_BELOW.square && height < ONE_UP_BELOW.square
}

/* ------------------------------------------------------------------------ *
 * Seen
 * ------------------------------------------------------------------------ */

/**
 * What one kehikko has seen: everything that moved at or before `w` (epoch
 * seconds), and each ref in `r` up to the activity it had when its card was
 * on screen. Activity that is the person's own is seen by definition.
 */
export interface Seen {
  w: number
  r: Record<string, number>
}

/** Every kehikko's record, by the kehikko's key. Insertion order is least recently touched first. */
export type SeenBook = Record<string, Seen>

/** How far back a kehikko with no record yet counts work as unseen: three days. */
export const LOOKBACK_SECONDS = 3 * 24 * 60 * 60

/** The key a kehikko's record is written under: its `key`, else its id; `''` with no canvases. */
export function kehikkoKey(kehikko: { id: number; key?: string } | null | undefined): string {
  if (!kehikko) return ''
  return kehikko.key ?? String(kehikko.id)
}

/** When a row last moved, in epoch seconds: its last activity, else its date. Null when neither reads. */
export function movedAt(row: Pick<Reference, 'at' | 'lastActivity'>): number | null {
  const at = Date.parse(row.lastActivity?.at ?? row.at)
  return Number.isNaN(at) ? null : Math.floor(at / 1000)
}

/** A kehikko's record, or a fresh one counting the last {@link LOOKBACK_SECONDS} as unseen. */
export function seenOf(book: SeenBook, key: string, now: number): Seen {
  return book[key] ?? { w: Math.floor(now / 1000) - LOOKBACK_SECONDS, r: {} }
}

/** Whether a row has moved since this kehikko last saw it. The person's own last activity is seen. */
export function isUnseen(row: Pick<Reference, 'ref' | 'at' | 'lastActivity'>, seen: Seen): boolean {
  if (row.lastActivity?.mine === true) return false
  const at = movedAt(row)
  if (at === null) return false
  return at > Math.max(seen.w, seen.r[row.ref] ?? -Infinity)
}

/**
 * The book with this row seen on this kehikko: its activity recorded, entries
 * the watermark already covers dropped, and this kehikko moved to the end
 * (most recently touched). The same book when nothing changes.
 */
export function markSeen(book: SeenBook, key: string, row: Pick<Reference, 'ref' | 'at' | 'lastActivity'>, now: number): SeenBook {
  const seen = seenOf(book, key, now)
  if (!isUnseen(row, seen)) return book
  const at = movedAt(row)!
  const r: Record<string, number> = {}
  for (const [ref, when] of Object.entries(seen.r)) if (when > seen.w && ref !== row.ref) r[ref] = when
  r[row.ref] = at
  const { [key]: _was, ...rest } = book
  return { ...rest, [key]: { w: seen.w, r } }
}

/**
 * The one-up order: unseen first, newest activity first; then the rest the
 * same way; dateless rows last. Nothing is dropped, and ties keep the order
 * the rows came in.
 */
export function oneUpOrder<Row extends Pick<Reference, 'ref' | 'at' | 'lastActivity'>>(rows: readonly Row[], seen: Seen): Row[] {
  const placed = rows.map((row, i) => ({ row, i, unseen: isUnseen(row, seen), at: movedAt(row) }))
  placed.sort((a, b) => {
    if (a.unseen !== b.unseen) return a.unseen ? -1 : 1
    if (a.at === null || b.at === null) return a.at === b.at ? a.i - b.i : a.at === null ? 1 : -1
    return b.at - a.at || a.i - b.i
  })
  return placed.map((one) => one.row)
}

/** Where the card on screen is, as the footer says it: `3 / 12`. */
export function positionSaid(at: number, of: number): string {
  return `${Math.min(Math.max(at, 0), Math.max(of - 1, 0)) + 1} / ${of}`
}

/** The card a key moves to from `at`, or null for a key that does not move. */
export function stepTo(key: string, at: number, of: number): number | null {
  if (of < 1) return null
  const last = of - 1
  switch (key) {
    case 'ArrowDown':
    case 'PageDown':
    case 'j':
      return Math.min(at + 1, last)
    case 'ArrowUp':
    case 'PageUp':
    case 'k':
      return Math.max(at - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return null
  }
}

/* ------------------------------------------------------------------------ *
 * Related
 * ------------------------------------------------------------------------ */

/**
 * Everything this module treats as related to a row, the row first: its whole
 * stack, bottom first, and then what it is tied to (`ties.ts`): the issues a
 * change is part of or closes, the changes that are part of or closed an
 * issue, and the changes that say they close it. Only rows in `rows` (the
 * whole reading, not the narrowed list); each once.
 */
export function relatedOf<Row extends Reference>(row: Row, rows: readonly Row[]): Row[] {
  const byRef = new Map(rows.map((one) => [one.ref, one]))
  const refs = [
    row.ref,
    ...(row.stack?.members.map((m) => m.ref) ?? []),
    ...(row.partOf ?? []),
    ...(row.closes ?? []),
    ...(row.contributions ?? []),
    ...(row.closedBy ?? []),
    ...rows.filter((one) => one.closes?.includes(row.ref) || one.partOf?.includes(row.ref)).map((one) => one.ref),
  ]
  const out: Row[] = []
  for (const ref of new Set(refs)) {
    const one = ref === row.ref ? row : byRef.get(ref)
    if (one) out.push(one)
  }
  return out
}
