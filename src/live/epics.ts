import { HostRefused } from 'kehikot-module-protocol/client'

import type { Ask } from './ask.ts'

/**
 * Which epics of the project a reference belongs to.
 *
 * The host answers it from three questions it already answers, and nothing is
 * added to the protocol: `epics.list` (every epic of the open project, each
 * with its parts and the refs a part names), then, per epic, `steps.list` and
 * `epic.get` — the same two questions the page asks for the open epic to
 * narrow "This epic" — for every ref the epic names, steps, related work and
 * the umbrella. Asked when the selection menu opens, and never in between:
 * what an epic names changes when a person edits it, and a menu that is not
 * open is not reading anything.
 *
 * ## Connected
 *
 * A reference is connected to an epic when the epic names it, or — for a
 * change — names an issue it closes or is part of (the ties of `ties.ts`, the
 * same rule "This epic" uses). An issue is connected when the epic names it:
 * an epic that names a change does not take in the issue the change closes.
 */

/** One epic of the project, as much of it as this page needs. */
export interface EpicReach {
  slug: string
  title: string
  /** Every ref the epic names, steps and umbrella and parts. */
  refs: string[]
  parts: { id: string; heading: string; refs: string[] }[]
}

/** What one asking found. `open` is the epic the page stands on, or null. */
export interface EpicsReading {
  open: string | null
  epics: EpicReach[]
}

/** The row's facts this reads: its ref and the issues it is part of or closes. */
export interface Tied {
  ref: string
  partOf?: readonly string[]
  closes?: readonly string[]
}

/** One line of the menu's "In epics" section. */
export interface EpicLink {
  slug: string
  title: string
  /** How many of the selected references are connected to this epic. */
  count: number
  /** Of how many were selected. */
  of: number
  /** The headings of the parts that name them, once each, in the epic's order. */
  parts: string[]
  open: boolean
}

/** What the menu draws for the section. */
export type EpicsState =
  | { state: 'reading' }
  | { state: 'failed'; why: string }
  | { state: 'read'; links: EpicLink[] }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one !== '') : []

/** `epics.list`'s rows, read leniently: a row without a slug is not an epic. */
export function epicRows(answer: unknown): { slug: string; title: string; parts: EpicReach['parts'] }[] {
  if (!isObject(answer) || !Array.isArray(answer.epics)) return []
  return answer.epics.flatMap((one) => {
    if (!isObject(one) || !text(one.slug)) return []
    const parts = (Array.isArray(one.parts) ? one.parts : []).flatMap((part) =>
      isObject(part) ? [{ id: text(part.id), heading: text(part.heading), refs: strings(part.refs) }] : [],
    )
    return [{ slug: text(one.slug), title: text(one.title) || text(one.slug), parts }]
  })
}

/**
 * Ask the host which refs every epic of the project names.
 *
 * `{ ok: false }` with a sentence when `epics.list` cannot be answered, which
 * is the one question the rest hangs on. An epic whose steps or umbrella could
 * not be read still counts with what its parts name, which is less than it
 * names but never more.
 */
export async function askEpics(
  ask: Ask,
  open: string | null,
  /** `namedBy` of the wire: the refs one epic names, out of its `steps.list` and `epic.get`. */
  namedBy: (steps: unknown, epic: unknown) => string[],
): Promise<{ ok: true; reading: EpicsReading } | { ok: false; why: string }> {
  let listed: unknown
  try {
    listed = await ask('epics.list', {})
  } catch (error) {
    return {
      ok: false,
      why:
        error instanceof HostRefused
          ? error.refusal.error || 'The host would not list the project’s epics.'
          : 'This app failed while reading the host’s answer.',
    }
  }
  const rows = epicRows(listed)
  const epics = await Promise.all(
    rows.map(async (one): Promise<EpicReach> => {
      const [steps, whole] = await Promise.allSettled([ask('steps.list', { epic: one.slug }), ask('epic.get', { epic: one.slug })])
      const named = namedBy(steps.status === 'fulfilled' ? steps.value : null, whole.status === 'fulfilled' ? whole.value : null)
      const refs = [...new Set([...named, ...one.parts.flatMap((part) => part.refs)])]
      return { ...one, refs }
    }),
  )
  return { ok: true, reading: { open, epics } }
}

/**
 * The epics the selected references belong to, with a count of how many of
 * them each one has. Epics with none are left out. Most first, then by title.
 */
export function epicsFor(selected: readonly string[], reading: EpicsReading, rows: readonly Tied[]): EpicLink[] {
  const byRef = new Map(rows.map((row) => [row.ref, row]))
  const links: EpicLink[] = []
  for (const epic of reading.epics) {
    const named = new Set(epic.refs)
    let count = 0
    const parts = new Set<string>()
    for (const ref of selected) {
      const row = byRef.get(ref)
      const hit = [ref, ...(row?.partOf ?? []), ...(row?.closes ?? [])].filter((one) => named.has(one))
      if (!hit.length) continue
      count += 1
      for (const part of epic.parts) if (part.heading && hit.some((one) => part.refs.includes(one))) parts.add(part.heading)
    }
    if (count) {
      const ordered = epic.parts.map((part) => part.heading).filter((heading) => parts.has(heading))
      links.push({
        slug: epic.slug,
        title: epic.title,
        count,
        of: selected.length,
        parts: [...new Set(ordered)],
        open: epic.slug === reading.open,
      })
    }
  }
  return links.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
}

/** The words after an epic's title: which part, and for several selected how many are in it. */
export function linkSaid(link: EpicLink): string {
  const said: string[] = []
  if (link.of > 1) said.push(`${link.count} of ${link.of}`)
  if (link.parts.length) said.push(link.parts.length === 1 ? `part: ${link.parts[0]}` : `parts: ${link.parts.join(', ')}`)
  return said.join(' · ')
}

export const NOT_IN_ANY_EPIC = 'Not in any epic of this project.'
