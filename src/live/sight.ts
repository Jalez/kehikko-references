import type { TrackerMissing, TrackerSource } from 'kehikot-module-protocol'

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
 * ## What moved when the rows started coming from the host's shared reading
 *
 * Twice now. The rows came from the host's `live.get`, then from this app's
 * own server running `gh` — which failed in eight interesting ways, each with
 * its own sentence, and saw GitHub only. Since issue #4 they come from
 * `tracker.get`, the reading the host keeps for every module in a project, and
 * the CLI's failures are the host's to report: they arrive per source, in
 * `sources[].error`, beside the rows that source last gave. What is left for
 * this page to fail at is the conversation with the host, so `Trouble` shrank
 * to the three ways that can go.
 *
 * What did NOT move is the shape of the argument. Every one of these is still a
 * distinct fact with its own paragraph, and the two that are easiest to confuse
 * — "there is no tracker to read" and "the tracker was read and is empty" — are
 * still the two furthest apart in what they tell somebody to do.
 */

/**
 * Why asking the host for the reading produced nothing to draw.
 *
 * - `unknown-method` — the host has never heard of `tracker.get`: a host
 *   older than the shared reading. Asking again will not change it.
 * - `refused` — the host answered no, in a sentence of its own: no tracker
 *   permission for this module, no project, a failure on its side.
 * - `unreadable` — the host answered in a shape this app cannot read as a
 *   reading, which is two programs a version apart.
 */
export type TroubleKind = 'unknown-method' | 'refused' | 'unreadable'

export interface Trouble {
  kind: TroubleKind
  /** One sentence for the person: the host's own when it gave one. */
  why: string
  /** Anything more the host said, verbatim. Never the only thing on screen. */
  said: string | null
}

/**
 * The reading as this page holds it: the protocol's `TrackerReading`, with the
 * rows left as they arrived.
 *
 * Unparsed on purpose. `trackerReadingResult` checks every row, and one row a
 * version ahead would fail the whole answer — four hundred references refused
 * for one odd label. `collect.ts` reads the rows one at a time instead, and
 * draws a row it cannot read as unreadable rather than losing the rest.
 */
export interface Held {
  /** When the reading last changed, or null when nothing has ever been read for this project. */
  at: string | null
  /** Whether the host is reading right now. */
  refreshing: boolean
  sources: TrackerSource[]
  missing: TrackerMissing[]
  rows: unknown[]
}

/**
 * - `listening` — the page just loaded and no greeting has arrived yet. It
 *   still might: a host greets on frame load, and load ordering is not ours.
 *   Distinct from `unhosted` because "not yet" and "not at all" are different
 *   sentences and only one of them is worth acting on.
 * - `unhosted` — the grace has passed and nothing greeted us. This is the
 *   standalone state, the one an app running on its own port is in forever, and
 *   the one it must not draw as an empty list.
 * - `no-project` — a host is there and its context names no project folder.
 *   The protocol says that is a real state rather than an oversight: a host with
 *   no filesystem of its own knows a project's name and has no folder to point
 *   at. There is nothing for a list to be about; there is also nothing wrong.
 * - `asking` — the read is out, nothing has come back, AND there is nothing
 *   already on screen. The one state in which a whole container of waiting is honest.
 *   A read that happens while rows are already drawn is NOT this state — see
 *   `busy` on `Kehikot`, which is what keeps the container usable in flight.
 * - `trouble` — the host was asked for the reading and gave nothing this page
 *   can draw, for one of the reasons above. Each draws its own paragraph.
 * - `read` — a reading, which may itself contain no references, and that is the
 *   one genuinely empty list on this page. A source that failed its last read
 *   says so in `reading.sources`, beside the rows it gave before — rows AND a
 *   sentence, which is the state this whole design exists to be able to draw.
 *   `trouble` is set when asking AGAIN failed over a reading already on
 *   screen: the rows stay, and the sentence says they were not re-asked.
 */
export type Sight =
  | { at: 'listening' }
  | { at: 'unhosted' }
  | { at: 'no-project' }
  | { at: 'asking'; project: string }
  | { at: 'trouble'; project: string; trouble: Trouble }
  | { at: 'read'; project: string; reading: Held; trouble: Trouble | null }
