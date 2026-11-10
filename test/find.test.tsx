import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { FIND_MARK_ATTRIBUTE, pageFind } from 'kehikot-module-protocol/client'

import { collect } from '@/live/collect.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * Find (protocol 2.69.0). Every reference is in the document (`reference-list.test.tsx`), so the
 * host's find bar is answered by the protocol client's own search of the page with no code here.
 * This holds that the search marks, counts, moves and clears on the list this page renders. Marked
 * with `<mark>` here (the test document has no `CSS.highlights`), which also proves the marks come
 * back out of React's DOM without a trace.
 */

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function list() {
  const rows = collect(
    Array.from({ length: 12 }, (_, at) =>
      row(`gh#${at + 1}`, { state: 'open', title: at % 4 === 0 ? `Migrate the store, part ${at + 1}` : `Something else ${at + 1}` }),
    ),
  )
  return render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />).container
}

const options = { caseSensitive: false, wholeWord: true }
const marks = (root: Element) => [...root.querySelectorAll(`mark[${FIND_MARK_ATTRIBUTE}]`)]

describe('find in the references', () => {
  test('marks and counts the matches, and moves between them', () => {
    const root = list()
    const search = pageFind(() => {}, { root, visible: () => true, highlights: false })
    expect(search.run('migrate', options, 'first')).toEqual({ total: 3, current: 1 })
    expect(marks(root).map((mark) => mark.textContent)).toEqual(['Migrate', 'Migrate', 'Migrate'])
    expect(search.run('migrate', options, 'next')).toEqual({ total: 3, current: 2 })
    expect(search.run('migrate', options, 'prev')).toEqual({ total: 3, current: 1 })
    expect(search.run('migrate', options, 'prev')).toEqual({ total: 3, current: 3 })
    expect(root.querySelectorAll('[data-current]')).toHaveLength(1)
    search.close()
  })

  test('close clears every mark and leaves the list as React drew it', () => {
    const root = list()
    const before = root.innerHTML
    const search = pageFind(() => {}, { root, visible: () => true, highlights: false })
    search.run('migrate', options, 'first')
    search.close()
    expect(marks(root)).toHaveLength(0)
    expect(root.innerHTML).toBe(before)
  })
})
