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
 * among four hundred, the affordances belong in the open. They fold onto a
 * second line in a narrow column, which is the cost, and it is one line.
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
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.value}
          size="xs"
          variant={option.value === value ? 'secondary' : 'ghost'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(option.value === value && 'font-semibold')}
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
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <Input
        value={sifting.query}
        onChange={(event) => onChange({ ...sifting, query: event.target.value })}
        placeholder="Filter by number, title, label or person"
        aria-label="Filter references"
        className="h-8 min-w-40 flex-1"
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
