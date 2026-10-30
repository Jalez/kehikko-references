import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { Heading, ageOf } from '@/view/heading.tsx'
import { row } from './fixtures.ts'

const PROJECT = '/Users/somebody/Projects/kehikko'

/**
 * What a narrow container is allowed to take away, and what it is not.
 *
 * ## Why this file is assertions about class names, which is unusual
 *
 * Because the rule being kept is a rule about CSS, and the failure it guards
 * against is one nobody notices: a row drawn at four hundred pixels looks
 * finished, and the same row in a 220-pixel container on somebody's canvas had
 * twelve pixels of title. Nothing threw, nothing was missing from the document,
 * and the promise in `collect.ts` — every reference becomes exactly one row —
 * was technically kept by a row that could not be read.
 *
 * happy-dom does not do layout, so these tests cannot measure a title's width;
 * the browser probes that were run against a real container did that, and the
 * numbers are in this module's README. What a test CAN hold, and what breaks
 * quietly a year from now when somebody tidies a class list, is which pieces
 * are permitted to carry a hiding rule at all. `hidden @sm:block` on the people
 * column is the design. `hidden` anywhere near the identifier, the state or the
 * title is the bug.
 *
 * The other half is reachability. The drop order in `reference-row.tsx` argues
 * that what a narrow container hides is still reachable, and this asserts the
 * mechanism that makes that true rather than the intention: the row carries the
 * whole of itself as a `title`, including the pieces no width is showing.
 */

afterEach(cleanup)

const READING = [
  row('gh#131', {
    title: 'Until Journeys can be read from a module, a container is a picture of one',
    updatedAt: '2026-08-26T20:44:00Z',
    url: 'https://github.com/example/repo/issues/131',
    labels: ['area::modules', 'importance::P1'],
    assignees: ['ada lovelace'],
  }),
]

/**
 * The one element that carries a row's columns.
 *
 * It is the pressable middle of the row now rather than the row's only child:
 * the checkbox and the tracker link are siblings of it, and they are not part of
 * the layout these tests are about. It is the row's only direct child that is a
 * button — the checkbox is one too, and is nested inside a span for exactly the
 * padding reason given in `reference-row.tsx`, which is what makes `>` enough to
 * tell them apart.
 */
function rowLine(container: HTMLElement): HTMLElement {
  const line = container.querySelector('li[data-ref] > button')
  if (!(line instanceof HTMLElement)) throw new Error('the row drew nothing pressable inside its <li>')
  return line
}

/** The row itself, which is where the whole-row tooltip hangs. */
function rowBox(container: HTMLElement): HTMLElement {
  const li = container.querySelector('li[data-ref]')
  if (!(li instanceof HTMLElement)) throw new Error('no row was drawn at all')
  return li
}

describe('what a row may never stop showing, and the title it now may (issue #24)', () => {
  const two: ('identifier' | 'state')[] = ['identifier', 'state']

  /** Every class on the element and its ancestors inside the row. */
  const rulesUp = (found: HTMLElement, line: HTMLElement) => {
    const out: string[] = []
    for (let node: HTMLElement | null = found; node && node !== line.parentElement; node = node.parentElement) {
      out.push(...node.className.toString().split(/\s+/))
    }
    return out
  }

  test.each(two)('the %s carries no rule that hides it at any width', (which) => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const line = rowLine(container)
    const spans = [...line.querySelectorAll('span')]
    const identifier = spans.find((s) => s.textContent === 'gh#131')
    /* The state is a glyph beside the pipeline mark now, outside the pressable box. */
    const state = container.querySelector('li[data-ref] [data-marker^="state-"]') as HTMLElement | null
    const found = { identifier, state }[which]
    expect(found).toBeDefined()
    /* Walk up to the row itself: a hiding rule on any ancestor inside the row
       hides the child just as thoroughly as one on the child. */
    for (const rule of rulesUp(found!, line)) expect(rule).not.toMatch(/(^|:)(hidden|sr-only)$/)
  })

  test('the title is not drawn under 24rem of the frame, and is drawn from it', () => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const title = rowLine(container).querySelector('[data-title]') as HTMLElement
    expect(title.textContent).toStartWith('Until Journeys')
    const rules = title.className.split(/\s+/)
    expect(rules).toContain('hidden')
    /* Measured against the FRAME by name, not the pressable box: the markers
       beside the box make its width differ from row to row. */
    expect(rules).toContain('@sm/frame:block')
  })

  test('where the title is not drawn it is still the pressable box’s accessible name, and in the row’s tooltip', () => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const spoken = rowLine(container).querySelector('[data-title-spoken]') as HTMLElement
    expect(spoken.textContent).toStartWith('Until Journeys')
    const rules = spoken.className.split(/\s+/)
    /* Read by a screen reader below 24rem, gone above it where the drawn one is the name. */
    expect(rules).toContain('sr-only')
    expect(rules).toContain('@sm/frame:hidden')
    expect(rowBox(container).getAttribute('title')).toContain('Until Journeys')
  })

  test('the markers carry no rule that hides them at any width', () => {
    const rows = collect([
      row('gh#131', { kind: 'change', assignees: ['ada'], reviewers: [{ login: 'mona', state: 'requested' }], lastActivity: { login: 'mona', at: '2026-08-27T08:00:00Z', kind: 'comment', mine: false } }),
    ])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const cluster = container.querySelector('[data-markers]') as HTMLElement
    const marks = [...cluster.querySelectorAll('[data-marker]')] as HTMLElement[]
    expect(marks.map((m) => m.dataset.marker)).toEqual(['assigned', 'review-asked', 'state-change-open'])
    for (const m of [cluster, ...marks]) expect(m.className).not.toMatch(/(^|\s|:)hidden(\s|$)/)
  })

  test('under 24rem of the frame only "⋯" is left at the row’s end; from it the copy button is beside it', () => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const li = rowBox(container)
    const menu = li.querySelector('[data-row-menu]') as HTMLElement
    expect(menu.getAttribute('aria-label')).toBe('More for gh#131')
    for (let node: HTMLElement | null = menu; node && node !== li; node = node.parentElement) {
      expect(node.className).not.toMatch(/(^|\s|:)(hidden|sr-only)(\s|$)/)
    }
    const copy = li.querySelector('[data-copy]')!.parentElement as HTMLElement
    expect(copy.className.split(/\s+/)).toContain('hidden')
    expect(copy.className.split(/\s+/)).toContain('@sm/frame:flex')
    /* Nothing else at the row's end: no loose open link, no bell. */
    expect(li.querySelector('a[target="_blank"]')).toBeNull()
    expect(li.querySelector('[data-marker="unaddressed"]')).toBeNull()
  })

  test('the row is one line at every width: no stacked layout left to fall back to', () => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const className = rowLine(container).className
    expect(className).toContain('h-9')
    expect(className).not.toContain('flex-col')
  })

  test('the width thresholds are container queries and never viewport ones', () => {
    /* The whole argument for `@` over `sm:` is that the container's width and the
       window's width are different numbers. A stray `sm:` here would make the
       row decide out of the wrong one, and would look completely correct in
       every test and in a tab. */
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const classes = [...container.querySelectorAll('*')].flatMap((e) => e.className.toString().split(/\s+/))
    const viewport = classes.filter((c) => /^(sm|md|lg|xl|2xl):/.test(c))
    expect(viewport).toEqual([])
  })
})

describe('what a narrow container hides is still reachable', () => {
  test('the row carries everything it can drop as its own tooltip', () => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const overview = rowBox(container).getAttribute("title") ?? ''
    /* Every piece the drop order is allowed to take away has to be in here,
       because this is the answer to "reachable how" for somebody who does not
       know the word to type into the filter. */
    expect(overview).toContain('gh#131')
    expect(overview).toContain('open')
    expect(overview).toContain('Until Journeys')
    expect(overview).toContain('area::modules')
    expect(overview).toContain('2026-08-26')
    expect(overview).toContain('ada lovelace')
  })

  test('a row with nobody on it says so in the tooltip too, rather than trailing off', () => {
    const rows = collect([row('#1', { title: 'x' })])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    expect(rowBox(container).getAttribute("title")).toContain('nobody')
  })

  test('a state nobody could read is named in the tooltip, never left blank', () => {
    const rows = collect([{ ref: '#1', state: 'something-else', title: 'x' }])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const overview = rowBox(container).getAttribute("title") ?? ''
    expect(overview).toContain('state unread')
    expect(overview).not.toContain('· open ·')
  })
})

/**
 * The heading that replaced two rows of chrome.
 *
 * Everything the toolbar drew is somewhere else — the filters and the query in
 * the container's own header, the refresh and the freshness line as
 * `kehikot.refreshable`, the order on the columns it orders — except the count,
 * which could not move because the host cannot count rows it does not render.
 *
 * So what is worth holding here is what the old bar's tests held, translated:
 * that the count always names both numbers, that nothing overflows instead of
 * wrapping, and that every ORDER stays reachable even at widths where its
 * column is not drawn.
 */
describe('the table’s heading, at every width', () => {
  test('the count is always drawn, and always names both numbers', () => {
    /* A filtered list looks exactly like a short list. This is the sentence
       that tells them apart, and it is the one thing on this surface a host
       could not have drawn. */
    const { rerender } = render(<Heading project={PROJECT} showing={24} total={24} />)
    expect(screen.getByText('24 references')).toBeDefined()
    rerender(<Heading project={PROJECT} showing={7} total={24} />)
    expect(screen.getByText('7 of 24 shown')).toBeDefined()
    /* And the short form for a narrow container, which is a shortening rather
       than a dropping: `7/24` is still both numbers. */
    expect(screen.getByText('7/24')).toBeDefined()
  })

  test('the whole of it is on the element’s own title, path and all', () => {
    /* The same rule every row keeps: what a narrow container takes away is
       still on the tooltip, in the order the wide layout would have drawn it. */
    const { container } = render(<Heading project={PROJECT} showing={7} total={24} />)
    const heading = container.querySelector('[data-heading]')!
    expect(heading.getAttribute('title')).toContain(PROJECT)
    expect(heading.getAttribute('title')).toContain('7 of 24 shown')
  })

  test('the count wraps rather than being cut: truncating it hid the scope', () => {
    const { container } = render(<Heading project={PROJECT} showing={0} total={6} scope="epic" />)
    const count = container.querySelector('[data-heading="count"]')!
    expect(count.className).not.toContain('truncate')
    expect(count.className).toContain('break-words')
    expect(count.textContent).toContain('0 of 6 shown')
    expect(count.textContent).toContain('this epic')
  })

  test('says which scope the count is of, and how old the reading is', () => {
    const now = Date.parse('2026-10-05T12:00:00Z')
    const { container } = render(
      <Heading
        project={PROJECT}
        showing={7}
        total={24}
        scope="epic"
        at="2026-09-29T08:00:00Z"
        unread={[
          { ref: '#9', reason: 'pending' },
          { ref: 'gl#3', reason: 'no-tracker' },
        ]}
        now={now}
      />,
    )
    const heading = container.querySelector('[data-heading]')!
    expect(heading.textContent).toContain('this epic')
    expect(heading.textContent).toContain('read 6 d ago')
    /* The age is the shared reading's, and the refs it names without a row are
       counted, and listed with why in the tooltip — never simply absent. */
    expect(heading.textContent).toContain('2 unread')
    expect(heading.getAttribute('title')).toContain('7 of 24 shown · this epic · read 6 d ago · 2 unread')
    expect(heading.getAttribute('title')).toContain('#9: not read yet')
    expect(heading.getAttribute('title')).toContain('gl#3: no tracker this project reads')
  })

  test('the age is coarse, and an undated reading says so', () => {
    const now = Date.parse('2026-10-05T12:00:00Z')
    expect(ageOf('2026-10-05T11:59:40Z', now)).toBe('read just now')
    expect(ageOf('2026-10-05T11:48:00Z', now)).toBe('read 12 min ago')
    expect(ageOf('2026-10-04T12:00:00Z', now)).toBe('read 24 h ago')
    expect(ageOf('2026-09-29T08:00:00Z', now)).toBe('read 6 d ago')
    expect(ageOf(null, now)).toBe('not read yet')
    expect(ageOf('yesterday-ish', now)).toBe('reading not dated')
  })

  test('the heading carries no sort controls: the order is the View menu\'s', () => {
    /* It used to draw five buttons on column headings. The row is the count and
       nothing else now, so a narrow container loses no order and no space. */
    render(<Heading project={PROJECT} showing={24} total={24} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

/**
 * The parts focus, about which the heading says nothing.
 *
 * It used to grow a second line while a part was picked — how many rows were
 * outside and which parts. The line is gone: the host's bar shows the pick,
 * and the heading is the one line it always was. What is held is that the
 * heading has no way to be handed a focus at all.
 */
describe('the parts focus, in the heading', () => {
  test('the heading is one line and draws nothing about picked parts', () => {
    const { container } = render(<Heading project={PROJECT} showing={6} total={24} />)
    expect(container.querySelector('[data-heading="focus"]')).toBeNull()
    expect(container.textContent).not.toContain('outside')
    expect(container.textContent).not.toContain('picked part')
  })
})
