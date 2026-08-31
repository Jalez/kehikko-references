import { useEffect, useRef, useState } from 'react'
import { ArrowDownWideNarrow, ListFilter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DEFAULT_ORDER, ORDER_LABELS, type Ordering } from '@/live/order.ts'
import { EVERYTHING, narrowing, type KindFilter, type Sifting, type StateFilter } from '@/live/sift.ts'

/**
 * The narrowing, and the count that keeps it honest.
 *
 * ## The count is not decoration
 *
 * "37 of 412" is the most important thing in this bar. A filtered list looks
 * exactly like a short list, and somebody who has forgotten they typed
 * something will read the second as the first and conclude the work is not
 * there. So the count is always drawn — never only when filtering — and it
 * names both numbers, so that the difference between them is visible rather
 * than inferable.
 *
 * ## Buttons, not a dropdown — above 21rem, and the qualification is new
 *
 * Five presses to see what this list can be narrowed to, against a menu that
 * has to be opened to be read. On a surface whose whole job is finding one row
 * among four hundred, the affordances belong in the open.
 *
 * That was written flat, about every width, and below 21rem it is overturned
 * here deliberately. What changed is not the argument — it is which cost the
 * argument was being weighed against. It was written against a bar that would
 * have been one line either way, where opening a menu buys nothing; it is being
 * applied now to a container where leaving the buttons in the open costs a third of
 * the reader's vertical space. The numbers are in the next section. Where the
 * whole set of affordances is affordable it stays in the open; where it is not,
 * the SETTING stays in the open and the set collapses behind it, which keeps the
 * half of the original argument that was load-bearing.
 *
 * ## What a narrow container does to seven buttons, and the choice made about it
 *
 * Measured at 220 pixels, the seven buttons and the count came to 226: six
 * pixels of horizontal overflow, which the browser resolved by giving the whole
 * page a sideways scrollbar. That is the worst of the available outcomes,
 * because it moves the header and the list with it, and because the thing
 * pushed off the right-hand edge is the state half of the filter — the part
 * that says why the list is short.
 *
 * The first answer to that was to WRAP, and every group wraps within itself, so
 * no line can ever be wider than the container. It stopped the sideways scroll and it
 * did not stop the cost, which was always vertical. Measured across a sweep of
 * container widths, on this list, with the reading of `modes-are-modules` in it:
 *
 * ```
 *   200px  bar 149px   340px  bar 71px    580px  bar 73px
 *   220px  bar 123px   400px  bar 71px    680px  bar 49px
 *   320px  bar 101px   460px  bar 81px    760px  bar 49px
 * ```
 *
 * The step between 320 and 340 is the one that matters: below it the bar is
 * three lines or more, above it two. And a container on a canvas is short as well as
 * narrow — at 220 by 300, the measured bar was 123 pixels and the list it was
 * filtering was 132. The filter had become the same size as the thing filtered,
 * which is the point at which a control has stopped being overhead and started
 * being the page.
 *
 * So the threshold is **21rem (336 pixels)**, chosen because it sits inside the
 * measured step rather than because it is a round number: every width below it
 * measured 101 pixels of bar or more, every width at or above it measured 81 or
 * less. It is a container query against the container, like everything else here.
 *
 * There were three ways out of the vertical cost and the choice between them is
 * worth stating.
 *
 * **Scrolling the bar inside itself** keeps one line and costs nothing
 * vertically, and it is still rejected, at every width, for the reason it always
 * was: the pressed button is the current filter, and a strip scrolled back to
 * its left edge hides `Closed` while the list goes on showing only closed
 * things. A filter you cannot see is a filter you have forgotten you set, which
 * is the failure the count exists to prevent — solving that in one place and
 * reintroducing it in another is not a solution. Nothing about a narrow container
 * weakens that; it is the one option here that can hide a setting by accident.
 *
 * **Icon-only buttons with the active one labelled** were rejected on the
 * vocabulary rather than on the space. `Issues` and `Changes` have honest icons;
 * `Any`, `Open`, `Merged` and `Closed` do not, and the three that could be drawn
 * would be drawn as circles that differ by their fill. A row of glyphs a reader
 * has to learn is a worse trade than a word behind one press, on a surface where
 * the words are the whole vocabulary of the filter.
 *
 * **Collapsing into a control that names its own setting** is what is done, and
 * it is a dropdown by another name. The thing that makes it survivable is that
 * the trigger is not the word "Filters": it reads `Changes · Merged`, or `All`
 * when nothing is narrowed. The setting is on screen with the popover shut, and
 * the popover holds exactly the same buttons in exactly the same order — so
 * pressing it is how you CHANGE the filter, never how you find out what it is.
 * That is the distinction the original paragraph did not make and the reason
 * this is not simply a reversal.
 *
 * The remaining cost is that the whole set is no longer readable without a
 * press, which was the original argument, and it is paid: at 220 pixels the bar
 * goes from four lines to two, and the two lines it gives back go to the list.
 *
 * ## The order is a dropdown at EVERY width, and that is not the same climbdown
 *
 * Five orders had to go somewhere, and putting them in the open as five more
 * buttons would have undone the whole of the section above: the bar was two
 * lines at 400 pixels before they existed.
 *
 * The reason they may live behind a press when the filters may not is that the
 * two controls fail differently, and the "buttons, not a dropdown" argument was
 * always about a specific failure rather than about menus. **A filter hides
 * rows. An order does not.** The thing this bar is built to prevent — somebody
 * reading a list of two and concluding the other twenty-two do not exist — is
 * something only the filter can do; every order shows all twenty-four. So the
 * filter has to be readable and the order only has to be VISIBLE, which is a
 * weaker requirement and one a labelled trigger meets: it reads `Recent`, or
 * `Oldest`, or `State`, and the current order is on screen without opening
 * anything.
 *
 * The label is never the word "Sort". It is the order, for the same reason the
 * collapsed filter's label is the setting: a control that has to be opened to
 * say what it is doing is the thing that was rejected, whatever it is called.
 *
 * ## Measured, not queried, and this is the one place in the app that is
 *
 * Every other width decision here and in `reference-row.tsx` is a container
 * query, and they should be: they choose which pixels a browser paints, and CSS
 * is what chooses pixels. This one is different in kind. It chooses which
 * CONTROLS EXIST — seven buttons or one — and a container query cannot do that,
 * because CSS can only hide what has already been written into the document.
 *
 * The version of this that used `@min-[21rem]:hidden` on one form and
 * `@min-[21rem]:contents` on the other worked, and left both in the DOM at every
 * width. Two buttons called `Closed`, at all times. That is not a tidiness
 * complaint: the browser's own find-in-page reaches the one that is display-none
 * and reports a match nobody can press, and `getByRole('button', { name:
 * 'Closed' })` — which is how the rest of this project asserts that a control
 * exists — becomes ambiguous and throws. A surface whose stated promise is that
 * everything drawn is real cannot carry a hidden second copy of its own filter.
 *
 * So the bar measures itself with a `ResizeObserver` and renders one form. The
 * observer watches the bar's own box, which is the container's width, and the switch
 * cannot oscillate because changing form changes the bar's HEIGHT and never its
 * width. Where there is no `ResizeObserver` — a test in happy-dom, anything
 * without layout — it stays wide, which is the form that shows everything and is
 * therefore the right thing to be wrong towards.
 */

/**
 * The container width, in CSS pixels, below which the filter collapses.
 *
 * 336 rather than 320 or 384: the sweep above measured 101 pixels of bar at 320
 * and 71 at 340, so the honest boundary is inside that step and this is the
 * middle of it. Written as a number rather than as a Tailwind threshold because
 * it is read by JavaScript now — see the note above about why.
 */
const COLLAPSE_BELOW = 336

const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'issue', label: 'Issues' },
  { value: 'change', label: 'Changes' },
]

const STATES: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'opened', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
]

/**
 * The filter as one short string, for the collapsed trigger.
 *
 * It names only what has actually been narrowed, because the words that are
 * doing nothing are the words there is no room for: `Changes · Merged` is
 * sixteen characters and fits beside the count in a 220-pixel container, and
 * `All · Any · Changes · Merged` does not. When nothing is narrowed at all it
 * says `All` rather than nothing, because a control with no label is a control
 * whose state a reader has to guess at — and "no filter" is a state as much as
 * any other.
 *
 * The query is deliberately not in here. It is already visible, in full, in the
 * input two inches to the left, and repeating it would be spending the scarcest
 * width on the one part of the filter that cannot be hidden.
 */
const ORDERS = (Object.keys(ORDER_LABELS) as Ordering[]).map((value) => ({ value, label: ORDER_LABELS[value] }))

function settingOf(sifting: Sifting): string {
  const words: string[] = []
  const kind = KINDS.find((option) => option.value === sifting.kind)
  if (kind && kind.value !== 'all') words.push(kind.label)
  const state = STATES.find((option) => option.value === sifting.state)
  if (state && state.value !== 'all') words.push(state.label)
  return words.length ? words.join(' · ') : 'All'
}

/**
 * The whole of what the collapsed control is set to, filter and order together.
 *
 * The order is named only when it is not the one the list arrives in, on the
 * same principle as the filter words above: the scarce thing is width, and a
 * word that says "nothing has been changed" is the first one to spend. `Recent`
 * is what this list has always been and is what somebody who has touched nothing
 * is looking at, so its absence is not a gap.
 */
function labelOf(sifting: Sifting, ordering: Ordering): string {
  const setting = settingOf(sifting)
  return ordering === DEFAULT_ORDER ? setting : `${setting} · ${ORDER_LABELS[ordering]}`
}

function Group<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    /* `flex-wrap` here and not only on the bar: a group is a flex line of its
       own, and without this a group wider than the container overflows the bar
       rather than breaking inside it — which is exactly how six pixels of
       page-wide sideways scroll got in. It matters inside the popover too,
       where the available width is the container's minus the layer's own padding. */
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-0.5 @md:gap-1">
      {options.map((option) => (
        /* Two pixels off each side of each button below 28rem. It looks like
           fussing and it is worth a line: `Any Open Merged Closed` measures 193
           at the roomier padding and the container is 196, so a single letter of
           drift breaks the group onto a second line — and a second line here is
           24 pixels off the list in a container that has 300 to divide. */
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

/**
 * The order control, and the label that keeps the current order on screen.
 *
 * One component used at both widths, because the argument for it does not change
 * with the container: it is a labelled trigger in a laptop tab for the same reason it
 * is one in a 220-pixel column. What changes is where it sits — beside the
 * filter buttons when they are in the open, and inside the collapsed filter's
 * own layer when they are not, so that a narrow container has one thing to press
 * rather than two competing for the same strip.
 */
function OrderGroup({ value, onChange }: { value: Ordering; onChange: (value: Ordering) => void }) {
  return (
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
  onChange,
  ordering,
  onOrder,
  showing,
  total,
}: {
  sifting: Sifting
  onChange: (sifting: Sifting) => void
  ordering: Ordering
  onOrder: (ordering: Ordering) => void
  showing: number
  total: number
}) {
  const bar = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const element = bar.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const watching = new ResizeObserver((entries) => {
      const width = entries[0]?.borderBoxSize?.[0]?.inlineSize ?? element.getBoundingClientRect().width
      /* Read off the entry where the browser offers it and off the box
         otherwise, because `borderBoxSize` is what the observer was given and a
         second `getBoundingClientRect` inside a resize callback is a layout the
         browser has already done. */
      setCompact(width < COLLAPSE_BELOW)
    })
    watching.observe(element)
    return () => watching.disconnect()
  }, [])

  const groups = (
    <>
      <Group options={KINDS} value={sifting.kind} onChange={(kind) => onChange({ ...sifting, kind })} label="Kind" />
      <Group
        options={STATES}
        value={sifting.state}
        onChange={(state) => onChange({ ...sifting, state })}
        label="State"
      />
    </>
  )

  return (
    <div
      ref={bar}
      data-toolbar={compact ? 'compact' : 'wide'}
      className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5 @md:gap-2 @md:py-2"
    >
      {/* `basis-40` rather than `min-w-40`: a minimum makes the input refuse to
          be narrower than 10rem and push the bar wider than the container, where a
          basis is only a preference — the input takes a line of its own in a
          narrow container and stretches to whatever the container is. */}
      <Input
        value={sifting.query}
        onChange={(event) => onChange({ ...sifting, query: event.target.value })}
        placeholder="Filter by number, title, label or person"
        aria-label="Filter references"
        className="h-7 min-w-0 flex-1 basis-40 text-sm @md:h-8"
      />

      {compact ? (
        <Popover>
          <PopoverTrigger asChild>
            {/* The label is the setting, never the word "Filters". A trigger
                that has to be opened to say what it is set to is the control
                this file spent three paragraphs rejecting. Both the narrowing
                and the order are in it, because in this form there is one
                control and it has to account for everything behind it.

                `whitespace-normal` rather than `truncate`: at the widest
                possible label — a kind, a state and an order all set — the text
                is about 150 pixels against 196 of container, so a truncation is
                reachable, and a truncated setting is a setting that is not on
                screen. It takes a second line instead, which costs 16 pixels in
                the rare case rather than hiding a word in it. */}
            <Button
              size="xs"
              variant="outline"
              /* The setting is spoken as well as drawn. Without this the
                 accessible name of the trigger is the bare word `All`, which is
                 also the name of a button inside it — and a reader who cannot
                 see the icon has no way to tell the control from its contents. */
              aria-label={`Narrow and order the list. Currently ${labelOf(sifting, ordering)}.`}
              className="h-auto max-w-full gap-1 px-1.5 py-1 text-left whitespace-normal"
            >
              <ListFilter />
              <span className="min-w-0">{labelOf(sifting, ordering)}</span>
            </Button>
          </PopoverTrigger>
          {/* Sized to what the container leaves rather than to a fixed width: the
              shadcn default is 288 pixels and the containers this form exists for are
              220. `p-2` rather than `p-4` for the same reason — sixteen pixels a
              side is a quarter of the room the state group needs. */}
          <PopoverContent
            align="start"
            collisionPadding={4}
            className="flex w-auto max-w-[var(--radix-popover-content-available-width)] flex-col gap-1 p-2"
          >
            {groups}
            {/* A rule between the two, because they are different questions —
                which rows, and in what order — and a stack of eleven small
                buttons with nothing separating them reads as one long set of
                alternatives. */}
            <div className="border-t border-border pt-1">
              <OrderGroup value={ordering} onChange={onOrder} />
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {groups}
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
            <PopoverContent
              align="start"
              collisionPadding={4}
              className="w-auto max-w-[var(--radix-popover-content-available-width)] p-2"
            >
              <OrderGroup value={ordering} onChange={onOrder} />
            </PopoverContent>
          </Popover>
        </>
      )}

      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {showing === total ? `${total} references` : `${showing} of ${total} shown`}
      </span>
      {narrowing(sifting) && (
        <Button size="xs" variant="outline" onClick={() => onChange(EVERYTHING)}>
          Clear
        </Button>
      )}
    </div>
  )
}
