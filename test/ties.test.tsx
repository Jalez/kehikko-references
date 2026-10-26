import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { EVERYTHING, facetsOfRow, offer, sift, siftingOf, IN_SCOPE, SCOPE } from '@/live/sift.ts'
import { tieSaid, withContributions } from '@/live/ties.ts'
import { ReferenceRow, overview } from '@/view/reference-row.tsx'
import { row } from './fixtures.ts'

/**
 * Work that is part of an issue (protocol 2.26.0): a merge request that says
 * "Part of #3912" is shown with #3912 under "This epic", says so on its row,
 * and never makes #3912 closed or done.
 *
 * The fixtures are the two real GitLab cases the host was misreading: `!3907`
 * delivers part of the open `#3912`, and `!3251` closes `#2638`.
 */

afterEach(cleanup)

const PART = [
  row('!3907', { state: 'merged', mergedAt: '2026-10-20T10:00:00Z', title: 'First half of the export', contributes: ['#3912'] }),
  row('#3912', { state: 'open', title: 'Export the whole thing', contributedBy: ['!3907'] }),
]
const CLOSES = [
  row('!3251', {
    state: 'merged',
    mergedAt: '2026-09-01T10:00:00Z',
    title: 'Fix the import',
    links: [{ ref: '#2638', relation: 'closes' }],
  }),
  row('#2638', {
    state: 'closed',
    closedAt: '2026-09-01T10:00:00Z',
    title: 'Import is broken',
    closedByMerge: true,
    links: [{ ref: '!3251', relation: 'closed-by' }],
  }),
]
/* Something else in the project, which no epic here names. */
const OTHER = [row('#1', { title: 'unrelated' }), row('!2', { title: 'unrelated change' })]

const byRef = (rows: ReturnType<typeof collect>) => new Map(rows.map((one) => [one.ref, one]))

describe('reading the tie', () => {
  test('a change that is part of an issue, and the issue it is part of, each carry the other end', () => {
    const rows = byRef(collect([...PART, ...CLOSES, ...OTHER]))
    expect(rows.get('!3907')?.partOf).toEqual(['#3912'])
    expect(rows.get('#3912')?.contributions).toEqual(['!3907'])
    /* Closing is not contributing. */
    expect(rows.get('!3251')?.partOf).toBeUndefined()
    expect(rows.get('#2638')?.contributions).toBeUndefined()
  })

  test('either end alone is enough: a reading where only the issue says it', () => {
    const rows = byRef(collect([row('!3907', { state: 'merged' }), row('#3912', { contributedBy: ['!3907'] })]))
    expect(rows.get('!3907')?.partOf).toEqual(['#3912'])
    expect(rows.get('#3912')?.contributions).toEqual(['!3907'])
  })

  test('a ref a change also closes is a closing, never a contribution', () => {
    const rows = byRef(
      collect([
        row('!5', { state: 'merged', contributes: ['#6'], links: [{ ref: '#6', relation: 'closes' }] }),
        row('#6', { state: 'closed', closedByMerge: true, links: [{ ref: '!5', relation: 'closed-by' }] }),
      ]),
    )
    expect(rows.get('!5')?.partOf).toBeUndefined()
    expect(rows.get('#6')?.contributions).toBeUndefined()
  })

  test('from a host older than 2.26.0, no tie and the rows are the rows they were', () => {
    const rows = collect([row('!3907', { state: 'merged' }), row('#3912')])
    for (const one of rows) {
      expect('partOf' in one).toBe(false)
      expect('contributions' in one).toBe(false)
      expect(tieSaid(one)).toBe('')
    }
    const named = ['#3912']
    expect(withContributions(named, rows)).toBe(named)
  })
})

describe('a contribution never closes its issue', () => {
  test('#3912 stays open, not closedByMerge, with !3907 merged', () => {
    const rows = byRef(collect([...PART, ...CLOSES]))
    const issue = rows.get('#3912')!
    expect(issue.state).toBe('open')
    expect(issue.closedByMerge).toBe(false)
    expect(facetsOfRow(issue, [])).toEqual(['issue:open'])
    /* The change is merged: that is its own state, not its issue's. */
    expect(facetsOfRow(rows.get('!3907')!, [])).toContain('change:merged')
    /* And the closing case still reads as it did. */
    expect(rows.get('#2638')?.closedByMerge).toBe(true)
    expect(facetsOfRow(rows.get('#2638')!, [])).toEqual(['issue:closed', 'closed:done'])
  })

  test('a closed issue whose only merged change is a contribution is not done by merge', () => {
    /* The host says nothing about closedByMerge, so this module reads the
       links — and a contribution is not one. */
    const rows = byRef(
      collect([
        row('!3907', { state: 'merged', contributes: ['#3912'] }),
        row('#3912', { state: 'closed', closedAt: '2026-10-21T10:00:00Z', contributedBy: ['!3907'] }),
      ]),
    )
    const issue = rows.get('#3912')!
    expect(issue.closedByMerge).toBe(false)
    expect(facetsOfRow(issue, [])).toEqual(['issue:closed', 'closed:unknown'])
    /* Hiding what is done does not hide it. */
    expect(sift([issue], { ...EVERYTHING, hidden: ['closed:done'] })).toHaveLength(1)
  })
})

describe('"This epic" reaches the work that is part of its issues', () => {
  const rows = collect([...PART, ...CLOSES, ...OTHER])

  test('an epic naming #3912 shows !3907 with it; one naming the change does not take in the issue', () => {
    expect(withContributions(['#3912'], rows)).toEqual(['#3912', '!3907'])
    expect(withContributions(['!3907'], rows)).toEqual(['!3907'])
    /* A closing change was never added by the scope, and still is not. */
    expect(withContributions(['#2638'], rows)).toEqual(['#2638'])
  })

  test('through the scope, the list and the count in the label', () => {
    const canvas = { epicRefs: withContributions(['#3912', '#2638'], rows) }
    const shown = sift(rows, siftingOf({ [SCOPE]: IN_SCOPE }, canvas)).map((one) => one.ref)
    expect(shown.sort()).toEqual(['!3907', '#2638', '#3912'])
    const scope = offer(rows, true, canvas)![0]!
    expect(scope.options[0]?.label).toBe('This epic 3')
  })

  test('a picked part that lists #3912 shows !3907 too', () => {
    const parts = [{ id: 'export', heading: 'Export', refs: ['#3912'], picked: true }]
    const shown = sift(rows, { ...EVERYTHING, parts }).map((one) => one.ref)
    expect(shown.sort()).toEqual(['!3907', '#3912'])
  })
})

describe('the tie on the row', () => {
  const rows = byRef(collect([...PART, ...CLOSES]))
  const draw = (ref: string) =>
    render(<ReferenceRow row={rows.get(ref)!} landed={false} selected={false} onPick={() => {}} onToggle={() => {}} />)

  test('the change says which issue it is part of, in words', () => {
    const { container } = draw('!3907')
    const tie = container.querySelector('[data-tie]')
    expect(tie?.textContent).toBe('part of #3912')
    /* Text, never a link. */
    expect(tie?.querySelector('a')).toBeNull()
    expect(overview(rows.get('!3907')!)).toContain('part of #3912')
  })

  test('the issue says which changes are part of it', () => {
    const { container } = draw('#3912')
    expect(container.querySelector('[data-tie]')?.textContent).toBe('has contributions from !3907')
    expect(overview(rows.get('#3912')!)).toContain('has contributions from !3907')
  })

  test('a row with no tie draws none', () => {
    const { container } = draw('!3251')
    expect(container.querySelector('[data-tie]')).toBeNull()
    expect(overview(rows.get('!3251')!)).not.toContain('part of')
  })

  test('a ref is drawn as text, whatever it says', () => {
    const odd = collect([row('!9', { contributes: ['<b>#1</b>'] })])[0]!
    expect(odd.partOf).toEqual(['<b>#1</b>'])
    const { container } = render(<ReferenceRow row={odd} landed={false} selected={false} onPick={() => {}} onToggle={() => {}} />)
    expect(container.querySelector('[data-tie]')?.textContent).toBe('part of <b>#1</b>')
    expect(container.querySelector('[data-tie] b')).toBeNull()
  })
})
