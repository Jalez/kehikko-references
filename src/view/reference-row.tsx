import { cn } from '@/lib/utils'
import type { Reference } from '@/live/reference.ts'
import { StateWord } from './state-word.tsx'

/**
 * One reference, on one line, at a fixed height.
 *
 * ## What narrowing takes away, in order, and why that order
 *
 * The same row is read in a column three hundred pixels wide inside a roadmap
 * and across a laptop screen in its own tab. That is one layout, not three:
 * everything below sits in one flex line and the pieces drop out from the right
 * as the CONTAINER narrows — container queries, not viewport ones, because the
 * frame's width and the window's width are not the same number and it is the
 * frame this row lives in.
 *
 * Dropped first, at the widest threshold: **the labels**. They are the most
 * decorative thing here, and — this is the argument — they are still reachable,
 * because the filter searches them. A label you cannot see but can type is not
 * gone.
 *
 * Dropped next: **the date**. It answers "is this fresh", which is a question
 * about the list rather than about the row, and the header answers it once for
 * everything by naming when the reading was taken.
 *
 * Dropped last: **the people**. They go reluctantly, because "who is on it" is
 * half of what somebody scans for — but they are searchable too, and the two
 * things that are NOT searchable have to survive.
 *
 * Never dropped, at any width: **the identifier, the state and the title**. The
 * identifier is what somebody is looking for; the state is what they came to
 * check; the title is how they recognise the right one when the identifier is
 * only half remembered. A row that has lost any of those three has stopped
 * being a row and become a hint.
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
         choice is in this module's README. */
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 36px' }}
    >
      <Wrapper
        {...(row.url ? { href: row.url, target: '_blank', rel: 'noreferrer' } : {})}
        className="@container flex h-9 items-center gap-3 px-3 text-sm hover:bg-accent/60"
      >
        <span
          className="w-[5.5rem] shrink-0 truncate text-right font-mono text-xs tabular-nums text-muted-foreground"
          title={row.ref}
        >
          {row.ref}
        </span>

        <span className="w-[4.5rem] shrink-0">
          <StateWord row={row} />
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

        <span
          className="hidden w-32 shrink-0 truncate text-right text-xs text-muted-foreground @sm:block"
          title={row.people.join(', ')}
        >
          {/* Nobody is a fact worth showing. An issue with no assignee is not a
              gap in this page's reading; it is a thing about the tracker, and a
              blank here would let it pass unnoticed. */}
          {row.people.length ? row.people.join(', ') : <span className="italic">nobody</span>}
        </span>
      </Wrapper>
    </li>
  )
}
