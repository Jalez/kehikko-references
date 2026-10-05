import { ArrowDown, ArrowUp, ArrowUpDown, GitPullRequest } from 'lucide-react'

import type { TrackerMissing } from 'kehikot-module-protocol'

import { cn } from '@/lib/utils'
import { ORDER_LABELS, type Ordering } from '@/live/order.ts'
import { projectName } from './absence.tsx'

/**
 * The table's heading: what each column is, what it is sorted by, and how much
 * of the reading is on screen.
 *
 * ## What was here before, and where all of it went
 *
 * Two rows of chrome. A header with the project name, a freshness line and a
 * Refresh button; and a toolbar with a query box, seven filter buttons, an
 * order trigger, a count and a Clear. At 220 pixels — an ordinary size on a
 * grid canvas — they came to about a hundred pixels between them, over a list
 * that had three hundred to divide. `view/toolbar.tsx` measured that and spent
 * two thousand words choosing the least bad way to fit it, and the file is gone
 * because the question it was answering has been dissolved rather than answered
 * better:
 *
 * - **The kind and state filters** are `kehikot.filters` groups now — one
 *   `hide` group of the shared ref facets since 2.3.0 — drawn in
 *   the container's own header beside every other module's.
 * - **The query** is a `text` filter group, drawn as an input inside the same
 *   menu. The protocol refused free text twice and the refusal is now written
 *   down as what it was — an argument about a text box in a header STRIP,
 *   applied to a control that is a MENU. See `LIMITS.FILTER_TEXT`.
 * - **Refresh, and the freshness line**, are `kehikot.refreshable`: the module
 *   says it can be read again and when it last read, and the host draws the
 *   control, the sentence and an auto-refresh interval it stores per container.
 * - **The order** is here, on the columns it orders, which is where a person
 *   looking at a table expects to find it.
 * - **The count** is here too, and is the one thing that could not move. See
 *   below.
 * - **Clear** is the host's "Show everything", which now puts back all three
 *   groups — including the query — in one press.
 *
 * What is left is one line, about twenty-four pixels, and it is the table's
 * heading rather than a strip of controls above it.
 *
 * ## The count could not leave, and this is the reason
 *
 * `37 of 412 shown` is the most important text on this surface. A filtered list
 * looks exactly like a short list, and somebody who has forgotten what is set
 * reads the second as the first and concludes the work is not there. The host
 * can say THAT something is narrowed — it fills in the funnel — and it cannot
 * say how much, because it sees rows it does not render, in a document it
 * cannot read, in a frame on another origin. Only this module can count, so
 * only this module can draw it, and hiding rows without saying how many is the
 * exact thing `live/sift.ts` was written to prevent.
 *
 * It sits in the title column, which is the one cell that is never dropped at
 * any width, and it shortens to `37/412` below 24rem rather than disappearing.
 *
 * ## Sorting on the columns, and the one that has no column
 *
 * Four orders have an obvious home: `ref` on the identifier, `state` on the
 * state, and `moved`/`stale` on the date, which is one control with two
 * directions — newest first, oldest first. The fifth is `kind`, and a kind has
 * no column of its own: it is a mark inside the identifier cell, because a
 * glyph on two rows out of twenty-four is those two rows standing out where a
 * column would be noise on all of them. So its control is the leading cell,
 * above the checkboxes, drawn as the same glyph the rows use and named in its
 * tooltip — the trade the tracker link on every row already makes.
 *
 * ## Every order stays reachable at every width, which the columns do not
 *
 * The date, the labels and the people drop out of a narrow row — the drop order
 * is argued in `reference-row.tsx` — and a sort control that dropped with its
 * column would make "oldest first" unreachable in a 220-pixel container, which
 * is most of them. So the date control stays and loses its WORD instead,
 * becoming an arrow named in its tooltip.
 *
 * The arithmetic, and it is arithmetic rather than a browser probe: at 220
 * pixels the row is 220 wide, the checkbox cell takes 28 and the tracker cell
 * 30, leaving 162. A glyph is 12 and a gap is 4; `Ref` is about 20 at 11px and
 * `State` about 30. Kind (16) plus Ref (36) plus State (46) plus the date arrow
 * (16) is 114, which leaves 48 for the count — and `37/412` is about 40. It
 * fits, with the labels that matter and without the two that do not.
 *
 * Two words and two glyphs was the trade `toolbar.tsx` refused for the FILTER
 * buttons, and refused correctly: a filter hides rows, so its state has to be
 * readable without pressing anything. An order hides nothing. That distinction
 * was already written down in the file this replaces, and it is what makes the
 * same trade right here and wrong there.
 *
 * ## The project's name, and the rule it follows
 *
 * It was a line of its own in the header and it is a prefix on the count now,
 * shown from 24rem up and dropped below that with the whole path on the row's
 * `title` at every width. That is the same discipline every row keeps: what a
 * narrow container takes away is still on the element's own tooltip, in the
 * order the wide layout would have drawn it.
 *
 * ## Which scope, and how old the reading is
 *
 * Two words after the count, both from issue #1, and both there because the
 * count alone stopped being enough the moment the scope went on by default.
 *
 * `this epic` (or `picked containers`) says what the first number is OF. A
 * list narrowed to the epic and a list of the whole project look identical,
 * and `37 of 412 shown` with no scope beside it reads as "a filter somebody set
 * is hiding 375", which sends a reader to the menus for a narrowing nobody set.
 * Nothing is drawn when the scope is off, or has nothing to narrow to: the
 * count then is the project's, which is what a bare count has always meant.
 *
 * `read 6 d ago` says how old the reading is. The host draws its own freshness
 * line from `kehikot.refreshable`, but only where it has room for one and only
 * in its header, and a list a day old looks exactly like a live one unless the
 * list itself says otherwise. It is the shared reading's own `at` — when the
 * host's reading last changed — never the moment the page asked. It used to be
 * the date of this app's own snapshot; there is no such snapshot any more
 * (issue #4), and a source whose last read failed says so, with its own date,
 * in the line under this one — see `view/sources.tsx`.
 *
 * `3 unread` is the refs the reading names but has no row for — not read yet,
 * not found, on no tracker this project reads — counted, and listed in the
 * tooltip with why. A ref the epic names that is on no row would otherwise be
 * simply absent, which is the failure this module is written against.
 */

/** Which order each column heading sets, and what its arrow means. */
type Column = 'ref' | 'state' | 'date' | 'kind'

export function Heading({
  project,
  ordering,
  onOrder,
  showing,
  total,
  scope = null,
  at,
  unread = [],
  now,
}: {
  /** The absolute project folder. The last segment is drawn; the whole thing is the tooltip. */
  project: string
  ordering: Ordering
  onOrder: (ordering: Ordering) => void
  showing: number
  total: number
  /** What the scope is narrowing to, or `null` when it is not narrowing. */
  scope?: 'epic' | 'containers' | null
  /** When the shared reading last changed, as the reading says. `undefined` draws no age at all. */
  at?: string | null
  /** The refs the reading names and holds no row for, and why. */
  unread?: readonly TrackerMissing[]
  /** The time to measure the age against. A parameter so a test can hold it still. */
  now?: number
}) {
  const count = showing === total ? `${total} references` : `${showing} of ${total} shown`
  const brief = showing === total ? `${total}` : `${showing}/${total}`
  const within = scope === 'epic' ? 'this epic' : scope === 'containers' ? 'picked containers' : null
  const age = at === undefined ? null : ageOf(at, now)
  const gaps = unread.length ? `${unread.length} unread` : null
  const why = unread.map((gap) => `${gap.ref}: ${MISSING[gap.reason]}`)

  return (
    <div
      data-heading="columns"
      title={[[project, count, within, age, gaps].filter(Boolean).join(' · '), ...why].join('\n')}
      className="flex items-stretch border-b border-border bg-muted/30"
    >
      {/* Above the checkboxes, and the same width as them, so the columns below
          line up. It is a control rather than a label because the thing it
          sorts by has no column — see the essay. */}
      <span className="flex shrink-0 items-center pr-1 pl-2">
        <Sort
          column="kind"
          ordering={ordering}
          onOrder={onOrder}
          hint="Sort by kind: issues first, then changes"
        >
          <GitPullRequest className="size-3" />
        </Sort>
      </span>

      {/* The same `@container` the row's pressable middle is, so every threshold
          below is measured against the same box the row's columns are. A
          heading whose breakpoints were the container's and a row whose
          breakpoints were this box's would part company at exactly one width,
          which is the kind of bug nobody finds by looking. */}
      <div className="@container flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-1 @md:gap-3">
        <span className="flex shrink-0 items-center justify-end @md:w-[5.5rem]">
          <Sort column="ref" ordering={ordering} onOrder={onOrder} hint="Sort by identifier">
            Ref
          </Sort>
        </span>

        <span className="shrink-0 @md:w-[4.5rem]">
          <Sort column="state" ordering={ordering} onOrder={onOrder} hint="Sort by state: open work first">
            State
          </Sort>
        </span>

        {/* The count, in the cell that is never dropped. `tabular-nums` so the
            numbers do not shuffle sideways while somebody types in the filter
            and the left figure changes on every keystroke. */}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-muted-foreground">
          <span className="hidden @sm:inline">{projectName(project)} · </span>
          <span className="@sm:hidden">{brief}</span>
          <span className="hidden @sm:inline">{count}</span>
          {within && <span className="hidden @sm:inline"> · {within}</span>}
          {age && <span className="hidden @md:inline"> · {age}</span>}
          {gaps && <span className="hidden @md:inline"> · {gaps}</span>}
        </span>

        {/* Kept at every width where its column is not, because an order nobody
            can reach in a 220-pixel container is an order that does not exist
            for most of the containers this module is put in. */}
        <span className="flex shrink-0 items-center justify-end @xl:w-[5.5rem]">
          <Sort
            column="date"
            ordering={ordering}
            onOrder={onOrder}
            /* One phrase in all three states — "when it last moved" — with what
               pressing would DO appended when this is the column in force. A
               control whose name changed entirely between states is one nobody
               can search for, which is the failure the host's own `Filters.tsx`
               has an essay about. */
            hint={
              ordering === 'moved'
                ? 'Sort by when it last moved: newest first now, press for oldest'
                : ordering === 'stale'
                  ? 'Sort by when it last moved: oldest first now, press for newest'
                  : 'Sort by when it last moved'
            }
          >
            <span className="hidden @xl:inline">Updated</span>
          </Sort>
        </span>

        {/* The people column's width, held empty. A heading cell with nothing in
            it keeps the columns beneath it where they are; a missing one would
            slide the date heading out from over the dates. */}
        <span className="hidden w-32 shrink-0 @sm:block" aria-hidden="true" />
      </div>

      {/* And the tracker link's cell, held the same way and for the same
          reason. */}
      <span className="w-[30px] shrink-0" aria-hidden="true" />
    </div>
  )
}

/**
 * One column heading that sorts, in shadcn's shape: a quiet button carrying the
 * label and an arrow that says whether this is the column in force.
 *
 * ## What a press does, and the one column that has two directions
 *
 * `ref`, `state` and `kind` are one direction each — an identifier has no
 * "descending" that anybody asks for by name, and `state` is ordered along the
 * line work travels rather than alphabetically, so reversing it would produce a
 * sequence nobody means. Pressing one of those sets its order and pressing it
 * again does nothing, which is the honest behaviour for a control with one
 * state.
 *
 * The date has two, and they are two genuinely different questions rather than
 * one question read backwards: `moved` is "what is happening" and `stale` is
 * "what has been sitting". So pressing it toggles, and the arrow says which.
 *
 * ## The arrow, and why an inactive column still has one
 *
 * A column with no arrow at all reads as a column that cannot be sorted, and a
 * person who has not pressed anything would have no way to discover that four
 * of these do something. So an inactive heading carries the neutral
 * double-arrow at low contrast — visible enough to be an affordance, quiet
 * enough not to compete with the one that is actually in force.
 */
function Sort({
  column,
  ordering,
  onOrder,
  hint,
  children,
}: {
  column: Column
  ordering: Ordering
  onOrder: (ordering: Ordering) => void
  hint: string
  children?: React.ReactNode
}) {
  const active =
    column === 'date' ? ordering === 'moved' || ordering === 'stale' : ordering === column
  const press = () => {
    if (column === 'date') {
      onOrder(ordering === 'moved' ? 'stale' : 'moved')
      return
    }
    onOrder(column)
  }

  return (
    <button
      type="button"
      onClick={press}
      title={hint}
      /* The accessible name says what the control does and what it is currently
         doing, because two of these are glyphs and one of them is the only
         thing on the row that can say "oldest first". `aria-pressed` says the
         state as well, for a reader whose software announces it. */
      aria-label={`${hint}${active ? `. Currently ${ORDER_LABELS[ordering]}` : ''}`}
      aria-pressed={active}
      className={cn(
        'flex min-w-0 cursor-pointer items-center gap-0.5 rounded px-0.5 text-[11px] hover:bg-accent/60',
        active ? 'font-semibold text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
      {active ? (
        ordering === 'stale' ? (
          <ArrowUp className="size-3 shrink-0" />
        ) : (
          <ArrowDown className="size-3 shrink-0" />
        )
      ) : (
        <ArrowUpDown className="size-3 shrink-0 opacity-40" />
      )}
    </button>
  )
}

/** Why a ref has no row, in the words the heading's tooltip uses. */
const MISSING: Record<TrackerMissing['reason'], string> = {
  pending: 'not read yet',
  'not-found': 'its tracker has no such issue or change',
  'no-tracker': 'no tracker this project reads',
  failed: 'its tracker could not be read',
}

/**
 * How old a reading is, in the fewest words that still say it.
 *
 * Coarse on purpose: minutes, hours, days. The exact instant is on the host's
 * own freshness line, and the question this answers is only "is this list
 * from today". `null` is the protocol's "nothing has ever been read", and a
 * date this cannot parse says so rather than guessing — an undated list is the
 * one most worth doubting.
 */
export function ageOf(read: string | null, now: number = Date.now()): string {
  if (read === null) return 'not read yet'
  const at = Date.parse(read)
  if (Number.isNaN(at)) return 'reading not dated'
  const minutes = Math.max(0, Math.floor((now - at) / 60_000))
  if (minutes < 1) return 'read just now'
  if (minutes < 60) return `read ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `read ${hours} h ago`
  return `read ${Math.floor(hours / 24)} d ago`
}
