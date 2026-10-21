import { useState, type ReactNode } from 'react'
import { BellDot, CircleAlert, CircleCheck, Eye, Hourglass, Layers, UserCheck } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { assignedSaid, reviewOf, stackSaid, unaddressed, type ReviewWord } from '@/live/markers.ts'
import type { Reference } from '@/live/reference.ts'

/**
 * A row's markers, drawn at every width beside the pressable box (issues #23
 * and #25). The sentences are `live/markers.ts`'s; this file only draws them.
 *
 * Each marker is its own focusable element with its own `aria-label`, and
 * its shadcn tooltip opens on keyboard focus as well as on hover, so a person
 * who cannot point reads the same sentence somebody hovering does. They sit
 * OUTSIDE the row's button because a focusable thing inside a button is not
 * reachable at all, and because the stack marker is a button of its own.
 *
 * Never colour alone: every state has its own shape — an hourglass for a
 * review asked and not started, an eye for one under way, a ring with a tick
 * for approved, a ring with a bang for changes requested — and its words in
 * the label. Colour is only the second telling.
 *
 * The cluster carries `title=""` so the row's own whole-row `title` does not
 * pop up over a marker's tooltip and say everything again at once.
 */

const MARK = 'inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'

/** A marker that only explains itself: focusable, labelled, with the label's sentence as its tooltip. */
function Mark({ name, said, label, children, className }: { name: string; said: string; label: string; children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-marker={name} role="img" tabIndex={0} aria-label={label} className={cn(MARK, className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{said}</TooltipContent>
    </Tooltip>
  )
}

const REVIEW_ICON: Record<ReviewWord, ReactNode> = {
  asked: <Hourglass className="size-3.5" aria-hidden="true" />,
  reviewing: <Eye className="size-3.5" aria-hidden="true" />,
  changes: <CircleAlert className="size-3.5" aria-hidden="true" />,
  approved: <CircleCheck className="size-3.5" aria-hidden="true" />,
}

/**
 * The stack: `⧉ 2/3`, the whole stack bottom first in its tooltip, and a press
 * opens the same list as buttons — pressing one selects that change, as
 * pressing its row would. A tooltip cannot hold buttons, which is why the
 * press opens a popover rather than the tooltip being made clickable.
 */
function StackMark({ row, onPick }: { row: Reference; onPick: (ref: string) => void }) {
  const [open, setOpen] = useState(false)
  const place = row.stack!
  const said = stackSaid(place, row.ref)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-marker="stack"
              aria-label={`Stacked: ${place.at} of ${place.of}. Show the stack`}
              className={cn(MARK, 'w-auto gap-0.5 px-1 font-mono text-[11px] tabular-nums @sm/frame:min-w-11')}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              {place.at}/{place.of}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{said}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-1">
        <p className="px-2 py-1 text-xs text-muted-foreground">Stack, bottom first</p>
        <ol aria-label={`The stack ${row.ref} is in, bottom first`}>
          {place.members.map((m, i) => (
            <li key={m.ref}>
              <button
                type="button"
                data-stack-member={m.ref}
                aria-current={m.ref === row.ref ? 'true' : undefined}
                onClick={() => {
                  onPick(m.ref)
                  setOpen(false)
                }}
                style={{ paddingLeft: `${0.5 + m.depth * 0.75}rem` }}
                className={cn(
                  'flex w-full items-baseline gap-2 rounded py-1 pr-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                  m.ref === row.ref && 'font-medium',
                )}
              >
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="font-mono text-xs">{m.ref}</span>
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                {m.ref === row.ref && <span className="text-xs text-muted-foreground">this one</span>}
              </button>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The cluster, and an empty slot where a marker is not. From 24rem of the frame
 * every row's cluster is one width, so the pressable box beside it is too, and
 * the date, role and people columns inside it line up down the list. Below
 * that the slots are not drawn: the cluster is only as wide as what it says,
 * which is what lets a narrow row keep its identifier and state on one line.
 */
const CLUSTER = 'ml-auto flex shrink-0 items-center justify-end gap-0.5'
const SLOT = {
  stack: <span aria-hidden="true" className="hidden w-11 @sm/frame:block" />,
  mark: <span aria-hidden="true" className="hidden size-6 @sm/frame:block" />,
}
const SLOTS = (
  <>
    {SLOT.stack}
    {SLOT.mark}
    {SLOT.mark}
    {SLOT.mark}
  </>
)

export function Markers({ row, now, onPick }: { row: Reference; now: number; onPick: (ref: string) => void }) {
  const assigned = assignedSaid(row)
  const review = row.kind === 'change' ? reviewOf(row.reviewers) : null
  const last = unaddressed(row, now)
  if (!row.stack && !assigned && !review && !last) return <span data-markers className={cn(CLUSTER, 'hidden @sm/frame:flex')}>{SLOTS}</span>
  return (
    <span data-markers title="" className={CLUSTER}>
      {row.stack ? <StackMark row={row} onPick={onPick} /> : SLOT.stack}
      {assigned ? (
        <Mark name="assigned" said={assigned} label={assigned}>
          <UserCheck className="size-3.5" aria-hidden="true" />
        </Mark>
      ) : SLOT.mark}
      {review ? (
        <Mark
          name={`review-${review.word}`}
          said={review.said}
          label={review.said}
          className={cn(review.word === 'approved' && 'text-emerald-700 dark:text-emerald-400', review.word === 'changes' && 'text-amber-700 dark:text-amber-400')}
        >
          {REVIEW_ICON[review.word]}
        </Mark>
      ) : SLOT.mark}
      {last ? (
        <Mark name="unaddressed" said={last} label={`Unaddressed activity. ${last}`} className="text-foreground">
          <BellDot className="size-3.5" aria-hidden="true" />
        </Mark>
      ) : SLOT.mark}
    </span>
  )
}
