import { describe, expect, test } from 'bun:test'
import { CONTENT_STEPS, planOfJourney, plansUnion, stepsListResult } from 'kehikot-module-protocol'

import { epicStamp, namedBy } from '../src/wire/use-kehikot.ts'

/** What the open epic names, from a 2.21.0 host's `steps.list`: every steps provider's plan. */
describe('the refs an epic names, from every provider’s steps', () => {
  const journey = { slug: 'e', title: 'E', steps: [{ title: 'A', refs: ['#1', '#9'], roles: { '#9': 'prior-art' } }, { title: 'B', refs: ['#2'] }] }

  test('a step’s refs and its related ones, as a journey step’s refs were', () => {
    const union = stepsListResult.parse(plansUnion([{ module: 'kehikot.journeys', plan: planOfJourney(journey)! }]))
    expect(union.steps?.[0]).toMatchObject({ refs: ['#1'], related: ['#9'] })
    /* The same refs as the record's own steps named before 2.21.0, in the same order. */
    expect(namedBy(union, null)).toEqual(namedBy({ steps: journey.steps }, null))
    expect(namedBy(union, { umbrella: '#100' })).toEqual(['#1', '#9', '#2', '#100'])
  })

  test('two providers’ steps are both read', () => {
    const union = plansUnion([
      { module: 'kehikot.journeys', plan: planOfJourney(journey)! },
      { module: 'kehikot.planner', plan: { phases: [], steps: [{ id: 'x', title: 'X', body: '', refs: ['#7'], related: [], after: [], gates: [] }] } },
    ])
    expect(namedBy(union, null)).toEqual(['#1', '#9', '#2', '#7'])
  })

  test('the epic’s stamp moves on a CONTENT_STEPS change, as on every source the host announces, and not on another epic’s', () => {
    const at = '2026-10-26T10:00:00.000Z'
    expect(epicStamp([{ source: CONTENT_STEPS, epic: 'e', at }], 'e')).not.toBe(epicStamp([], 'e'))
    expect(epicStamp([{ source: CONTENT_STEPS, epic: 'other', at }], 'e')).toBe(epicStamp([], 'e'))
  })
})
