import { useCallback, useEffect, useRef, useState } from 'react'

import { copyPayload, idsOfAll, payloadOfAll, type Copied, type Copyable, type CopyOptions } from '@/live/copy.ts'
import { stacksOf } from '@/live/stack.ts'

/**
 * Copying the selected references at once: one line each, linked, with their
 * titles (the single row's copy, repeated), or just their ids space-separated.
 * The selection menu (`selection-menu.tsx`) and Cmd+C both use what is here.
 *
 * Drawn in the page, never as a header item: a header press reaches this page as
 * a message, and a clipboard write needs the person's own press in this frame.
 */

/** The two things a copy of several rows can be. */
export type CopyKind = 'linked' | 'ids'

/** What to put on the clipboard for `kind`. */
export function payloadFor(kind: CopyKind, rows: Copyable[], options: CopyOptions = {}) {
  return kind === 'ids' ? idsOfAll(rows, options) : payloadOfAll(rows, options)
}

/** The parts of a keydown this rule reads; a real `KeyboardEvent` is one. */
export interface CopyKey {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  defaultPrevented: boolean
  target: EventTarget | null
}

/**
 * Whether Cmd+C (Ctrl+C) copies the selected rows instead of doing what it would.
 *
 * Only when nothing else wants the key: no text is selected (then the person is
 * copying that text), focus is not in a field, and focus is in the list or on
 * nothing in particular (the page's body: WebKit does not focus a button on a
 * mouse click, so after clicking a row focus is the body).
 */
export function takesCopyKey(event: CopyKey, list: Element | null, textSelected: boolean): boolean {
  if (event.defaultPrevented || textSelected) return false
  if (event.key.toLowerCase() !== 'c' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  const target = event.target
  if (!target || typeof (target as Element).closest !== 'function') return false
  const element = target as Element
  if (element.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false
  return element === element.ownerDocument.body || (list !== null && list.contains(element))
}

/** What a copy of `rows` as `kind` takes: how many, how many stacks came along, and the text. */
export function copiedOf(kind: CopyKind, rows: Copyable[], options: CopyOptions = {}): Copied {
  return { count: rows.length, stacks: stacksOf(rows).length, plain: payloadFor(kind, rows, options).plain }
}

/**
 * The copy itself and what it said: `copied` is what was copied — how many,
 * how many stacks came along, and the text — for a few seconds after, or null.
 * One place, so the bar, the footer and Cmd+C say the same.
 */
export function useCopyMany(rows: Copyable[]) {
  const [copied, setCopied] = useState<Copied | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  const say = useCallback((what: Copied) => {
    setCopied(what)
    if (timer.current) clearTimeout(timer.current)
    /* Long enough to read what came along, short enough not to linger over the next selection. */
    timer.current = setTimeout(() => setCopied(null), what.stacks > 0 ? 4000 : 1500)
  }, [])
  const copy = useCallback(
    (kind: CopyKind) => {
      if (rows.length === 0) return Promise.resolve(false)
      const what = copiedOf(kind, rows)
      return copyPayload(payloadFor(kind, rows)).then((ok) => {
        if (!ok) return false
        say(what)
        return true
      })
    },
    [rows, say],
  )
  /* The host wrote the clipboard itself, in the person's click (protocol 2.40.0): say it was copied, as a copy here would. */
  const noteCopied = useCallback(
    (kind: CopyKind = 'linked') => {
      if (rows.length === 0) return
      say(copiedOf(kind, rows))
    },
    [rows, say],
  )
  return { copied, copy, noteCopied }
}
