import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { copiedSaid, idsOfAll, payloadOfAll } from '@/live/copy.ts'
import { footerItems, footerPressed } from '@/live/footer.ts'
import { stackPlaces, stackSaid, type StackMember } from '@/live/markers.ts'
import { isForked, stackLines, stackPath, stackSentence, stacksOf, stackTree } from '@/live/stack.ts'
import { copiedOf } from '@/view/copy-many.tsx'
import { overview } from '@/view/reference-row.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'
import { trackerRowSchema } from 'kehikot-module-protocol'
import { row } from './fixtures.ts'

/**
 * Stacks as they really are: a fork, where one change has several built on it,
 * is a tree and is drawn and copied as one — never one long numbered line.
 */

afterEach(cleanup)

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

describe('a copy takes the stack along', () => {
  const fork = collect(FORK)
  const pick = (...refs: string[]) => refs.map((ref) => fork.find((r) => r.ref === ref)!)

  test('one stacked change: its line, then the forked stack as a tree in a code block, it marked', () => {
    const p = payloadOfAll(pick('#13'))
    expect(p.plain).toBe(
      [
        `[#13](${fork[1]!.url}) left`,
        '',
        'Forked stack of #13, bottom first:',
        '```text',
        '#12 base',
        '├─ #13 left (copied)',
        '│  └─ #15 top',
        '└─ #14 right',
        '```',
      ].join('\n'),
    )
    expect(p.html).toContain('<p>Forked stack of #13, bottom first:</p><pre>#12 base\n├─ #13 left (copied)\n│  └─ #15 top\n└─ #14 right</pre>')
  })

  test('several from one stack: the stack once, every copied one marked', () => {
    const p = payloadOfAll(pick('#13', '#14'))
    expect(p.plain.match(/Forked stack/g)).toHaveLength(1)
    expect(p.plain).toContain('Forked stack of #13 and #14, bottom first:')
    expect(p.plain).toContain('├─ #13 left (copied)')
    expect(p.plain).toContain('└─ #14 right (copied)')
  })

  test('a line: a numbered list, in Markdown and as <ol>', () => {
    const line = collect(LINE)
    const p = payloadOfAll([line[2]!])
    expect(p.plain.split('\n').slice(1)).toEqual(['', 'Stack of #23, bottom first:', '1. #21 one', '2. #22 two', '3. #23 three (copied)'])
    expect(p.html).toContain('<ol><li>#21 one</li><li>#22 two</li><li>#23 three (copied)</li></ol>')
  })

  test('Copy ids: the ids, then the stack as refs only — a tree for a fork, one line for a line', () => {
    expect(idsOfAll(pick('#15', '#14')).plain).toBe(
      ['#15 #14', '', 'Forked stack of #15 and #14, bottom first:', '#12', '├─ #13', '│  └─ #15', '└─ #14'].join('\n'),
    )
    expect(idsOfAll([collect(LINE)[0]!]).plain).toBe('#21\n\nStack of #21, bottom first: #21 → #22 → #23')
    /* A rich paste keeps the lines. */
    expect(idsOfAll(pick('#14')).html).toStartWith('<pre>#14\n\n')
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
    expect(stackLines(stacksOf(picked)[1]!.place, ['#22'], false)).toEqual(['1. #21', '2. #22 (copied)', '3. #23'])
  })

  test('what was copied is said: in the bar and the footer, the text in the footer’s tooltip', async () => {
    expect(copiedSaid({ count: 3, stacks: 0 })).toBe('Copied 3')
    expect(copiedSaid({ count: 2, stacks: 1 })).toBe('Copied 2 + stack')
    expect(copiedSaid({ count: 4, stacks: 2 })).toBe('Copied 4 + 2 stacks')
    const copied = copiedOf('linked', pick('#13'))
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
    const acts = { copied: (kind: 'linked' | 'ids') => void kinds.push(kind), clear: () => {}, goToEpic: async () => true }
    await footerPressed('copy', undefined, acts, 'copy')
    await footerPressed('copy-ids', undefined, acts, 'copy')
    expect(kinds).toEqual(['linked', 'ids'])
  })
})
