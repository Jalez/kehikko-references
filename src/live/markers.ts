import type { LastActivityKind, TrackerActivity, TrackerReviewer, TrackerRow } from 'kehikot-module-protocol'

import type { Reference } from './reference.ts'

/**
 * The row's markers: what a narrow row says about a reference besides its
 * identifier and its state (issues #23 and #25). Pure; `reference-row.tsx`
 * draws them, and every sentence a marker's tooltip says is made here.
 *
 * Four of them, each only when it has something to say:
 *
 * - **The stack** (#23): a change whose base branch is another open change's
 *   head, as the host worked it out (protocol 2.8.0 `stack`). `2/3`, and the
 *   whole stack bottom first.
 * - **Assigned** (#25): somebody is assigned. Nothing when nobody is: the
 *   row's tooltip says "nobody", and a marker on most rows would be noise.
 * - **Review** (#25): on a change somebody was asked to review: asked,
 *   reviewing, changes requested or approved, with each reviewer named.
 * - **Unaddressed activity** (#25): the last thing done on an open reference
 *   was done by somebody else. Only where the host says whose it was against
 *   who the person is (`lastActivity.mine`); when it does not know who the
 *   person is, there is no marker — never a guess.
 */

/* ------------------------------------------------------------------------ *
 * The stack
 * ------------------------------------------------------------------------ */

/** One change of a stack, bottom first. `depth` is how far above the bottom: two at one depth are a fork. */
export interface StackMember {
  ref: string
  title: string
  depth: number
}

/** Where a change sits in its stack: `at` of `of`, counting from the bottom, and the whole stack. */
export interface StackPlace {
  at: number
  of: number
  members: StackMember[]
}

/**
 * Every stacked change's place, by ref, from the rows of one reading.
 *
 * The bottom is found by following `below` down while the reading holds it;
 * the stack is then walked up from there through `above`, in the order the
 * host gave (number order), each change once. A ref the reading does not hold
 * ends the walk there. A stack of one — its other changes not in the reading —
 * is no stack to show.
 */
export function stackPlaces(rows: readonly TrackerRow[]): Map<string, StackPlace> {
  const byRef = new Map(rows.map((row) => [row.ref, row]))
  const out = new Map<string, StackPlace>()
  const walked = new Map<string, StackMember[]>()
  for (const row of rows) {
    if (!row.stack) continue
    let bottom = row
    const down = new Set([row.ref])
    for (let below = bottom.stack?.below; below && byRef.has(below) && !down.has(below); below = bottom.stack?.below) {
      down.add(below)
      bottom = byRef.get(below)!
    }
    let members = walked.get(bottom.ref)
    if (!members) {
      members = []
      const seen = new Set<string>()
      const walk = (one: TrackerRow, depth: number) => {
        if (seen.has(one.ref)) return
        seen.add(one.ref)
        members!.push({ ref: one.ref, title: one.title, depth })
        for (const above of one.stack?.above ?? []) {
          const next = byRef.get(above)
          if (next) walk(next, depth + 1)
        }
      }
      walk(bottom, 0)
      walked.set(bottom.ref, members)
    }
    const at = members.findIndex((m) => m.ref === row.ref)
    if (members.length < 2 || at < 0) continue
    out.set(row.ref, { at: at + 1, of: members.length, members })
  }
  return out
}

/** The stack as the marker's tooltip says it: one line each, bottom first, this one marked. */
export function stackSaid(place: StackPlace, ref: string): string {
  const lines = place.members.map(
    (m, i) => `${'  '.repeat(m.depth)}${i + 1}. ${m.ref}${m.title ? ` ${m.title}` : ''}${m.ref === ref ? ' (this one)' : ''}`,
  )
  return [`Stacked: ${place.at} of ${place.of}, bottom first`, ...lines].join('\n')
}

/* ------------------------------------------------------------------------ *
 * Who holds it
 * ------------------------------------------------------------------------ */

/** Who is assigned, as the marker says it; null when nobody is. */
export function assignedSaid(row: Pick<Reference, 'assignees' | 'myRoles'>): string | null {
  if (!row.assignees.length) return null
  const you = row.myRoles?.includes('assignee') ? ' (you among them)' : ''
  return `Assigned to ${row.assignees.join(', ')}${you}`
}

/** Where a change's review stands, in one word, for the marker's icon. */
export type ReviewWord = 'asked' | 'reviewing' | 'changes' | 'approved'

/** Each reviewer's state, as the tooltip says it. */
const REVIEWER_SAID: Record<TrackerReviewer['state'], string> = {
  requested: 'asked',
  commented: 'reviewing',
  changes: 'changes requested',
  approved: 'approved',
}

/** What the marker's one word means, at the head of its tooltip. */
export const REVIEW_SAID: Record<ReviewWord, string> = {
  asked: 'Review asked, not started',
  reviewing: 'Being reviewed',
  changes: 'Changes requested',
  approved: 'Approved',
}

/**
 * The review marker: the strongest word any reviewer's state gives — changes
 * requested, then approved, then reviewing, then only asked — and every
 * reviewer named with theirs. Null when nobody was asked and nobody reviewed,
 * or the host did not say.
 */
export function reviewOf(reviewers: readonly TrackerReviewer[] | undefined): { word: ReviewWord; said: string } | null {
  if (!reviewers?.length) return null
  const has = (state: TrackerReviewer['state']) => reviewers.some((r) => r.state === state)
  const word: ReviewWord = has('changes') ? 'changes' : has('approved') ? 'approved' : has('commented') ? 'reviewing' : 'asked'
  const names = reviewers.map((r) => `${r.name || r.login} (${REVIEWER_SAID[r.state]})`).join(', ')
  return { word, said: `${REVIEW_SAID[word]}: ${names}` }
}

/* ------------------------------------------------------------------------ *
 * Unaddressed activity
 * ------------------------------------------------------------------------ */

const KIND_SAID: Record<LastActivityKind, string> = {
  comment: 'a comment',
  review: 'a review',
  commit: 'a commit',
  state: 'a state change',
}

/** How long ago, in the heading's own short words. */
export function agoSaid(at: string, now: number): string {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return 'at a time not read'
  const minutes = Math.max(0, Math.floor((now - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

/**
 * The unaddressed-activity sentence — `Last activity: mona, a review, 3 h ago`
 * — or null when there is no marker to draw: not open, no last activity read,
 * the last activity was the person's own, or the host does not know who the
 * person is (`mine` absent). Never a guess from a name.
 */
export function unaddressed(row: { state: Reference['state']; lastActivity?: TrackerActivity }, now: number): string | null {
  const last = row.lastActivity
  if (row.state !== 'open' || !last || last.mine !== false) return null
  return `Last activity: ${last.login}, ${KIND_SAID[last.kind]}, ${agoSaid(last.at, now)}`
}
