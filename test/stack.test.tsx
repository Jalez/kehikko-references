import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { copiedSaid, idsOfAll, payloadOfAll } from '@/live/copy.ts'
import { footerItems, footerPressed } from '@/live/footer.ts'
import { stackPlaces, stackSaid, type StackMember } from '@/live/markers.ts'
import { isForked, stackLines, stackPath, stackSentence, stacksOf, stackTree } from '@/live/stack.ts'
import { copiedOf } from '@/view/copy-many.tsx'
import { overview } from '@/view/reference-row.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'
import { footerItemsSchema, trackerRowSchema } from 'kehikot-module-protocol'
import { SelectionMenu } from '@/view/selection-menu.tsx'
import { row } from './fixtures.ts'

/**
 * Stacks as they really are: a fork, where one change has several built on it,
 * is a tree and is drawn and copied as one — never one long numbered line.
 */

afterEach(cleanup)

/** "With stack" on: a copy takes the stacks along. Off (the default) it takes nothing but the rows. */
const WITH = { stack: true }

/**
 * #12 is the bottom; #13 and #14 are both built on it (the fork); #15 is on #13.
 *
 * ```
 * #12 base
 * ├─ #13
 * │  └─ #15
 * └─ #14
 * ```
 */
const FORK = [
  row('#12', { kind: 'change', title: 'base', stack: { above: ['#13', '#14'] } }),
  row('#13', { kind: 'change', title: 'left', stack: { below: '#12', above: ['#15'] } }),
  row('#14', { kind: 'change', title: 'right', stack: { below: '#12' } }),
  row('#15', { kind: 'change', title: 'top', stack: { below: '#13' } }),
]
const LINE = [
  row('#21', { kind: 'change', title: 'one', stack: { above: ['#22'] } }),
  row('#22', { kind: 'change', title: 'two', stack: { below: '#21', above: ['#23'] } }),
  row('#23', { kind: 'change', title: 'three', stack: { below: '#22' } }),
]

const m = (ref: string, depth: number, base: string | null): StackMember => ({ ref, title: '', depth, base })

describe('the tree', () => {
  test('the issue’s example: a fork shows as branches, with fork markers', () => {
    const place = stackPlaces(FORK.map((r) => trackerRowSchema.parse(r))).get('#14')!
    expect(place.forked).toBe(true)
    expect(stackTree(place.members).map((l) => `${l.prefix}${l.ref}`)).toEqual(['#12', '├─ #13', '│  └─ #15', '└─ #14'])
  })

  test('deeper: a carried-on line only while the ancestor has a later sibling', () => {
    const members = [m('a', 0, null), m('b', 1, 'a'), m('c', 2, 'b'), m('d', 3, 'c'), m('e', 2, 'b'), m('f', 1, 'a'), m('g', 2, 'f')]
    expect(stackTree(members).map((l) => `${l.prefix}${l.ref}`)).toEqual([
      'a',
      '├─ b',
      '│  ├─ c',
      '│  │  └─ d',
      '│  └─ e',
      '└─ f',
      '   └─ g',
    ])
  })

  test('forked only when a change has two built on it', () => {
    expect(isForked([m('a', 0, null), m('b', 1, 'a'), m('c', 2, 'b')])).toBe(false)
    expect(isForked([m('a', 0, null), m('b', 1, 'a'), m('c', 1, 'a')])).toBe(true)
  })

  test('the branch a change is on, bottom first', () => {
    const place = collect(FORK).find((r) => r.ref === '#15')!.stack!
    expect(stackPath(place.members, '#15')).toEqual(['#12', '#13', '#15'])
    expect(stackPath(place.members, '#14')).toEqual(['#12', '#14'])
    expect(stackSentence(place, '#14')).toBe('in a forked stack of 4, on the branch #12 → #14')
  })

  test('a line stays a numbered line, in the tooltip and the row’s overview', () => {
    const place = collect(LINE).find((r) => r.ref === '#22')!.stack!
    expect(place.forked).toBe(false)
    expect(stackSaid(place, '#22')).toBe(['Stacked: 2 of 3, bottom first', '1. #21 one', '2. #22 two (this one)', '3. #23 three'].join('\n'))
    expect(overview(collect(LINE).find((r) => r.ref === '#22')!)).toContain('stacked 2 of 3: #21 → #22 → #23')
  })

  test('a fork’s tooltip is the tree, and its overview names the branch, never "3 of 4"', () => {
    const rows = collect(FORK)
    const right = rows.find((r) => r.ref === '#14')!
    expect(stackSaid(right.stack!, '#14')).toBe(['Forked stack of 4, bottom first', '#12 base', '├─ #13 left', '│  └─ #15 top', '└─ #14 right (this one)'].join('\n'))
    expect(overview(right)).toContain('in a forked stack of 4, on the branch #12 → #14')
    expect(overview(right)).not.toContain('of 4:')
  })
})

describe('the marker', () => {
  test('a fork says how many it holds with a fork glyph, and its popover draws the tree in text', () => {
    const picked: string[] = []
    const { container, baseElement } = render(
      <ReferenceList rows={collect(FORK)} landedOn={null} selection={[]} onPick={(ref) => picked.push(ref)} onToggle={() => {}} />,
    )
    const mark = container.querySelector('li[data-ref="#14"] [data-marker="stack"]') as HTMLButtonElement
    expect(mark.dataset.forked).toBe('true')
    expect(mark.textContent).toBe('4')
    expect(mark.getAttribute('aria-label')).toBe('In a forked stack of 4, on the branch #12 → #14. Show the stack')
    fireEvent.click(mark)
    const members = [...baseElement.querySelectorAll('[data-stack-member]')] as HTMLButtonElement[]
    expect(members.map((b) => b.dataset.stackMember)).toEqual(['#12', '#13', '#15', '#14'])
    /* The glyphs are text, hidden from a screen reader, which hears each one's base instead. */
    expect(members.map((b) => b.querySelector('[data-tree]')!.textContent)).toEqual(['', '├─ ', '│  └─ ', '└─ '])
    expect(members.every((b) => b.querySelector('[data-tree]')!.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(members[2]!.getAttribute('aria-label')).toBe('#15 top, on #13')
    expect(members[3]!.getAttribute('aria-label')).toBe('#14 right, on #12, this one')
    fireEvent.click(members[2]!)
    expect(picked).toEqual(['#15'])
  })

  test('a line keeps its 2/3', () => {
    const { container } = render(<ReferenceList rows={collect(LINE)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const mark = container.querySelector('li[data-ref="#22"] [data-marker="stack"]') as HTMLButtonElement
    expect(mark.dataset.forked).toBeUndefined()
    expect(mark.textContent).toBe('2/3')
  })
})

describe('a copy takes no stack unless asked', () => {
  const line = collect(LINE)
  const fork = collect(FORK)

  test('off is the default: the lines and nothing else, in both formats', () => {
    expect(payloadOfAll(line).plain.split('\n')).toHaveLength(3)
    expect(payloadOfAll(line).plain).not.toContain('Stack')
    expect(payloadOfAll(line).html).not.toContain('Stack')
    expect(payloadOfAll(fork).plain).not.toContain('bottom first')
    expect(payloadOfAll(line, { stack: false })).toEqual(payloadOfAll(line))
  })
  test('Copy ids off is just the ids, one line, and the same in html', () => {
    expect(idsOfAll(line)).toEqual({ plain: '#21 #22 #23', html: '#21 #22 #23' })
    expect(idsOfAll([line[0]!]).plain).toBe('#21')
    expect(idsOfAll(fork).plain).toBe(fork.map((r) => r.ref).join(' '))
  })
  test('on adds the stacks to the rows, which are the same rows', () => {
    expect(payloadOfAll(line, WITH).plain.startsWith(payloadOfAll(line).plain)).toBe(true)
    expect(idsOfAll(line, WITH).plain).toBe('#21 #22 #23\n\nStack, bottom first: #21 → #22 → #23')
  })
  test('related is the stack by definition: whole, whatever the choice', () => {
    expect(idsOfAll(line, { whole: true }).plain).toContain('Stack, bottom first: #21 → #22 → #23')
    expect(idsOfAll(line, { whole: true, stack: false }).plain).toContain('Stack, bottom first')
  })
  test('what was copied says no stack when none came along', () => {
    expect(copiedOf('ids', fork)).toMatchObject({ count: fork.length, stacks: 0 })
    expect(copiedOf('ids', fork, WITH).stacks).toBe(1)
    expect(copiedOf('linked', fork).plain).not.toContain('Stack')
  })
})

describe('the footer: With stack beside Copy, only where there is a stack', () => {
  const facts = { project: '/p', showing: 4, total: 4, scope: null, at: null, unread: [] }
  const ids = (items: ReturnType<typeof footerItems>) => items.map((i) => i.id)

  test('not drawn when no selected row is in a stack', () => {
    const items = footerItems(facts, { count: 2, openable: 2, copied: null, epics: null, stacked: false })
    expect(ids(items)).not.toContain('with-stack')
    expect(ids(footerItems(facts, { count: 2, openable: 2, copied: null, epics: null }))).not.toContain('with-stack')
  })
  test('drawn right after the two copies, off by default, and a toggle the schema accepts', () => {
    const items = footerItems(facts, { count: 2, openable: 2, copied: null, epics: null, stacked: true })
    expect(footerItemsSchema.safeParse(items).success).toBe(true)
    const at = ids(items).indexOf('with-stack')
    expect(ids(items).slice(at - 2, at)).toEqual(['copy', 'copy-ids'])
    expect(items[at]).toMatchObject({ kind: 'toggle', label: 'With stack', checked: false })
    const on = footerItems(facts, { count: 2, openable: 2, copied: null, epics: null, stacked: true, withStack: true })
    expect(on.find((i) => i.id === 'with-stack')).toMatchObject({ checked: true })
    expect(on.find((i) => i.id === 'copy-ids')!.tooltip).toContain('stacks')
    expect(items.find((i) => i.id === 'copy-ids')!.tooltip).not.toContain('stacks')
  })
  test('pressing it sets the choice; it needs a true or a false', async () => {
    const got: boolean[] = []
    const acts = { copied: () => {}, setStack: (on: boolean) => void got.push(on), clear: () => {}, goToEpic: async () => true }
    expect(await footerPressed('with-stack', true, acts)).toBeUndefined()
    expect(await footerPressed('with-stack', false, acts)).toBeUndefined()
    expect(await footerPressed('with-stack', 'x', acts)).toContain('true or false')
    expect(got).toEqual([true, false])
  })
})

describe('the selection menu: With stack only where there is a stack', () => {
  const draw = (stacked: boolean, withStack = false, onStack: (on?: boolean) => void = () => {}) =>
    render(<SelectionMenu count={2} urls={[]} copied={null} onCopy={() => {}} onClear={() => {}} stacked={stacked} withStack={withStack} onStack={onStack} />)
  const open = async (container: HTMLElement) => {
    const trigger = container.querySelector('button') as HTMLElement
    trigger.focus()
    act(() => {
      fireEvent.keyDown(trigger, { key: 'Enter' })
    })
    await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
  }

  test('hidden with nothing stacked selected; drawn, unchecked, with a stack', async () => {
    const none = draw(false)
    await open(none.container)
    expect(document.querySelector('[data-item="ids"]')).not.toBeNull()
    expect(document.querySelector('[data-item="stack"]')).toBeNull()
    cleanup()
    const some = draw(true)
    await open(some.container)
    const box = document.querySelector('[data-item="stack"]')!
    expect(box.getAttribute('role')).toBe('menuitemcheckbox')
    expect(box.getAttribute('aria-checked')).toBe('false')
    expect(box.textContent).toContain('With stack')
  })
  test('choosing it reports the new choice', async () => {
    const got: boolean[] = []
    const some = draw(true, false, (on?: boolean) => void got.push(on as boolean))
    await open(some.container)
    fireEvent.click(document.querySelector('[data-item="stack"]')!)
    expect(got).toEqual([true])
  })
})

describe('a copy takes the stack along', () => {
  const fork = collect(FORK)
  const pick = (...refs: string[]) => refs.map((ref) => fork.find((r) => r.ref === ref)!)

  test('one stacked change: its line, then the forked stack as ids in a code block, the others not selected', () => {
    const p = payloadOfAll(pick('#13'), WITH)
    expect(p.plain).toBe(
      [
        `[#13](${fork[1]!.url}) left`,
        '',
        'Forked stack, bottom first:',
        '```text',
        '#12 (not selected)',
        '├─ #13',
        '│  └─ #15 (not selected)',
        '└─ #14 (not selected)',
        '```',
      ].join('\n'),
    )
    expect(p.html).toContain(`<p>Forked stack, bottom first:</p><pre>#12 (not selected)\n├─ <a href="${fork[1]!.url}">#13</a>\n│  └─ #15 (not selected)\n└─ #14 (not selected)</pre>`)
    expect(p.plain).not.toContain('(copied)')
  })

  test('the whole stack selected: titles once in the list, the tree is ids only with no markers', () => {
    const p = payloadOfAll(fork, WITH)
    expect(p.plain.split('\n').slice(4)).toEqual(['', 'Forked stack, bottom first:', '```text', '#12', '├─ #13', '│  └─ #15', '└─ #14', '```'])
    expect(p.plain.match(/ base/g)).toHaveLength(1)
    expect(p.plain.match(/Forked stack/g)).toHaveLength(1)
  })

  test('a line: one line of ids, in Markdown and html', () => {
    const line = collect(LINE)
    const p = payloadOfAll([line[2]!], WITH)
    expect(p.plain.split('\n').slice(1)).toEqual(['', 'Stack, bottom first:', '#21 (not selected) → #22 (not selected) → #23'])
    expect(p.html).toContain(`<p>Stack, bottom first:</p><p>#21 (not selected) → #22 (not selected) → <a href="${line[2]!.url}">#23</a></p>`)
    expect(payloadOfAll(line, WITH).plain.split('\n').slice(-1)).toEqual(['#21 → #22 → #23'])
  })

  test('mixed: stacked, unstacked and a stack with an unselected member', () => {
    const rows = [...collect(LINE), ...fork, ...collect([row('#99', { kind: 'change', title: 'alone' })])]
    const picked = ['#99', '#13', '#21', '#23', '#14'].map((ref) => rows.find((r) => r.ref === ref)!)
    const ordered = [rows.find((r) => r.ref === '#21')!, rows.find((r) => r.ref === '#23')!, rows.find((r) => r.ref === '#13')!, rows.find((r) => r.ref === '#14')!, picked[0]!]
    expect(payloadOfAll(ordered, WITH).plain.replace(/\]\([^)]*\)/g, ']')).toBe(
      [
        '[#21] one',
        '[#23] three',
        '[#13] left',
        '[#14] right',
        '[#99] alone',
        '',
        'Stack, bottom first:',
        '#21 → #22 (not selected) → #23',
        '',
        'Forked stack, bottom first:',
        '```text',
        '#12 (not selected)',
        '├─ #13',
        '│  └─ #15 (not selected)',
        '└─ #14',
        '```',
      ].join('\n'),
    )
  })

  test('Copy ids: the ids, then the stacks as refs, the same shape and the same marks', () => {
    expect(idsOfAll(pick('#15', '#14'), WITH).plain).toBe(
      ['#15 #14', '', 'Forked stack, bottom first:', '#12 (not selected)', '├─ #13 (not selected)', '│  └─ #15', '└─ #14'].join('\n'),
    )
    expect(idsOfAll(collect(LINE), WITH).plain).toBe('#21 #22 #23\n\nStack, bottom first: #21 → #22 → #23')
    expect(idsOfAll([collect(LINE)[0]!], WITH).plain).toBe('#21\n\nStack, bottom first: #21 → #22 (not selected) → #23 (not selected)')
    /* A rich paste keeps the lines. */
    expect(idsOfAll(pick('#14'), WITH).html).toStartWith('<pre>#14\n\n')
  })

  test('no stack, no change: the copy is what it always was', () => {
    const plain = collect([row('#1'), row('#2')])
    expect(payloadOfAll(plain).plain.split('\n')).toHaveLength(2)
    expect(idsOfAll(plain)).toEqual({ plain: '#1 #2', html: '#1 #2' })
  })

  test('two stacks: each once, in the order the rows name them', () => {
    const rows = [...collect(LINE), ...fork]
    const picked = [rows.find((r) => r.ref === '#14')!, rows.find((r) => r.ref === '#22')!]
    expect(stacksOf(picked).map((s) => s.place.members[0]!.ref)).toEqual(['#12', '#21'])
    expect(stackLines(stacksOf(picked)[1]!.place, ['#22'])).toEqual(['#21 (not selected) → #22 → #23 (not selected)'])
  })

  test('what was copied is said: in the bar and the footer, the text in the footer’s tooltip', async () => {
    expect(copiedSaid({ count: 3, stacks: 0 })).toBe('Copied 3')
    expect(copiedSaid({ count: 2, stacks: 1 })).toBe('Copied 2 + stack')
    expect(copiedSaid({ count: 4, stacks: 2 })).toBe('Copied 4 + 2 stacks')
    const copied = copiedOf('linked', pick('#13'), WITH)
    expect(copied).toMatchObject({ count: 1, stacks: 1 })
    const items = footerItems(
      { project: '/p', showing: 4, total: 4, scope: null, at: null, unread: [] },
      { count: 1, openable: 1, copied, epics: null },
    )
    const selected = items.find((item) => item.id === 'selected')!
    expect(selected).toMatchObject({ text: 'Copied 1 + stack' })
    expect((selected as { tooltip?: string }).tooltip).toStartWith(`[#13](${fork[1]!.url}) left`)
    expect((selected as { tooltip: string }).tooltip.length).toBeLessThanOrEqual(240)
    /* The footer's press says which copy the host carried. */
    const kinds: string[] = []
    const acts = { copied: (kind: 'linked' | 'ids') => void kinds.push(kind), clear: () => {}, setStack: () => {}, goToEpic: async () => true }
    await footerPressed('copy', undefined, acts, 'copy')
    await footerPressed('copy-ids', undefined, acts, 'copy')
    expect(kinds).toEqual(['linked', 'ids'])
  })
})
