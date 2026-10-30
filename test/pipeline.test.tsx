import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { PIPELINE_STATES, type PipelineState } from 'kehikot-module-protocol'

import { collect } from '@/live/collect.ts'
import { failingRefs, pipelineSaid } from '@/live/pipeline.ts'
import { EVERYTHING, FAILING, SCOPE, offer, sift, siftingOf } from '@/live/sift.ts'
import { overview } from '@/view/reference-row.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * A change's pipeline beside its faces (issue #38): a round mark whose shape
 * says the state and whose colour says it again, a tooltip with the word and
 * how long ago, a press that opens the pipeline when the reading links one,
 * and nothing at all when there is no pipeline.
 */

afterEach(cleanup)

/* The list reads the clock as it draws, so the pipeline moved 12 minutes (and a few seconds) before now. */
const NOW = Date.now()
const AT = new Date(NOW - 12 * 60_000 - 5_000).toISOString()
const URL = 'https://gitlab.com/group/project/-/pipelines/99'

const change = (state: PipelineState, more: Record<string, unknown> = {}) =>
  row('!12', { kind: 'change', pipeline: state, ...more })

const draw = (raw: Record<string, unknown>[], onOpenLink?: (url: string) => Promise<{ outcome: 'shown'; why: string }>) =>
  render(
    <ReferenceList rows={collect(raw)} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} onOpenLink={onOpenLink ?? null} />,
  )

describe('what the reading carries over', () => {
  test('the state, and the link and time only where the reading gave them', () => {
    expect(collect([change('failed', { pipelineUrl: URL, pipelineAt: AT })])[0]!.pipeline).toEqual({ state: 'failed', url: URL, at: AT })
    expect(collect([change('running')])[0]!.pipeline).toEqual({ state: 'running' })
  })

  test('no pipeline, none on the row; and never on an issue', () => {
    expect(collect([row('!12', { kind: 'change' })])[0]!.pipeline).toBeUndefined()
    expect(collect([row('#3', { pipeline: 'failed' })])[0]!.pipeline).toBeUndefined()
  })

  test('a link that is not http(s) is not carried', () => {
    expect(collect([change('failed', { pipelineUrl: 'javascript:alert(1)' })])[0]!.pipeline).toEqual({ state: 'failed' })
  })
})

describe('the sentence', () => {
  test('the word people say, and how long ago', () => {
    expect(pipelineSaid({ state: 'failed', at: AT }, NOW)).toBe('Pipeline: failed · 12 min ago')
    expect(pipelineSaid({ state: 'success', at: AT }, NOW)).toBe('Pipeline: passed · 12 min ago')
    expect(pipelineSaid({ state: 'running' }, NOW)).toBe('Pipeline: running')
    expect(pipelineSaid({ state: 'pending', at: 'yesterday' }, NOW)).toBe('Pipeline: pending')
  })

  test('the row’s own tooltip says it too', () => {
    expect(overview(collect([change('failed', { pipelineAt: AT })])[0]!, NOW)).toContain('Pipeline: failed · 12 min ago')
  })
})

describe('the mark', () => {
  test('every state draws its own icon, never colour alone, and says its word', () => {
    const icons = new Set<string>()
    for (const state of PIPELINE_STATES) {
      const { container } = draw([change(state, { pipelineAt: AT })])
      const mark = container.querySelector(`[data-marker="pipeline-${state}"]`)!
      expect(mark).not.toBeNull()
      expect(mark.getAttribute('aria-label')).toBe(pipelineSaid({ state, at: AT }, NOW))
      const svg = mark.querySelector('svg')!
      expect(svg).not.toBeNull()
      icons.add(`${state === 'manual' ? 'skipped' : state}:${svg.getAttribute('class')}`)
      cleanup()
    }
    /* Skipped and manual share the dash; every other state has a shape of its own. */
    const shapes = [...icons].map((one) => one.split(':')[1]!.split(' ').find((c) => c.startsWith('lucide-') && c !== 'lucide-icon'))
    expect(new Set(shapes).size).toBe(6)
  })

  test('running turns, unless the person asked for less motion', () => {
    const { container } = draw([change('running')])
    expect(container.querySelector('[data-marker="pipeline-running"] svg')!.getAttribute('class')).toContain('motion-safe:animate-spin')
  })

  test('no pipeline, no mark', () => {
    const { container } = draw([row('!12', { kind: 'change' })])
    expect(container.querySelector('[data-marker^="pipeline-"]')).toBeNull()
  })

  test('without a link it only explains itself: not a link, not a button', () => {
    const { container } = draw([change('failed')])
    const mark = container.querySelector('[data-marker="pipeline-failed"]')!
    expect(mark.tagName).toBe('SPAN')
    expect(mark.getAttribute('href')).toBeNull()
  })

  test('with a link, a press hands it to the canvas and the default is prevented', () => {
    const asked: string[] = []
    const { container } = draw([change('failed', { pipelineUrl: URL, pipelineAt: AT })], (url) => {
      asked.push(url)
      return Promise.resolve({ outcome: 'shown', why: '' })
    })
    const mark = container.querySelector('[data-marker="pipeline-failed"]') as HTMLAnchorElement
    expect(mark.tagName).toBe('A')
    expect(mark.getAttribute('href')).toBe(URL)
    expect(mark.getAttribute('aria-label')).toBe('Pipeline: failed · 12 min ago. Open the pipeline')
    expect(fireEvent.click(mark)).toBe(false)
    expect(asked).toEqual([URL])
  })

  test('with a link and no host to hand it to, it is an ordinary new-tab link', () => {
    const { container } = draw([change('success', { pipelineUrl: URL })])
    const mark = container.querySelector('[data-marker="pipeline-success"]') as HTMLAnchorElement
    expect(mark.getAttribute('target')).toBe('_blank')
    expect(fireEvent.click(mark)).toBe(true)
  })
})

describe('Pipeline failing', () => {
  const rows = collect([
    change('failed'),
    row('!13', { kind: 'change', pipeline: 'success' }),
    row('!14', { kind: 'change', pipeline: 'failed', state: 'merged' }),
    row('#3'),
  ])

  test('open changes whose pipeline failed; not offered when no row has a pipeline', () => {
    expect(failingRefs(rows)).toEqual(['!12'])
    expect(failingRefs(collect([row('#3'), row('!12', { kind: 'change' })]))).toBeNull()
  })

  test('offered in the Scope group with its count, and narrows to those rows', () => {
    const failing = failingRefs(rows)
    const scope = offer(rows, true, { failing })!.find((group) => group.id === SCOPE)!
    expect(scope.options.find((option) => option.id === FAILING)?.label).toBe('Pipeline failing 1')
    expect(offer(rows, true, { failing: null })!.find((group) => group.id === SCOPE)!.options.some((o) => o.id === FAILING)).toBe(false)
    const sifting = siftingOf({ [SCOPE]: FAILING }, { failing })
    expect(sift(rows, sifting).map((one) => one.ref)).toEqual(['!12'])
  })

  test('chosen with no pipelines in the reading, it narrows nothing', () => {
    expect(siftingOf({ [SCOPE]: FAILING }, { failing: null }).scope).toBeNull()
    expect(siftingOf({ [SCOPE]: FAILING }, {})).toEqual(EVERYTHING)
  })
})
