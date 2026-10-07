import { describe, expect, test } from 'bun:test'

import { LIMITS, filterGroupSchema, filtersSchema, MESSAGE, type Disposition } from 'kehikot-module-protocol'

import type { Reference } from '@/live/reference.ts'
import {
  ALL,
  EVERYTHING,
  HIDE,
  IN_SCOPE,
  KEHIKKO,
  PICKED,
  SCOPE,
  SHOW_ALL,
  facetsOfRow,
  focusOf,
  hides,
  narrowing,
  nothingInScope,
  nothingPicked,
  offer,
  scopeOf,
  sift,
  siftingOf,
} from '@/live/sift.ts'

/**
 * The filter, which is the only thing in this app permitted to hide a row.
 *
 * So the tests are about two symmetrical failures. It must hide what was asked
 * for — a filter that quietly matches everything is a filter nobody can use —
 * and it must hide nothing else, because the reader's model of what is on this
 * journey is built from a list they believe is complete.
 */

const row = (over: Partial<Reference>): Reference => ({
  key: `k:${over.ref ?? '#1'}`,
  ref: '#1',
  kind: 'issue',
  origin: 'gitlab',
  state: 'open',
  stateReason: null,
  closedByMerge: false,
  draft: false,
  title: '',
  at: '2026-08-01T00:00:00Z',
  url: null,
  labels: [],
  people: [],
  unreadable: false,
  ...over,
})

const rows: Reference[] = [
  row({ ref: '#2274', title: 'Talon tapa näkyy pois päältä', labels: ['type::bug'], people: ['ada'] }),
  row({ ref: '!1848', kind: 'change', state: 'merged', title: 'fix(rbac): stop the role editor', people: ['grace'] }),
  row({ ref: 'gh#41', origin: 'github', state: 'closed', title: 'connected apps', labels: ['area::db'] }),
  row({ ref: 'gh#99', origin: 'github', kind: 'change', state: null, title: 'a state nobody could read' }),
]

describe('nothing is hidden until something is asked', () => {
  test('the empty filter is every row, in the order it was given', () => {
    expect(sift(rows, EVERYTHING).map((r) => r.ref)).toEqual(['#2274', '!1848', 'gh#41', 'gh#99'])
    expect(narrowing(EVERYTHING)).toBe(false)
  })

  test('whitespace is not a question', () => {
    expect(sift(rows, { ...EVERYTHING, query: '   ' })).toHaveLength(4)
    expect(narrowing({ ...EVERYTHING, query: '   ' })).toBe(false)
  })
})

describe('what the query looks at', () => {
  test('the identifier, with or without its sigil', () => {
    expect(sift(rows, { ...EVERYTHING, query: '1848' }).map((r) => r.ref)).toEqual(['!1848'])
    expect(sift(rows, { ...EVERYTHING, query: '!1848' }).map((r) => r.ref)).toEqual(['!1848'])
  })

  test('the title, a label and a person', () => {
    expect(sift(rows, { ...EVERYTHING, query: 'role editor' }).map((r) => r.ref)).toEqual(['!1848'])
    expect(sift(rows, { ...EVERYTHING, query: 'area::db' }).map((r) => r.ref)).toEqual(['gh#41'])
    expect(sift(rows, { ...EVERYTHING, query: 'ADA' }).map((r) => r.ref)).toEqual(['#2274'])
  })

  test('two words may match two different fields', () => {
    /* How somebody types when they half remember a thing: a name and a word. */
    expect(sift(rows, { ...EVERYTHING, query: 'grace rbac' }).map((r) => r.ref)).toEqual(['!1848'])
  })

  test('a word that matches nothing hides everything, and says nothing else', () => {
    expect(sift(rows, { ...EVERYTHING, query: 'grace bug' })).toHaveLength(0)
  })
})

/**
 * The `hide` group: the shared ref facets, any number of them on at once.
 *
 * What the old pair of single choices could not say is the reason the group
 * exists — "hide closed MRs/PRs, keep closed issues" — so that is held first.
 */
describe('hiding by facet', () => {
  const mark = (ref: string, value: Disposition['value']): Disposition => ({
    ref,
    value,
    target: null,
    note: '',
    by: null,
    at: null,
  })

  test('each row has the facets the protocol says it has', () => {
    expect(rows.map((r) => facetsOfRow(r, []))).toEqual([
      ['issue:open'],
      ['change:merged', 'closed:done'],
      /* Closed with no reason the tracker gave and no mark: the case a person
         is asked to settle, never counted as done. */
      ['issue:closed', 'closed:unknown'],
      /* A state nobody could read has no facets at all. */
      [],
    ])
  })

  test('closed changes and closed issues are separately hideable', () => {
    const closedIssue = row({ ref: 'gh#7', origin: 'github', state: 'closed' })
    const closedChange = row({ ref: 'gh#8', origin: 'github', kind: 'change', state: 'closed' })
    const both = [closedIssue, closedChange]
    expect(sift(both, { ...EVERYTHING, hidden: ['change:closed'] }).map((r) => r.ref)).toEqual(['gh#7'])
    expect(sift(both, { ...EVERYTHING, hidden: ['issue:closed'] }).map((r) => r.ref)).toEqual(['gh#8'])
  })

  test('a state nobody could read is never hidden, whatever is switched on', () => {
    /* The assertion the old `state` group was written for, kept in the new
       vocabulary: the app must not decide an unreadable row is open, and must
       not decide it is closed either. */
    const all = ['issue:open', 'issue:closed', 'change:open', 'change:closed', 'change:merged'] as const
    expect(sift(rows, { ...EVERYTHING, hidden: [...all] }).map((r) => r.ref)).toEqual(['gh#99'])
  })

  test('GitHub’s reason decides the closed facet', () => {
    const notPlanned = row({ ref: 'gh#5', origin: 'github', state: 'closed', stateReason: 'NOT_PLANNED' })
    const completed = row({ ref: 'gh#6', origin: 'github', state: 'closed', stateReason: 'COMPLETED' })
    expect(facetsOfRow(notPlanned, [])).toEqual(['issue:closed', 'closed:wont-do'])
    expect(sift([notPlanned, completed], { ...EVERYTHING, hidden: ['closed:wont-do'] }).map((r) => r.ref)).toEqual([
      'gh#6',
    ])
  })

  test('a GitLab issue closed by a merged change is done', () => {
    const closed = row({ ref: '#12', state: 'closed', closedByMerge: true })
    expect(facetsOfRow(closed, [])).toEqual(['issue:closed', 'closed:done'])
  })

  test('a person’s mark wins over the tracker’s reason', () => {
    const completed = row({ ref: 'gh#6', origin: 'github', state: 'closed', stateReason: 'COMPLETED' })
    const marks = [mark('gh#6', 'duplicate')]
    expect(facetsOfRow(completed, marks)).toEqual(['issue:closed', 'closed:duplicate'])
    expect(sift([completed], { ...EVERYTHING, hidden: ['closed:duplicate'], marks })).toHaveLength(0)
    expect(sift([completed], { ...EVERYTHING, hidden: ['closed:done'], marks })).toHaveLength(1)
  })

  test('the toggles compose with the query', () => {
    expect(sift(rows, { ...EVERYTHING, query: 'a', hidden: ['issue:open', 'issue:closed'] }).map((r) => r.ref)).toEqual([
      '!1848',
      'gh#99',
    ])
  })
})

describe('what is offered to the host, which is all of the narrowing now', () => {
  test('nothing at all until a reading has arrived, which is not the same as nothing to offer', () => {
    /* The distinction the whole feature turns on. An empty offer is a CLAIM the
       host acts on by pruning this container's stored choice; `null` is "I have
       nothing to say yet" and is not sent. Making the claim on mount, before a
       reading, erased the remembered filter on every load in the module this was
       found in. */
    expect(offer(rows, false)).toBeNull()
    expect(offer([], false)).toBeNull()
    /* And a project whose tracker genuinely holds nothing HAS nothing to be
       narrowed by, so the control goes away rather than offering `Issues 0`. */
    expect(offer([], true)).toEqual([])
  })

  test('the counts are in the labels, because the protocol has no count field', () => {
    const groups = offer(rows, true)!
    expect(groups.map((group) => group.id)).toEqual([SCOPE, KEHIKKO, HIDE, 'search'])
    /* One toggles group, from the shared vocabulary, counted over the whole
       reading. The unreadable row is counted under nothing. */
    expect(groups[2]?.kind).toBe('toggles')
    expect(groups[2]?.options).toEqual([
      { id: 'issue:open', label: 'open issues (1)' },
      { id: 'issue:closed', label: 'closed issues (1)' },
      { id: 'change:merged', label: 'merged MRs/PRs (1)' },
      { id: 'closed:done', label: 'done (1)' },
      { id: 'closed:unknown', label: 'closed, reason unknown (1)' },
    ])
  })

  test('a facet nothing has is not offered, unless it is switched on', () => {
    const only = [rows[0]!]
    expect(offer(only, true)![2]?.options.map((option) => option.id)).toEqual(['issue:open'])
    /* On, it stays, so a person can switch off what they switched on. */
    expect(offer(only, true, {}, ['change:closed'])![2]?.options.map((option) => option.id)).toEqual([
      'issue:open',
      'change:closed',
    ])
  })

  test('the facet counts follow the marks', () => {
    const marks: Disposition[] = [{ ref: 'gh#41', value: 'wont-do', target: null, note: '', by: null, at: null }]
    const labels = offer(rows, true, { marks })![2]?.options.map((option) => option.label)
    expect(labels).toContain('won’t do (1)')
    expect(labels).not.toContain('closed, reason unknown (1)')
  })

  test('the fallbacks never go', () => {
    const groups = offer([rows[0]!], true)!
    /* The typed group and the toggles are exempt, and the protocol is the
       reason: neither has a fallback to fall to. */
    for (const group of groups.filter((one) => one.kind !== 'text' && one.kind !== 'toggles')) {
      expect(group.options.some((option) => option.id === group.fallback)).toBe(true)
    }
  })

  test('the third group is the query, and it says what this search looks at', () => {
    /* The label is the input's placeholder AND its accessible name, so it has
       to name the fields — which is the one thing no host could have written.
       And it carries no count: the number a reader wants about a query changes
       on every keystroke, and the count is drawn in the page instead. */
    const search = offer(rows, true)!.find((group) => group.id === 'search')!
    expect(search.kind).toBe('text')
    expect(search.options).toEqual([])
    expect(search.fallback).toBeUndefined()
    expect(search.label).toContain('number')
    expect(search.label).toContain('person')
    expect(search.label.length).toBeLessThanOrEqual(LIMITS.FILTER_LABEL)
  })

  test('every group is one the protocol would accept, checked against its own schema', () => {
    /* The cheapest possible way to find out that this module has written an
       offer no host will take — a label over the bound, a fallback naming an
       option that was dropped — and to find it here rather than in somebody
       else's log. */
    for (const group of offer(rows, true)!) {
      expect(filterGroupSchema.safeParse(group).success).toBe(true)
    }
    /* And the whole offer, under the four-group cap the scope had to fit in. */
    const message = { type: MESSAGE.FILTERS, groups: offer(rows, true, { epicRefs: ['gh#41'], selection: ['#2274'] }) }
    expect(filtersSchema.safeParse(message).success).toBe(true)
  })
})

describe('reading back what the host chose', () => {
  test('all four groups are read out of one record', () => {
    expect(
      siftingOf(
        { [SCOPE]: IN_SCOPE, [HIDE]: ['change:closed', 'closed:wont-do'], search: 'rbac jaakko', [KEHIKKO]: PICKED },
        { selection: ['gh#41'], epicRefs: ['#2274'] },
      ),
    ).toEqual({
      query: 'rbac jaakko',
      hidden: ['change:closed', 'closed:wont-do'],
      scope: { from: 'epic', refs: ['#2274'] },
      picked: ['gh#41'],
      marks: [],
      parts: [],
    })
  })

  test('a choice stored by the version with kind and state groups narrows nothing', () => {
    /* The host reconciles a stored choice against what a module offers, and it
       cannot do that before the module has offered anything — the greeting goes
       first. So a container saved under 2.2.0 arrives with `kind` and `state`
       in it, and neither is a group this version reads. */
    expect(siftingOf({ kind: 'change', state: 'merged' })).toEqual(EVERYTHING)
    expect(siftingOf({ kind: 'epics', state: 'abandoned' })).toEqual(EVERYTHING)
    expect(siftingOf({})).toEqual(EVERYTHING)
  })

  test('a hide that is not a list, or names facets nobody knows, hides nothing it does not understand', () => {
    expect(siftingOf({ [HIDE]: 'issue:open' }).hidden).toEqual([])
    expect(siftingOf({ [HIDE]: ['opened', 'issue:closed', 'not-a-facet'] }).hidden).toEqual(['issue:closed'])
  })

  test('a query longer than the protocol allows is clipped rather than dropped', () => {
    const long = 'x'.repeat(LIMITS.FILTER_TEXT + 100)
    expect(siftingOf({ search: long }).query).toHaveLength(LIMITS.FILTER_TEXT)
  })

  test('anything narrowed at all is narrowed, whichever group did it', () => {
    expect(narrowing({ ...EVERYTHING, query: 'rbac' })).toBe(true)
    expect(narrowing({ ...EVERYTHING, hidden: ['issue:closed'] })).toBe(true)
    expect(narrowing({ ...EVERYTHING, scope: { from: 'epic', refs: [] } })).toBe(true)
    expect(narrowing(EVERYTHING)).toBe(false)
  })

  test('one row is asked about with the same function the list is', () => {
    const closed = rows.find((row) => row.state === 'closed')!
    expect(hides({ ...EVERYTHING, hidden: ['issue:closed'] }, closed)).toBe(true)
    expect(hides(EVERYTHING, closed)).toBe(false)
  })

  test('show-all is not the empty choice, because the scope rests on the epic', () => {
    expect(SHOW_ALL).toEqual({ [SCOPE]: ALL })
    expect(siftingOf(SHOW_ALL, { epicRefs: ['#2274'] }).scope).toBeNull()
    expect(siftingOf({}, { epicRefs: ['#2274'] }).scope).not.toBeNull()
  })
})

/**
 * The scope: on by default, narrowed to what the open epic names, or to what
 * the picked-out containers show while any are.
 */
describe('the scope', () => {
  test('at rest it narrows to the epic’s refs, in the list’s own order', () => {
    const scoped = siftingOf({}, { epicRefs: ['gh#41', '#2274', '#9999'] })
    expect(sift(rows, scoped).map((r) => r.ref)).toEqual(['#2274', 'gh#41'])
  })

  test('Everything is one choice away, and narrows nothing', () => {
    expect(sift(rows, siftingOf({ [SCOPE]: ALL }, { epicRefs: ['gh#41'] }))).toHaveLength(4)
  })

  test('with nothing read about the epic, it narrows nothing rather than everything', () => {
    /* No epic open, or the host refused both questions: the scope has nothing
       to narrow to, and an empty list for that would be a lie about the work. */
    const unread = siftingOf({})
    expect(unread.scope).toBeNull()
    expect(sift(rows, unread)).toHaveLength(4)
  })

  test('picked-out containers win over the epic', () => {
    expect(scopeOf(['gh#41'], ['!1848'])).toEqual({ from: 'containers', refs: ['!1848'] })
    expect(scopeOf(['gh#41'], null)).toEqual({ from: 'epic', refs: ['gh#41'] })
    expect(scopeOf(null, null)).toBeNull()
    const aimed = siftingOf({}, { epicRefs: ['gh#41'], aimed: ['!1848'] })
    expect(sift(rows, aimed).map((r) => r.ref)).toEqual(['!1848'])
  })

  test('an epic that names nothing here is its own state, not "nothing matches"', () => {
    const elsewhere = siftingOf({}, { epicRefs: ['#31337'] })
    expect(sift(rows, elsewhere)).toHaveLength(0)
    expect(nothingInScope(rows, elsewhere)).toBe(true)
    expect(nothingInScope(rows, siftingOf({}, { epicRefs: [] }))).toBe(true)
    /* A toggle that hides what the scope kept is the menus, not the scope. */
    expect(nothingInScope(rows, { ...siftingOf({}, { epicRefs: ['gh#41'] }), hidden: ['issue:closed'] })).toBe(false)
  })

  test('is offered first, with the epic as its fallback and both options whatever the counts', () => {
    const scope = offer(rows, true, { epicRefs: ['gh#41', '#31337'] })![0]!
    expect(scope).toMatchObject({ id: SCOPE, label: 'Scope', fallback: IN_SCOPE })
    expect(scope.options).toEqual([
      { id: IN_SCOPE, label: 'This epic 1' },
      { id: ALL, label: 'Everything 4' },
    ])
    expect(offer(rows, true, { epicRefs: [] })![0]!.options[0]?.label).toBe('This epic 0')
    expect(offer(rows, true)![0]!.options[0]?.label).toBe('This epic (not read)')
    expect(offer(rows, true, { epicRefs: ['gh#41'], aimed: ['!1848', '#2274'] })![0]!.options[0]?.label).toBe(
      'Picked containers 2',
    )
  })
})

/**
 * The kehikko group: narrowed to what the kehikko has picked out.
 *
 * Two symmetrical failures again, and a third particular to this group. It
 * must narrow to the pick when it is on; it must not narrow when it is off,
 * whatever the canvas has picked — a list that followed the selection with the
 * group at rest would be a module hiding rows because another module said
 * something, with nothing in the header saying so; and it must never switch
 * itself off, which is what dropping its option at a zero count would do.
 */
describe('narrowed to what the kehikko has picked', () => {
  test('on, the list is what the canvas picked and nothing else', () => {
    const picked = siftingOf({ [KEHIKKO]: PICKED }, { selection: ['gh#41', '!1848'] })
    expect(picked.picked).toEqual(['gh#41', '!1848'])
    expect(sift(rows, picked).map((r) => r.ref)).toEqual(['!1848', 'gh#41'])
    expect(narrowing(picked)).toBe(true)
  })

  test('off, the canvas may pick what it likes and every row stays', () => {
    const rest = siftingOf({}, { selection: ['gh#41'] })
    expect(rest.picked).toBeNull()
    expect(sift(rows, rest)).toHaveLength(4)
    expect(narrowing(rest)).toBe(false)
  })

  test('on with nothing picked hides everything, and says so as its own state rather than as "no match"', () => {
    const empty = siftingOf({ [KEHIKKO]: PICKED }, { selection: [] })
    expect(empty.picked).toEqual([])
    expect(sift(rows, empty)).toHaveLength(0)
    expect(nothingPicked(rows, empty)).toBe(true)
    /* A kind that hides everything is "nothing matches", not "nothing picked":
       the pick reaches a row, and the menus are what to change. */
    expect(nothingPicked(rows, { ...EVERYTHING, picked: ['gh#41'], hidden: ['issue:closed'] })).toBe(false)
    expect(nothingPicked(rows, { ...EVERYTHING, hidden: ['issue:closed'] })).toBe(false)
  })

  test('a pick about references this project does not hold is "nothing picked" too', () => {
    expect(nothingPicked(rows, { ...EVERYTHING, picked: ['gh#31337'] })).toBe(true)
  })

  test('composes with the other three', () => {
    const both = siftingOf({ [KEHIKKO]: PICKED, [HIDE]: ['change:merged'] }, { selection: ['gh#41', '!1848'] })
    expect(sift(rows, both).map((r) => r.ref)).toEqual(['gh#41'])
  })

  test('exact strings: gh#41 is not #41', () => {
    expect(sift(rows, { ...EVERYTHING, picked: ['#41'] })).toHaveLength(0)
  })

  test('is offered second, with the count of rows the pick reaches, and both options whatever the count', () => {
    const none = offer(rows, true, { selection: [] })!.find((group) => group.id === KEHIKKO)!
    expect(none.label).toBe('Kehikko')
    expect(none.fallback).toBe('all')
    /* `Picked here 0` is offered on purpose. Dropping it would make the host
       fall the stored choice back to `Everything` the moment the selection
       emptied — a filter that switches itself off, and stays off. */
    expect(none.options).toEqual([
      { id: 'all', label: 'Everything 4' },
      { id: PICKED, label: 'Picked here 0' },
    ])
    const some = offer(rows, true, { selection: ['gh#41', 'gh#31337'] })!.find((group) => group.id === KEHIKKO)!
    expect(some.options[1]?.label).toBe('Picked here 1')
    expect(filterGroupSchema.safeParse(some).success).toBe(true)
  })

  test('the sifting holds a copy, so a later context cannot change a reading already taken', () => {
    const selection = ['gh#41']
    const taken = siftingOf({ [KEHIKKO]: PICKED }, { selection })
    selection.push('!1848')
    expect(taken.picked).toEqual(['gh#41'])
  })
})

/**
 * The parts focus: parts of the epic picked out in the host's bar.
 *
 * Two failures again, and the second is the one this field was designed
 * against. It must narrow to the refs the picked parts list — and it must
 * never do so without the number of rows it hid being countable, because
 * nobody set this narrowing in this container and nothing here can undo it.
 * With nothing picked, every answer has to be the one it was before the field
 * existed.
 */
describe('the parts of the epic picked out in the host’s bar', () => {
  const part = (id: string, refs: string[], picked = false, heading = `The ${id}`) => ({ id, heading, refs, picked })
  const seam = (picked: boolean) => part('seam', ['#2274', 'gh#41'], picked)
  const tests = (picked: boolean) => part('tests', ['!1848', 'gl#404'], picked)

  test('parts that are listed and not picked narrow nothing and say nothing', () => {
    const sifting = { ...EVERYTHING, parts: [seam(false), tests(false)] }
    expect(sift(rows, sifting)).toHaveLength(4)
    expect(focusOf(rows, sifting)).toBeNull()
    expect(focusOf(rows, EVERYTHING)).toBeNull()
    expect(narrowing(sifting)).toBe(false)
  })

  test('a picked part narrows to the refs it lists, and the rest are counted', () => {
    const sifting = { ...EVERYTHING, parts: [seam(true), tests(false)] }
    expect(sift(rows, sifting).map((r) => r.ref)).toEqual(['#2274', 'gh#41'])
    expect(focusOf(rows, sifting)).toEqual({ picked: ['The seam'], of: 2, shown: 2, outside: 2 })
  })

  test('several picked parts are a union, and a ref in no part is outside every focus', () => {
    const sifting = { ...EVERYTHING, parts: [seam(true), tests(true)] }
    /* `gh#99` is in neither part: it is outside, counted, and not drawn. */
    expect(sift(rows, sifting).map((r) => r.ref)).toEqual(['#2274', '!1848', 'gh#41'])
    expect(focusOf(rows, sifting)).toEqual({ picked: ['The seam', 'The tests'], of: 2, shown: 3, outside: 1 })
  })

  test('the count is of what the rest of the narrowing would draw, not of the whole reading', () => {
    /* The toggles hide `gh#41` whether or not a part is picked, so it is not
       one of the rows the FOCUS is hiding. shown + outside is the list as it
       was before the focus. */
    const sifting = { ...EVERYTHING, hidden: ['issue:closed' as const], parts: [seam(true), tests(false)] }
    const before = sift(rows, { ...sifting, parts: [] })
    const focus = focusOf(rows, sifting)!
    expect(sift(rows, sifting).map((r) => r.ref)).toEqual(['#2274'])
    expect(focus).toMatchObject({ shown: 1, outside: 2 })
    expect(focus.shown + focus.outside).toBe(before.length)
  })

  test('a part with no heading is named by its id, and a focus that hides nothing is still a focus', () => {
    const all = part('all', ['#2274', '!1848', 'gh#41', 'gh#99'], true, '')
    expect(focusOf(rows, { ...EVERYTHING, parts: [all] })).toEqual({ picked: ['all'], of: 1, shown: 4, outside: 0 })
  })

  test('it is not something one press here can put back, and `hides` still sees it', () => {
    const sifting = { ...EVERYTHING, parts: [seam(true)] }
    expect(narrowing(sifting)).toBe(false)
    expect(hides(sifting, rows[1]!)).toBe(true)
    expect(hides(sifting, rows[0]!)).toBe(false)
  })

  test('read out of the canvas as a copy, like every other fact', () => {
    const parts = [seam(true)]
    const taken = siftingOf({}, { parts })
    parts.push(tests(true))
    expect(taken.parts).toEqual([seam(true)])
    expect(siftingOf({}).parts).toEqual([])
  })
})

describe('order survives', () => {
  test('narrowing never reorders what is left', () => {
    const many = [...rows].reverse()
    expect(sift(many, { ...EVERYTHING, query: 'a' }).map((r) => r.ref)).toEqual(
      many.filter((r) => sift([r], { ...EVERYTHING, query: 'a' }).length === 1).map((r) => r.ref),
    )
  })
})
