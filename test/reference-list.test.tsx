import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { sift, EVERYTHING } from '@/live/sift.ts'
import { ReferenceList } from '@/view/reference-list.tsx'

/**
 * The promise again, one layer up.
 *
 * `collect.test.ts` proves no reading loses a reference. This proves no reading
 * loses one on the way to the screen — which is a separate thing and the place
 * a windowing library would break it. Four hundred rows in, four hundred `<li>`
 * out, every identifier present, and the assertion is on the DOM rather than on
 * a count the component reports about itself.
 */

afterEach(cleanup)

/** A reading with `count` GitHub issues in it, as a refresh would file them. */
function reading(count: number) {
  const ghIssues: Record<string, unknown> = {}
  for (let n = 1; n <= count; n += 1) {
    ghIssues[`gh#${n}`] = {
      state: n % 3 === 0 ? 'closed' : 'opened',
      title: `something that has to be done, number ${n}`,
      at: `2026-08-${String((n % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      url: `https://github.com/example/repo/issues/${n}`,
      labels: ['area::db', 'importance::P1'],
      assignees: ['ada'],
    }
  }
  return { generated: '2026-08-27T10:00:00Z', ghIssues }
}

describe('four hundred rows', () => {
  test('four hundred of them reach the document', () => {
    const rows = collect(reading(400))
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    expect(container.querySelectorAll('li')).toHaveLength(400)
  })

  test('every identifier is findable in the text of the page', () => {
    /* The failure a windowing library introduces, stated as a test: a reference
       that is in the reading and not in the document is one the browser's own
       find cannot reach, and somebody concludes their work is not filed. */
    const rows = collect(reading(400))
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    const drawn = new Set([...container.querySelectorAll('li')].map((li) => li.getAttribute('data-ref')))
    for (const row of rows) expect(drawn.has(row.ref)).toBe(true)
  })

  test('a filtered list draws exactly what the filter kept, and nothing else', () => {
    const rows = collect(reading(400))
    const kept = sift(rows, { ...EVERYTHING, state: 'closed' })
    const { container } = render(<ReferenceList rows={kept} landedOn={null} />)
    expect(container.querySelectorAll('li')).toHaveLength(kept.length)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(400)
  })
})

describe('what a row shows when the reading is thin', () => {
  test('a row with no title says which kind of nothing it is', () => {
    const rows = collect({ issues: { '1': {}, '2': null } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    const text = container.textContent ?? ''
    expect(text).toContain('no title in the reading')
    expect(text).toContain('this reference arrived with no reading at all')
  })

  test('an unreadable state is drawn as unseen, never as open', () => {
    const rows = collect({ issues: { '1': { state: 'something-else', title: 'x' } } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    expect(container.textContent).toContain('unseen')
    expect(container.textContent).not.toContain('open')
  })

  test('a row with nobody on it says nobody rather than nothing', () => {
    const rows = collect({ issues: { '1': { state: 'opened', title: 'x' } } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    expect(container.textContent).toContain('nobody')
  })

  test('a reference with no readable link is not a link', () => {
    const rows = collect({ issues: { '1': { state: 'opened', title: 'x', url: 'javascript:alert(1)' } } })
    const { container } = render(<ReferenceList rows={rows} landedOn={null} />)
    expect(container.querySelector('a')).toBeNull()
  })
})
