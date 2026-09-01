import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { Heading } from '@/view/heading.tsx'

const PROJECT = '/Users/somebody/Projects/roadmap'

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

const READING = {
  generated: '2026-08-26T20:44:44Z',
  ghIssues: {
    'gh#131': {
      state: 'opened',
      title: 'Until Journeys can be read from a module, a container is a picture of one',
      at: '2026-08-26T20:44:00Z',
      url: 'https://github.com/example/repo/issues/131',
      labels: ['area::modules', 'importance::P1'],
      assignees: ['ada lovelace'],
    },
  },
}

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

describe('the three things a row may never stop showing', () => {
  const three: ('identifier' | 'state' | 'title')[] = ['identifier', 'state', 'title']

  test.each(three)('the %s carries no rule that hides it at any width', (which) => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const line = rowLine(container)
    /* First, second and third in document order: the identifier and the state
       are wrapped together in the stacked layout and dissolve into the line
       above 20rem, so the identifier is found by walking rather than by
       counting children. */
    const spans = [...line.querySelectorAll('span')]
    const identifier = spans.find((s) => s.textContent === 'gh#131')
    const state = spans.find((s) => s.textContent === 'open')
    const title = spans.find((s) => (s.textContent ?? '').startsWith('Until Journeys'))
    const found = { identifier, state, title }[which]
    expect(found).toBeDefined()
    /* Walk up to the row itself: a hiding rule on any ancestor inside the row
       hides the child just as thoroughly as one on the child. */
    for (let node: HTMLElement | null = found!; node && node !== line.parentElement; node = node.parentElement) {
      expect(node.className).not.toContain('hidden')
    }
  })

  test('the row is two lines when it is narrow and one line when it is not', () => {
    /* Not a measurement — happy-dom has no layout — but the pair of rules that
       makes the measurement come out. `flex-col` is the stacked layout and
       `@xs:flex-row` is the line, and one without the other is a row that is
       either always stacked or never rescued. */
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const className = rowLine(container).className
    expect(className).toContain('flex-col')
    expect(className).toContain('@xs:flex-row')
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
    expect(overview).toContain('opened')
    expect(overview).toContain('Until Journeys')
    expect(overview).toContain('area::modules')
    expect(overview).toContain('2026-08-26')
    expect(overview).toContain('ada lovelace')
  })

  test('a row with nobody on it says so in the tooltip too, rather than trailing off', () => {
    const rows = collect({ issues: { '1': { state: 'opened', title: 'x' } } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    expect(rowBox(container).getAttribute("title")).toContain('nobody')
  })

  test('a state nobody could read is named in the tooltip, never left blank', () => {
    const rows = collect({ issues: { '1': { state: 'something-else', title: 'x' } } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const overview = rowBox(container).getAttribute("title") ?? ''
    expect(overview).toContain('state unread')
    expect(overview).not.toContain('· opened ·')
  })
})

/**
 * The heading that replaced two rows of chrome.
 *
 * Everything the toolbar drew is somewhere else — the filters and the query in
 * the container's own header, the refresh and the freshness line as
 * `roadmap.refreshable`, the order on the columns it orders — except the count,
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
    const { rerender } = render(<Heading project={PROJECT} ordering="moved" onOrder={() => {}} showing={24} total={24} />)
    expect(screen.getByText('24 references')).toBeDefined()
    rerender(<Heading project={PROJECT} ordering="moved" onOrder={() => {}} showing={7} total={24} />)
    expect(screen.getByText('7 of 24 shown')).toBeDefined()
    /* And the short form for a narrow container, which is a shortening rather
       than a dropping: `7/24` is still both numbers. */
    expect(screen.getByText('7/24')).toBeDefined()
  })

  test('the whole of it is on the element’s own title, path and all', () => {
    /* The same rule every row keeps: what a narrow container takes away is
       still on the tooltip, in the order the wide layout would have drawn it. */
    const { container } = render(<Heading project={PROJECT} ordering="moved" onOrder={() => {}} showing={7} total={24} />)
    const heading = container.querySelector('[data-heading]')!
    expect(heading.getAttribute('title')).toContain(PROJECT)
    expect(heading.getAttribute('title')).toContain('7 of 24 shown')
  })

  test('every order is reachable, including the two whose column a narrow row drops', () => {
    /* The date, the labels and the people drop out of a narrow row. A sort
       control that dropped with its column would make "oldest first"
       unreachable in a 220-pixel container, which is most of them — so the date
       control loses its WORD and keeps its place. */
    const asked: string[] = []
    render(<Heading project={PROJECT} ordering="moved" onOrder={(o) => asked.push(o)} showing={24} total={24} />)
    for (const control of screen.getAllByRole('button')) {
      expect(control.className).not.toContain('hidden')
    }
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  test('the date heading toggles between the two questions it answers', () => {
    /* `moved` is "what is happening" and `stale` is "what has been sitting",
       which are two questions rather than one read backwards. */
    const asked: string[] = []
    const press = (ordering: 'moved' | 'stale') => {
      cleanup()
      render(<Heading project={PROJECT} ordering={ordering} onOrder={(o) => asked.push(o)} showing={24} total={24} />)
      fireEvent.click(screen.getByRole('button', { name: /oldest|newest|last moved/i }))
    }
    press('moved')
    press('stale')
    expect(asked).toEqual(['stale', 'moved'])
  })

  test('a one-direction heading sets its order and says which one is in force', () => {
    const asked: string[] = []
    render(<Heading project={PROJECT} ordering="ref" onOrder={(o) => asked.push(o)} showing={24} total={24} />)
    const ref = screen.getByRole('button', { name: /identifier/i })
    expect(ref.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /by state/i }))
    expect(asked).toEqual(['state'])
  })

  test('the kind order has a control even though the kind has no column', () => {
    /* A glyph on two rows out of twenty-four is those two rows standing out; a
       column would be noise on all of them. So the mark stays inside the
       identifier cell and its ORDER gets the leading cell, named in a tooltip —
       the trade the tracker link on every row already makes. */
    const asked: string[] = []
    render(<Heading project={PROJECT} ordering="moved" onOrder={(o) => asked.push(o)} showing={24} total={24} />)
    fireEvent.click(screen.getByRole('button', { name: /by kind/i }))
    expect(asked).toEqual(['kind'])
  })
})
