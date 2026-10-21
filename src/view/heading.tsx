import type { TrackerMissing } from 'kehikot-module-protocol'

import { projectName } from './absence.tsx'

/**
 * The table's heading: how much of the reading is on screen.
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
 * - **The order** is the View menu's "Sort by" switch, a `kehikot.header` item.
 * - **The count** is here, and is the one thing that could not move. See
 *   below.
 * - **Clear** is the host's "Show everything", which now puts back all three
 *   groups — including the query — in one press.
 *
 * What is left is one line holding the count, with no controls on it.
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
 * ## Sorting is not here any more

It was five buttons on this row — a kind glyph over the checkboxes, `Ref`,
`State` and the date — and the row they sat on cost its height at every width,
with spacer cells to keep them over their columns. The order is the View menu's
"Sort by" switch now (`kehikot.header`, `orderItem` in `live/order.ts`), beside
the filters, so it is reachable at any width by keyboard through the host's own
menu and costs this module no space. What is left is the count, which is why
the row is still here.

## The project's name, and the rule it follows
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
 *
 * ## The parts focus, which gets no line
 *
 * While parts of the epic are picked out in the host's bar the list draws only
 * the rows those parts list. The heading used to grow a second line saying so
 * and counting what was outside; it cost its twenty pixels at every width, and
 * the host's bar already shows the pick. The heading is the one line it has
 * always been, whatever is picked.
 */

export function Heading({
  project,
  showing,
  total,
  scope = null,
  at,
  unread = [],
  now,
}: {
  /** The absolute project folder. The last segment is drawn; the whole thing is the tooltip. */
  project: string
  showing: number
  total: number
  /** What the scope is narrowing to, or `null` when it is not narrowing. */
  scope?: 'epic' | 'containers' | 'review' | 'mine' | null
  /** When the shared reading last changed, as the reading says. `undefined` draws no age at all. */
  at?: string | null
  /** The refs the reading names and holds no row for, and why. */
  unread?: readonly TrackerMissing[]
  /** The time to measure the age against. A parameter so a test can hold it still. */
  now?: number
}) {
  const count = showing === total ? `${total} references` : `${showing} of ${total} shown`
  const brief = showing === total ? `${total}` : `${showing}/${total}`
  const within =
    scope === 'epic'
      ? 'this epic'
      : scope === 'containers'
        ? 'picked containers'
        : scope === 'review'
          ? 'asked to review'
          : scope === 'mine'
            ? 'mine'
            : null
  const age = at === undefined ? null : ageOf(at, now)
  const gaps = unread.length ? `${unread.length} unread` : null
  const why = unread.map((gap) => `${gap.ref}: ${MISSING[gap.reason]}`)

  return (
    <div
      data-heading="columns"
      title={[[project, count, within, age, gaps].filter(Boolean).join(' · '), ...why].join('\n')}
      className="@container flex items-center border-b border-border bg-muted/30 px-3 py-0.5"
    >
      {/* The count, and nothing else. `tabular-nums` so the numbers do not
          shuffle sideways while somebody types in the filter and the left
          figure changes on every keystroke. */}
      <span data-heading="count" className="min-w-0 flex-1 break-words font-mono text-[11px] leading-tight tabular-nums text-muted-foreground">
        <span className="hidden @sm:inline">{projectName(project)} · </span>
        <span className="@sm:hidden">{brief}</span>
        <span className="hidden @sm:inline">{count}</span>
        {within && <span className="hidden @sm:inline"> · {within}</span>}
        {age && <span className="hidden @md:inline"> · {age}</span>}
        {gaps && <span className="hidden @md:inline"> · {gaps}</span>}
      </span>
    </div>
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
