import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

/**
 * The row's "⋯" menu: open in the person's own browser (never handed to the
 * canvas), copy the reference, and the last activity when it was somebody
 * else's. Keyboard first: Radix's menu, opened from the trigger.
 */

afterEach(cleanup)

const at = '2026-10-21T09:00:00Z'
const g = globalThis as unknown as { window: { open: unknown } }
let had: unknown
let opened: unknown[][]
let texts: string[]
beforeEach(() => {
  had = g.window.open
  opened = []
  g.window.open = (...args: unknown[]) => void opened.push(args)
  texts = []
  ;(globalThis as Record<string, unknown>).ClipboardItem = undefined
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => void texts.push(t) },
  })
})
afterEach(() => {
  g.window.open = had
})

function draw(rows: Record<string, unknown>[], onOpenLink?: (url: string) => Promise<never>) {
  const asked: string[] = []
  const picked: string[] = []
  const view = render(
    <ReferenceList
      rows={collect(rows)}
      landedOn={null}
      selection={[]}
      onPick={(ref) => picked.push(ref)}
      onToggle={() => {}}
      onOpenLink={
        onOpenLink ??
        ((url) => {
          asked.push(url)
          return Promise.resolve({ outcome: 'shown', why: '' })
        })
      }
    />,
  )
  return { ...view, asked, picked }
}

/** Open the menu as a keyboard does, and hand back its items. */
async function openMenu(ref: string) {
  const trigger = document.querySelector(`li[data-ref="${ref}"] [data-row-menu]`) as HTMLElement
  trigger.focus()
  act(() => {
    fireEvent.keyDown(trigger, { key: 'Enter' })
  })
  await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
  return { trigger, items: [...document.querySelectorAll('[role="menuitem"]')] as HTMLElement[] }
}

describe('the row’s "⋯"', () => {
  test('is a button named for the row, that opens a menu', async () => {
    draw([row('gh#7')])
    const { trigger, items } = await openMenu('gh#7')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-label')).toBe('More for gh#7')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(items.map((item) => item.textContent)).toEqual(['Open in your browser', 'Copy reference'])
    /* Each item has an icon and its words. */
    for (const item of items) expect(item.querySelector('svg')).not.toBeNull()
  })

  test('"Open in your browser" opens a new window at the address, and never hands it to the canvas', async () => {
    const { asked, picked } = draw([row('gh#7')])
    const { items } = await openMenu('gh#7')
    act(() => items[0]!.click())
    expect(opened).toEqual([['https://github.com/example/repo/issues/7', '_blank', 'noopener,noreferrer']])
    expect(asked).toEqual([])
    expect(picked).toEqual([])
  })

  test('with no link in the reading, "Open in your browser" is there and cannot be chosen', async () => {
    draw([row('gh#7', { url: 'javascript:alert(1)' })])
    const { items } = await openMenu('gh#7')
    expect(items[0]!.hasAttribute('data-disabled')).toBe(true)
    act(() => items[0]!.click())
    expect(opened).toEqual([])
  })

  test('"Copy reference" copies the row as its copy button does', async () => {
    draw([row('gh#7', { title: 'Fix it' })])
    const { items } = await openMenu('gh#7')
    act(() => items[1]!.click())
    await waitFor(() => expect(texts).toEqual(['[gh#7](https://github.com/example/repo/issues/7) Fix it']))
  })

  test('somebody else’s last activity is an item with the bell and its sentence, that opens the page in the browser', async () => {
    draw([row('gh#7', { lastActivity: { login: 'mona', at, kind: 'review', mine: false } })])
    const { items } = await openMenu('gh#7')
    expect(items).toHaveLength(3)
    const activity = items[2]!
    expect(activity.textContent).toStartWith('Last activity: mona, a review, ')
    expect(activity.textContent).toContain('See it in your browser')
    expect(activity.querySelector('svg.lucide-bell-dot')).not.toBeNull()
    act(() => activity.click())
    expect(opened.map((args) => args[0])).toEqual(['https://github.com/example/repo/issues/7'])
  })

  test('Escape closes it and puts focus back on "⋯"', async () => {
    draw([row('gh#7')])
    const { trigger } = await openMenu('gh#7')
    const menu = document.querySelector('[role="menu"]') as HTMLElement
    act(() => {
      fireEvent.keyDown(menu, { key: 'Escape' })
    })
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
})
