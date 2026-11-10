import type { TrackerRow } from 'kehikot-module-protocol'

import type { Reference } from './reference.ts'
import { isForked, stackTree } from './stack.ts'

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
 * - **Review** (#25): on a change somebody was asked to review: each
 *   reviewer's standing from all they did (`activity.ts`, 3.23.0).
 * - **New activity** (#25, 3.23.0): the last thing done was done by somebody
 *   else since this kehikko last saw the item (`activity.ts`). Only where the
 *   host says whose it was against who the person is (`lastActivity.mine`);
 *   when it does not know who the person is, there is no marker — never a guess.
 */

/* ------------------------------------------------------------------------ *
 * The stack
 * ------------------------------------------------------------------------ */

/**
 * One change of a stack, bottom first, depth first: each change is followed by
 * everything built on it before its next sibling. `depth` is how far above the
 * bottom, and `base` the change it is built on (null for the bottom). Two
 * changes with one base are a fork: the stack is a tree, not a line
 * (`live/stack.ts` draws it as one).
 */
export interface StackMember {
  ref: string
  title: string
  depth: number
  base: string | null
}

/**
 * Where a change sits in its stack: `at` of `of`, counting from the bottom in
 * the members' order, and the whole stack. `forked` when some change in it has
 * more than one change built on it: then `at` is no position on a line, and
 * nothing says it as one.
 */
export interface StackPlace {
  at: number
  of: number
  forked: boolean
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
      const walk = (one: TrackerRow, depth: number, base: string | null) => {
        if (seen.has(one.ref)) return
        seen.add(one.ref)
        members!.push({ ref: one.ref, title: one.title, depth, base })
        for (const above of one.stack?.above ?? []) {
          const next = byRef.get(above)
          if (next) walk(next, depth + 1, one.ref)
        }
      }
      walk(bottom, 0, null)
      walked.set(bottom.ref, members)
    }
    const at = members.findIndex((m) => m.ref === row.ref)
    if (members.length < 2 || at < 0) continue
    out.set(row.ref, { at: at + 1, of: members.length, forked: isForked(members), members })
  }
  return out
}

/**
 * The stack as the marker's tooltip says it, bottom first, this one marked: a
 * line of changes numbered, a forked stack as a tree (`stackTree`).
 */
export function stackSaid(place: StackPlace, ref: string): string {
  if (!place.forked) {
    const lines = place.members.map((m, i) => `${i + 1}. ${m.ref}${m.title ? ` ${m.title}` : ''}${m.ref === ref ? ' (this one)' : ''}`)
    return [`Stacked: ${place.at} of ${place.of}, bottom first`, ...lines].join('\n')
  }
  const lines = stackTree(place.members).map((line) => `${line.prefix}${line.ref}${line.title ? ` ${line.title}` : ''}${line.ref === ref ? ' (this one)' : ''}`)
  return [`Forked stack of ${place.of}, bottom first`, ...lines].join('\n')
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

/* ------------------------------------------------------------------------ *
 * How long ago
 * ------------------------------------------------------------------------ */

/** How long ago, in the heading's own short words. */
export function agoSaid(at: string, now: number): string {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return 'at a time not read'
  const minutes = Math.max(0, Math.floor((now - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'yesterday'
  return `${Math.floor(hours / 24)} d ago`
}
