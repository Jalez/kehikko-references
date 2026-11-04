import type { StackMember, StackPlace } from './markers.ts'

/**
 * A stack as it really is: a tree. Pure.
 *
 * A change is built on at most one other (its base branch is that change's
 * head), but several changes can be built on the same one. Then the stack
 * forks, and drawing it as one numbered line — `3 of 4` — says something
 * false: that the fourth change sits on the third. So a forked stack is drawn
 * as an indented tree with fork markers, the way `tree` and `git log --graph`
 * draw one, in text, never told by colour or indentation alone:
 *
 * ```
 * #12 base
 * ├─ #13
 * │  └─ #15
 * └─ #14
 * ```
 *
 * A stack with no fork stays a numbered line, bottom first: there the number
 * IS where a change sits.
 */

/** One line of the tree: the member, and the glyphs that go before it. */
export interface StackLine extends StackMember {
  /** `├─ `, `└─ `, and `│  ` / `   ` for each level above: empty for the bottom. */
  prefix: string
  /** No later sibling: drawn with `└─`. */
  last: boolean
}

/** Whether some change in the stack has more than one change built on it. */
export function isForked(members: readonly StackMember[]): boolean {
  const bases = new Set<string>()
  for (const m of members) {
    if (m.base === null) continue
    if (bases.has(m.base)) return true
    bases.add(m.base)
  }
  return false
}

/**
 * The members, in their order (bottom first, depth first), each with the tree
 * glyphs that go before it. Worked out from depth alone: a member is the last
 * of its siblings when no later member at its depth comes before one shallower,
 * and an ancestor's line carries on (`│`) while that ancestor has a later sibling.
 */
export function stackTree(members: readonly StackMember[]): StackLine[] {
  const laterAt = (i: number, depth: number): boolean => {
    for (let j = i + 1; j < members.length; j++) {
      const d = members[j]!.depth
      if (d < depth) return false
      if (d === depth) return true
    }
    return false
  }
  return members.map((m, i) => {
    const last = !laterAt(i, m.depth)
    if (m.depth === 0) return { ...m, prefix: '', last }
    let prefix = ''
    for (let level = 1; level < m.depth; level++) prefix += laterAt(i, level) ? '│  ' : '   '
    prefix += last ? '└─ ' : '├─ '
    return { ...m, prefix, last }
  })
}

/** The changes from the bottom of the stack up to `ref`, each once: the branch it is on. */
export function stackPath(members: readonly StackMember[], ref: string): string[] {
  const byRef = new Map(members.map((m) => [m.ref, m]))
  const path: string[] = []
  for (let at = byRef.get(ref); at && !path.includes(at.ref); at = at.base ? byRef.get(at.base) : undefined) path.unshift(at.ref)
  return path
}

/** The stack in a sentence, for a label or the row's tooltip. */
export function stackSentence(place: StackPlace, ref: string): string {
  if (!place.forked) return `stacked ${place.at} of ${place.of}: ${place.members.map((m) => m.ref).join(' → ')}`
  return `in a forked stack of ${place.of}, on the branch ${stackPath(place.members, ref).join(' → ')}`
}

/* ------------------------------------------------------------------------ *
 * The stack in a copy
 * ------------------------------------------------------------------------ */

/** The stacks the copied rows are in, each once, in the order the rows first name them. */
export function stacksOf(rows: ReadonlyArray<{ ref: string; stack?: StackPlace }>): { place: StackPlace; copied: string[] }[] {
  const out = new Map<string, { place: StackPlace; copied: string[] }>()
  for (const row of rows) {
    if (!row.stack || row.stack.members.length < 2) continue
    const key = row.stack.members[0]!.ref
    const known = out.get(key)
    if (known) known.copied.push(row.ref)
    else out.set(key, { place: row.stack, copied: [row.ref] })
  }
  return [...out.values()]
}

/** What a copied stack's block is headed with. */
export function stackHeading(place: StackPlace): string {
  return `${place.forked ? 'Forked stack' : 'Stack'}, bottom first:`
}

/** The marker on a stack member that was not among the copied rows: the only one a reader learns from. */
export const NOT_SELECTED = ' (not selected)'

/**
 * A stack as lines of references, no titles (the list above has them, once):
 * a line of changes as one line (`!21 → !22 → !23`), a forked stack as a tree.
 * A member that was not copied says so. `label` writes a ref (plain, or a link).
 */
export function stackLines(place: StackPlace, copied: readonly string[], label: (ref: string) => string = (ref) => ref): string[] {
  const one = (ref: string) => `${label(ref)}${copied.includes(ref) ? '' : NOT_SELECTED}`
  if (!place.forked) return [place.members.map((m) => one(m.ref)).join(' → ')]
  return stackTree(place.members).map((line) => `${line.prefix}${one(line.ref)}`)
}
