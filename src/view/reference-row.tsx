import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { assignedSaid, reviewOf, unaddressed } from '@/live/markers.ts'
import type { Reference } from '@/live/reference.ts'
import type { AddressOpenResult } from 'kehikot-module-protocol'
import { pipelineSaid } from '@/live/pipeline.ts'
import { roleSaid } from '@/live/roles.ts'
import { tieSaid } from '@/live/ties.ts'
import { Markers } from './markers.tsx'
import { CopyButton } from './copy-button.tsx'

/**
 * One reference, in as little vertical space as the column it is in allows.
 *
 * ## Three things a row does, and which one the plain click belongs to
 *
 * A row used to be a link and nothing else: the whole of it was an `<a>`, and
 * clicking anywhere on it opened the issue on GitHub or GitLab. That was right
 * while opening the tracker was the only thing anybody could want from a row.
 * It stopped being right the moment this app could tell the canvas what the
 * reader has picked out — because then a row has two plausible meanings for one
 * gesture, and the browser's own convention gives the whole area to whichever of
 * them is wrapped around it.
 *
 * The plain click is now SELECTION, and the argument is about what the click is
 * for rather than about which is more important. Selecting is the cheap,
 * repeated, in-place act: it is done dozens of times while reading a list,
 * it changes what the containers beside this one are showing, and it costs nothing to
 * undo. Opening the tracker is the rare, expensive, one-way act — a new tab, a
 * different application, the end of whatever scan was in progress. A surface
 * that gives its whole click area to the expensive one and asks for a modifier
 * key for the cheap one has the frequencies backwards.
 *
 * So the tracker gets an affordance of its own rather than a gesture: an icon at
 * the end of every row, with the tracker named in its tooltip. It is a visible
 * thing to press, which is the whole requirement — a person who wants GitHub
 * must not have to discover that ⌘-click, or a long press, or a double click
 * does it. A hidden gesture is a feature only its author knows about.
 *
 * A row with no `url` still draws that icon, dimmed and inert, with a tooltip
 * saying the reading carried no link. The alternative is a gap where every other
 * row has something to press, and a gap is read as a rendering failure rather
 * than as a fact about the reading — the same argument that puts the word
 * "nobody" on a row with no assignee instead of leaving a blank.
 *
 * ## The checkbox is a separate control because the two gestures mean different
 * things
 *
 * Plain click REPLACES the selection; the checkbox ADDS to it and takes away
 * from it. Both are needed and neither can be the other: a list where every
 * click accumulated would make picking one row a two-step operation (clear, then
 * pick), and a list where every click replaced would make picking four rows
 * impossible without a modifier key nobody is told about. Shift-click and
 * ⌘-click are the conventions for this on a desktop and they are exactly the
 * hidden gestures this file has just argued against, so the accumulating gesture
 * gets a control that can be seen. It costs 24 pixels of the row's width at
 * every size, which is paid out of the title, and the title still has 172 of the
 * 196 available in a 220-pixel container.
 *
 * The tick is drawn from the canvas's selection as the host last stated it, not
 * from anything this row remembers — see `selection` in `use-kehikot.ts`. A row
 * ticked here was ticked by the host.
 *
 * ## One layout, sized by the container and not by the window
 *
 * The same row is read across a laptop screen in its own tab and in a container two
 * hundred and twenty pixels wide on somebody's canvas. That is one layout, not
 * three, and every threshold below is a CONTAINER query — the frame's width and
 * the window's width are not the same number, and it is the frame this row
 * lives in. A viewport breakpoint here would make the row's decisions out of a
 * number nobody who resizes the container is changing.
 *
 * The container is now the pressable middle of the row rather than the row
 * itself, because that is the box the columns actually divide — and the
 * consequence is worth spelling out, because it is not what it looks like.
 *
 * A `@xx:` class is measured against the nearest container ANCESTOR of the
 * element carrying it, and an element is not its own ancestor. So the thresholds
 * written on the pressable box — the gap, the fixed columns — are measured
 * against the frame, while the thresholds written on its children — the labels,
 * the date, the people — are measured against the box itself, which is narrower
 * by the checkbox, the markers, the copy button and the "⋯" menu.
 *
 * That split is correct rather than accidental: "is there room for the people
 * column" is a question about what is left after the row's controls have taken
 * theirs. The one child that asks about the frame instead is the title, by
 * name (`@sm/frame:`), for the reason given below.
 *
 * ## What narrowing takes away, in order, and why that order
 *
 * Dropped first, at the widest threshold: **the labels** (under 48rem). They
 * are the most decorative thing here, and — this is the argument — they are
 * still reachable, because the filter searches them. A label you cannot see but
 * can type is not gone.
 *
 * Dropped next: **the date** (under 36rem). It answers "is this fresh", which
 * is a question about the list rather than about the row, and the header
 * answers it once for everything by naming when the reading was taken.
 *
 * Dropped after the date: **my role** (under 32rem) — `Reviewer (asked)` and
 * the like, on the rows the person has one. It is reachable at any width: the
 * row's tooltip says it, and the Scope group narrows to it.
 *
 * Dropped last: **the people** (under 24rem). They go reluctantly, because "who
 * is on it" is half of what somebody scans for — but they are searchable too,
 * and the two things that are NOT searchable have to survive.
 *
 * Dropped under 24rem of the frame: **the title** (issue #24). That used to
 * be the one thing never dropped, and the reason it no longer is, is where
 * this list is read at that width: beside Journeys, where pressing a row shows
 * that reference in the journey with its title at full length. A narrow row is
 * for finding the one to press and seeing who holds it, so its width goes to
 * the identifier, the state and the markers. The title stays reachable: it is
 * in the row's tooltip, and an `sr-only` copy keeps it in the pressable box's
 * accessible name at every width.
 *
 * This threshold is measured against the FRAME (`@sm/frame:`, the app's named
 * container), not the pressable box: the markers sit beside that box, so its
 * width differs from row to row, and a title that came and went with how many
 * markers a row has would make a column of rows that do not agree.
 *
 * Never dropped, at any width: **the identifier, the state and the markers**
 * (`markers.tsx`: the stack, who is assigned, where the review stands, and
 * activity by somebody else). The identifier is what somebody is looking for;
 * the state is what they came to check; the markers say whether somebody
 * already holds it, which is what a narrow list beside a journey is for (#25).
 *
 * Nor is the checkbox ever dropped: selecting is the row's verb, and the
 * selection menu in the bar (`selection-menu.tsx`) holds the rest — open, copy
 * — so a row you cannot act on at 220 pixels is not left behind. The state is a
 * glyph beside the pipeline mark (`StateMark` in `markers.tsx`), its words in
 * its tooltip and label.
 *
 * ## One line at every width
 *
 * Under 20rem the row used to be two lines, the identifier and the state on
 * the first and the title on the whole of the second, because a one-line row
 * left the title twelve pixels at 220. With the title dropped under 24rem that
 * second line has nothing to hold, so the row is one line, 36 pixels, at every
 * width — more rows on screen in exactly the narrow container that has the
 * least height to spare.
 *
 * The fixed columns come back at 28rem and not before. They exist for
 * alignment — a column of ragged identifiers is a column you have to read
 * rather than scan — and alignment is a luxury that has to be paid for out of
 * the title's width. Above 28rem there is width to pay with; below it there is
 * not, and the columns shrink to their contents instead.
 *
 * ## The identifier is right-aligned, on purpose
 *
 * `#41` and `#2274` in a left-aligned column put their digits in different
 * places, and scanning a column of numbers means comparing digits. Right
 * alignment with tabular figures gives them one edge. The cost is that the
 * sigils — `#`, `!`, `gh#` — end up ragged, which is a real loss and the
 * smaller one: the sigil is also carried by the kind filter, and the digits are
 * carried by nothing else.
 */

/** Just the date. The hour is noise on a list where the freshest thing is hours old. */
function day(at: string): string {
  return at.slice(0, 10)
}

/**
 * What one row IS, in the words the tracker that filed it uses.
 *
 * `change` is the right word for the filter, which has to cover both trackers
 * with one button — the argument is in `reference.ts` and it still holds. It is
 * the wrong word here, because a row is one specific thing filed in one specific
 * tracker, and nobody has ever gone looking for "a change". They went looking
 * for a pull request. Which of the two it is comes from the bag it was read out
 * of, never from parsing the ref.
 */
function whatItIs(row: Reference): string {
  if (row.kind === 'issue') return 'issue'
  return row.origin === 'github' ? 'pull request' : 'merge request'
}

/**
 * The whole row as one sentence, hung on the row as its `title`.
 *
 * The drop order above is defensible only while what it drops stays reachable,
 * and "the filter searches it" is a poor answer to somebody who does not yet
 * know the word to type. This is the other half: hovering any part of a row
 * says everything the row would say at full width, including the pieces this
 * width has taken away. It is deliberately built from the same fields in the
 * same order as the wide layout, so the tooltip and the row never disagree.
 *
 * The state glyph and every marker carry their own tooltip, and the cluster's
 * empty `title` keeps this one from opening over theirs.
 */
export function overview(row: Reference, now: number = Date.now()): string {
  /* The kind is second, right after the identifier, because it is the thing the
     row itself says least about and the thing somebody hunting for their pull
     request among two dozen issues most needs. It is spelled out in words here
     even though the row draws it as a glyph — a tooltip is where a glyph gets
     explained, and "pull request" is what the person is looking for. */
  const parts = [row.ref, whatItIs(row), row.state ?? 'state unread', row.title || 'no title in the reading']
  if (row.labels.length) parts.push(row.labels.join(', '))
  if (row.at) parts.push(day(row.at))
  parts.push(row.people.length ? row.people.join(', ') : 'nobody')
  const mine = roleSaid(row.myRoles)
  if (mine) parts.push(`my role: ${mine}`)
  const tie = tieSaid(row)
  if (tie) parts.push(tie)
  if (row.stack) parts.push(`stacked ${row.stack.at} of ${row.stack.of}: ${row.stack.members.map((m) => m.ref).join(' → ')}`)
  const assigned = assignedSaid(row)
  if (assigned) parts.push(assigned)
  const review = reviewOf(row.reviewers)
  if (review) parts.push(review.said)
  if (row.kind === 'change' && row.pipeline) parts.push(pipelineSaid(row.pipeline, now))
  const last = unaddressed(row, now)
  if (last) parts.push(last)
  return parts.join(' · ')
}

export function ReferenceRow({
  row,
  landed,
  selected,
  onPick,
  onToggle,
  onOpenLink,
  now,
}: {
  row: Reference
  landed: boolean
  /** Hand a marker's link to the canvas (`address.open`), or null to follow it in a new tab. Not the open icon's: that opens the person's browser. */
  onOpenLink?: ((url: string) => Promise<AddressOpenResult | null>) | null
  /** The clock the activity marker says "3 h ago" against. Tests pass one; the page reads it at drawing. */
  now?: number
  /** As the host last said the canvas's selection stands. Never what this page asked for. */
  selected: boolean
  /** Plain click: this row becomes the whole selection. */
  onPick: (ref: string) => void
  /** The checkbox: this row joins or leaves whatever is already selected. */
  onToggle: (ref: string) => void
}) {
  const at = now ?? Date.now()
  return (
    <li
      data-ref={row.ref}
      data-kind={row.kind}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        /* `flex-wrap` for the narrowest frames only: where the identifier, the
           state and every marker do not fit on one line, the markers and the
           link go to a second line rather than over the state. Nothing wraps
           while they fit, which is every row at 24rem and most at 220px. */
        'flex flex-wrap items-stretch border-b border-border/60 last:border-b-0',
        landed && 'landed',
        /* An inset shadow rather than a border, because a border on a selected
           row would make it one pixel taller than an unselected one and the
           whole list would shift by a pixel every time somebody picked
           something. The tint is the scannable signal at a glance and the tick
           is the unambiguous one; neither is enough on its own in a list where
           a reader is looking at forty rows and one checkbox. */
        selected && 'bg-primary/10 shadow-[inset_2px_0_0_0_var(--primary)]',
      )}
      title={overview(row, at)}
      /* `content-visibility` is why there is no windowing library in this
         project. The browser skips laying out and painting rows that are
         nowhere near the viewport, and `contain-intrinsic-size` tells it what
         height to reserve for one it has skipped — so scrolling is smooth and
         the scrollbar does not lie, while every row stays in the DOM where the
         browser's own find-in-page, a screen reader and Ctrl+F can all reach
         it. A windowed list buys the same paint cost by removing rows from the
         document, which on this surface would mean the browser's find can miss
         a reference that is genuinely there. The measurement behind that
         choice is in this module's README.

         The `auto` in `contain-intrinsic-size` is doing work now that a row is
         not always 36 pixels tall: it means the 36 is only a first guess, and
         once the browser has laid a row out for real it remembers that height
         for the next time it skips it. A bare `36px` would have made the
         scrollbar lie by a third in a narrow container, where every row is two
         lines. */
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 36px' }}
    >
      {/* Its own padded box rather than a margin on the box, so that the
          pressable area of the checkbox reaches the left edge of the row: at
          220 pixels a 16-pixel target with 3 pixels of slack either side is a
          thing people miss, and the misses land on the row and replace their
          selection. */}
      <span className="flex shrink-0 items-center pr-1 pl-2">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(row.ref)}
          aria-label={`Include ${row.ref} in the selection`}
        />
      </span>

      {/* A button and not a div with a handler. It is a thing that does
          something when pressed, so it is focusable, it answers the space bar
          and the return key, and a screen reader says so — none of which is
          true of a clickable `div`, and all of which used to be true here for
          free because the row was a link. Replacing a link with something that
          only responds to a mouse would have been a regression dressed as a
          feature. */}
      <button
        type="button"
        onClick={() => onPick(row.ref)}
        className="@container flex h-9 min-w-32 flex-1 items-center gap-2 pr-1 pl-1 text-left text-sm hover:bg-accent/60 @md:gap-3 @sm/frame:min-w-0"
      >
        {/* The mark rides INSIDE the identifier's box rather than beside it,
            so that the fixed 5.5rem column above 28rem still holds one thing
            and the column of numbers keeps its right edge. A separate column
            would have been fourteen pixels of mostly-empty space on every row
            to serve two of them. */}
        <span className="flex shrink-0 items-center justify-end gap-1 @md:w-[5.5rem]">
          <span className="truncate text-right font-mono text-xs tabular-nums text-muted-foreground">{row.ref}</span>
        </span>

        {/* Under 24rem of the frame the title is not drawn (issue #24) and
            this copy keeps it in the button's accessible name, so a screen
            reader still hears what the row is; above it the drawn title is
            the name and this one is gone. */}
        <span data-title-spoken className="sr-only @sm/frame:hidden">
          {row.title || 'no title in the reading'}
        </span>

        <span
          data-title
          className={cn('hidden min-w-0 flex-1 truncate @sm/frame:block', !row.title && 'text-muted-foreground italic')}
        >
          {row.title || (row.unreadable ? 'this reference arrived with no reading at all' : 'no title in the reading')}
        </span>

        {/* The tie to an issue — `part of #3912` on a change, `has contributions from !3907` on the
            issue (protocol 2.26.0) — beside the title and kept while it truncates, so a merge request
            that delivers a piece of an issue says which. Plain text, never a link. Under 24rem of the
            frame it goes with the title and is still spoken, and the row's tooltip says it. */}
        {tieSaid(row) && (
          <span
            data-tie
            className="sr-only max-w-[45%] shrink-0 truncate text-xs text-muted-foreground @sm/frame:not-sr-only"
          >
            {tieSaid(row)}
          </span>
        )}

        {row.labels.length > 0 && (
          <span className="hidden shrink-0 gap-1 @3xl:flex">
            {row.labels.slice(0, 2).map((label) => (
              <span key={label} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {label}
              </span>
            ))}
          </span>
        )}

        {row.at && (
          <span className="hidden w-[5.5rem] shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground @xl:block">
            {day(row.at)}
          </span>
        )}

        {/* My role: what the person is on this one — `Reviewer (asked) ·
            Author` — in a fixed column so it lines up down the list, empty on
            a row they have no role on (most of them; a word on each would be a
            column of noise). Dropped under 32rem, after the labels and the
            date and before the people; the tooltip says it at every width and
            the Scope group narrows to it. */}
        <span
          data-role
          className="hidden w-28 shrink-0 truncate text-right text-xs text-foreground @lg:block"
        >
          {roleSaid(row.myRoles)}
        </span>

        <span className="hidden w-32 shrink-0 truncate text-right text-xs text-muted-foreground @sm:block">
          {/* Nobody is a fact worth showing. An issue with no assignee is not a
              gap in this page's reading; it is a thing about the tracker, and a
              blank here would let it pass unnoticed. */}
          {row.people.length ? row.people.join(', ') : <span className="italic">nobody</span>}
        </span>
      </button>

      <Markers row={row} now={at} onPick={onPick} onOpenLink={onOpenLink ?? null} />

      {/* From 24rem of the frame the copy button ends the row; below that it is
          dropped, because there is no room for it beside the markers and the
          selection menu in the bar copies the selected rows (one or more). */}
      <span className="hidden self-stretch @sm/frame:flex">
        <CopyButton row={row} />
      </span>

    </li>
  )
}
