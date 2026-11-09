import { useState } from 'react'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LIMITS } from 'kehikot-module-protocol'

import { collect } from '@/live/collect.ts'
import type { Copied, Payload } from '@/live/copy.ts'
import { footerItems, FOOTER } from '@/live/footer.ts'
import { MENU_ACTIONS, menuCopy, menuHasStacks, menuRows, opensMenu } from '@/live/item-menu.ts'
import { reading, writing } from '@/live/keep.ts'
import {
  LOOKBACK_SECONDS,
  ONE_UP_BELOW,
  isUnseen,
  kehikkoKey,
  markSeen,
  oneUpFits,
  oneUpOrder,
  positionSaid,
  relatedOf,
  seenOf,
  stepTo,
  type Seen,
} from '@/live/one-up.ts'
import { ItemMenu, useItemMenu } from '@/view/item-menu.tsx'
import { OneUp, cardFacts } from '@/view/one-up.tsx'
import { row } from './fixtures.ts'

afterEach(cleanup)

const NOW = Date.parse('2026-08-27T12:00:00Z')
const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('when the one-up view is drawn', () => {
  test('under three rows tall, at any width', () => {
    expect(oneUpFits(800, ONE_UP_BELOW.height - 1)).toBe(true)
    expect(oneUpFits(800, ONE_UP_BELOW.height)).toBe(false)
    expect(oneUpFits(null, 60)).toBe(true)
  })
  test('narrower than the tight fit and shorter than that square: a postage stamp', () => {
    expect(oneUpFits(239, 239)).toBe(true)
    expect(oneUpFits(240, 200)).toBe(false)
    expect(oneUpFits(200, 240)).toBe(false)
  })
  test('a tall narrow list beside a journey stays a list, and so does a big one', () => {
    expect(oneUpFits(200, 700)).toBe(false)
    expect(oneUpFits(600, 400)).toBe(false)
  })
  test('an unmeasured list is never one-up', () => {
    expect(oneUpFits(null, null)).toBe(false)
    expect(oneUpFits(100, 0)).toBe(false)
    expect(oneUpFits(100, Number.NaN)).toBe(false)
  })
})

describe('seen, per kehikko', () => {
  const seen: Seen = { w: secs('2026-08-25T00:00:00Z'), r: { '#2': secs('2026-08-26T10:00:00Z') } }
  test('moved after the watermark and after it was seen is unseen', () => {
    expect(isUnseen({ ref: '#1', at: '2026-08-26T00:00:00Z' }, seen)).toBe(true)
    expect(isUnseen({ ref: '#1', at: '2026-08-24T00:00:00Z' }, seen)).toBe(false)
    expect(isUnseen({ ref: '#2', at: '2026-08-26T10:00:00Z' }, seen)).toBe(false)
    expect(isUnseen({ ref: '#2', at: '2026-08-26T11:00:00Z' }, seen)).toBe(true)
  })
  test('the last activity counts over the date, and the person’s own is seen', () => {
    const last = { login: 'mona', kind: 'comment' as const, at: '2026-08-26T12:00:00Z', mine: false }
    expect(isUnseen({ ref: '#3', at: '2026-08-20T00:00:00Z', lastActivity: last }, seen)).toBe(true)
    expect(isUnseen({ ref: '#3', at: '2026-08-26T00:00:00Z', lastActivity: { ...last, mine: true } }, seen)).toBe(false)
  })
  test('a dateless row is never unseen', () => {
    expect(isUnseen({ ref: '#4', at: '' }, seen)).toBe(false)
  })
  test('a kehikko with no record counts the last three days', () => {
    expect(seenOf({}, 'k', NOW)).toEqual({ w: Math.floor(NOW / 1000) - LOOKBACK_SECONDS, r: {} })
  })
  test('marking seen records the activity on that kehikko only, and moves it last', () => {
    const book = { a: { w: 0, r: {} }, b: { w: 0, r: {} } }
    const next = markSeen(book, 'a', { ref: '#1', at: '2026-08-26T00:00:00Z' }, NOW)
    expect(Object.keys(next)).toEqual(['b', 'a'])
    expect(next.a!.r['#1']).toBe(secs('2026-08-26T00:00:00Z'))
    expect(next.b).toEqual({ w: 0, r: {} })
    expect(markSeen(next, 'a', { ref: '#1', at: '2026-08-26T00:00:00Z' }, NOW)).toBe(next)
  })
  test('the kehikko key is its key, else its id', () => {
    expect(kehikkoKey({ id: 4, key: 'wide' })).toBe('wide')
    expect(kehikkoKey({ id: 4 })).toBe('4')
    expect(kehikkoKey(null)).toBe('')
  })
  test('it is kept with the order, never past the protocol’s cap, and an older string still reads', () => {
    const kept = { ordering: 'moved' as const, seen: { wide: { w: 100, r: { '#1': 200 } } } }
    expect(reading(writing(kept))).toEqual(kept)
    expect(reading(JSON.stringify({ v: 3, o: 'ref' }))).toEqual({ ordering: 'ref' })
    expect(reading(JSON.stringify({ v: 3, o: 'ref', s: { k: ['zz', { '#1': '!!' }], bad: 4 } }))).toEqual({
      ordering: 'ref',
      seen: { k: { w: parseInt('zz', 36), r: {} } },
    })
    const big: Record<string, Seen> = {}
    for (let k = 0; k < 10; k++) {
      const r: Record<string, number> = {}
      for (let i = 0; i < 80; i++) r[`gh:owner/repo#${1000 + i}`] = 1_800_000_000 + i
      big[`kehikko-${k}`] = { w: 1_700_000_000, r }
    }
    const text = writing({ ordering: 'moved', seen: big })
    expect(text.length).toBeLessThanOrEqual(LIMITS.MODULE_STATE)
    const back = reading(text)!
    /* The most recently touched kehikko is the one kept. */
    expect(Object.keys(back.seen!)).toContain('kehikko-9')
    expect(Object.keys(back.seen!)).not.toContain('kehikko-0')
  })
})

describe('the one-up order', () => {
  const seen: Seen = { w: secs('2026-08-25T00:00:00Z'), r: { '#3': secs('2026-08-26T09:00:00Z') } }
  const rows = [
    { ref: '#1', at: '2026-08-20T00:00:00Z' },
    { ref: '#2', at: '2026-08-26T08:00:00Z' },
    { ref: '#3', at: '2026-08-26T09:00:00Z' },
    { ref: '#4', at: '' },
    { ref: '#5', at: '2026-08-26T10:00:00Z' },
    { ref: '#6', at: '2026-08-24T00:00:00Z' },
  ]
  test('unseen first, newest first; then the rest by recent activity; dateless last', () => {
    expect(oneUpOrder(rows, seen).map((r) => r.ref)).toEqual(['#5', '#2', '#3', '#6', '#1', '#4'])
  })
  test('nothing is dropped', () => {
    expect(oneUpOrder(rows, seen)).toHaveLength(rows.length)
  })
})

describe('the keys and the readout', () => {
  test('one card per key, held at the ends', () => {
    expect(stepTo('ArrowDown', 0, 3)).toBe(1)
    expect(stepTo('ArrowDown', 2, 3)).toBe(2)
    expect(stepTo('ArrowUp', 0, 3)).toBe(0)
    expect(stepTo('PageDown', 1, 3)).toBe(2)
    expect(stepTo('End', 0, 3)).toBe(2)
    expect(stepTo('Home', 2, 3)).toBe(0)
    expect(stepTo('a', 0, 3)).toBeNull()
  })
  test('3 / 12', () => {
    expect(positionSaid(2, 12)).toBe('3 / 12')
    expect(positionSaid(20, 12)).toBe('12 / 12')
  })
  test('the footer reads the position first, and what the menu copied', () => {
    const items = footerItems(
      { project: '/p/harbour', showing: 12, total: 40, at: null },
      null,
      { position: '3 / 12', menu: { said: 'Copied 12', tooltip: 'x' } },
    )
    expect(items[0]).toMatchObject({ id: FOOTER.position, text: '3 / 12' })
    expect(items.find((i) => i.id === FOOTER.menuCopied)).toMatchObject({ text: 'Copied 12' })
    expect(footerItems({ project: '/p/harbour', showing: 12, total: 40, at: null }).some((i) => i.id === FOOTER.position)).toBe(false)
  })
})

/* A line stack #21 → #22 → #23, an issue #9 that #22 is part of, and an unrelated #30. */
const READING = collect([
  row('#21', { kind: 'change', title: 'one', stack: { above: ['#22'] }, updatedAt: '2026-08-26T01:00:00Z' }),
  row('#22', { kind: 'change', title: 'two', stack: { below: '#21', above: ['#23'] }, contributes: ['#9'], updatedAt: '2026-08-26T02:00:00Z' }),
  row('#23', { kind: 'change', title: 'three', stack: { below: '#22' }, updatedAt: '2026-08-26T03:00:00Z' }),
  row('#9', { title: 'the issue', updatedAt: '2026-08-26T04:00:00Z' }),
  row('#30', { title: 'elsewhere', updatedAt: '2026-08-26T05:00:00Z' }),
] as never)
const by = (ref: string) => READING.find((r) => r.ref === ref)!
const url = (ref: string) => by(ref).url

describe('related', () => {
  test('the whole stack, bottom first, then what it is tied to, the item first', () => {
    expect(relatedOf(by('#22'), READING).map((r) => r.ref)).toEqual(['#22', '#21', '#23', '#9'])
    expect(relatedOf(by('#9'), READING).map((r) => r.ref)).toEqual(['#9', '#22'])
    expect(relatedOf(by('#30'), READING).map((r) => r.ref)).toEqual(['#30'])
  })
})

describe('what each menu action copies', () => {
  const shown = [by('#23'), by('#22'), by('#30')]
  const action = (id: string) => MENU_ACTIONS.find((a) => a.id === id)!
  const copy = (id: string, ref = '#22', stack = true) => menuCopy(action(id), by(ref), shown, READING, stack)

  test('copy this, with link: the title line, then its stack as ids, the others not selected', () => {
    expect(copy('this-linked').payload.plain).toBe(
      `[#22](${url('#22')}) two\n\nStack, bottom first:\n#21 (not selected) → #22 → #23 (not selected)`,
    )
  })
  test('copy this id', () => {
    expect(copy('this-ids').payload.plain).toBe('#22\n\nStack, bottom first: #21 (not selected) → #22 → #23 (not selected)')
    expect(copy('this-ids', '#30').payload.plain).toBe('#30')
  })
  test('copy all filtered: what the list shows, in its order', () => {
    expect(copy('filtered-ids').payload.plain).toBe('#23 #22 #30\n\nStack, bottom first: #21 (not selected) → #22 → #23')
    expect(copy('filtered-linked').payload.plain).toBe(
      [`[#23](${url('#23')}) three`, `[#22](${url('#22')}) two`, `[#30](${url('#30')}) elsewhere`, '', 'Stack, bottom first:', '#21 (not selected) → #22 → #23'].join('\n'),
    )
    expect(copy('filtered-ids').copied).toMatchObject({ count: 3, stacks: 1 })
  })
  test('copy related: the whole stack and the tie, and nothing in the stack is "not selected"', () => {
    expect(copy('related-ids').payload.plain).toBe('#22 #21 #23 #9\n\nStack, bottom first: #21 → #22 → #23')
    const linked = copy('related-linked').payload
    expect(linked.plain).not.toContain('not selected')
    expect(linked.plain.split('\n').slice(0, 4)).toEqual([
      `[#22](${url('#22')}) two`,
      `[#21](${url('#21')}) one`,
      `[#23](${url('#23')}) three`,
      `[#9](${url('#9')}) the issue`,
    ])
    expect(linked.html).toContain(`<a href="${url('#21')}">#21</a> → <a href="${url('#22')}">#22</a>`)
  })
  test('with stack off (the default) the copies are the rows and nothing else', () => {
    expect(copy('this-ids', '#22', false).payload.plain).toBe('#22')
    expect(copy('this-linked', '#22', false).payload.plain).toBe(`[#22](${url('#22')}) two`)
    expect(copy('this-ids', '#22', false).copied).toMatchObject({ count: 1, stacks: 0 })
    expect(copy('filtered-ids', '#22', false).payload.plain).toBe('#23 #22 #30')
    expect(copy('filtered-linked', '#22', false).payload.plain).not.toContain('Stack')
    expect(copy('filtered-ids', '#22', false).copied.stacks).toBe(0)
  })
  test('copy related keeps the whole stack with the choice off', () => {
    expect(copy('related-ids', '#22', false).payload.plain).toBe('#22 #21 #23 #9\n\nStack, bottom first: #21 → #22 → #23')
    expect(copy('related-linked', '#22', false).payload.plain).toContain('Stack, bottom first')
  })
  test('With stack means something only when the item or a shown row is stacked', () => {
    expect(menuHasStacks(by('#30'), [by('#30'), by('#9')])).toBe(false)
    expect(menuHasStacks(by('#30'), shown)).toBe(true)
    expect(menuHasStacks(by('#22'), [])).toBe(true)
  })
  test('menuCopy defaults to no stack', () => {
    expect(menuCopy(action('this-ids'), by('#22'), shown, READING).payload.plain).toBe('#22')
  })
  test('the rows each scope takes', () => {
    expect(menuRows('this', by('#9'), shown, READING).map((r) => r.ref)).toEqual(['#9'])
    expect(menuRows('filtered', by('#9'), shown, READING).map((r) => r.ref)).toEqual(['#23', '#22', '#30'])
  })
  test('Shift+F10 and the context-menu key open it; F10 alone does not', () => {
    const k = (key: string, shiftKey = false) => ({ key, shiftKey, altKey: false, ctrlKey: false, metaKey: false })
    expect(opensMenu(k('F10', true))).toBe(true)
    expect(opensMenu(k('ContextMenu'))).toBe(true)
    expect(opensMenu(k('F10'))).toBe(false)
  })
})

/** A list with the menu wired as the page wires it. */
function Harness({
  onCopied,
  copy,
  stackable = false,
}: {
  onCopied: (c: Copied | null) => void
  copy: (p: Payload) => Promise<boolean>
  /** Wire "With stack" as the page does, kept in this component. */
  stackable?: boolean
}) {
  const menu = useItemMenu()
  const [stack, setStack] = useState(false)
  return (
    <div>
      <div data-testid="list" {...menu.handlers}>
        {READING.map((r) => (
          <div key={r.ref} data-ref={r.ref}>
            <button type="button">{r.ref}</button>
          </div>
        ))}
      </div>
      <button type="button">elsewhere</button>
      {menu.menu && <ItemMenu at={menu.menu} rows={READING} shown={READING} onClose={menu.close} onCopied={onCopied} copy={copy} {...(stackable ? { stack, onStack: setStack } : {})} />}
    </div>
  )
}

describe('the item menu', () => {
  const setup = () => {
    const copies: Payload[] = []
    const said: (Copied | null)[] = []
    render(
      <Harness
        onCopied={(c) => said.push(c)}
        copy={async (p) => {
          copies.push(p)
          return true
        }}
      />,
    )
    return { copies, said }
  }

  test('right-click opens it on that item, and choosing copies and says how many', async () => {
    const { copies, said } = setup()
    fireEvent.contextMenu(screen.getByRole('button', { name: '#22' }), { clientX: 10, clientY: 10 })
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('data-item-menu')).toBe('#22')
    await act(async () => {
      fireEvent.click(menu.querySelector('[data-action="related-ids"]')!)
    })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(copies[0]!.plain).toBe('#22 #21 #23 #9\n\nStack, bottom first: #21 → #22 → #23')
    expect(said[0]).toMatchObject({ count: 4, stacks: 1 })
  })

  test('With stack: drawn only with a stack in reach, off at first, and it changes what the copies take', async () => {
    const copies: Payload[] = []
    render(<Harness onCopied={() => {}} copy={async (p) => (copies.push(p), true)} stackable />)
    fireEvent.contextMenu(screen.getByRole('button', { name: '#22' }), { clientX: 10, clientY: 10 })
    const box = () => screen.getByRole('menu').querySelector('[data-action="stack"]')!
    expect(box().getAttribute('role')).toBe('menuitemcheckbox')
    expect(box().getAttribute('aria-checked')).toBe('false')
    await act(async () => {
      fireEvent.click(screen.getByRole('menu').querySelector('[data-action="this-ids"]')!)
    })
    expect(copies[0]!.plain).toBe('#22')
    fireEvent.contextMenu(screen.getByRole('button', { name: '#22' }), { clientX: 10, clientY: 10 })
    fireEvent.click(box())
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(box().getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.click(screen.getByRole('menu').querySelector('[data-action="this-ids"]')!)
    })
    expect(copies[1]!.plain).toBe('#22\n\nStack, bottom first: #21 (not selected) → #22 → #23 (not selected)')
  })

  test('Shift+F10 opens it from the keyboard, focus on the first item; arrows move, Enter chooses, focus returns', async () => {
    const { copies } = setup()
    const trigger = screen.getByRole('button', { name: '#30' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
    const menu = screen.getByRole('menu')
    expect(document.activeElement?.getAttribute('data-action')).toBe('this-linked')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('data-action')).toBe('this-ids')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    /* Related is disabled for #30, which has none, so End lands on the last that is not. */
    expect(document.activeElement?.getAttribute('data-action')).toBe('filtered-ids')
    expect(menu.querySelector('[data-action="related-ids"]')!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    })
    expect(copies[0]!.plain).toBe('#30 #9 #23 #22 #21')
    expect(document.activeElement).toBe(trigger)
  })

  test('the context-menu key opens it too; Escape closes it and gives focus back', () => {
    setup()
    const trigger = screen.getByRole('button', { name: '#9' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ContextMenu' })
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test('a press outside closes it, and so does focus leaving for another frame', () => {
    setup()
    fireEvent.contextMenu(screen.getByRole('button', { name: '#9' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.contextMenu(screen.getByRole('button', { name: '#9' }))
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('a long press on a touch screen opens it', async () => {
    setup()
    const target = screen.getByRole('button', { name: '#21' })
    fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 5, clientY: 5 })
    await act(() => new Promise((done) => setTimeout(done, 550)))
    expect(screen.getByRole('menu').getAttribute('data-item-menu')).toBe('#21')
  })
})

describe('the one-up cards', () => {
  const ordered = [by('#22'), by('#9'), by('#30')]
  const draw = (onAt: (at: number, ref: string | null) => void = () => {}) =>
    render(<OneUp rows={ordered} unseen={new Set(['#22'])} selection={[]} onPick={() => {}} onAt={onAt} now={NOW} />)

  test('one card per reference, snapping whole cards', () => {
    const { container } = draw()
    const scroller = container.querySelector<HTMLElement>('[data-one-up]')!
    expect(scroller.style.scrollSnapType).toBe('y mandatory')
    const cards = container.querySelectorAll<HTMLElement>('[data-card]')
    expect([...cards].map((c) => c.dataset.ref)).toEqual(['#22', '#9', '#30'])
    expect(cards[0]!.style.scrollSnapAlign).toBe('start')
  })

  test('a card says the state, the title, the stack and the activity, and Unseen in words', () => {
    const { container } = draw()
    const first = container.querySelector<HTMLElement>('[data-card]')!
    expect(first.textContent).toContain('#22')
    expect(first.textContent).toContain('Merge request · open')
    expect(first.textContent).toContain('two')
    expect(first.textContent).toContain('Stack 2/3')
    expect(first.textContent).toContain('Unseen')
    expect(first.textContent).toContain('part of #9')
    expect(container.querySelectorAll('[data-unseen-mark]')).toHaveLength(1)
  })

  test('CI and the review are said on a change', () => {
    const change = { ...by('#22'), pipeline: { state: 'failed' as const }, reviewers: [{ login: 'mona', name: 'Mona', state: 'approved' as const }] }
    expect(cardFacts(change, NOW)).toEqual(['Stack 2/3', 'CI failed', 'Approved', '34 h ago'])
  })

  test('the arrow keys move one card and say where', () => {
    const at: [number, string | null][] = []
    const { container } = draw((i, ref) => at.push([i, ref]))
    expect(at.at(-1)).toEqual([0, '#22'])
    const buttons = container.querySelectorAll<HTMLElement>('[data-card] button')
    buttons[0]!.focus()
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' })
    expect(at.at(-1)).toEqual([1, '#9'])
    expect(document.activeElement).toBe(buttons[1]!)
    fireEvent.keyDown(buttons[1]!, { key: 'End' })
    expect(at.at(-1)).toEqual([2, '#30'])
    fireEvent.keyDown(buttons[2]!, { key: 'ArrowDown' })
    expect(at.at(-1)).toEqual([2, '#30'])
  })
})
