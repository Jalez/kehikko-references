import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, within } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { stateSaid } from '@/live/state.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * A row's state as a small coloured glyph beside the pipeline mark, with its
 * words as tooltip and label. Every state its own glyph: never colour alone.
 */

afterEach(cleanup)

const merged = row('gh#4019', { kind: 'change', state: 'merged' })
const cases: [string, Record<string, unknown>, string, string, string][] = [
  ['gh#1', { kind: 'change' }, 'state-change-open', 'lucide-git-pull-request', 'Pull request · open'],
  ['!2', { draft: true }, 'state-change-draft', 'lucide-git-pull-request-draft', 'Merge request · draft'],
  ['gh#3', { kind: 'change', state: 'merged' }, 'state-change-merged', 'lucide-git-merge', 'Pull request · merged'],
  ['!4', { state: 'closed' }, 'state-change-closed', 'lucide-git-pull-request-closed', 'Merge request · closed'],
  ['gh#5', {}, 'state-issue-open', 'lucide-circle-dot', 'Issue · open'],
  ['gh#6', { state: 'closed', links: [{ relation: 'closed-by', ref: 'gh#4019' }] }, 'state-issue-done', 'lucide-circle-check', 'Issue · closed by gh#4019'],
  ['gh#7', { state: 'closed', stateReason: 'COMPLETED' }, 'state-issue-done', 'lucide-circle-check', 'Issue · closed'],
  ['#8', { state: 'closed' }, 'state-issue-closed', 'lucide-circle-check', 'Issue · closed'],
  ['gh#9', { state: 'closed', stateReason: 'NOT_PLANNED' }, 'state-issue-not-planned', 'lucide-circle-slash', 'Issue · closed as not planned'],
  ['gh#10', { state: 'closed', stateReason: 'DUPLICATE' }, 'state-issue-not-planned', 'lucide-circle-slash', 'Issue · closed as a duplicate'],
]

function drawn() {
  const rows = [merged, ...cases.map(([ref, more]) => row(ref, more))]
  return render(<ReferenceList rows={collect(rows)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
}
const mark = (container: HTMLElement, ref: string) => container.querySelector(`li[data-ref="${ref}"] [data-marker^="state-"]`) as HTMLElement

describe('the state glyph', () => {
  test.each(cases)('%s: its own glyph, its words as the label', (ref, _more, look, glyph, said) => {
    const { container } = drawn()
    const m = mark(container, ref)
    expect(m.dataset.marker).toBe(look)
    expect(m.querySelector(`svg.${glyph}`)).not.toBeNull()
    expect(m.getAttribute('aria-label')).toBe(said)
    expect(m.getAttribute('role')).toBe('img')
    expect(m.getAttribute('tabindex')).toBe('0')
  })

  test('each look has a glyph no other look has, apart from the two closings that share a circle-check in different tones', () => {
    const { container } = drawn()
    const glyphs = new Map<string, string>()
    for (const [ref] of cases) {
      const m = mark(container, ref)
      glyphs.set(m.dataset.marker!, m.querySelector('svg')!.getAttribute('class')!)
    }
    const shapes = [...glyphs.entries()].filter(([look]) => look !== 'state-issue-closed').map(([, svg]) => svg)
    expect(new Set(shapes).size).toBe(shapes.length)
    /* Done and closed-without-a-word share the shape and differ in tone; the words tell them apart. */
    expect(mark(container, 'gh#7').className).not.toBe(mark(container, '#8').className)
  })

  test('the tooltip says the words on focus', async () => {
    const { container } = drawn()
    const m = mark(container, 'gh#6')
    fireEvent.focus(m)
    expect((await within(document.body).findAllByText('Issue · closed by gh#4019')).length).toBeGreaterThan(0)
  })

  test('sits just before the pipeline mark, the same size', () => {
    const rows = collect([row('!11', { pipeline: 'failed' })])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const marks = [...container.querySelectorAll('[data-marker]')] as HTMLElement[]
    const at = marks.findIndex((m) => m.dataset.marker?.startsWith('state-'))
    expect(marks[at + 1]!.dataset.marker).toBe('pipeline-failed')
    for (const m of [marks[at]!, marks[at + 1]!]) {
      expect(m.className).toContain('h-6')
      expect(m.className).toContain('w-6')
      expect(m.querySelector('svg')!.getAttribute('class')).toContain('size-3.5')
    }
  })

  test('a state the reading did not carry is never drawn as open', () => {
    expect(stateSaid({ kind: 'issue', origin: 'github', state: null, draft: false, stateReason: null, closedByMerge: false })).toBe('Issue · state not read')
  })
})
