import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { EVERYTHING } from '@/live/sift.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { Toolbar } from '@/view/toolbar.tsx'

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

describe('the filter bar in a column narrower than it is', () => {
  test('the kind and the state are not drawn here any more, because the header draws them', () => {
    /* The move, asserted from this side. Seven buttons used to live in this bar
       and the whole of its layout argument was about fitting them into 220
       pixels; they are offered to the host now and drawn in the container's own
       header. A copy left behind would be two controls for one setting, one of
       which the reader could press without the other ever hearing about it. */
    render(
      <Toolbar sifting={{ ...EVERYTHING, state: 'closed' }} onQuery={() => {}} onClear={() => {}} ordering="moved" onOrder={() => {}} showing={1} total={24} />,
    )
    for (const label of ['All', 'Issues', 'Changes', 'Any', 'Open', 'Merged', 'Closed']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
    /* And what stayed: the query, the order and the count. */
    expect(screen.getByLabelText('Filter references')).toBeDefined()
    expect(screen.getByRole('button', { name: /Order the list/ })).toBeDefined()
  })

  test('no part of the bar may overflow instead of wrapping', () => {
    /* Six pixels of a button past the right edge gave the whole page a sideways
       scrollbar, and the fix is that every flex line in here is allowed to
       break. Fewer things wrap now than did, and the rule is the same one. */
    const { container } = render(
      <Toolbar sifting={EVERYTHING} onQuery={() => {}} onClear={() => {}} ordering="moved" onOrder={() => {}} showing={24} total={24} />,
    )
    const bar = container.querySelector('[data-toolbar]')!
    expect(bar.className).toContain('flex-wrap')
  })

  test('the count names both numbers whatever the width, because a short list and a filtered one look the same', () => {
    const { rerender } = render(
      <Toolbar sifting={EVERYTHING} onQuery={() => {}} onClear={() => {}} ordering="moved" onOrder={() => {}} showing={24} total={24} />,
    )
    expect(screen.getByText('24 references')).toBeDefined()
    rerender(
      <Toolbar sifting={{ ...EVERYTHING, kind: 'issue' }} onQuery={() => {}} onClear={() => {}} ordering="moved" onOrder={() => {}} showing={7} total={24} />,
    )
    expect(screen.getByText('7 of 24 shown')).toBeDefined()
  })

  test('Clear is offered for what the HOST is hiding, not only for what was typed here', () => {
    /* The failure this guards: a reader looking at four rows of twenty-four,
       with the reason in a header they have not looked at, and no button on the
       list to put it back. `narrowing` is asked about the composed setting for
       exactly this reason. */
    const pressed: string[] = []
    const { rerender } = render(
      <Toolbar sifting={EVERYTHING} onQuery={() => {}} onClear={() => pressed.push('clear')} ordering="moved" onOrder={() => {}} showing={24} total={24} />,
    )
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    rerender(
      <Toolbar sifting={{ ...EVERYTHING, state: 'closed' }} onQuery={() => {}} onClear={() => pressed.push('clear')} ordering="moved" onOrder={() => {}} showing={4} total={24} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(pressed).toEqual(['clear'])
  })
})
