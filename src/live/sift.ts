import type { Reference } from './reference.ts'

/**
 * Narrowing the list, which is the only place this app is allowed to hide a
 * row — and only because somebody asked it to, in the current second, with the
 * count of what is hidden on screen.
 *
 * That is the whole rule this file exists to keep. `collect` never drops
 * anything; a filter drops things by definition, so every part of the design
 * here is about making the dropping visible: the count of what matched out of
 * what exists is always drawn, a narrowed list that matches nothing says so in
 * its own words rather than in the words used for an epic with no references,
 * and one press puts everything back.
 */

export type KindFilter = 'all' | 'issue' | 'change'
export type StateFilter = 'all' | 'opened' | 'closed' | 'merged'

export interface Sifting {
  query: string
  kind: KindFilter
  state: StateFilter
}

export const EVERYTHING: Sifting = { query: '', kind: 'all', state: 'all' }

/** Whether anything is being hidden by choice. Drives the "clear" affordance and the count. */
export function narrowing(sifting: Sifting): boolean {
  return sifting.query.trim() !== '' || sifting.kind !== 'all' || sifting.state !== 'all'
}

/**
 * Every word has to match something; the words do not have to match the same
 * thing.
 *
 * `jaakko rbac` finds the change `jaakko` wrote about `rbac` — one word from the
 * people, one from the title — which is how somebody looking for a reference
 * they half remember actually types. An implementation that required the whole
 * phrase in one field would find nothing and give no reason for it.
 *
 * The haystack is built once per row per call and includes the identifier, the
 * title, every label and every person. The identifier matters most and is
 * cheapest: `1848` finds `!1848`, and typing `!1848` finds it too, because the
 * spelling is in the haystack exactly as it is drawn.
 */
function matches(row: Reference, terms: string[]): boolean {
  if (!terms.length) return true
  const hay = [row.ref, row.title, ...row.labels, ...row.people].join(' ').toLowerCase()
  return terms.every((term) => hay.includes(term))
}

/**
 * The rows to draw, in the order `collect` put them.
 *
 * Order is never changed here. A filter that also reordered would mean pressing
 * "issues" moves every remaining row, and the reader loses the place they had
 * just found.
 */
export function sift(rows: readonly Reference[], sifting: Sifting): Reference[] {
  const terms = sifting.query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (sifting.kind !== 'all' && row.kind !== sifting.kind) return false
    /* A row whose state could not be read is not `opened`, and asking for open
       rows must not produce it. It survives `all`, where it belongs: it is a
       reference that exists, with a state nobody can see. */
    if (sifting.state !== 'all' && row.state !== sifting.state) return false
    return matches(row, terms)
  })
}
