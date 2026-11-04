import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { cn } from '@/lib/utils'
import { REVIEW_SAID, agoSaid, reviewOf } from '@/live/markers.ts'
import { PIPELINE_WORD } from '@/live/pipeline.ts'
import type { Reference } from '@/live/reference.ts'
import { stackPath } from '@/live/stack.ts'
import { tieSaid } from '@/live/ties.ts'
import { stepTo } from '@/live/one-up.ts'
import { stateSaid } from '@/live/state.ts'
import { StateMark } from './markers.tsx'
import { overview } from './reference-row.tsx'

/**
 * One reference at a time, for a tiny container (`oneUpFits` in
 * `live/one-up.ts`): each card is the whole height of the list, and the list
 * snaps (`scroll-snap-type: y mandatory`), so a wheel, a trackpad, a swipe or
 * an arrow key always lands on a whole card, never between two.
 *
 * The keys are this component's, so they move exactly one card: the arrows,
 * Page Up and Page Down, Home and End, on any card. The card says what a row
 * hides at this size: the state in words, the whole title, where it sits in
 * its stack, CI, the review, the last activity, and "Unseen" when it moved
 * since this kehikko last had it on screen. Never colour alone.
 */

/** The stack position in words: `2/3`, or the branch in a forked stack. */
function stackWord(row: Reference): string | null {
  const place = row.stack
  if (!place) return null
  if (!place.forked) return `Stack ${place.at}/${place.of}`
  return `Forked stack of ${place.of}: ${stackPath(place.members, row.ref).join(' → ')}`
}

/** CI, the review and the last activity, each a short phrase; nothing for what the reading did not carry. */
export function cardFacts(row: Reference, now: number): string[] {
  const facts: string[] = []
  const stack = stackWord(row)
  if (stack) facts.push(stack)
  if (row.kind === 'change' && row.pipeline) facts.push(`CI ${PIPELINE_WORD[row.pipeline.state]}`)
  const review = row.kind === 'change' ? reviewOf(row.reviewers) : null
  if (review) facts.push(REVIEW_SAID[review.word])
  const last = row.lastActivity
  if (last) facts.push(`${last.mine ? 'you' : last.login}, ${agoSaid(last.at, now)}`)
  else if (row.at) facts.push(agoSaid(row.at, now))
  return facts
}

export function OneUp({
  rows,
  unseen,
  selection,
  onPick,
  onAt,
  now,
}: {
  /** In the one-up order. */
  rows: readonly Reference[]
  /** The refs that moved since this kehikko last saw them. */
  unseen: ReadonlySet<string>
  selection: readonly string[]
  onPick: (ref: string) => void
  /** The card on screen changed: its index and ref. */
  onAt: (at: number, ref: string | null) => void
  now?: number
}) {
  const clock = now ?? Date.now()
  const scroller = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  /* The ref on screen, so a new order (a refresh, a filter) keeps the same card in view. */
  const current = useRef<string | null>(null)
  const picked = new Set(selection)

  const cardAt = (i: number) => scroller.current?.querySelectorAll<HTMLElement>('[data-card]')[i] ?? null

  const settle = (i: number) => {
    const ref = rows[i]?.ref ?? null
    current.current = ref
    setAt(i)
    onAt(i, ref)
  }

  const go = (i: number, focus: boolean) => {
    const element = scroller.current
    if (element) element.scrollTo?.({ top: i * element.clientHeight })
    if (focus) cardAt(i)?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    settle(i)
  }

  /* A new list: back on the card that was on screen, or the first. */
  useLayoutEffect(() => {
    const keep = current.current ? rows.findIndex((row) => row.ref === current.current) : -1
    const i = keep >= 0 ? keep : 0
    const element = scroller.current
    if (element) element.scrollTop = i * element.clientHeight
    settle(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  /* A scroll the browser snapped: which card it landed on. */
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = element.clientHeight
        if (height <= 0) return
        const i = Math.min(Math.max(Math.round(element.scrollTop / height), 0), rows.length - 1)
        if (rows[i] && rows[i]!.ref !== current.current) settle(i)
      })
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const next = stepTo(event.key, at, rows.length)
    if (next === null) return
    event.preventDefault()
    go(next, true)
  }

  return (
    <div
      ref={scroller}
      data-one-up
      role="list"
      aria-label="References, one at a time"
      onKeyDown={onKeyDown}
      className="absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {rows.map((row, i) => {
        const facts = cardFacts(row, clock)
        const isNew = unseen.has(row.ref)
        const tie = tieSaid(row)
        return (
          <div
            key={row.key}
            role="listitem"
            data-card
            data-ref={row.ref}
            data-unseen={isNew ? 'true' : 'false'}
            aria-posinset={i + 1}
            aria-setsize={rows.length}
            className="h-full snap-start snap-always overflow-hidden border-b border-border/60"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            <button
              type="button"
              onClick={() => onPick(row.ref)}
              tabIndex={i === at ? 0 : -1}
              title={overview(row, clock)}
              aria-label={`${row.ref}, ${stateSaid(row)}${isNew ? ', unseen' : ''}: ${row.title || 'no title'}`}
              className={cn(
                'flex h-full w-full flex-col gap-0.5 overflow-hidden px-2 py-1 text-left hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring',
                picked.has(row.ref) && 'bg-primary/10 shadow-[inset_2px_0_0_0_var(--primary)]',
              )}
            >
              <span className="flex min-w-0 items-center gap-1 text-xs">
                <StateMark row={row} compact />
                <span className="font-mono tabular-nums text-muted-foreground">{row.ref}</span>
                <span className="truncate text-muted-foreground">{stateSaid(row)}</span>
                {isNew && (
                  <span
                    data-unseen-mark
                    className="ml-auto shrink-0 rounded-sm bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground"
                  >
                    Unseen
                  </span>
                )}
              </span>
              <span className={cn('line-clamp-2 text-sm leading-snug', !row.title && 'italic text-muted-foreground')}>
                {row.title || 'no title in the reading'}
              </span>
              {facts.length > 0 && (
                <span data-card-facts className="truncate text-[11px] text-muted-foreground">
                  {facts.join(' · ')}
                </span>
              )}
              {tie && <span className="truncate text-[11px] text-muted-foreground">{tie}</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
