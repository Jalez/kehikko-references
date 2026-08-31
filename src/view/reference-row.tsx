import { ExternalLink, GitPullRequest } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { Reference } from '@/live/reference.ts'
import { StateWord } from './state-word.tsx'

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
 * from anything this row remembers — see `selection` in `use-roadmap.ts`. A row
 * ticked here was ticked by the roadmap.
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
 * written on the pressable box — the stack-or-line decision — are still measured
 * against the container, exactly as they were, while the thresholds written on its
 * children — the labels, the date, the people — are measured against the box
 * itself, which is 58 pixels narrower.
 *
 * That split is correct rather than accidental. "Is there room for a second
 * line" is a question about the container; "is there room for the people column" is a
 * question about what is left after the checkbox and the tracker link have taken
 * theirs. The measured effect is that the columns drop 58 pixels of container width
 * earlier than they used to, which is the honest answer to a row that now has
 * two more things in it.
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
 * Dropped last: **the people** (under 24rem). They go reluctantly, because "who
 * is on it" is half of what somebody scans for — but they are searchable too,
 * and the two things that are NOT searchable have to survive.
 *
 * Never dropped, at any width: **the identifier, the state and the title**. The
 * identifier is what somebody is looking for; the state is what they came to
 * check; the title is how they recognise the right one when the identifier is
 * only half remembered. A row that has lost any of those three has stopped
 * being a row and become a hint.
 *
 * Nor is the checkbox ever dropped, and nor is the tracker link. They are the
 * row's two verbs, and a row you cannot act on at 220 pixels is a row somebody
 * has to widen a container to use.
 *
 * ## Two lines under 20rem, because one line stops holding three things
 *
 * That rule used to be a claim rather than a fact. At 220 pixels — an ordinary
 * container on a grid canvas — the identifier column and the state column were fixed
 * at 5.5rem and 4.5rem, and what was left for the title, measured in a browser,
 * was **twelve pixels**. The title was on the row, in the document, findable by
 * Ctrl+F, and unreadable. "Never dropped" had quietly become "never deleted",
 * which is not the same promise.
 *
 * So under 20rem the row stops being a line and becomes two: the identifier and
 * the state share the first, the title gets the whole of the second. It costs
 * about sixteen pixels of height per row, and it buys the title 172 pixels
 * instead of 12 at that width. A reader who can see four rows and read them is
 * better served than one who can see seven and cannot.
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

/** What the tracker is called, for the sentence on the link. Read off the bag, never parsed. */
const TRACKER: Record<Reference['origin'], string> = { github: 'GitHub', gitlab: 'GitLab' }

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
 * The mark that says this row is a change, and the discoverability failure it
 * exists to fix.
 *
 * GitLab spells the difference into the identifier — `#41` is an issue and `!41`
 * is a merge request, and a reader who knows the convention needs nothing else.
 * GitHub numbers issues and pull requests in ONE sequence and spells them both
 * `gh#`, so on this list `gh#131` and `gh#105` were typographically identical
 * rows. The only thing that separated them was the state badge, and only by
 * accident: `merged` cannot be an issue, so a merged pull request was
 * distinguishable and an OPEN one was not distinguishable from anything.
 *
 * Measured against a real reading of `modes-are-modules`: twenty-two GitHub
 * issues and two GitHub pull requests, and nothing whatsoever on either of those
 * two rows saying they were pull requests. A person who believed this list did
 * not show their changes was reading it correctly — the changes were there and
 * the list never said so.
 *
 * So changes carry a mark and issues do not, and the asymmetry is the design
 * rather than an oversight. A glyph on every row is a column of noise that says
 * nothing at a glance; a glyph on two rows out of twenty-four is the two rows
 * standing out, which is exactly what somebody looking for their pull requests
 * needs. It costs about fourteen pixels on the rows that have it and nothing on
 * the rest.
 *
 * It is not the only answer to that problem and it is the one that works without
 * anybody pressing anything: the `Changes` filter and the `Kind` order both
 * bring them together, and both require knowing to look.
 */
function KindMark({ row }: { row: Reference }) {
  if (row.kind !== 'change') return null
  return (
    <span
      data-kind="change"
      title={`This is a ${whatItIs(row)}, not an issue.`}
      aria-label={whatItIs(row)}
      role="img"
      className="shrink-0 text-muted-foreground"
    >
      <GitPullRequest className="size-3" />
    </span>
  )
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
 * The state badge keeps its own `title` where it has one, and so does the
 * tracker link, and that is not an oversight: `unseen` and `draft` need
 * explaining rather than repeating, and a more specific tooltip on a smaller
 * target is the browser's own rule.
 */
function overview(row: Reference): string {
  /* The kind is second, right after the identifier, because it is the thing the
     row itself says least about and the thing somebody hunting for their pull
     request among two dozen issues most needs. It is spelled out in words here
     even though the row draws it as a glyph — a tooltip is where a glyph gets
     explained, and "pull request" is what the person is looking for. */
  const parts = [row.ref, whatItIs(row), row.state ?? 'state unread', row.title || 'no title in the reading']
  if (row.labels.length) parts.push(row.labels.join(', '))
  if (row.at) parts.push(day(row.at))
  parts.push(row.people.length ? row.people.join(', ') : 'nobody')
  return parts.join(' · ')
}

/**
 * The way out to the tracker, drawn whether or not there is one.
 *
 * `url` is what the tracker itself said and is never built here, so a row with
 * no link is a row that opens nothing rather than one that opens the wrong
 * repository's issue 41. The inert twin is `aria-hidden` because a screen reader
 * announcing a link that is not a link is worse than silence, and it keeps its
 * `title` because a sighted reader hovering the one dim icon in a column of live
 * ones deserves the sentence.
 */
function Tracker({ row }: { row: Reference }) {
  const shared = 'flex shrink-0 items-center self-stretch px-2'
  if (!row.url) {
    return (
      <span
        aria-hidden="true"
        title={`The reading for ${row.ref} carried no link, so there is nothing to open.`}
        className={cn(shared, 'text-muted-foreground/30')}
      >
        <ExternalLink className="size-3.5" />
      </span>
    )
  }
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noreferrer"
      title={`Open ${row.ref} on ${TRACKER[row.origin]}`}
      aria-label={`Open ${row.ref} on ${TRACKER[row.origin]}`}
      className={cn(shared, 'text-muted-foreground hover:text-foreground focus-visible:text-foreground')}
    >
      <ExternalLink className="size-3.5" />
    </a>
  )
}

export function ReferenceRow({
  row,
  landed,
  selected,
  onPick,
  onToggle,
}: {
  row: Reference
  landed: boolean
  /** As the host last said the canvas's selection stands. Never what this page asked for. */
  selected: boolean
  /** Plain click: this row becomes the whole selection. */
  onPick: (ref: string) => void
  /** The checkbox: this row joins or leaves whatever is already selected. */
  onToggle: (ref: string) => void
}) {
  return (
    <li
      data-ref={row.ref}
      data-kind={row.kind}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'flex items-stretch border-b border-border/60 last:border-b-0',
        landed && 'landed',
        /* An inset shadow rather than a border, because a border on a selected
           row would make it one pixel taller than an unselected one and the
           whole list would shift by a pixel every time somebody picked
           something. The tint is the scannable signal at a glance and the tick
           is the unambiguous one; neither is enough on its own in a list where
           a reader is looking at forty rows and one checkbox. */
        selected && 'bg-primary/10 shadow-[inset_2px_0_0_0_var(--primary)]',
      )}
      title={overview(row)}
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
        className="@container flex min-h-9 min-w-0 flex-1 flex-col justify-center gap-0.5 py-1.5 pr-1 pl-1 text-left text-sm hover:bg-accent/60 @xs:h-9 @xs:flex-row @xs:items-center @xs:gap-2 @xs:py-0 @md:gap-3"
      >
        {/* One element in the stacked layout and none in the wide one:
            `@xs:contents` dissolves this wrapper so the identifier and the
            state become items of the row's own flex line, in the same order,
            rather than a nested box with its own spacing rules to keep in
            step. */}
        <span className="flex items-center gap-2 @xs:contents">
          {/* The mark rides INSIDE the identifier's box rather than beside it,
              so that the fixed 5.5rem column above 28rem still holds one thing
              and the column of numbers keeps its right edge. A separate column
              would have been fourteen pixels of mostly-empty space on every row
              to serve two of them. */}
          <span className="flex shrink-0 items-center justify-end gap-1 @md:w-[5.5rem]">
            <KindMark row={row} />
            <span className="truncate text-right font-mono text-xs tabular-nums text-muted-foreground">{row.ref}</span>
          </span>

          <span className="shrink-0 @md:w-[4.5rem]">
            <StateWord row={row} />
          </span>
        </span>

        <span className={cn('min-w-0 flex-1 truncate', !row.title && 'text-muted-foreground italic')}>
          {row.title || (row.unreadable ? 'this reference arrived with no reading at all' : 'no title in the reading')}
        </span>

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

        <span className="hidden w-32 shrink-0 truncate text-right text-xs text-muted-foreground @sm:block">
          {/* Nobody is a fact worth showing. An issue with no assignee is not a
              gap in this page's reading; it is a thing about the tracker, and a
              blank here would let it pass unnoticed. */}
          {row.people.length ? row.people.join(', ') : <span className="italic">nobody</span>}
        </span>
      </button>

      <Tracker row={row} />
    </li>
  )
}
