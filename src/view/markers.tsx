import { useState, type ReactNode } from 'react'
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleQuestionMark,
  CircleSlash,
  CircleX,
  GitFork,
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
import { activitySaid, reviewOf } from '@/live/activity.ts'
import { assignedSaid, stackSaid } from '@/live/markers.ts'
import { stackPath, stackTree } from '@/live/stack.ts'
import { stateLook, stateSaid, type StateLook } from '@/live/state.ts'
import type { Reference } from '@/live/reference.ts'
import { handLink, handsLink } from '@/live/links.ts'
import { pipelineSaid, type Pipeline } from '@/live/pipeline.ts'
import { Faces } from './faces.tsx'
import { fitLook, type FitLook } from '@/live/fit.ts'
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
 * Never colour alone: every reviewer's standing has its own shape, a badge on
 * their face (`faces.tsx`), and its words in the label, a line per reviewer
 * (`live/activity.ts`). Colour is only the second telling.
 *
 * The cluster carries `title=""` so the row's own whole-row `title` does not
 * pop up over a marker's tooltip and say everything again at once.
 */

/**
 * A marker's box: 24 pixels, or 20 in a narrow list (`live/fit.ts`), where the
 * pipeline's box also slides 4 pixels under the state's so the two read as a
 * pair. The boxes overlap; the 14-pixel glyphs in them do not.
 */
const BOX = { normal: 'w-6', compact: 'w-5', paired: 'w-5 -ml-1' }

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
 * The stack: `⧉ 2/3` on a line of changes; on a forked stack `⑂ 4`, how many
 * changes the tree holds, because a position on a line would be false there.
 * Its tooltip says the whole stack bottom first (a tree when forked), and a
 * press opens the same list as buttons — pressing one selects that change, as
 * pressing its row would. A tooltip cannot hold buttons, which is why the
 * press opens a popover rather than the tooltip being made clickable.
 *
 * In the popover a forked stack is the tree `stackTree` draws: its glyphs are
 * text (`├─ └─ │`), hidden from a screen reader, which hears each entry's base
 * in its label instead. Never colour or indentation alone.
 */
function StackMark({ row, onPick, tight = false }: { row: Reference; onPick: (ref: string) => void; tight?: boolean }) {
  const [open, setOpen] = useState(false)
  const place = row.stack!
  const said = stackSaid(place, row.ref)
  const lines = place.forked ? stackTree(place.members) : null
  const label = place.forked
    ? `In a forked stack of ${place.of}, on the branch ${stackPath(place.members, row.ref).join(' → ')}. Show the stack`
    : `Stacked: ${place.at} of ${place.of}. Show the stack`
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-marker="stack"
              data-forked={place.forked ? 'true' : undefined}
              aria-label={label}
              className={cn(MARK, 'w-auto gap-0.5 font-mono text-[11px] tabular-nums', tight ? 'px-0.5' : 'px-1 @sm/frame:min-w-11')}
            >
              {place.forked ? <GitFork className="size-3.5" aria-hidden="true" /> : <Layers className="size-3.5" aria-hidden="true" />}
              {place.forked ? place.of : `${place.at}/${place.of}`}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className={place.forked ? 'whitespace-pre-wrap font-mono' : undefined}>{said}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-1">
        <p className="px-2 py-1 text-xs text-muted-foreground">{place.forked ? 'Forked stack, bottom first' : 'Stack, bottom first'}</p>
        <ol aria-label={`The ${place.forked ? 'forked ' : ''}stack ${row.ref} is in, bottom first`}>
          {place.members.map((m, i) => (
            <li key={m.ref}>
              <button
                type="button"
                data-stack-member={m.ref}
                data-depth={m.depth}
                aria-current={m.ref === row.ref ? 'true' : undefined}
                aria-label={
                  lines
                    ? `${m.ref}${m.title ? ` ${m.title}` : ''}${m.base ? `, on ${m.base}` : ', the bottom'}${m.ref === row.ref ? ', this one' : ''}`
                    : undefined
                }
                onClick={() => {
                  onPick(m.ref)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-baseline gap-2 rounded py-1 pr-2 pl-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                  m.ref === row.ref && 'font-medium',
                )}
              >
                {lines ? (
                  <span data-tree aria-hidden="true" className="-mr-1.5 shrink-0 whitespace-pre font-mono text-xs text-muted-foreground">
                    {lines[i]!.prefix}
                  </span>
                ) : (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                )}
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
  compact = false,
}: {
  pipeline: Pipeline
  now: number
  onOpenLink?: ((url: string) => Promise<AddressOpenResult | null>) | null
  /** A narrow list: a 20-pixel box overlapping the state's (`live/fit.ts`). */
  compact?: boolean
}) {
  const box = compact ? BOX.paired : BOX.normal
  const said = pipelineSaid(pipeline, now)
  const look = PIPELINE_LOOK[pipeline.state]
  const url = pipeline.url
  if (!url) {
    return (
      <Mark name={`pipeline-${pipeline.state}`} said={said} label={said} className={cn(box, look.tone)}>
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
          className={cn(MARK, box, look.tone)}
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

export function StateMark({ row, compact = false }: { row: Reference; compact?: boolean }) {
  const look = stateLook(row)
  const said = stateSaid(row)
  return (
    <Mark name={`state-${look}`} said={said} label={said} className={cn(compact ? BOX.compact : BOX.normal, STATE_LOOK[look].tone)}>
      {STATE_LOOK[look].icon}
    </Mark>
  )
}

/**
 * New activity: the last thing done was somebody else's and this kehikko has
 * not seen it since (`live/activity.ts`). The bell, its sentence as tooltip and
 * label, and a press opens the reference in the person's own browser
 * (`openOutside`), where that activity is, and counts it seen. Never handed to
 * the canvas. A bell with a dot, never colour alone; the row's title is bold
 * beside it.
 */
export function ActivityMark({ last, url, onSeen, compact = false }: { last: string; url: string | null; onSeen?: () => void; compact?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-marker="new-activity"
          aria-label={`New activity. ${last}. See it in your browser`}
          disabled={!url}
          onClick={(event) => {
            event.stopPropagation()
            onSeen?.()
            openOutside(url)
          }}
          className={cn(MARK, compact ? BOX.compact : BOX.normal, 'text-foreground')}
        >
          <BellDot className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{`New activity: ${last}`}</TooltipContent>
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
const CLUSTER = 'ml-auto flex shrink-0 items-center justify-end'
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
  look = fitLook('wide'),
  fresh = false,
  onSeen,
}: {
  row: Reference
  now: number
  /** Somebody else acted on it since this kehikko last saw it: the bell. */
  fresh?: boolean
  /** The bell was pressed: the activity is seen. */
  onSeen?: (ref: string) => void
  onPick: (ref: string) => void
  /** Hand a link to the canvas (`address.open`), or null to follow it in a new tab. */
  onOpenLink?: ((url: string) => Promise<AddressOpenResult | null>) | null
  /** How tightly the list is drawn (`live/fit.ts`). */
  look?: FitLook
}) {
  const assigned = assignedSaid(row)
  const review = row.kind === 'change' ? reviewOf(row, now) : null
  const pipeline = row.kind === 'change' ? row.pipeline : undefined
  const last = fresh ? activitySaid(row, now)?.full ?? null : null
  const compact = look.compactMarks
  return (
    <span role="cell" data-markers title="" className={cn(CLUSTER, compact ? 'gap-0' : 'gap-0.5')}>
      {row.stack ? <StackMark row={row} onPick={onPick} tight={compact} /> : SLOT.stack}
      {assigned ? (
        <Mark name="assigned" said={assigned} label={assigned} className={cn(FACES_MARK.assigned, compact && 'px-0')}>
          <Faces faces={row.assignedFaces} max={look.faces} tight={look.facesTight} />
        </Mark>
      ) : SLOT.assigned}
      {review ? (
        <Mark name={`review-${review.word}`} said={review.said} label={review.said} className={cn(FACES_MARK.review, compact && 'px-0')}>
          <Faces faces={row.reviewerFaces ?? []} max={look.faces} tight={look.facesTight} />
        </Mark>
      ) : SLOT.review}
      <StateMark row={row} compact={compact} />
      {pipeline ? <PipelineMark pipeline={pipeline} now={now} onOpenLink={onOpenLink ?? null} compact={compact} /> : SLOT.pipeline}
      {last ? <ActivityMark last={last} url={row.url ?? null} onSeen={onSeen ? () => onSeen(row.ref) : undefined} compact={compact} /> : SLOT.mark}
    </span>
  )
}
