import { describe, expect, test } from 'bun:test'

import { activitySaid, reviewOf } from '@/live/activity.ts'
import { collect } from '@/live/collect.ts'
import { row } from './fixtures.ts'

/**
 * 3.26.0: what a host from protocol 2.67.0 says beyond the tracker's word — when each reviewer
 * reviewed and last acted, the threads they opened, and what the latest activity was — reaches the
 * standings and the sentence through `collect`.
 */

const NOW = Date.parse('2026-11-10T12:00:00Z')

describe('a host that says what each reviewer did', () => {
  const [one] = collect([
    row('!7', {
      kind: 'change',
      lastPushAt: '2026-11-10T10:00:00Z',
      reviewers: [
        { login: 'mona', state: 'requested', activeAt: '2026-11-10T11:00:00Z' },
        { login: 'jo', state: 'approved', reviewedAt: '2026-11-10T08:00:00Z', activeAt: '2026-11-10T08:00:00Z' },
        { login: 'cat', state: 'changes', reviewedAt: '2026-11-10T11:30:00Z', openThreads: 3 },
      ],
      lastActivity: { login: 'cat', at: '2026-11-10T11:30:00Z', kind: 'review', verdict: 'changes', mine: false },
      people: { mona: { name: 'Mona' }, cat: { name: 'Cat' } },
    }),
  ])

  test('the fields come through the schema', () => {
    expect(one!.reviewers?.[0]).toMatchObject({ login: 'mona', activeAt: '2026-11-10T11:00:00Z' })
    expect(one!.lastActivity).toMatchObject({ verdict: 'changes', name: 'Cat' })
  })

  test('each reviewer’s line says the specific thing', () => {
    expect(reviewOf(one!, NOW)!.lines).toEqual([
      'Mona: Reviewing: commented 1 h ago',
      'jo: New commits since their review · approved 4 h ago',
      'Cat: Requested changes · 3 open threads · 30 min ago',
    ])
    expect(one!.reviewerFaces!.map((face) => face.word)).toEqual(['reviewing', 'stale', 'changes'])
  })

  test('the last activity says the verdict', () => {
    expect(activitySaid(one!, NOW)!.short).toBe('Cat requested changes · 30 min ago')
  })

  test('a comment on a line and a push of commits', () => {
    const [comment, push] = collect([
      row('!8', { kind: 'change', lastActivity: { login: 'mona', at: '2026-11-10T11:55:00Z', kind: 'comment', path: 'server/api.ts', line: 42 } }),
      row('!9', { kind: 'change', lastActivity: { login: 'ali', at: '2026-11-10T11:00:00Z', kind: 'commit', commits: 2 } }),
    ])
    expect(activitySaid(comment!, NOW)).toMatchObject({ short: 'mona commented on line 42 of api.ts · 5 min ago', full: 'mona commented on line 42 of server/api.ts · 5 min ago' })
    expect(activitySaid(push!, NOW)!.short).toBe('ali pushed 2 commits · 1 h ago')
  })
})
