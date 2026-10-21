import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { trackerRowSchema, type TrackerRow } from 'kehikot-module-protocol'

import { collect } from '@/live/collect.ts'
import { agoSaid, assignedSaid, reviewOf, stackPlaces, stackSaid, unaddressed } from '@/live/markers.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * The row's markers (issues #23 and #25): the stack a change is in, who is
 * assigned, where the review stands, and activity by somebody else — each
 * from the host's reading (protocol 2.7.0 and 2.8.0), none worked out here
 * from a name.
 */

afterEach(cleanup)

const NOW = Date.parse('2026-10-21T12:00:00Z')
const parse = (raw: Record<string, unknown>): TrackerRow => trackerRowSchema.parse(raw)

/** A stack of three, bottom #41, as the host links it. */
const STACK = [
  row('gh#42', { kind: 'change', title: 'Middle', stack: { below: 'gh#41', above: ['gh#43'] } }),
  row('gh#43', { kind: 'change', title: 'Top', stack: { below: 'gh#42' } }),
  row('gh#41', { kind: 'change', title: 'Bottom', stack: { above: ['gh#42'] } }),
  row('gh#50', { kind: 'change', title: 'Alone' }),
]

describe('the stack order (issue #23)', () => {
  test('bottom first, whatever order the reading gave, and each change knows its place', () => {
    const places = stackPlaces(STACK.map(parse))
    for (const ref of ['gh#41', 'gh#42', 'gh#43']) {
      expect(places.get(ref)!.members.map((m) => m.ref)).toEqual(['gh#41', 'gh#42', 'gh#43'])
      expect(places.get(ref)!.of).toBe(3)
    }
    expect(places.get('gh#41')!.at).toBe(1)
    expect(places.get('gh#42')!.at).toBe(2)
    expect(places.get('gh#43')!.at).toBe(3)
    expect(places.has('gh#50')).toBe(false)
  })

  test('a fork: both branches after the change they share, one deeper, in the host’s order', () => {
    const forked = [
      row('gh#41', { kind: 'change', title: 'Bottom', stack: { above: ['gh#42', 'gh#44'] } }),
      row('gh#42', { kind: 'change', title: 'Left', stack: { below: 'gh#41' } }),
      row('gh#44', { kind: 'change', title: 'Right', stack: { below: 'gh#41' } }),
    ].map(parse)
    const place = stackPlaces(forked).get('gh#44')!
    expect(place.members).toEqual([
      { ref: 'gh#41', title: 'Bottom', depth: 0 },
      { ref: 'gh#42', title: 'Left', depth: 1 },
      { ref: 'gh#44', title: 'Right', depth: 1 },
    ])
    expect(place.at).toBe(3)
  })

  test('a change below that the reading does not hold ends the walk there; alone, it is no stack', () => {
    const orphan = [row('gh#42', { kind: 'change', stack: { below: 'gh#41', above: ['gh#43'] } }), row('gh#43', { kind: 'change', stack: { below: 'gh#42' } })].map(parse)
    expect(stackPlaces(orphan).get('gh#43')!.members.map((m) => m.ref)).toEqual(['gh#42', 'gh#43'])
    expect(stackPlaces([parse(row('gh#43', { kind: 'change', stack: { below: 'gh#42' } }))]).size).toBe(0)
  })

  test('the tooltip says the stack in order, refs and titles, and marks this one', () => {
    const place = stackPlaces(STACK.map(parse)).get('gh#42')!
    expect(stackSaid(place, 'gh#42')).toBe(['Stacked: 2 of 3, bottom first', '1. gh#41 Bottom', '  2. gh#42 Middle (this one)', '    3. gh#43 Top'].join('\n'))
  })

  test('collect gives each stacked row its place, worked out over every row read', () => {
    const rows = collect(STACK)
    expect(rows.find((r) => r.ref === 'gh#43')!.stack).toMatchObject({ at: 3, of: 3 })
    expect(rows.find((r) => r.ref === 'gh#50')!.stack).toBeUndefined()
  })

  test('the marker says 2/3 at every width, and pressing an entry of the stack selects it', () => {
    const picked: string[] = []
    const { container, baseElement } = render(
      <ReferenceList rows={collect(STACK)} landedOn={null} selection={[]} onPick={(ref) => picked.push(ref)} onToggle={() => {}} />,
    )
    const mark = container.querySelector('li[data-ref="gh#42"] [data-marker="stack"]') as HTMLButtonElement
    expect(mark.textContent).toBe('2/3')
    expect(mark.getAttribute('aria-label')).toBe('Stacked: 2 of 3. Show the stack')
    expect(mark.className).not.toMatch(/(^|\s|:)hidden(\s|$)/)
    fireEvent.click(mark)
    const members = [...baseElement.querySelectorAll('[data-stack-member]')] as HTMLButtonElement[]
    expect(members.map((m) => m.dataset.stackMember)).toEqual(['gh#41', 'gh#42', 'gh#43'])
    expect(members[1]!.getAttribute('aria-current')).toBe('true')
    fireEvent.click(members[0]!)
    expect(picked).toEqual(['gh#41'])
  })
})

describe('who holds it (issue #25)', () => {
  test('assigned names the people, and says when the person is among them', () => {
    expect(assignedSaid({ assignees: [], myRoles: [] })).toBeNull()
    expect(assignedSaid({ assignees: ['Ada', 'Mona'] })).toBe('Assigned to Ada, Mona')
    expect(assignedSaid({ assignees: ['Ada'], myRoles: ['assignee'] })).toBe('Assigned to Ada (you among them)')
  })

  test('the review word is the strongest state, and every reviewer is named with theirs', () => {
    expect(reviewOf(undefined)).toBeNull()
    expect(reviewOf([])).toBeNull()
    expect(reviewOf([{ login: 'mona', state: 'requested' }])).toEqual({ word: 'asked', said: 'Review asked, not started: mona (asked)' })
    expect(reviewOf([{ login: 'mona', state: 'requested' }, { login: 'hubot', state: 'commented' }])!.word).toBe('reviewing')
    expect(reviewOf([{ login: 'mona', name: 'Mona Lisa', state: 'approved' }, { login: 'hubot', state: 'commented' }])).toEqual({
      word: 'approved',
      said: 'Approved: Mona Lisa (approved), hubot (reviewing)',
    })
    expect(reviewOf([{ login: 'mona', state: 'approved' }, { login: 'hubot', state: 'changes' }])!.word).toBe('changes')
  })

  test('the markers are drawn as labelled, focusable icons: a different shape for each review word', () => {
    const rows = collect([
      row('gh#1', { kind: 'change', assignees: ['Ada'], reviewers: [{ login: 'mona', state: 'approved' }] }),
      row('gh#2', { kind: 'change', reviewers: [{ login: 'mona', state: 'requested' }] }),
      row('gh#3', {}),
    ])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const marks = (ref: string) => [...container.querySelectorAll(`li[data-ref="${ref}"] [data-marker]`)] as HTMLElement[]
    expect(marks('gh#1').map((m) => m.dataset.marker)).toEqual(['assigned', 'review-approved'])
    expect(marks('gh#1')[0]!.getAttribute('aria-label')).toBe('Assigned to Ada')
    expect(marks('gh#1')[1]!.getAttribute('aria-label')).toBe('Approved: mona (approved)')
    for (const m of marks('gh#1')) expect(m.getAttribute('tabindex')).toBe('0')
    expect(marks('gh#2').map((m) => m.dataset.marker)).toEqual(['review-asked'])
    /* Not colour alone: the two review words are two different icons. */
    expect(marks('gh#1')[1]!.innerHTML).not.toBe(marks('gh#2')[0]!.innerHTML)
    /* Nothing to say: no marker, only the empty slots that keep the wide columns aligned, which are not drawn narrow. */
    expect(container.querySelector('li[data-ref="gh#3"] [data-marker]')).toBeNull()
    expect(container.querySelector('li[data-ref="gh#3"] [data-markers]')!.className).toContain('hidden @sm/frame:flex')
  })

  test('the row’s tooltip says them too', () => {
    const rows = collect([row('gh#1', { kind: 'change', assignees: ['Ada'], reviewers: [{ login: 'mona', state: 'approved' }] })])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const said = container.querySelector('li[data-ref]')!.getAttribute('title') ?? ''
    expect(said).toContain('Assigned to Ada')
    expect(said).toContain('Approved: mona (approved)')
  })
})

describe('unaddressed activity (issue #25)', () => {
  const at = '2026-10-21T09:00:00Z'
  const open = (lastActivity: Record<string, unknown> | undefined, state: 'open' | 'closed' | 'merged' = 'open') =>
    ({ state, ...(lastActivity ? { lastActivity: lastActivity as never } : {}) }) as Parameters<typeof unaddressed>[0]

  test('somebody else: the marker, with who, what and how long ago', () => {
    expect(unaddressed(open({ login: 'mona', at, kind: 'review', mine: false }), NOW)).toBe('Last activity: mona, a review, 3 h ago')
  })
  test('the person themselves: no marker', () => {
    expect(unaddressed(open({ login: 'jalez', at, kind: 'comment', mine: true }), NOW)).toBeNull()
  })
  test('who the person is not known: no marker, never a guess', () => {
    expect(unaddressed(open({ login: 'mona', at, kind: 'comment' }), NOW)).toBeNull()
  })
  test('no last activity read, or not open: no marker', () => {
    expect(unaddressed(open(undefined), NOW)).toBeNull()
    expect(unaddressed(open({ login: 'mona', at, kind: 'state', mine: false }, 'merged'), NOW)).toBeNull()
  })
  test('how long ago, in short words', () => {
    expect(agoSaid('2026-10-21T11:59:40Z', NOW)).toBe('just now')
    expect(agoSaid('2026-10-21T11:15:00Z', NOW)).toBe('45 min ago')
    expect(agoSaid('2026-10-18T12:00:00Z', NOW)).toBe('3 d ago')
  })

  test('drawn only for somebody else, labelled as unaddressed activity', () => {
    const rows = collect([
      row('#1', { lastActivity: { login: 'mona', at, kind: 'comment', mine: false } }),
      row('#2', { lastActivity: { login: 'jalez', at, kind: 'comment', mine: true } }),
      row('#3', { lastActivity: { login: 'mona', at, kind: 'comment' } }),
    ])
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const mark = (ref: string) => container.querySelector(`li[data-ref="${ref}"] [data-marker="unaddressed"]`)
    expect(mark('#1')!.getAttribute('aria-label')).toStartWith('Unaddressed activity. Last activity: mona, a comment, ')
    expect(mark('#2')).toBeNull()
    expect(mark('#3')).toBeNull()
  })
})
