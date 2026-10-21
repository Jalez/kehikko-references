import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { filterGroupSchema, type MyRole } from 'kehikot-module-protocol'

import { collect } from '@/live/collect.ts'
import type { Reference } from '@/live/reference.ts'
import { roleRefs, roleSaid } from '@/live/roles.ts'
import { ALL, IN_SCOPE, MINE, REVIEW, SCOPE, nothingInScope, offer, sift, siftingOf } from '@/live/sift.ts'
import { NothingInScope } from '@/view/absence.tsx'
import { Heading } from '@/view/heading.tsx'
import { ReferenceRow } from '@/view/reference-row.tsx'
import { row } from './fixtures.ts'

/**
 * My role (review orchestration, C6): the person's roles on each reference, as
 * the host worked them out (protocol 2.7.0 `myRoles`), drawn as a column and
 * narrowed to from the Scope group — so the changes asking them for a review
 * are one press away.
 */

afterEach(cleanup)

const roled = (ref: string, myRoles: MyRole[] | undefined, more: Record<string, unknown> = {}) =>
  row(ref, { ...(myRoles ? { myRoles } : {}), ...more })

const reading = () =>
  collect([
    roled('gh#1', ['reviewer-asked'], { kind: 'change', updatedAt: '2026-08-05T00:00:00Z' }),
    roled('gh#2', ['reviewer-done', 'author'], { kind: 'change', updatedAt: '2026-08-04T00:00:00Z' }),
    roled('gh#3', ['assignee'], { updatedAt: '2026-08-03T00:00:00Z' }),
    roled('gh#4', [], { updatedAt: '2026-08-02T00:00:00Z' }),
  ])

describe('the words', () => {
  test('reviewer first, then author, then assignee, joined by a dot', () => {
    expect(roleSaid(['author', 'reviewer-asked'])).toBe('Reviewer (asked) · Author')
    expect(roleSaid(['assignee', 'reviewer-done'])).toBe('Reviewer (done) · Assignee')
    expect(roleSaid([])).toBe('')
    expect(roleSaid(undefined)).toBe('')
  })
})

describe('collect carries the roles', () => {
  test('as the host said them; absent is not known, never []', () => {
    const rows = collect([roled('gh#1', ['author']), roled('gh#2', []), roled('gh#3', undefined)])
    const by = new Map(rows.map((r) => [r.ref, r]))
    expect(by.get('gh#1')!.myRoles).toEqual(['author'])
    expect(by.get('gh#2')!.myRoles).toEqual([])
    expect(by.get('gh#3')!.myRoles).toBeUndefined()
  })
})

describe('roleRefs', () => {
  test('null when no row says who I am', () => {
    expect(roleRefs(collect([roled('gh#1', undefined)]))).toBeNull()
  })
  test('the asked rows and every row I have a role on', () => {
    expect(roleRefs(reading())).toEqual({ review: ['gh#1'], mine: ['gh#1', 'gh#2', 'gh#3'] })
  })
})

describe('the Scope group', () => {
  test('without roles: as before, two options', () => {
    const rows = collect([roled('gh#1', undefined)])
    const scope = offer(rows, true, { epicRefs: ['gh#1'], roles: roleRefs(rows) })![0]!
    expect(scope.options.map((o) => o.id)).toEqual([IN_SCOPE, ALL])
  })

  test('with roles: Asked to review and Mine after Everything, counted, the epic still the fallback', () => {
    const rows = reading()
    const groups = offer(rows, true, { epicRefs: ['gh#3'], roles: roleRefs(rows) })!
    expect(groups).toHaveLength(4)
    const scope = groups[0]!
    expect(scope).toMatchObject({ id: SCOPE, fallback: IN_SCOPE })
    expect(scope.options).toEqual([
      { id: IN_SCOPE, label: 'This epic 1' },
      { id: ALL, label: 'Everything 4' },
      { id: REVIEW, label: 'Asked to review 1' },
      { id: MINE, label: 'Mine, any role 3' },
    ])
    expect(filterGroupSchema.safeParse(scope).success).toBe(true)
  })

  test('nobody asking is still offered, as 0: it is the answer to the question', () => {
    const rows = collect([roled('gh#4', [])])
    const scope = offer(rows, true, { roles: roleRefs(rows) })![0]!
    expect(scope.options.find((o) => o.id === REVIEW)?.label).toBe('Asked to review 0')
  })
})

describe('narrowing to my role', () => {
  test('Asked to review is across the project, not only the epic', () => {
    const rows = reading()
    const sifting = siftingOf({ [SCOPE]: REVIEW }, { epicRefs: ['gh#3'], roles: roleRefs(rows) })
    expect(sifting.scope).toEqual({ from: 'review', refs: ['gh#1'] })
    expect(sift(rows, sifting).map((r) => r.ref)).toEqual(['gh#1'])
  })

  test('Mine is every role', () => {
    const rows = reading()
    const sifting = siftingOf({ [SCOPE]: MINE }, { roles: roleRefs(rows) })
    expect(sift(rows, sifting).map((r) => r.ref)).toEqual(['gh#1', 'gh#2', 'gh#3'])
  })

  test('a host that does not say who I am: the choice narrows nothing', () => {
    const rows = collect([roled('gh#1', undefined), roled('gh#2', undefined)])
    const sifting = siftingOf({ [SCOPE]: REVIEW }, { roles: roleRefs(rows) })
    expect(sifting.scope).toBeNull()
    expect(sift(rows, sifting)).toHaveLength(2)
  })

  test('nobody asking is its own state, with its own sentence', () => {
    const rows = collect([roled('gh#4', []), roled('gh#5', ['author'])])
    const sifting = siftingOf({ [SCOPE]: REVIEW }, { roles: roleRefs(rows) })
    expect(nothingInScope(rows, sifting)).toBe(true)
    render(<NothingInScope scope={sifting.scope!} total={2} everything={() => {}} />)
    expect(screen.getByText('Nobody is asking you to review anything here.')).toBeTruthy()
  })

  test('no role anywhere says so in other words', () => {
    const rows = collect([roled('gh#4', [])])
    const sifting = siftingOf({ [SCOPE]: MINE }, { roles: roleRefs(rows) })
    render(<NothingInScope scope={sifting.scope!} total={1} everything={() => {}} />)
    expect(screen.getByText('You have no role on anything here.')).toBeTruthy()
  })

  test('the heading names the role scope', () => {
    const { container } = render(<Heading project="/work/p" showing={1} total={4} scope="review" />)
    expect(container.textContent).toContain('asked to review')
  })
})

describe('the My role column', () => {
  const draw = (one: Reference) =>
    render(
      <ul>
        <ReferenceRow row={one} landed={false} selected={false} onPick={() => {}} onToggle={() => {}} />
      </ul>,
    )

  test('says my roles in words, and the row’s tooltip says them too', () => {
    const one = reading().find((r) => r.ref === 'gh#2')!
    const { container } = draw(one)
    const cell = container.querySelector('[data-role]')!
    expect(cell.textContent).toBe('Reviewer (done) · Author')
    expect(container.querySelector('li')!.getAttribute('title')).toContain('my role: Reviewer (done) · Author')
  })

  test('a row I have no role on, or whose roles are not known, has an empty cell and nothing in the tooltip', () => {
    for (const one of collect([roled('gh#4', []), roled('gh#5', undefined)])) {
      cleanup()
      const { container } = draw(one)
      expect(container.querySelector('[data-role]')!.textContent).toBe('')
      expect(container.querySelector('li')!.getAttribute('title')).not.toContain('my role')
    }
  })
})
