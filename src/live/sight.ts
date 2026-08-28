import type { Refusal } from '@/wire/host.ts'

/**
 * What this app can see, and how it came to see it.
 *
 * ## Why this is a type and not a boolean with some extras
 *
 * The whole argument of this surface is that there are several different ways
 * to have no rows, they mean entirely different things, and a list that draws
 * them all as an empty list is lying quietly. Written as `rows: Reference[]`
 * plus a `loading` flag, those differences have nowhere to live: five distinct
 * situations collapse into one empty array, and the page shows the sentence
 * "no results" over all of them.
 *
 * So: six states, each of which is a different fact about the world, and the
 * page draws a different paragraph for each. Enumerated here rather than in the
 * view so that the states are a thing the tests can hold, and so that adding a
 * seventh means answering the question "what does this one SAY" before anything
 * renders.
 *
 * - `listening` — the page just loaded and no greeting has arrived yet. It
 *   still might: a host greets on frame load, and load ordering is not ours.
 *   Distinct from `unhosted` because "not yet" and "not at all" are different
 *   sentences and only one of them is worth acting on.
 * - `unhosted` — the grace has passed and nothing greeted us. This is the
 *   standalone state, the one an app running on its own port is in forever, and
 *   the one it must not draw as an empty list.
 * - `no-epic` — a roadmap is there and its context names no epic. There
 *   is nothing for a list to be about; there is also nothing wrong.
 * - `asking` — the question is out and no answer has come back. The one state
 *   in which a spinner is honest, because something IS coming.
 * - `refused` — the roadmap answered, and the answer was no. Carries the
 *   protocol's two halves: a word for this code and a sentence for the person.
 * - `unread` — the roadmap answered with nothing. Not an empty reading: NO
 *   reading. Nothing has yet gone and looked at the trackers for this epic.
 * - `read` — a reading, which may itself contain no references, and that is the
 *   one genuinely empty list on this page.
 */
export type Sight =
  | { at: 'listening' }
  | { at: 'unhosted' }
  | { at: 'no-epic' }
  | { at: 'asking'; epic: string }
  | { at: 'refused'; epic: string; refusal: Refusal }
  | { at: 'unread'; epic: string }
  | { at: 'read'; epic: string; live: unknown }
