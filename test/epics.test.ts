import { describe, expect, test } from 'bun:test'
import { HostRefused } from 'kehikot-module-protocol/client'

import { askEpics, epicRows, epicsFor, linkSaid, type EpicReach, type EpicsReading } from '@/live/epics.ts'
import { namedBy } from '@/wire/use-kehikot.ts'

const epic = (slug: string, refs: string[], more: Partial<EpicReach> = {}): EpicReach => ({
  slug,
  title: `Epic ${slug}`,
  refs,
  parts: [],
  ...more,
})
const reading = (epics: EpicReach[], open: string | null = null): EpicsReading => ({ open, epics })

describe('which epics a selected reference belongs to', () => {
  test('a merge request the epic names directly', () => {
    const links = epicsFor(['!5'], reading([epic('a', ['!5']), epic('b', ['#1'])]), [{ ref: '!5' }])
    expect(links.map((one) => one.slug)).toEqual(['a'])
    expect(links[0]).toMatchObject({ count: 1, of: 1, open: false })
  })

  test('a merge request through an issue it closes, closed or not', () => {
    const links = epicsFor(['!5'], reading([epic('a', ['#9'])]), [{ ref: '!5', closes: ['#9'] }, { ref: '#9' }])
    expect(links.map((one) => one.slug)).toEqual(['a'])
  })

  test('a merge request through an issue it is part of', () => {
    const links = epicsFor(['!5'], reading([epic('a', ['#9']), epic('c', ['#10'])]), [{ ref: '!5', partOf: ['#9'] }])
    expect(links.map((one) => one.slug)).toEqual(['a'])
  })

  test('an issue is only in the epics that name it, not those naming a change that closes it', () => {
    const rows = [{ ref: '!5', closes: ['#9'] }, { ref: '#9' }]
    expect(epicsFor(['#9'], reading([epic('a', ['!5'])]), rows)).toEqual([])
    expect(epicsFor(['#9'], reading([epic('a', ['#9'])]), rows)).toHaveLength(1)
  })

  test('several epics, each once, and the open one marked', () => {
    const links = epicsFor(['!5'], reading([epic('b', ['!5']), epic('a', ['#9']), epic('c', ['x'])], 'b'), [{ ref: '!5', closes: ['#9'] }])
    expect(links.map((one) => [one.slug, one.open])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  test('several selected: the union, with how many of them each epic has, most first', () => {
    const links = epicsFor(
      ['!1', '!2', '!3'],
      reading([epic('a', ['!1']), epic('b', ['!1', '#2']), epic('c', ['#7'])]),
      [{ ref: '!1' }, { ref: '!2', closes: ['#2'] }, { ref: '!3' }],
    )
    expect(links.map((one) => [one.slug, one.count, one.of])).toEqual([
      ['b', 2, 3],
      ['a', 1, 3],
    ])
    expect(linkSaid(links[0]!)).toBe('2 of 3')
  })

  test('which part, by the part that names the ref or the issue it closes', () => {
    const parts = [
      { id: 'one', heading: 'First', refs: ['#9'] },
      { id: 'two', heading: 'Second', refs: ['!5'] },
      { id: 'three', heading: 'Third', refs: ['#4'] },
    ]
    const [link] = epicsFor(['!5'], reading([epic('a', ['#9', '!5', '#4'], { parts })]), [{ ref: '!5', closes: ['#9'] }])
    expect(link!.parts).toEqual(['First', 'Second'])
    expect(linkSaid(link!)).toBe('parts: First, Second')
  })

  test('in no epic: nothing', () => {
    expect(epicsFor(['!5'], reading([epic('a', ['#1'])]), [{ ref: '!5' }])).toEqual([])
    expect(epicsFor(['!5'], reading([]), [])).toEqual([])
  })
})

describe('asking the host', () => {
  const ask = (answers: Record<string, unknown>, calls: string[] = []) => async (method: string, params?: Record<string, unknown>) => {
    calls.push(`${method}${params?.epic ? ` ${params.epic}` : ''}`)
    const said = answers[`${method}${params?.epic ? ` ${params.epic}` : ''}`]
    if (said instanceof Error) throw said
    if (said === undefined) throw new HostRefused({ reason: 'failed', error: 'no' })
    return said
  }

  test('epics.list, then steps.list and epic.get of each; parts add their refs', async () => {
    const calls: string[] = []
    const answer = await askEpics(
      ask(
        {
          'epics.list': { epics: [{ slug: 'a', title: 'Alpha', parts: [{ id: 'p', heading: 'P', refs: ['#3'] }] }, { slug: 'b' }, { nothing: true }] },
          'steps.list a': { steps: [{ refs: ['#1'] }] },
          'epic.get a': { umbrella: '#2' },
          'steps.list b': { steps: [] },
        },
        calls,
      ),
      'a',
      namedBy,
    )
    expect(answer.ok && answer.reading.open).toBe('a')
    expect(answer.ok && answer.reading.epics.map((one) => [one.slug, one.title, one.refs])).toEqual([
      ['a', 'Alpha', ['#1', '#2', '#3']],
      ['b', 'b', []],
    ])
    expect(calls.filter((one) => one.startsWith('epics.list'))).toHaveLength(1)
  })

  test('a host that will not list the epics is a sentence', async () => {
    const answer = await askEpics(ask({}), null, namedBy)
    expect(answer).toEqual({ ok: false, why: 'no' })
  })

  test('epic rows without a slug are not epics', () => {
    expect(epicRows({ epics: [{ title: 'x' }, 3, { slug: 's' }] }).map((one) => one.slug)).toEqual(['s'])
    expect(epicRows(null)).toEqual([])
  })
})
