import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'

import { copyPayload, type Copied } from '@/live/copy.ts'
import { LONG_PRESS_MS, LONG_PRESS_SLOP, MENU_ACTIONS, menuCopy, menuDisabled, menuHasStacks, menuRows, opensMenu, type MenuAction } from '@/live/item-menu.ts'
import type { Reference } from '@/live/reference.ts'

/**
 * The item menu: right-click a row or a card, or press Shift+F10 or the
 * context-menu key on one, or hold it on a touch screen. Copies the item, every
 * row the list shows, or the item's related references (`live/item-menu.ts`).
 *
 * Drawn in the page, because a clipboard write needs the person's press in
 * this frame. A plain `role="menu"`: focus goes to the first item, the arrows,
 * Home and End move, Enter and Space choose, Escape and Tab close and focus
 * goes back to the item. It closes on a press outside it and when focus leaves
 * this page (into another module's frame, which blurs this window).
 */

export interface MenuAt {
  ref: string
  x: number
  y: number
  /** The element focus goes back to when the menu closes. */
  from: HTMLElement | null
}

/** The item a target is in: the nearest `[data-ref]`. */
function itemOf(target: EventTarget | null): HTMLElement | null {
  const element = target as Element | null
  if (!element || typeof element.closest !== 'function') return null
  return element.closest<HTMLElement>('[data-ref]')
}

/**
 * The gestures that open the menu, for the element the rows or cards are in:
 * spread the handlers on it. `menu` is where it is open, or null.
 */
export function useItemMenu() {
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const pressed = useRef(false)
  /* The click a lifted finger sends after a long press opened the menu is not a pick. */
  const swallow = useRef(false)
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  useEffect(() => cancelPress, [])

  const openAt = useCallback((item: HTMLElement, x: number, y: number, from: HTMLElement | null) => {
    const ref = item.dataset.ref
    if (ref) setMenu({ ref, x, y, from })
  }, [])

  const onContextMenu = (event: ReactMouseEvent) => {
    const item = itemOf(event.target)
    if (!item) return
    event.preventDefault()
    /* A long press already opened it; the browser's own contextmenu after it is the same gesture. */
    if (pressed.current) {
      pressed.current = false
      return
    }
    openAt(item, event.clientX, event.clientY, (event.target as HTMLElement).closest('button') ?? item)
  }
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!opensMenu(event)) return
    const item = itemOf(event.target)
    if (!item) return
    event.preventDefault()
    const box = (event.target as HTMLElement).getBoundingClientRect()
    openAt(item, box.left + 8, box.bottom, event.target as HTMLElement)
  }
  const onPointerDown = (event: ReactPointerEvent) => {
    pressed.current = false
    swallow.current = false
    if (event.pointerType !== 'touch') return
    const item = itemOf(event.target)
    if (!item) return
    const target = event.target as HTMLElement
    const { clientX: x, clientY: y } = event
    cancelPress()
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null
        pressed.current = true
        swallow.current = true
        openAt(item, x, y, target.closest('button') ?? item)
      }, LONG_PRESS_MS),
    }
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    const held = press.current
    if (held && Math.hypot(event.clientX - held.x, event.clientY - held.y) > LONG_PRESS_SLOP) cancelPress()
  }
  const onPointerUp = () => cancelPress()
  const onClickCapture = (event: ReactMouseEvent) => {
    if (!swallow.current) return
    swallow.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    menu,
    close: useCallback(() => setMenu(null), []),
    handlers: { onContextMenu, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture },
  }
}

export function ItemMenu({
  at,
  rows,
  shown,
  onClose,
  onCopied,
  stack = false,
  onStack,
  copy = copyPayload,
}: {
  at: MenuAt
  /** The whole reading. */
  rows: readonly Reference[]
  /** What the list shows, in its order. */
  shown: readonly Reference[]
  onClose: () => void
  /** A copy landed (what it took), or the clipboard refused it (null). */
  onCopied: (copied: Copied | null) => void
  /** "With stack": whether the copies take the stacks along (the related copies always do). */
  stack?: boolean
  onStack?: (on: boolean) => void
  /** The clipboard write; a test hands its own. */
  copy?: typeof copyPayload
}) {
  const row = rows.find((one) => one.ref === at.ref) ?? shown.find((one) => one.ref === at.ref)
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState({ left: at.x, top: at.y })

  const close = useCallback(
    (refocus: boolean) => {
      onClose()
      if (refocus && at.from?.isConnected) at.from.focus({ preventScroll: true })
    },
    [onClose, at.from],
  )

  /* Inside the window: a tiny container has little room, so the menu is moved back in from its edges. */
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const width = element.offsetWidth
    const height = element.offsetHeight
    const left = Math.max(0, Math.min(at.x, window.innerWidth - width))
    const top = Math.max(0, Math.min(at.y, window.innerHeight - height))
    setPlace({ left, top })
    element.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true })
  }, [at.x, at.y])

  useEffect(() => {
    const outside = (event: Event) => {
      if (box.current && event.target instanceof Node && box.current.contains(event.target)) return
      close(false)
    }
    /* Focus into another frame on the canvas blurs this window and nothing else says so. */
    const blur = () => close(false)
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', blur)
    }
  }, [close])

  if (!row) return null

  const choose = (action: MenuAction) => {
    const { payload, copied } = menuCopy(action, row, shown, rows, stack)
    close(true)
    void copy(payload).then((ok) => onCopied(ok ? copied : null))
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]') ?? [])]
    const now = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => items[(i + items.length) % items.length]?.focus({ preventScroll: true })
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        go(now + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        go(now < 0 ? items.length - 1 : now - 1)
        break
      case 'Home':
        event.preventDefault()
        go(0)
        break
      case 'End':
        event.preventDefault()
        go(items.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close(true)
        break
      case 'Tab':
        event.preventDefault()
        close(true)
        break
    }
  }

  const groups: MenuAction[][] = [MENU_ACTIONS.slice(0, 2), MENU_ACTIONS.slice(2, 4), MENU_ACTIONS.slice(4, 6)]
  return (
    <div
      ref={box}
      role="menu"
      aria-label={`Copy from ${row.ref}`}
      data-item-menu={row.ref}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: place.left, top: place.top }}
      className="fixed z-50 min-w-[11rem] max-w-[calc(100vw-8px)] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {groups.map((group, g) => (
        <div key={g} role="group" className={g > 0 ? 'mt-1 border-t border-border pt-1' : undefined}>
          {group.map((action) => {
            const count = menuRows(action.scope, row, shown, rows).length
            const disabled = menuDisabled(action.scope, count)
            return (
              <div
                key={action.id}
                role="menuitem"
                tabIndex={-1}
                data-action={action.id}
                aria-disabled={disabled ? 'true' : undefined}
                title={disabled ?? undefined}
                onClick={() => !disabled && choose(action)}
                onKeyDown={(event) => {
                  if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
                  event.preventDefault()
                  choose(action)
                }}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground aria-disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.scope !== 'this' && <span className="font-mono tabular-nums text-muted-foreground">{count}</span>}
              </div>
            )
          })}
        </div>
      ))}
      {onStack && menuHasStacks(row, shown) && (
        <div role="group" className="mt-1 border-t border-border pt-1">
          <div
            role="menuitemcheckbox"
            aria-checked={stack}
            tabIndex={-1}
            data-action="stack"
            title="Add each stack the copied references are in. Copy related always does."
            onClick={() => onStack(!stack)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onStack(!stack)
            }}
            className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
          >
            <span aria-hidden="true" className="flex size-3 shrink-0 items-center justify-center rounded-[3px] border border-border text-[9px] leading-none">
              {stack ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1 truncate">With stack</span>
          </div>
        </div>
      )}
    </div>
  )
}
