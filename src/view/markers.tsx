import { useState, type ReactNode } from 'react'
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleQuestionMark,
  CircleSlash,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Layers,
  LoaderCircle,
  BellDot,
} from 'lucide-react'
import type { AddressOpenResult, PipelineState } from 'kehikot-module-protocol'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { assignedSaid, reviewOf, stackSaid, unaddressed } from '@/live/markers.ts'
import { stateLook, stateSaid, type StateLook } from '@/live/state.ts'
import type { Reference } from '@/live/reference.ts'
import { handLink, handsLink } from '@/live/links.ts'
import { pipelineSaid, type Pipeline } from '@/live/pipeline.ts'
import { Faces } from './faces.tsx'
import { openOutside } from '@/live/links.ts'

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
 * Who is assigned and who reviews are drawn as their faces (protocol 2.10.0;
 * `faces.tsx`): tiny round avatars, overlapping, `+N` past three, initials
 * where there is no picture. The marker's tooltip and label name every one
 * of them and, for reviewers, where each stands.
 *
 * Never colour alone: every reviewer's state has its own shape, a badge on
 * their face — an hourglass for a review asked and not started, an eye for
 * one under way, a ring with a tick for approved, a ring with a bang for
 * changes requested — and its words in the label. Colour is only the second
 * telling.
 *
 * The cluster carries `title=""` so the row's own whole-row `title` does not
 * pop up over a marker's tooltip and say everything again at once.
 */

const MARK = 'inline-flex h-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'

/** A marker that only explains itself: focusable, labelled, with the label's sentence as its tooltip. */
function Mark({ name, said, label, children, className = 'w-6' }: { name: string; said: string; label: string; children: ReactNode; className?: string }) {
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

/**
 * A marker drawing faces: as wide as they are under 24rem of the frame, and from
 * there the width its column has in this list (`facesColumns`, set on the list
 * as `--faces-assigned` and `--faces-review`), so the columns stay aligned.
 * Outside a list, room for three faces and a `+N`.
 */
const FACES_MARK = {
  assigned: 'w-auto px-0.5 @sm/frame:w-[var(--faces-assigned,56px)]',
  review: 'w-auto px-0.5 @sm/frame:w-[var(--faces-review,56px)]',
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
 * A change's pipeline (issue #38): a small round mark beside the faces, its
 * shape saying the state and its colour saying it again — never colour alone.
 * Running is a partial ring that turns, passed a tick, failed a cross, pending
 * a hollow dashed ring, canceled a slash, skipped and manual a dash. The
 * tooltip and the label say the word and, where the reading gave one, how long
 * ago it moved.
 *
 * With a link in the reading the mark is a link: a press hands the address to
 * the canvas (a module that shows pages takes it), and a new tab is the
 * fallback. Without one it only explains itself. No pipeline, no mark.
 */
const PIPELINE_LOOK: Record<PipelineState, { icon: ReactNode; tone: string }> = {
  running: { icon: <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />, tone: 'text-sky-700 dark:text-sky-400' },
  success: { icon: <CircleCheck className="size-3.5" aria-hidden="true" />, tone: 'text-emerald-700 dark:text-emerald-400' },
  failed: { icon: <CircleX className="size-3.5" aria-hidden="true" />, tone: 'text-red-700 dark:text-red-400' },
  pending: { icon: <CircleDashed className="size-3.5" aria-hidden="true" />, tone: 'text-amber-700 dark:text-amber-400' },
  canceled: { icon: <CircleSlash className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
  skipped: { icon: <CircleMinus className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
  manual: { icon: <CircleMinus className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
}

export function PipelineMark({
  pipeline,
  now,
  onOpenLink,
}: {
  pipeline: Pipeline
  now: number
  onOpenLink?: ((url: string) => Promise<AddressOpenResult | null>) | null
}) {
  const said = pipelineSaid(pipeline, now)
  const look = PIPELINE_LOOK[pipeline.state]
  const url = pipeline.url
  if (!url) {
    return (
      <Mark name={`pipeline-${pipeline.state}`} said={said} label={said} className={cn('w-6', look.tone)}>
        {look.icon}
      </Mark>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          data-marker={`pipeline-${pipeline.state}`}
          aria-label={`${said}. Open the pipeline`}
          onClick={(event) => {
            /* Handed to the canvas (`address.open`) when the host answers it; otherwise followed. */
            if (!onOpenLink || !handsLink(url, true)) return
            event.preventDefault()
            void handLink(url, onOpenLink)
          }}
          className={cn(MARK, 'w-6', look.tone)}
        >
          {look.icon}
        </a>
      </TooltipTrigger>
      <TooltipContent>{said}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The row's state as a small coloured glyph beside the pipeline mark, the same
 * size and box, so the two read as a pair: where the work stands, and where its
 * pipeline does. Every state has its own glyph and the colour only says it again
 * (never colour alone); the words — "Merge request · open", "Issue · closed by
 * !4019" — are its tooltip, on hover and on focus, and its `aria-label`. A state
 * the reading did not carry is a dashed question, never drawn as open.
 */
const STATE_LOOK: Record<StateLook, { icon: ReactNode; tone: string }> = {
  'change-open': { icon: <GitPullRequest className="size-3.5" aria-hidden="true" />, tone: 'text-emerald-700 dark:text-emerald-400' },
  'change-draft': { icon: <GitPullRequestDraft className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
  'change-merged': { icon: <GitMerge className="size-3.5" aria-hidden="true" />, tone: 'text-violet-700 dark:text-violet-400' },
  'change-closed': { icon: <GitPullRequestClosed className="size-3.5" aria-hidden="true" />, tone: 'text-red-700 dark:text-red-400' },
  'issue-open': { icon: <CircleDot className="size-3.5" aria-hidden="true" />, tone: 'text-emerald-700 dark:text-emerald-400' },
  'issue-done': { icon: <CircleCheck className="size-3.5" aria-hidden="true" />, tone: 'text-violet-700 dark:text-violet-400' },
  'issue-closed': { icon: <CircleCheck className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
  'issue-not-planned': { icon: <CircleSlash className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
  unseen: { icon: <CircleQuestionMark className="size-3.5" aria-hidden="true" />, tone: 'text-muted-foreground' },
}

export function StateMark({ row }: { row: Reference }) {
  const look = stateLook(row)
  const said = stateSaid(row)
  return (
    <Mark name={`state-${look}`} said={said} label={said} className={cn('w-6', STATE_LOOK[look].tone)}>
      {STATE_LOOK[look].icon}
    </Mark>
  )
}

/**
 * The last activity, when it was somebody else's (`unaddressed`): the bell, its
 * sentence as tooltip and label, and a press opens the reference in the
 * person's own browser (`openOutside`), where that activity is. Never handed to
 * the canvas.
 */
export function ActivityMark({ last, url }: { last: string; url: string | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-marker="unaddressed"
          aria-label={`Unaddressed activity. ${last}. See it in your browser`}
          disabled={!url}
          onClick={(event) => {
            event.stopPropagation()
            openOutside(url)
          }}
          className={cn(MARK, 'w-6 text-foreground')}
        >
          <BellDot className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{last}</TooltipContent>
    </Tooltip>
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
  assigned: <span aria-hidden="true" data-slot="assigned" className="hidden h-6 w-[var(--faces-assigned,56px)] @sm/frame:block" />,
  review: <span aria-hidden="true" data-slot="review" className="hidden h-6 w-[var(--faces-review,56px)] @sm/frame:block" />,
  pipeline: <span aria-hidden="true" data-slot="pipeline" className="hidden size-6 @sm/frame:block" />,
  mark: <span aria-hidden="true" data-slot="activity" className="hidden size-6 @sm/frame:block" />,
}

export function Markers({
  row,
  now,
  onPick,
  onOpenLink,
}: {
  row: Reference
  now: number
  onPick: (ref: string) => void
  /** Hand a link to the canvas (`address.open`), or null to follow it in a new tab. */
  onOpenLink?: ((url: string) => Promise<AddressOpenResult | null>) | null
}) {
  const assigned = assignedSaid(row)
  const review = row.kind === 'change' ? reviewOf(row.reviewers) : null
  const pipeline = row.kind === 'change' ? row.pipeline : undefined
  const last = unaddressed(row, now)
  return (
    <span data-markers title="" className={CLUSTER}>
      {row.stack ? <StackMark row={row} onPick={onPick} /> : SLOT.stack}
      {assigned ? (
        <Mark name="assigned" said={assigned} label={assigned} className={FACES_MARK.assigned}>
          <Faces faces={row.assignedFaces} />
        </Mark>
      ) : SLOT.assigned}
      {review ? (
        <Mark name={`review-${review.word}`} said={review.said} label={review.said} className={FACES_MARK.review}>
          <Faces faces={row.reviewerFaces ?? []} />
        </Mark>
      ) : SLOT.review}
      <StateMark row={row} />
      {pipeline ? <PipelineMark pipeline={pipeline} now={now} onOpenLink={onOpenLink ?? null} /> : SLOT.pipeline}
      {last ? <ActivityMark last={last} url={row.url ?? null} /> : SLOT.mark}
    </span>
  )
}
