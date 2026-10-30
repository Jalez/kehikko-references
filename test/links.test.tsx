import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup } from '@testing-library/react'
import type { AddressOpenResult } from 'kehikot-module-protocol'

import { MANIFEST } from '../manifest.ts'
import { handLink, handsLink, openOutside, stillFollow } from '@/live/links.ts'

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
