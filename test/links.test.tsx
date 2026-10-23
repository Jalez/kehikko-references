import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AddressOpenResult } from 'kehikot-module-protocol'

import { MANIFEST } from '../manifest.ts'
import { collect } from '@/live/collect.ts'
import { handLink, handsLink, stillFollow } from '@/live/links.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * A row's way out to the tracker, handed to the canvas (`address.open`,
 * protocol 2.16.0) when the host answers it: a Browser there opens it, or the
 * person is asked. With an older host the link opens a new tab as before.
 */

afterEach(cleanup)

describe('the manifest', () => {
  test('declares address:open', () => {
    expect(MANIFEST.declares.uses).toContain('address:open')
  })
})

describe('handsLink', () => {
  test('only with a host that answers, and only an address the protocol takes', () => {
    expect(handsLink('https://github.com/example/repo/issues/1', true)).toBe(true)
    expect(handsLink('https://github.com/example/repo/issues/1', false)).toBe(false)
    for (const url of ['javascript:alert(1)', 'http://gitlab.example.com/x', 'https://u:p@github.com/x', '', null, undefined]) {
      expect(handsLink(url, true)).toBe(false)
    }
  })
})

describe('after handing it over', () => {
  const answer = (outcome: AddressOpenResult['outcome']): AddressOpenResult => ({ outcome, why: '' })

  test('shown or offered: the canvas has it, and the page opens nothing', async () => {
    for (const outcome of ['shown', 'offered'] as const) {
      expect(stillFollow(answer(outcome))).toBe(false)
      const opened: string[] = []
      await handLink('https://example.com', () => Promise.resolve(answer(outcome)), (url) => void opened.push(url))
      expect(opened).toEqual([])
    }
  })

  test('declined, or no answer: the link is followed as it always was', async () => {
    for (const given of [answer('declined'), null]) {
      expect(stillFollow(given)).toBe(true)
      const opened: string[] = []
      await handLink('https://example.com', () => Promise.resolve(given), (url) => void opened.push(url))
      expect(opened).toEqual(['https://example.com'])
    }
  })
})

describe('the row’s link', () => {
  const rows = collect([row('gh#7')])

  test('with a host that answers, a press hands the address over and the default is prevented', () => {
    const asked: string[] = []
    const { container } = render(
      <ReferenceList
        rows={rows}
        landedOn={null}
        selection={[]}
        onPick={() => {}}
        onToggle={() => {}}
        onOpenLink={(url) => {
          asked.push(url)
          return Promise.resolve({ outcome: 'shown', why: '' })
        }}
      />,
    )
    const link = container.querySelector('a[href]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://github.com/example/repo/issues/7')
    const followed = fireEvent.click(link)
    expect(followed).toBe(false)
    expect(asked).toEqual(['https://github.com/example/repo/issues/7'])
  })

  test('without one, the link is an ordinary new-tab link', () => {
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    const link = container.querySelector('a[href]') as HTMLAnchorElement
    expect(link.getAttribute('target')).toBe('_blank')
    expect(fireEvent.click(link)).toBe(true)
  })
})
