import { Check, ChevronDown, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { copyPayload, idsOfAll, payloadOfAll, type Copyable } from '@/live/copy.ts'

/**
 * Copying the selected references at once: one line each, linked, with their
 * titles (the single row's copy, repeated), or just their ids space-separated.
 *
 * Drawn in the page, never as a header item: a header press reaches this page as
 * a message, and a clipboard write needs the person's own press in this frame.
 */

/** The two things a copy of several rows can be. */
export type CopyKind = 'linked' | 'ids'

/** What to put on the clipboard for `kind`. */
export function payloadFor(kind: CopyKind, rows: Copyable[]) {
  return kind === 'ids' ? idsOfAll(rows) : payloadOfAll(rows)
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

/**
 * The copy itself and what it said: `copied` is how many were copied, for a
 * moment after, or null. One place, so the bar and Cmd+C say the same.
 */
export function useCopyMany(rows: Copyable[]) {
  const [copied, setCopied] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  const copy = useCallback(
    (kind: CopyKind) => {
      if (rows.length === 0) return Promise.resolve(false)
      const count = rows.length
      return copyPayload(payloadFor(kind, rows)).then((ok) => {
        if (!ok) return false
        setCopied(count)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(null), 1500)
        return true
      })
    },
    [rows],
  )
  return { copied, copy }
}

/**
 * "Copy 3 references", and beside it a small menu with the same copy and the
 * ids-only one. Says "Copied 3" for a moment once the clipboard took it.
 */
export function CopyMany({
  count,
  copied,
  onCopy,
}: {
  count: number
  copied: number | null
  onCopy: (kind: CopyKind) => void
}) {
  const [open, setOpen] = useState(false)
  const done = copied !== null
  const item =
    'flex w-full items-center rounded-sm px-2 py-1 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent'
  return (
    <span data-copy-many className="ml-2 flex shrink-0 items-center rounded-sm border border-border bg-background text-[11px] leading-none">
      <button
        type="button"
        onClick={() => onCopy('linked')}
        aria-label={`Copy ${count} references with their links and titles`}
        className="flex h-5 items-center gap-1 px-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
        <span aria-live="polite">
          {done ? (
            `Copied ${copied}`
          ) : (
            <>
              Copy {count}
              <span className="hidden @sm:inline"> references</span>
            </>
          )}
        </span>
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="More ways to copy the selected references"
            className="flex h-5 items-center border-l border-border px-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-1">
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false)
              onCopy('linked')
            }}
          >
            Copy with links and titles
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false)
              onCopy('ids')
            }}
          >
            Copy ids
          </button>
        </PopoverContent>
      </Popover>
    </span>
  )
}
