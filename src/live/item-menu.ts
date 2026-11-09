import { stacksOf } from './stack.ts'
import { idsOfAll, payloadOfAll, type Copied, type Payload } from './copy.ts'
import { relatedOf } from './one-up.ts'
import type { Reference } from './reference.ts'

/**
 * What the item menu (right-click, Shift+F10, the context-menu key, or a long
 * press on a row or card) copies. Pure: `view/item-menu.tsx` draws it.
 *
 * Three scopes, each as a linked copy (the titles, linked) or as ids only, and
 * with the stacks the rows are in only when the person turned "With stack" on:
 *
 * - **this**: the item;
 * - **filtered**: every row the current filters and scope show, in the order shown;
 * - **related**: the item's whole stack and what it is tied to (`relatedOf`),
 *   each stack whole, so nothing in it is "(not selected)".
 */

export type MenuScope = 'this' | 'filtered' | 'related'
export type MenuKind = 'linked' | 'ids'

export interface MenuAction {
  id: string
  scope: MenuScope
  kind: MenuKind
  label: string
}

export const MENU_ACTIONS: readonly MenuAction[] = [
  { id: 'this-linked', scope: 'this', kind: 'linked', label: 'Copy this (with link)' },
  { id: 'this-ids', scope: 'this', kind: 'ids', label: 'Copy this id' },
  { id: 'filtered-linked', scope: 'filtered', kind: 'linked', label: 'Copy all filtered (with links)' },
  { id: 'filtered-ids', scope: 'filtered', kind: 'ids', label: 'Copy all filtered ids' },
  { id: 'related-linked', scope: 'related', kind: 'linked', label: 'Copy related (with links)' },
  { id: 'related-ids', scope: 'related', kind: 'ids', label: 'Copy related ids' },
]

/** The rows a scope copies, for the item `row`: `shown` is the narrowed list, `rows` the whole reading. */
export function menuRows<Row extends Reference>(scope: MenuScope, row: Row, shown: readonly Row[], rows: readonly Row[]): Row[] {
  if (scope === 'this') return [row]
  if (scope === 'filtered') return [...shown]
  return relatedOf(row, rows)
}

/** Why an action cannot run, or null when it can. */
export function menuDisabled(scope: MenuScope, count: number): string | null {
  if (scope === 'related' && count < 2) return 'Nothing in the reading is related to this one.'
  if (scope === 'filtered' && count < 1) return 'The list shows nothing.'
  return null
}

/** What an action puts on the clipboard, and what the footer says it took. */
export function menuCopy(
  action: Pick<MenuAction, 'scope' | 'kind'>,
  row: Reference,
  shown: readonly Reference[],
  rows: readonly Reference[],
  stack = false,
): { payload: Payload; copied: Copied } {
  const picked = menuRows(action.scope, row, shown, rows)
  const options = { whole: action.scope === 'related', stack }
  const payload = action.kind === 'ids' ? idsOfAll(picked, options) : payloadOfAll(picked, options)
  const stacks = options.whole || stack ? stacksOf(picked).length : 0
  return { payload, copied: { count: picked.length, stacks, plain: payload.plain } }
}

/** Whether a keydown opens the item menu: Shift+F10, or the context-menu key. */
export function opensMenu(event: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (event.key === 'ContextMenu') return true
  return event.key === 'F10' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
}

/** How long a touch is held before it opens the menu, and how far it may drift. */
export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP = 10

/** Whether "With stack" means anything for what the menu can copy: the item or something shown is in a stack. */
export function menuHasStacks(row: Reference, shown: readonly Reference[]): boolean {
  return stacksOf([row, ...shown]).length > 0
}
