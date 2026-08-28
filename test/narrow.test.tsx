import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { EVERYTHING } from '@/live/sift.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { Toolbar } from '@/view/toolbar.tsx'

/**
 * What a narrow pane is allowed to take away, and what it is not.
 *
 * ## Why this file is assertions about class names, which is unusual
 *
 * Because the rule being kept is a rule about CSS, and the failure it guards
 * against is one nobody notices: a row drawn at four hundred pixels looks
 * finished, and the same row in a 220-pixel pane on somebody's canvas had
 * twelve pixels of title. Nothing threw, nothing was missing from the document,
 * and the promise in `collect.ts` — every reference becomes exactly one row —
 * was technically kept by a row that could not be read.
 *
 * happy-dom does not do layout, so these tests cannot measure a title's width;
 * the browser probes that were run against a real pane did that, and the
 * numbers are in this module's README. What a test CAN hold, and what breaks
 * quietly a year from now when somebody tidies a class list, is which pieces
 * are permitted to carry a hiding rule at all. `hidden @sm:block` on the people
 * column is the design. `hidden` anywhere near the identifier, the state or the
 * title is the bug.
 *
 * The other half is reachability. The drop order in `reference-row.tsx` argues
 * that what a narrow pane hides is still reachable, and this asserts the
 * mechanism that makes that true rather than the intention: the row carries the
 * whole of itself as a `title`, including the pieces no width is showing.
 */

afterEach(cleanup)

const READING = {
  generated: '2026-08-26T20:44:44Z',
  ghIssues: {
    'gh#131': {
      state: 'opened',
      title: 'Until Journeys can be read from a module, a pane is a picture of one',
      at: '2026-08-26T20:44:00Z',
      url: 'https://github.com/example/repo/issues/131',
      labels: ['area::modules', 'importance::P1'],
      assignees: ['ada lovelace'],
    },
  },
}

/** The one element that carries a row's layout, whichever tag it turned out to be. */
function rowLine(container: HTMLElement): HTMLElement {
  const line = container.querySelector('li[data-ref] > *')
  if (!(line instanceof HTMLElement)) throw new Error('the row drew nothing inside its <li>')
  return line
}

describe('the three things a row may never stop showing', () => {
  const three: ('identifier' | 'state' | 'title')[] = ['identifier', 'state', 'title']

  test.each(three)('the %s carries no rule that hides it at any width', (which) => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} />)
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
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} />)
    const className = rowLine(container).className
    expect(className).toContain('flex-col')
    expect(className).toContain('@xs:flex-row')
  })

  test('the width thresholds are container queries and never viewport ones', () => {
    /* The whole argument for `@` over `sm:` is that the pane's width and the
       window's width are different numbers. A stray `sm:` here would make the
       row decide out of the wrong one, and would look completely correct in
       every test and in a tab. */
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} />)
    const classes = [...container.querySelectorAll('*')].flatMap((e) => e.className.toString().split(/\s+/))
    const viewport = classes.filter((c) => /^(sm|md|lg|xl|2xl):/.test(c))
    expect(viewport).toEqual([])
  })
})

describe('what a narrow pane hides is still reachable', () => {
  test('the row carries everything it can drop as its own tooltip', () => {
    const { container } = render(<ReferenceList rows={collect(READING)} landedOn={null} />)
    const overview = rowLine(container).getAttribute('title') ?? ''
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
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    expect(rowLine(container).getAttribute('title')).toContain('nobody')
  })

  test('a state nobody could read is named in the tooltip, never left blank', () => {
    const rows = collect({ issues: { '1': { state: 'something-else', title: 'x' } } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    const overview = rowLine(container).getAttribute('title') ?? ''
    expect(overview).toContain('state unread')
    expect(overview).not.toContain('· opened ·')
  })
})

describe('the filter bar in a column narrower than it is', () => {
  test('every option is drawn, and the current one is marked, with no width to hide behind', () => {
    render(<Toolbar sifting={{ ...EVERYTHING, state: 'closed' }} onChange={() => {}} showing={1} total={24} />)
    for (const label of ['All', 'Issues', 'Changes', 'Any', 'Open', 'Merged', 'Closed']) {
      const button = screen.getByRole('button', { name: label })
      expect(button.className).not.toContain('hidden')
    }
    /* The point of the whole layout decision: whatever the pane does to this
       bar, the pressed button is in the document and is not hidden. A bar that
       scrolled its own overflow would pass the line above and still leave
       `Closed` off screen — which is why it wraps instead. */
    expect(screen.getByRole('button', { name: 'Closed' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
  })

  test('no part of the bar may overflow instead of wrapping', () => {
    /* Six pixels of a button past the right edge gave the whole page a sideways
       scrollbar, and the fix is that every flex line in here is allowed to
       break. Asserted on the two groups, because they are what overflowed. */
    const { container } = render(<Toolbar sifting={EVERYTHING} onChange={() => {}} showing={24} total={24} />)
    const groups = [...container.querySelectorAll('[role="group"]')]
    expect(groups).toHaveLength(2)
    for (const group of groups) expect(group.className).toContain('flex-wrap')
    const bar = groups[0]!.parentElement!
    expect(bar.className).toContain('flex-wrap')
  })

  test('the count names both numbers whatever the width, because a short list and a filtered one look the same', () => {
    const { rerender } = render(<Toolbar sifting={EVERYTHING} onChange={() => {}} showing={24} total={24} />)
    expect(screen.getByText('24 references')).toBeDefined()
    rerender(<Toolbar sifting={{ ...EVERYTHING, kind: 'issue' }} onChange={() => {}} showing={7} total={24} />)
    expect(screen.getByText('7 of 24 shown')).toBeDefined()
  })
})
