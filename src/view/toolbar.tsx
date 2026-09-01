import { ArrowDownWideNarrow } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ORDER_LABELS, type Ordering } from '@/live/order.ts'
import { narrowing, type Sifting } from '@/live/sift.ts'

/**
 * What is left of the narrowing after two thirds of it moved, and the count that
 * keeps the whole of it honest.
 *
 * ## What used to be here, and where it went
 *
 * Seven buttons: `All · Issues · Changes` and `Any · Open · Merged · Closed`,
 * with a whole section of this file arguing that they should be in the open at
 * wide widths and behind one labelled trigger below 21rem. They are now offered
 * to the host as two `roadmap.filters` groups and drawn in the container's own
 * header, beside every other module's, and the argument for the move — and the
 * message that made it possible without breaking `goto` — is at the top of
 * `live/sift.ts`.
 *
 * What that took away from this file is the whole `ResizeObserver` and the
 * `compact` form it chose between. That machinery existed because seven buttons
 * plus a count came to 226 pixels in a 220-pixel container, and the collapse was
 * the least bad of three ways out. With the seven gone there is one form at
 * every width: a query, an order trigger, a count and a `Clear`. Nothing decides
 * between two sets of controls any more, so nothing has to measure itself, and
 * the two buttons named `Closed` that a CSS-only version would have left in the
 * document at all times are not a hazard this file has to guard against.
 *
 * The honest note, kept from the essay that used to be here rather than dropped
 * with it: **this bought no vertical room.** At 220 pixels the bar was two lines
 * with the seven collapsed behind one trigger and it is two lines now. The move
 * was made for consistency across the canvas, which is a reason, and it was not
 * made for pixels, which would not have been one.
 *
 * ## The count is not decoration
 *
 * `37 of 412 shown` is the most important thing in this bar and it did not move
 * and could not have. A filtered list looks exactly like a short list, and
 * somebody who has forgotten what is set will read the second as the first and
 * conclude the work is not there. So it is always drawn — never only when
 * filtering — and it names both numbers, so that the difference between them is
 * visible rather than inferable.
 *
 * It stays here because the host cannot write it. A container header can say
 * THAT something is narrowed; it cannot count rows it does not render, in a
 * document it cannot read, in a frame on another origin. And it counts the query
 * as well as the host's two groups, which is the other half of why it belongs to
 * this module: it is the only number that accounts for all three.
 *
 * ## `Clear` puts EVERYTHING back, including what this page does not hold
 *
 * The promise is one press, and one press is now two things: the query is
 * cleared here, and the host is asked to move this container's filters back to
 * their resting options. `app.tsx` does both in `clearAll`, and says so when the
 * host declines the second — because a button that silently does two thirds of
 * what it says is worse than one that says what it could not do.
 *
 * It is drawn whenever ANYTHING is narrowed, the host's groups included, which
 * is why this component is handed the composed `Sifting` rather than only its
 * own query. A `Clear` that appeared only for a typed query would be missing at
 * the moment a reader most needs it: staring at four rows of four hundred with
 * the reason for it in a header they have not looked at.
 *
 * ## The order is a labelled trigger, at every width, and always was
 *
 * Five orders had to go somewhere, and putting them in the open as five more
 * buttons would have undone the whole of the section above.
 *
 * The reason they may live behind a press when the filters may not is that the
 * two controls fail differently, and the "buttons, not a dropdown" argument was
 * always about a specific failure rather than about menus. **A filter hides
 * rows. An order does not.** The thing this bar is built to prevent — somebody
 * reading a list of two and concluding the other twenty-two do not exist — is
 * something only the filter can do; every order shows all twenty-four. So the
 * filter has to be READABLE and the order only has to be VISIBLE, which is a
 * weaker requirement and one a labelled trigger meets: it reads `Recent`, or
 * `Oldest`, or `State`, and the current order is on screen without opening
 * anything.
 *
 * The label is never the word "Sort", for the same reason the collapsed filter's
 * label was never the word "Filters": a control that has to be opened to say
 * what it is doing is the thing that was rejected, whatever it is called.
 *
 * It stays in this module rather than joining the two that left, and that is a
 * decision rather than an oversight. `filterGroupSchema` would express it
 * perfectly well — five options, a fallback of `Recent` — and it is not a
 * filter. It hides nothing, so it has no business in a control a reader has
 * learned to check when the list looks short; and the words `Recent` and
 * `Oldest` mean something only against a list of references somebody is looking
 * at, which is here.
 */

const ORDERS = (Object.keys(ORDER_LABELS) as Ordering[]).map((value) => ({ value, label: ORDER_LABELS[value] }))

/**
 * The order control, and the label that keeps the current order on screen.
 *
 * One component, one form, at every width: it is a labelled trigger in a laptop
 * tab for the same reason it is one in a 220-pixel column.
 */
function OrderGroup({ value, onChange }: { value: Ordering; onChange: (value: Ordering) => void }) {
  return (
    /* `flex-wrap` is not fussing: a group is a flex line of its own, and without
       it a group wider than the container overflows the bar rather than breaking
       inside it — which is exactly how six pixels of page-wide sideways scroll
       got in when this bar had seven more buttons on it. It matters inside the
       popover too, where the width available is the container's minus the
       layer's own padding. */
    <div role="group" aria-label="Order" className="flex flex-wrap items-center gap-0.5 @md:gap-1">
      {ORDERS.map((option) => (
        <Button
          key={option.value}
          size="xs"
          variant={option.value === value ? 'secondary' : 'ghost'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn('px-1.5 @md:px-2', option.value === value && 'font-semibold')}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

export function Toolbar({
  sifting,
  onQuery,
  onClear,
  ordering,
  onOrder,
  showing,
  total,
}: {
  /**
   * The WHOLE narrowing — the query this bar owns and the two groups the host
   * holds — because the count and the `Clear` are about all of it.
   */
  sifting: Sifting
  onQuery: (query: string) => void
  /** Clear everything: the query here, and the container's filters at the host. */
  onClear: () => void
  ordering: Ordering
  onOrder: (ordering: Ordering) => void
  showing: number
  total: number
}) {
  return (
    <div
      data-toolbar="bar"
      className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5 @md:gap-2 @md:py-2"
    >
      {/* `basis-40` rather than `min-w-40`: a minimum makes the input refuse to
          be narrower than 10rem and push the bar wider than the container, where a
          basis is only a preference — the input takes a line of its own in a
          narrow container and stretches to whatever the container is. */}
      <Input
        value={sifting.query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Filter by number, title, label or person"
        aria-label="Filter references"
        className="h-7 min-w-0 flex-1 basis-40 text-sm @md:h-8"
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="xs"
            variant="outline"
            aria-label={`Order the list. Currently ${ORDER_LABELS[ordering]}.`}
            className="gap-1 px-1.5"
          >
            <ArrowDownWideNarrow />
            <span>{ORDER_LABELS[ordering]}</span>
          </Button>
        </PopoverTrigger>
        {/* Sized to what the container leaves rather than to a fixed width: the
            shadcn default is 288 pixels and the containers this exists for are
            220. `p-2` rather than `p-4` for the same reason. */}
        <PopoverContent
          align="start"
          collisionPadding={4}
          className="w-auto max-w-[var(--radix-popover-content-available-width)] p-2"
        >
          <OrderGroup value={ordering} onChange={onOrder} />
        </PopoverContent>
      </Popover>

      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {showing === total ? `${total} references` : `${showing} of ${total} shown`}
      </span>
      {narrowing(sifting) && (
        <Button size="xs" variant="outline" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  )
}
