import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AddressOpenResult } from 'kehikot-module-protocol'

import { MANIFEST } from '../manifest.ts'
import { collect } from '@/live/collect.ts'
import { handLink, handsLink, openOutside, stillFollow } from '@/live/links.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * Links handed to the canvas (`address.open`, protocol 2.16.0) — a pipeline's
 * link still is — and the row's own way out, which never is: it opens the
 * person's own browser.
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

describe('openOutside', () => {
  test('opens a web address and nothing else', () => {
    const opened: string[] = []
    expect(openOutside('https://github.com/example/repo/issues/7', (url) => opened.push(url))).toBe(true)
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@github.com/x', '', null, undefined]) {
      expect(openOutside(url, (to) => opened.push(to))).toBe(false)
    }
    expect(opened).toEqual(['https://github.com/example/repo/issues/7'])
  })
})

describe('the row’s link opens the person’s own browser', () => {
  const rows = collect([row('gh#7')])
  const g = globalThis as unknown as { window: { open: unknown } }
  let had: unknown
  let opened: unknown[][]
  beforeEach(() => {
    had = g.window.open
    opened = []
    g.window.open = (...args: unknown[]) => void opened.push(args)
  })
  afterEach(() => {
    g.window.open = had
  })

  test('a press opens a new window at the address, and never hands it to the canvas', () => {
    const asked: string[] = []
    const picked: string[] = []
    const { container } = render(
      <ReferenceList
        rows={rows}
        landedOn={null}
        selection={[]}
        onPick={(ref) => picked.push(ref)}
        onToggle={() => {}}
        onOpenLink={(url) => {
          asked.push(url)
          return Promise.resolve({ outcome: 'shown', why: '' })
        }}
      />,
    )
    const link = container.querySelector('a[data-open-outside]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://github.com/example/repo/issues/7')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('aria-label')).toBe('Open gh#7 in your browser')
    expect(fireEvent.click(link)).toBe(false)
    expect(opened).toEqual([['https://github.com/example/repo/issues/7', '_blank', 'noopener,noreferrer']])
    expect(asked).toEqual([])
    expect(picked).toEqual([])
  })

  test('the same without a host that answers address.open', () => {
    const { container } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    fireEvent.click(container.querySelector('a[data-open-outside]') as HTMLAnchorElement)
    expect(opened).toHaveLength(1)
  })

  test('says "Open in your browser" on hover', async () => {
    const { container, findAllByText } = render(<ReferenceList rows={rows} landedOn={null} selection={[]} onPick={() => {}} onToggle={() => {}} />)
    fireEvent.focus(container.querySelector('a[data-open-outside]') as HTMLAnchorElement)
    expect((await findAllByText('Open in your browser')).length).toBeGreaterThan(0)
  })
})
