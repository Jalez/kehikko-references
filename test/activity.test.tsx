import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'

import { activitySaid, reviewerStanding, reviewOf, type ActivityFacts, type ReviewerSignals } from '@/live/activity.ts'
import { collect } from '@/live/collect.ts'
import { hasNewActivity, markSeen, seenOf, type SeenBook } from '@/live/one-up.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * 3.23.0: a reviewer's standing from everything they did, the last activity
 * said as what it was, and new activity by somebody else marked until the
 * person looks at it.
 */

afterEach(cleanup)

const NOW = Date.parse('2026-11-10T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

const standing = (r: ReviewerSignals, facts: ActivityFacts = {}) => reviewerStanding(r, { kind: 'change', state: 'open', ...facts }, NOW)

describe('a reviewer’s standing', () => {
  test('asked, with nothing from them: not started', () => {
    expect(standing({ login: 'mona', state: 'requested' })).toEqual({ word: 'asked', said: 'Asked, not started' })
    /* New commits are no news to somebody who has not looked yet. */
    expect(standing({ login: 'mona', state: 'requested' }, { lastPushAt: hoursAgo(1) }).word).toBe('asked')
  })

  test('comment only, still "requested" on the tracker: reviewing, with when', () => {
    expect(standing({ login: 'mona', state: 'requested', activeAt: hoursAgo(2) })).toEqual({ word: 'reviewing', said: 'Reviewing: commented 2 h ago' })
  })

  test('comment only, from a host that says no more than the last activity: still reviewing', () => {
    const facts = { lastActivity: { login: 'Mona', at: hoursAgo(2), kind: 'comment' as const } }
    expect(standing({ login: 'mona', state: 'requested' }, facts)).toEqual({ word: 'reviewing', said: 'Reviewing: commented 2 h ago' })
    /* Somebody else's comment says nothing about her. */
    expect(standing({ login: 'mona', state: 'requested' }, { lastActivity: { ...facts.lastActivity, login: 'ali' } }).word).toBe('asked')
  })

  test('the newest of what they did is said', () => {
    const r = { login: 'mona', state: 'commented' as const, reviewedAt: hoursAgo(5), activeAt: minutesAgo(30) }
    expect(standing(r).said).toBe('Reviewing: commented 30 min ago')
  })

  test('approved: when', () => {
    expect(standing({ login: 'jo', state: 'approved', reviewedAt: hoursAgo(1) })).toEqual({ word: 'approved', said: 'Approved 1 h ago' })
    expect(standing({ login: 'jo', state: 'approved' })).toEqual({ word: 'approved', said: 'Approved' })
  })

  test('changes requested: with their open threads and when', () => {
    expect(standing({ login: 'cat', state: 'changes', reviewedAt: hoursAgo(2), openThreads: 3 })).toEqual({
      word: 'changes',
      said: 'Requested changes · 3 open threads · 2 h ago',
    })
    /* An older host counts threads on the change only. */
    expect(standing({ login: 'cat', state: 'changes' }, { discussions: { resolved: 0, unresolved: 1 } }).said).toBe('Requested changes · 1 open thread on the change')
  })

  test('threads they opened still open, without a verdict: changes requested', () => {
    expect(standing({ login: 'cat', state: 'requested', activeAt: hoursAgo(3), openThreads: 2 })).toEqual({
      word: 'changes',
      said: 'Requested changes · 2 open threads · 3 h ago',
    })
  })

  test('new commits after their review: re-review needed', () => {
    expect(standing({ login: 'jo', state: 'approved', reviewedAt: hoursAgo(3) }, { lastPushAt: hoursAgo(1) })).toEqual({
      word: 'stale',
      said: 'New commits since their review · approved 3 h ago',
    })
    expect(standing({ login: 'mona', state: 'requested', activeAt: hoursAgo(26) }, { lastPushAt: hoursAgo(1) }).said).toBe(
      'New commits since their review · commented yesterday',
    )
    /* A push before the review is what they reviewed. */
    expect(standing({ login: 'jo', state: 'approved', reviewedAt: hoursAgo(1) }, { lastPushAt: hoursAgo(3) }).word).toBe('approved')
  })

  test('the marker says the strongest, and each reviewer on a line', () => {
    const review = reviewOf(
      {
        kind: 'change',
        lastPushAt: hoursAgo(1),
        reviewers: [
          { login: 'mona', name: 'Mona Lisa', state: 'requested', activeAt: minutesAgo(20) },
          { login: 'jo', state: 'approved', reviewedAt: hoursAgo(3) },
          { login: 'ann', state: 'requested' },
        ],
      },
      NOW,
    )!
    expect(review.word).toBe('stale')
    expect(review.said).toBe(
      ['New commits since a review', 'Mona Lisa: Reviewing: commented 20 min ago', 'jo: New commits since their review · approved 3 h ago', 'ann: Asked, not started'].join('\n'),
    )
  })

  test('a reviewer who commented is drawn as reviewing, with an eye, not an hourglass', () => {
    const rows = collect([
      row('gh#5', {
        kind: 'change',
        reviewers: [{ login: 'mona', state: 'requested' }],
        lastActivity: { login: 'mona', at: '2026-08-27T08:00:00Z', kind: 'comment', mine: false },
      }),
    ])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    expect(container.querySelector('[data-marker="review-reviewing"]')).not.toBeNull()
    expect(container.querySelector('[data-face="mona"] [data-badge]')!.getAttribute('data-badge')).toBe('reviewing')
  })
})

describe('the last activity, said as what it was', () => {
  const said = (lastActivity: ActivityFacts['lastActivity'], facts: ActivityFacts = {}) =>
    activitySaid({ kind: 'change', state: 'open', lastActivity, ...facts }, NOW)

  test('a comment on a line, the file’s name in the row and its path in the tooltip', () => {
    const one = said({ login: 'mona', name: 'Mona', at: minutesAgo(5), kind: 'comment', path: 'src/server/api.ts', line: 42, mine: false })!
    expect(one.short).toBe('Mona commented on line 42 of api.ts · 5 min ago')
    expect(one.full).toBe('Mona commented on line 42 of src/server/api.ts · 5 min ago')
    expect(one.by).toBe('other')
  })
  test('a comment on the whole item, and one on a file without a line', () => {
    expect(said({ login: 'mona', at: minutesAgo(5), kind: 'comment' })!.short).toBe('mona commented · 5 min ago')
    expect(said({ login: 'mona', at: minutesAgo(5), kind: 'comment', path: 'a/b.ts' })!.short).toBe('mona commented on b.ts · 5 min ago')
  })
  test('a push, with how many when the host said', () => {
    expect(said({ login: 'ali', name: 'Ali', at: hoursAgo(1), kind: 'commit', commits: 2 })!.short).toBe('Ali pushed 2 commits · 1 h ago')
    expect(said({ login: 'ali', at: hoursAgo(1), kind: 'commit', commits: 1 })!.short).toBe('ali pushed 1 commit · 1 h ago')
    expect(said({ login: 'ali', at: hoursAgo(1), kind: 'commit' })!.short).toBe('ali pushed commits · 1 h ago')
  })
  test('a review, by its verdict', () => {
    expect(said({ login: 'jo', name: 'Jo', at: hoursAgo(30), kind: 'review', verdict: 'approved' })!.short).toBe('Jo approved · yesterday')
    expect(said({ login: 'jo', at: hoursAgo(2), kind: 'review', verdict: 'changes' })!.short).toBe('jo requested changes · 2 h ago')
    expect(said({ login: 'jo', at: hoursAgo(2), kind: 'review' })!.short).toBe('jo reviewed · 2 h ago')
  })
  test('a state change, as what it was', () => {
    const at = hoursAgo(2)
    expect(said({ login: 'jo', at, kind: 'state' }, { createdAt: at })!.short).toBe('jo opened it · 2 h ago')
    expect(said({ login: 'jo', at, kind: 'state' }, { createdAt: hoursAgo(90) })!.short).toBe('jo reopened it · 2 h ago')
    expect(said({ login: 'jo', at, kind: 'state' }, { state: 'merged' })!.short).toBe('jo merged it · 2 h ago')
    expect(said({ login: 'jo', at, kind: 'state' }, { state: 'closed' })!.short).toBe('jo closed it · 2 h ago')
  })
  test('the person’s own is "You"', () => {
    expect(said({ login: 'jalez', at: hoursAgo(2), kind: 'comment', mine: true })).toMatchObject({ short: 'You commented · 2 h ago', by: 'you' })
  })
  test('CI, when its finish is the newest event', () => {
    const last = { login: 'ali', at: hoursAgo(1), kind: 'commit' as const }
    expect(said(last, { pipeline: { state: 'failed', at: minutesAgo(10) } })).toMatchObject({ short: 'CI failed · 10 min ago', by: 'ci' })
    expect(said(last, { pipeline: { state: 'failed', at: hoursAgo(3) } })!.short).toBe('ali pushed commits · 1 h ago')
    /* A running pipeline is not an event yet, and one with no time cannot be placed. */
    expect(said(last, { pipeline: { state: 'running', at: minutesAgo(1) } })!.by).not.toBe('ci')
    expect(said(last, { pipeline: { state: 'failed' } })!.by).not.toBe('ci')
  })
  test('nothing read: nothing said', () => {
    expect(said(undefined)).toBeNull()
  })
  test('the row shows it, truncated, the whole sentence its own tooltip', () => {
    const rows = collect([
      row('gh#6', {
        kind: 'change',
        lastActivity: { login: 'mona', at: '2026-08-27T08:00:00Z', kind: 'comment', mine: false },
        people: { mona: { name: 'Mona Lisa' } },
      }),
    ])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const span = container.querySelector('[data-activity]') as HTMLElement
    expect(span.textContent).toStartWith('Mona Lisa commented · ')
    expect(span.className).toContain('truncate')
    expect(span.getAttribute('title')).toStartWith('Last activity: Mona Lisa commented · ')
    expect(container.querySelector('li[data-ref]')!.getAttribute('title')).toContain('Last activity: Mona Lisa commented')
  })
})

describe('new activity by somebody else', () => {
  const at = hoursAgo(1)
  const theirs = { ref: '#1', at: '', lastActivity: { login: 'mona', at, kind: 'comment' as const, mine: false } }

  test('marked when the latest event is somebody else’s and came after this kehikko last saw it', () => {
    const seen = seenOf({}, 'wide', NOW)
    expect(hasNewActivity(theirs, seen)).toBe(true)
    expect(hasNewActivity({ ...theirs, lastActivity: { ...theirs.lastActivity, mine: true } }, seen)).toBe(false)
    /* Who the person is not known: no mark, never a guess. */
    expect(hasNewActivity({ ...theirs, lastActivity: { login: 'mona', at, kind: 'comment' as const } }, seen)).toBe(false)
  })

  test('cleared once seen, and back when somebody acts again', () => {
    const book: SeenBook = markSeen({}, 'wide', theirs, NOW)
    expect(hasNewActivity(theirs, seenOf(book, 'wide', NOW))).toBe(false)
    /* Seen on one kehikko is seen there only. */
    expect(hasNewActivity(theirs, seenOf(book, 'other', NOW))).toBe(true)
    const again = { ...theirs, lastActivity: { ...theirs.lastActivity, at: minutesAgo(5) } }
    expect(hasNewActivity(again, seenOf(book, 'wide', NOW))).toBe(true)
  })

  test('the row: a bell and a bold title, and the bell counts it seen', () => {
    const rows = collect([row('gh#7', { lastActivity: { login: 'mona', at: '2026-08-27T08:00:00Z', kind: 'comment', mine: false } }), row('gh#8', {})])
    const seenRefs: string[] = []
    const g = globalThis as unknown as { window: { open: unknown } }
    const had = g.window.open
    g.window.open = () => {}
    try {
      const { container } = render(
        <ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} fresh={new Set(['gh#7'])} onSeen={(ref) => seenRefs.push(ref)} />,
      )
      const bell = container.querySelector('li[data-ref="gh#7"] [data-marker="new-activity"]') as HTMLElement
      expect(bell.getAttribute('aria-label')).toStartWith('New activity. mona commented · ')
      expect(bell.querySelector('svg.lucide-bell-dot')).not.toBeNull()
      expect(container.querySelector('li[data-ref="gh#7"]')!.getAttribute('data-fresh')).toBe('true')
      expect(container.querySelector('li[data-ref="gh#7"] [data-title]')!.className).toContain('font-semibold')
      expect(container.querySelector('li[data-ref="gh#8"] [data-marker="new-activity"]')).toBeNull()
      expect(container.querySelector('li[data-ref="gh#8"] [data-title]')!.className).not.toContain('font-semibold')
      fireEvent.click(bell)
      expect(seenRefs).toEqual(['gh#7'])
    } finally {
      g.window.open = had
    }
  })
})
