import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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
 * ## Buttons, not a dropdown
 *
 * Five presses to see what this list can be narrowed to, against a menu that
 * has to be opened to be read. On a surface whose whole job is finding one row
 * among four hundred, the affordances belong in the open.
 *
 * ## What a narrow pane does to seven buttons, and the choice made about it
 *
 * Measured at 220 pixels, the seven buttons and the count came to 226: six
 * pixels of horizontal overflow, which the browser resolved by giving the whole
 * page a sideways scrollbar. That is the worst of the available outcomes,
 * because it moves the header and the list with it, and because the thing
 * pushed off the right-hand edge is the state half of the filter — the part
 * that says why the list is short.
 *
 * There were three ways out and the choice between them is worth stating.
 *
 * **Scrolling the bar inside itself** keeps one line and costs nothing
 * vertically, and it was rejected: the pressed button is the current filter,
 * and a strip scrolled back to its left edge hides `Closed` while the list goes
 * on showing only closed things. A filter you cannot see is a filter you have
 * forgotten you set, which is the failure the count exists to prevent — solving
 * that in one place and reintroducing it in another is not a solution.
 *
 * **Collapsing into a select** was rejected for the reason the buttons are
 * buttons at all: the whole set has to be readable without being opened.
 *
 * So it **wraps**, and every group wraps within itself, so no line can ever be
 * wider than the pane. The cost is real and is vertical: at 220 pixels this bar
 * is four lines tall, and in a short pane those lines come out of the list. It
 * is bought back where it can be — a shorter input, tighter gaps and less
 * padding below 28rem, all container queries against the pane rather than the
 * window — and what is left is paid, because the alternative was a control
 * whose current setting could be off screen.
 */

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
       own, and without this a group wider than the pane overflows the bar
       rather than breaking inside it — which is exactly how six pixels of
       page-wide sideways scroll got in. */
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-0.5 @md:gap-1">
      {options.map((option) => (
        /* Two pixels off each side of each button below 28rem. It looks like
           fussing and it is worth a line: `Any Open Merged Closed` measures 193
           at the roomier padding and the pane is 196, so a single letter of
           drift breaks the group onto a second line — and a second line here is
           24 pixels off the list in a pane that has 300 to divide. */
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
  showing,
  total,
}: {
  sifting: Sifting
  onChange: (sifting: Sifting) => void
  showing: number
  total: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5 @md:gap-2 @md:py-2">
      {/* `basis-40` rather than `min-w-40`: a minimum makes the input refuse to
          be narrower than 10rem and push the bar wider than the pane, where a
          basis is only a preference — the input takes a line of its own in a
          narrow pane and stretches to whatever the pane is. */}
      <Input
        value={sifting.query}
        onChange={(event) => onChange({ ...sifting, query: event.target.value })}
        placeholder="Filter by number, title, label or person"
        aria-label="Filter references"
        className="h-7 min-w-0 flex-1 basis-40 text-sm @md:h-8"
      />
      <Group options={KINDS} value={sifting.kind} onChange={(kind) => onChange({ ...sifting, kind })} label="Kind" />
      <Group
        options={STATES}
        value={sifting.state}
        onChange={(state) => onChange({ ...sifting, state })}
        label="State"
      />
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
