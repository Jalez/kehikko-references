import { KEHIKKO_KEY, LIMITS, shortPath, type HeaderItemInput, type MessagePlace } from 'kehikot-module-protocol'

import type { ActivityFacts } from './activity.ts'
import { hasNewActivity, markSeen, type Seen, type SeenBook } from './one-up.ts'
import type { Reference } from './reference.ts'

/**
 * News for the agents at an epic (3.28.0): what somebody other than the person did on one of the
 * epic's items, told to the agent sessions working at that epic on this kehikko (`messages.tell`).
 * Pure: the page sends the epic's rows to its own server (`tell.ts` at the root), which keeps what
 * was told and does the telling.
 *
 * ## The same detector as the bell
 *
 * An item has news when `hasNewActivity` (`one-up.ts`, the bell's own test) says so against what
 * was TOLD at this place rather than what the person SAW: the last thing done on it was somebody
 * else's (`mine === false`, the host's word, never a guess) and came after the record. Telling marks
 * it with `markSeen` on the told book, so each event is told once. The words are the activity's
 * (2.67 detail: who, the verdict, the file and line, the commits).
 *
 * A finished pipeline is the other kind of news, as `activitySaid` treats it: a failure, and a
 * success after a failure ("recovered"). It is recorded per item as its last finished state (`''`
 * for a change seen with none yet).
 *
 * ## First sight tells nothing
 *
 * A place with no record starts at now: what happened before this module watched the place is not
 * news, and an epic opened for the first time does not flood its agents. An item first seen with a
 * finished pipeline has that pipeline recorded, not told.
 */

/** What a row carries that the news is read from: the bell's fields and the activity's. */
export type TellFacts = Pick<Reference, 'ref' | 'at' | 'lastActivity'> & ActivityFacts

/** What one place was told: the bell's `Seen` (`w`, `r`), and each item's last finished pipeline (`c`). */
export interface Told extends Seen {
  c: Record<string, string>
}

/** Every place's record, by `placeKey`. Insertion order is least recently touched first. */
export type ToldBook = Record<string, Told>

/** At most this many places are remembered; the least recently touched goes first. */
export const TOLD_PLACES_MOST = 64

/** The place an epic's news goes to: its agents on this kehikko, or at the epic anywhere when the kehikko has no key. */
export function placeOf(epic: string, kehikko: string | null | undefined): MessagePlace {
  return kehikko && KEHIKKO_KEY.test(kehikko) ? { epic, kehikko } : { epic }
}

/** The key a place's record is kept under. */
export const placeKey = (place: MessagePlace): string => `${place.epic ?? ''}@${place.kehikko ?? ''}`

const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Pipeline states that finished, and are recorded. */
const FINISHED = new Set(['failed', 'success', 'canceled'])

/** The open threads to name beside changes requested: the reviewer's own (2.67), else the change's unresolved. */
function threadsOf(row: TellFacts): number {
  const login = row.lastActivity?.login.toLowerCase()
  const theirs = row.reviewers?.find((r) => r.login.toLowerCase() === login)?.openThreads
  return theirs ?? row.discussions?.unresolved ?? 0
}

/** The sentence for somebody else's last act on a row: short, with the ref and a file's short name. */
export function activityNews(row: TellFacts): string | null {
  const last = row.lastActivity
  if (!last) return null
  const who = last.name || last.login
  const ref = row.ref
  switch (last.kind) {
    case 'comment': {
      if (!last.path) return `${who} commented on ${ref}`
      const file = shortPath(last.path)
      return last.line ? `${who} commented on ${ref} · line ${last.line} of ${file}` : `${who} commented on ${ref} · ${file}`
    }
    case 'review': {
      if (last.verdict === 'approved') return `${who} approved ${ref}`
      if (last.verdict === 'changes') {
        const threads = threadsOf(row)
        const where = last.path ? ` on ${shortPath(last.path)}` : ''
        return `${who} requested changes on ${ref}${threads > 0 ? ` · ${plural(threads, 'thread')}${where}` : where ? ` ·${where}` : ''}`
      }
      return `${who} reviewed ${ref}`
    }
    case 'commit':
      return last.commits ? `${who} pushed ${plural(last.commits, 'commit')} to ${ref}` : `${who} pushed commits to ${ref}`
    case 'state': {
      if (row.state === 'merged') return `${who} merged ${ref}`
      if (row.state === 'closed') return `${who} closed ${ref}`
      const created = row.createdAt ? Date.parse(row.createdAt) : NaN
      if (!Number.isNaN(created) && created !== Date.parse(last.at)) return `${who} reopened ${ref}`
      return `${who} opened ${ref}`
    }
    default:
      return null
  }
}

/** A finished pipeline as recorded: its state and when it moved. Null for one that has not finished. */
function finishedOf(row: TellFacts): string | null {
  if (row.kind !== 'change' || !row.pipeline || !FINISHED.has(row.pipeline.state)) return null
  return `${row.pipeline.state}@${row.pipeline.at ?? ''}`
}

/** The pipeline's news: failed, or passed after failing. Null when it is not news. */
function pipelineNews(row: TellFacts, was: string | undefined, now: string): string | null {
  if (was === undefined || was === now) return null
  if (now.startsWith('failed@')) return `CI failed on ${row.ref}`
  if (now.startsWith('success@') && was.startsWith('failed@')) return `CI recovered on ${row.ref}`
  return null
}

/**
 * What is news on these rows at this place, and the record with it told. `rows` are the epic's
 * items only; `tell: false` (the toggle off) records everything and tells nothing, so turning it on
 * again does not tell what happened while it was off. The same book back when nothing moved.
 */
export function newsFor(
  book: ToldBook,
  key: string,
  rows: readonly TellFacts[],
  nowMs: number,
  tell = true,
): { news: { ref: string; body: string }[]; book: ToldBook } {
  const fresh = !book[key]
  let seen: SeenBook = { [key]: book[key] ?? { w: Math.floor(nowMs / 1000), r: {} } }
  const c: Record<string, string> = { ...(book[key]?.c ?? {}) }
  const news: { ref: string; body: string }[] = []
  let moved = fresh

  for (const row of rows) {
    if (!fresh && hasNewActivity(row, seen[key]!)) {
      const body = activityNews(row)
      if (body && tell) news.push({ ref: row.ref, body: clip(body) })
      seen = markSeen(seen, key, row, nowMs)
      moved = true
    }
    /* A change seen with no finished pipeline is recorded as `''`, so its first failure is news;
       one never seen before has nothing recorded, and its pipeline is recorded, not told. */
    const finished = finishedOf(row) ?? (row.kind === 'change' && c[row.ref] === undefined ? '' : null)
    if (finished !== null && c[row.ref] !== finished) {
      const body = fresh ? null : pipelineNews(row, c[row.ref], finished)
      if (body && tell) news.push({ ref: row.ref, body })
      c[row.ref] = finished
      moved = true
    }
  }
  if (!moved) return { news, book }

  const { [key]: _was, ...rest } = book
  const next: ToldBook = { ...rest, [key]: { w: seen[key]!.w, r: seen[key]!.r, c } }
  const keys = Object.keys(next)
  for (const old of keys.slice(0, Math.max(0, keys.length - TOLD_PLACES_MOST))) delete next[old]
  return { news, book: next }
}

const clip = (text: string) => (text.length > LIMITS.MESSAGE_BODY ? `${text.slice(0, LIMITS.MESSAGE_BODY - 1)}…` : text)

/** The told book out of what was written, as far as it can be believed: anything malformed is left out. */
export function toldRead(raw: unknown): ToldBook {
  const out: ToldBook = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  const places = (raw as { v?: unknown; places?: unknown }).v === 1 ? (raw as { places?: unknown }).places : null
  if (typeof places !== 'object' || places === null || Array.isArray(places)) return out
  for (const [key, entry] of Object.entries(places as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const { w, r, c } = entry as { w?: unknown; r?: unknown; c?: unknown }
    if (typeof w !== 'number' || !Number.isFinite(w)) continue
    const refs: Record<string, number> = {}
    if (typeof r === 'object' && r !== null) for (const [ref, at] of Object.entries(r)) if (typeof at === 'number' && Number.isFinite(at)) refs[ref] = at
    const ci: Record<string, string> = {}
    if (typeof c === 'object' && c !== null) for (const [ref, state] of Object.entries(c)) if (typeof state === 'string') ci[ref] = state
    out[key] = { w, r: refs, c: ci }
  }
  return out
}

/** The told book as written. */
export const toldWritten = (book: ToldBook): string => `${JSON.stringify({ v: 1, places: book })}\n`

/** The slim facts the page sends for one row: only what `newsFor` reads. */
export function factsOf(row: Reference): TellFacts {
  return {
    ref: row.ref,
    at: row.at,
    kind: row.kind,
    state: row.state,
    ...(row.lastActivity ? { lastActivity: row.lastActivity } : {}),
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    ...(row.pipeline ? { pipeline: row.pipeline } : {}),
    ...(row.reviewers ? { reviewers: row.reviewers } : {}),
    ...(row.discussions ? { discussions: row.discussions } : {}),
  }
}

/** The header toggle's id: what a press names. */
export const TELL_ITEM = 'tell-agents'

/**
 * "Tell agents about new activity", in the container's View menu: on by default, kept per kehikko
 * with the order (`keep.ts`). Person-only: it says nothing about agents, so no agent turns itself
 * off. Left out of the kept view (`use-kehikot.ts`): this page's own kept string already restores it.
 */
export function tellItem(on: boolean): HeaderItemInput {
  return {
    kind: 'toggle',
    id: TELL_ITEM,
    label: 'Tell agents about new activity',
    checked: on,
  }
}

/** The state a press wants, or `null` when it is not this toggle's. */
export function tellPressed(item: string, value: unknown): boolean | null {
  if (item !== TELL_ITEM || typeof value !== 'boolean') return null
  return value
}
