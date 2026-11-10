import type { TrackerActivity, TrackerDiscussions, TrackerReviewer } from 'kehikot-module-protocol'

import { agoSaid } from './markers.ts'
import type { Pipeline } from './pipeline.ts'

/**
 * What each reviewer has done, what the last activity was, and whether it is
 * new to the person. Pure: `markers.tsx`, `reference-row.tsx` and `one-up.tsx`
 * draw it, and every sentence is made here.
 *
 * ## A reviewer's standing (3.23.0)
 *
 * The tracker's own word for a reviewer is narrower than what they did. A GitLab
 * reviewer who left discussion notes without submitting a review is still
 * "unreviewed" there, and a GitHub reviewer who commented on the conversation
 * is still a pending request. So the host's `state` is one signal among several:
 *
 * - `reviewedAt`, `activeAt` and `openThreads` on the reviewer (protocol 2.66.0),
 *   when the host says them;
 * - the row's `lastActivity` when it is theirs (protocol 2.8.0), which any host
 *   that reads activity says;
 * - the row's `lastPushAt` (2.7.0), against which a review can be older than the
 *   head.
 *
 * The standing is the strongest of them, newest first: new commits since they
 * last acted, then changes requested (or threads they opened still open), then
 * approved, then anything at all from them ("Reviewing: commented 2 h ago"),
 * and only with nothing from them "Asked, not started".
 *
 * ## The last activity (3.23.0)
 *
 * One sentence, the latest event with who did it and what: "Mona commented on
 * line 42 of api.ts · 5 min ago", "Ali pushed 2 commits · 1 h ago", "Jo approved
 * · 2 d ago", "CI failed · 10 min ago". A finished pipeline newer than the
 * latest person's event is the event. Detail the host did not say is left out,
 * never guessed: "Ali pushed commits", "Mona commented".
 *
 * ## New activity
 *
 * The latest event was somebody else's (`mine === false`, the host's word) and
 * came after this kehikko last saw the item (`isUnseen` in `one-up.ts`). It
 * clears when the person selects the item or opens it from the bell.
 */

/** A reviewer as a host from protocol 2.66.0 says one (`reviewedAt`, `activeAt`, `openThreads`); older hosts leave the three out. */
export interface ReviewerSignals extends TrackerReviewer {
  reviewedAt?: string
  activeAt?: string
  openThreads?: number
}

/** The last activity as a host from protocol 2.66.0 says it, and the actor's display name from `people`. */
export interface ActivitySignals extends TrackerActivity {
  commits?: number
  path?: string
  line?: number
  verdict?: 'approved' | 'changes' | 'commented'
  /** The actor's display name, from the row's `people` (2.10.0), when it is not just their login. */
  name?: string
}

/** What a row has that the standings and the sentence are read from. */
export interface ActivityFacts {
  kind?: 'issue' | 'change'
  state?: 'open' | 'closed' | 'merged' | null
  reviewers?: readonly ReviewerSignals[]
  lastActivity?: ActivitySignals
  lastPushAt?: string
  createdAt?: string
  discussions?: TrackerDiscussions
  pipeline?: Pipeline
}

/** Where one reviewer stands, in one word: the badge on their face. */
export type ReviewerWord = 'asked' | 'reviewing' | 'changes' | 'approved' | 'stale'

const time = (at: string | undefined | null): number | null => {
  if (!at) return null
  const t = Date.parse(at)
  return Number.isNaN(t) ? null : t
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Their latest act the reading shows, and whether it was a review or a comment. Null with nothing from them. */
function theirLatest(r: ReviewerSignals, row: ActivityFacts): { at: string; review: boolean } | null {
  const seen: { at: string; review: boolean }[] = []
  if (r.reviewedAt && time(r.reviewedAt) !== null) seen.push({ at: r.reviewedAt, review: true })
  if (r.activeAt && time(r.activeAt) !== null) seen.push({ at: r.activeAt, review: r.activeAt === r.reviewedAt })
  const last = row.lastActivity
  if (last && same(last.login, r.login) && (last.kind === 'comment' || last.kind === 'review') && time(last.at) !== null) {
    seen.push({ at: last.at, review: last.kind === 'review' })
  }
  if (!seen.length) return null
  return seen.reduce((a, b) => (time(b.at)! > time(a.at)! ? b : a))
}

/** When they last reviewed: the host's `reviewedAt`, else the row's last activity when it was their review. */
function reviewedAt(r: ReviewerSignals, row: ActivityFacts): string | null {
  if (r.reviewedAt && time(r.reviewedAt) !== null) return r.reviewedAt
  const last = row.lastActivity
  if (last && same(last.login, r.login) && last.kind === 'review' && r.state !== 'requested') return last.at
  return null
}

/** One reviewer's standing: the word on their face, and the sentence the tooltip says for them. */
export function reviewerStanding(r: ReviewerSignals, row: ActivityFacts, now: number): { word: ReviewerWord; said: string } {
  const latest = theirLatest(r, row)
  const reviewed = reviewedAt(r, row)
  const ago = (at: string | null) => (at ? ` ${agoSaid(at, now)}` : '')
  const threads = r.openThreads ?? 0

  /* What they did, said as their standing would be without the newer head. */
  const verdict = (): { word: Exclude<ReviewerWord, 'stale'>; said: string } => {
    if (r.state === 'changes' || (r.state !== 'approved' && threads > 0)) {
      const open =
        r.openThreads !== undefined
          ? threads > 0
            ? ` · ${plural(threads, 'open thread')}`
            : ''
          : r.state === 'changes' && row.discussions?.unresolved
            ? ` · ${plural(row.discussions.unresolved, 'open thread')} on the change`
            : ''
      const when = reviewed ?? latest?.at ?? null
      return { word: 'changes', said: `Requested changes${open}${when ? ` · ${agoSaid(when, now)}` : ''}` }
    }
    if (r.state === 'approved') {
      return { word: 'approved', said: `Approved${ago(reviewed)}${threads > 0 ? ` · ${plural(threads, 'open thread')}` : ''}` }
    }
    if (latest) return { word: 'reviewing', said: `Reviewing: ${latest.review ? 'reviewed' : 'commented'}${ago(latest.at)}` }
    if (r.state === 'commented') return { word: 'reviewing', said: `Reviewing: reviewed${ago(reviewed)}` }
    return { word: 'asked', said: 'Asked, not started' }
  }

  const did = verdict()
  if (did.word !== 'asked') {
    const theirs = Math.max(time(reviewed) ?? -Infinity, time(latest?.at) ?? -Infinity)
    const push = time(row.lastPushAt)
    if (push !== null && Number.isFinite(theirs) && push > theirs) {
      const lower = did.said.charAt(0).toLowerCase() + did.said.slice(1)
      return { word: 'stale', said: `New commits since their review · ${lower.replace(/^reviewing: /, '')}` }
    }
  }
  return did
}

/** Where a change's review stands, in one word, for the marker's icon. */
export type ReviewWord = ReviewerWord

/** What the marker's one word means, at the head of its tooltip. */
export const REVIEW_SAID: Record<ReviewWord, string> = {
  asked: 'Review asked, not started',
  reviewing: 'Being reviewed',
  changes: 'Changes requested',
  stale: 'New commits since a review',
  approved: 'Approved',
}

/** Which word wins on the marker: changes first, then a review of an older head, approved, reviewing, asked. */
const STRENGTH: ReviewWord[] = ['changes', 'stale', 'approved', 'reviewing', 'asked']

/**
 * The review marker: the strongest standing any reviewer has, and every
 * reviewer named with theirs, a line each. Null when nobody was asked and
 * nobody reviewed, or the host did not say.
 */
export function reviewOf(row: ActivityFacts, now: number): { word: ReviewWord; said: string; lines: string[] } | null {
  const reviewers = row.reviewers
  if (!reviewers?.length) return null
  const standings = reviewers.map((r) => ({ r, ...reviewerStanding(r, row, now) }))
  const word = STRENGTH.find((w) => standings.some((s) => s.word === w)) ?? 'asked'
  const lines = standings.map((s) => `${s.r.name || s.r.login}: ${s.said}`)
  return { word, said: [REVIEW_SAID[word], ...lines].join('\n'), lines }
}

/* ------------------------------------------------------------------------ *
 * The last activity
 * ------------------------------------------------------------------------ */

/** The last activity as a sentence: `short` for the row (a file's base name), `full` for the tooltip. */
export interface ActivitySaid {
  short: string
  full: string
  at: string
  /** Whose: the person's, somebody else's, or not known (the host does not know who the person is); `ci` for a pipeline. */
  by: 'you' | 'other' | 'unknown' | 'ci'
}

const baseName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

/** What was done, in words, with the path as given (`full`) or its base name. */
function didSaid(last: ActivitySignals, row: ActivityFacts, full: boolean): string {
  switch (last.kind) {
    case 'comment': {
      if (!last.path) return 'commented'
      const file = full ? last.path : baseName(last.path)
      return last.line ? `commented on line ${last.line} of ${file}` : `commented on ${file}`
    }
    case 'review':
      return last.verdict === 'approved' ? 'approved' : last.verdict === 'changes' ? 'requested changes' : 'reviewed'
    case 'commit':
      return last.commits ? `pushed ${plural(last.commits, 'commit')}` : 'pushed commits'
    case 'state':
      if (row.state === 'merged') return 'merged it'
      if (row.state === 'closed') return 'closed it'
      if (row.createdAt && time(row.createdAt) !== null && time(row.createdAt) !== time(last.at)) return 'reopened it'
      return 'opened it'
  }
}

/** Pipeline states that are an event: it finished one way or another. */
const CI_DONE: Partial<Record<Pipeline['state'], string>> = { failed: 'CI failed', success: 'CI passed', canceled: 'CI canceled' }

/**
 * The latest event on a row, as a sentence, or null when the reading has none.
 * A finished pipeline is the event when it is newer than the last person's act.
 */
export function activitySaid(row: ActivityFacts, now: number): ActivitySaid | null {
  const last = row.lastActivity
  const lastAt = time(last?.at)
  const ci = row.kind === 'change' && row.pipeline ? CI_DONE[row.pipeline.state] : undefined
  const ciAt = ci ? time(row.pipeline?.at) : null
  if (ci && ciAt !== null && (lastAt === null || ciAt > lastAt)) {
    const said = `${ci} · ${agoSaid(row.pipeline!.at!, now)}`
    return { short: said, full: said, at: row.pipeline!.at!, by: 'ci' }
  }
  if (!last || lastAt === null) return null
  const who = last.mine === true ? 'You' : last.name || last.login
  const ago = agoSaid(last.at, now)
  return {
    short: `${who} ${didSaid(last, row, false)} · ${ago}`,
    full: `${who} ${didSaid(last, row, true)} · ${ago}`,
    at: last.at,
    by: last.mine === true ? 'you' : last.mine === false ? 'other' : 'unknown',
  }
}
