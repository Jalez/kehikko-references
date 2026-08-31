/**
 * What this app can see, and how it came to see it.
 *
 * ## Why this is a type and not a boolean with some extras
 *
 * The whole argument of this surface is that there are several different ways
 * to have no rows, they mean entirely different things, and a list that draws
 * them all as an empty list is lying quietly. Written as `rows: Reference[]`
 * plus a `loading` flag, those differences have nowhere to live: a dozen
 * distinct situations collapse into one empty array, and the page shows the
 * sentence "no results" over all of them.
 *
 * So: a state per fact about the world, and the page draws a different paragraph
 * for each. Enumerated here rather than in the view so that the states are a
 * thing the tests can hold, and so that adding one means answering the question
 * "what does this one SAY" before anything renders.
 *
 * ## What moved when the rows started coming from GitHub
 *
 * Three of the old states were about a conversation with the roadmap — the
 * question was out, the roadmap refused it, the roadmap had no reading — and all
 * three were about `live.get`, which this app no longer calls. What replaced
 * them is a conversation with a subprocess, which fails in more ways and more
 * interesting ones, so the single refusal state grew into `Trouble`.
 *
 * What did NOT move is the shape of the argument. Every one of these is still a
 * distinct fact with its own paragraph, and the two that are easiest to confuse
 * — "there is no tracker to read" and "the tracker was read and is empty" — are
 * still the two furthest apart in what they tell somebody to do.
 */

/**
 * Why a read produced nothing, as the page understands it.
 *
 * The kinds are `tracker/gh.ts`'s, deliberately spelled the same on both sides
 * of the wire: the door decides which one it is, because the door is the thing
 * holding the exit code and the CLI's own words, and the page draws it. A page
 * that re-derived the kind from a sentence would be parsing prose somebody may
 * one day reword.
 */
export type TroubleKind =
  | 'bad-project'
  | 'no-gh'
  | 'not-a-repo'
  | 'no-remote'
  | 'unauthenticated'
  | 'offline'
  | 'rate-limited'
  | 'refused'
  /** The door itself did not answer: this app's own server is not there, or said something unreadable. */
  | 'door'

export interface Trouble {
  kind: TroubleKind
  /** One sentence for the person, written where the failure is known. */
  why: string
  /** What `gh` printed, if anything. Shown rather than summarised, and never the only thing on screen. */
  said: string | null
}

/**
 * - `listening` — the page just loaded and no greeting has arrived yet. It
 *   still might: a host greets on frame load, and load ordering is not ours.
 *   Distinct from `unhosted` because "not yet" and "not at all" are different
 *   sentences and only one of them is worth acting on.
 * - `unhosted` — the grace has passed and nothing greeted us. This is the
 *   standalone state, the one an app running on its own port is in forever, and
 *   the one it must not draw as an empty list.
 * - `no-project` — a roadmap is there and its context names no project folder.
 *   The protocol says that is a real state rather than an oversight: a host with
 *   no filesystem of its own knows a project's name and has no folder to point
 *   at. There is nothing for a list to be about; there is also nothing wrong.
 * - `asking` — the read is out, nothing has come back, AND there is nothing
 *   already on screen. The one state in which a whole container of waiting is honest.
 *   A read that happens while rows are already drawn is NOT this state — see
 *   `busy` on `Roadmap`, which is what keeps the container usable in flight.
 * - `trouble` — the read did not happen, there is no cached reading either, and
 *   the reason is one of the kinds above. Each draws its own paragraph.
 * - `read` — a reading, which may itself contain no references, and that is the
 *   one genuinely empty list on this page. It carries where the rows came from
 *   this time, and a `trouble` alongside them when a fresh read failed over a
 *   cache that could still be shown: rows AND a sentence, which is the state
 *   this whole design exists to be able to draw.
 */
export type Sight =
  | { at: 'listening' }
  | { at: 'unhosted' }
  | { at: 'no-project' }
  | { at: 'asking'; project: string }
  | { at: 'trouble'; project: string; trouble: Trouble }
  | { at: 'read'; project: string; live: unknown; from: 'gh' | 'cache'; trouble: Trouble | null }
