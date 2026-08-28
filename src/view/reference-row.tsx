import { cn } from '@/lib/utils'
import type { Reference } from '@/live/reference.ts'
import { StateWord } from './state-word.tsx'

/**
 * One reference, in as little vertical space as the column it is in allows.
 *
 * ## One layout, sized by the pane and not by the window
 *
 * The same row is read across a laptop screen in its own tab and in a pane two
 * hundred and twenty pixels wide on somebody's canvas. That is one layout, not
 * three, and every threshold below is a CONTAINER query — the frame's width and
 * the window's width are not the same number, and it is the frame this row
 * lives in. A viewport breakpoint here would make the row's decisions out of a
 * number nobody who resizes the pane is changing.
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
 * ## Two lines under 20rem, because one line stops holding three things
 *
 * That rule used to be a claim rather than a fact. At 220 pixels — an ordinary
 * pane on a grid canvas — the identifier column and the state column were fixed
 * at 5.5rem and 4.5rem, and what was left for the title, measured in a browser,
 * was **twelve pixels**. The title was on the row, in the document, findable by
 * Ctrl+F, and unreadable. "Never dropped" had quietly become "never deleted",
 * which is not the same promise.
 *
 * So under 20rem the row stops being a line and becomes two: the identifier and
 * the state share the first, the title gets the whole of the second. It costs
 * about sixteen pixels of height per row, and it buys the title 196 pixels
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
 * The state badge keeps its own `title` where it has one, and that is not an
 * oversight: `unseen` and `draft` need explaining rather than repeating, and a
 * more specific tooltip on a smaller target is the browser's own rule.
 */
function overview(row: Reference): string {
  const parts = [row.ref, row.state ?? 'state unread', row.title || 'no title in the reading']
  if (row.labels.length) parts.push(row.labels.join(', '))
  if (row.at) parts.push(day(row.at))
  parts.push(row.people.length ? row.people.join(', ') : 'nobody')
  return parts.join(' · ')
}

export function ReferenceRow({ row, landed }: { row: Reference; landed: boolean }) {
  /* The whole row is the link where there is one. `url` is what the tracker
     itself said, never built here, so a row with no link is a row that opens
     nothing rather than one that opens the wrong repository's issue 41. */
  const Wrapper = row.url ? 'a' : 'div'
  return (
    <li
      data-ref={row.ref}
      className={cn('border-b border-border/60 last:border-b-0', landed && 'landed')}
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
         scrollbar lie by a third in a narrow pane, where every row is two
         lines. */
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 36px' }}
    >
      <Wrapper
        {...(row.url ? { href: row.url, target: '_blank', rel: 'noreferrer' } : {})}
        title={overview(row)}
        className="@container flex min-h-9 flex-col justify-center gap-0.5 px-3 py-1.5 text-sm hover:bg-accent/60 @xs:h-9 @xs:flex-row @xs:items-center @xs:gap-2 @xs:py-0 @md:gap-3"
      >
        {/* One element in the stacked layout and none in the wide one:
            `@xs:contents` dissolves this wrapper so the identifier and the
            state become items of the row's own flex line, in the same order,
            rather than a nested box with its own spacing rules to keep in
            step. */}
        <span className="flex items-center gap-2 @xs:contents">
          <span className="shrink-0 truncate text-right font-mono text-xs tabular-nums text-muted-foreground @md:w-[5.5rem]">
            {row.ref}
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
      </Wrapper>
    </li>
  )
}
