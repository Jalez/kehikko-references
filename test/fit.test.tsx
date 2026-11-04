import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { facesShown } from '@/live/faces.ts'
import { fitLook, rowFit } from '@/live/fit.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * Compact rows: what a row shows at the widths a container is really given
 * (200, 280 and 380 pixels of the list, and a wide one). The fit is decided
 * from the list's own width, never the window's (`live/fit.ts`); happy-dom
 * does no layout, so the width is handed in and what each fit draws is held.
 */

afterEach(cleanup)

const BUSY = collect([
  row('!4013', {
    kind: 'change',
    title: 'feat(triage): tell the centre and the requester when a requested tool reaches the marketplace',
    assignees: ['ada', 'bob', 'cat', 'dan', 'eve'],
    reviewers: [
      { login: 'mona', state: 'approved' },
      { login: 'nils', state: 'requested' },
      { login: 'olga', state: 'changes' },
    ],
    pipeline: 'running',
  }),
])

function drawn(width: number) {
  const { container } = render(<ReferenceList rows={BUSY} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} width={width} />)
  const li = container.querySelector('li[data-ref]') as HTMLElement
  const faces = (name: string) => li.querySelector(`[data-marker^="${name}"] [data-faces]`) as HTMLElement
  return {
    li,
    fit: li.dataset.fit,
    ref: li.querySelector('li > button span.font-mono')?.textContent,
    title: li.querySelector('[data-title]') as HTMLElement,
    state: li.querySelector('[data-marker^="state-"]') as HTMLElement,
    pipeline: li.querySelector('[data-marker^="pipeline-"]') as HTMLElement,
    cluster: li.querySelector('[data-markers]') as HTMLElement,
    assigned: { shown: Number(faces('assigned').dataset.shown), more: faces('assigned').querySelector('[data-more]')?.textContent },
    review: { shown: Number(faces('review').dataset.shown), more: faces('review').querySelector('[data-more]')?.textContent },
    button: li.querySelector('li > button') as HTMLElement,
    check: li.querySelector('li > span') as HTMLElement,
  }
}

const classes = (el: HTMLElement) => el.className.split(/\s+/)

describe('the fit, from the list’s width', () => {
  test('the thresholds', () => {
    expect([200, 239, 240, 280, 319, 320, 380, 383, 384, 900].map(rowFit)).toEqual([
      'tight', 'tight', 'narrow', 'narrow', 'narrow', 'snug', 'snug', 'snug', 'wide', 'wide',
    ])
    /* Unmeasured is wide: the CSS container queries still fold a narrow list. */
    expect([null, undefined, 0, Number.NaN].map(rowFit)).toEqual(['wide', 'wide', 'wide', 'wide'])
  })

  test('faces: one at tight, two at narrow, three from snug, never fewer than one', () => {
    expect([fitLook('tight'), fitLook('narrow'), fitLook('snug'), fitLook('wide')].map((l) => l.faces)).toEqual([1, 2, 3, 3])
    expect(facesShown(['a', 'b', 'c', 'd'].map((n) => ({ login: n, name: n, avatarUrl: null })), 1)).toMatchObject({ more: 3 })
    expect(facesShown([{ login: 'a', name: 'a', avatarUrl: null }], 0).shown).toHaveLength(1)
  })
})

describe('what each width shows', () => {
  test('200px: ref, state and title on the line; one face each and +N; edge-to-edge 20px marks, state and pipeline overlapping', () => {
    const at = drawn(200)
    expect(at.fit).toBe('tight')
    expect(at.ref).toBe('!4013')
    expect(at.title.textContent).toStartWith('feat(triage)')
    expect(classes(at.title)).toContain('truncate')
    expect(classes(at.title)).not.toContain('hidden')
    expect(at.li.getAttribute('title')).toContain('reaches the marketplace')
    expect(at.state).toBeTruthy()
    expect(at.assigned).toEqual({ shown: 1, more: '+4' })
    expect(at.review).toEqual({ shown: 1, more: '+2' })
    expect(classes(at.state)).toContain('w-5')
    expect(classes(at.pipeline)).toEqual(expect.arrayContaining(['w-5', '-ml-1']))
    expect(classes(at.cluster)).toContain('gap-0')
    expect(classes(at.button)).toEqual(expect.arrayContaining(['gap-1', 'px-0.5', 'min-w-24']))
    expect(classes(at.check)).toEqual(expect.arrayContaining(['pl-1.5', 'pr-0.5']))
    /* Each face overlaps the next further, so only part of each shows. */
    expect(classes(at.li.querySelector('[data-face]') as HTMLElement)).toContain('-ml-1.5')
  })

  test('280px: the same compact row, two faces each', () => {
    const at = drawn(280)
    expect(at.fit).toBe('narrow')
    expect(at.title.textContent).toStartWith('feat(triage)')
    expect(at.assigned).toEqual({ shown: 2, more: '+3' })
    expect(at.review).toEqual({ shown: 2, more: '+1' })
    expect(classes(at.state)).toContain('w-5')
    expect(classes(at.cluster)).toContain('gap-0')
  })

  test('380px: three faces and 24px marks, the row’s insides still without slack', () => {
    const at = drawn(380)
    expect(at.fit).toBe('snug')
    expect(at.title.textContent).toStartWith('feat(triage)')
    expect(at.assigned).toEqual({ shown: 3, more: '+2' })
    expect(at.review).toEqual({ shown: 3, more: undefined })
    expect(classes(at.state)).toContain('w-6')
    expect(classes(at.pipeline)).not.toContain('-ml-1')
    expect(classes(at.cluster)).toContain('gap-0.5')
    expect(classes(at.button)).toContain('gap-1')
    expect(classes(at.li.querySelector('[data-face]') as HTMLElement)).toContain('-ml-1')
  })

  test('wide: the row as it was, its columns from the frame’s container queries', () => {
    const at = drawn(600)
    expect(at.fit).toBe('wide')
    expect(classes(at.button)).toEqual(expect.arrayContaining(['gap-2', 'min-w-32', '@md:gap-3']))
    expect(classes(at.check)).toEqual(expect.arrayContaining(['pl-2', 'pr-1']))
  })
})
