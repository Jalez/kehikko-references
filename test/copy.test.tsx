import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { copyPayload, idsOfAll, payloadOf, payloadOfAll, selectedInOrder } from '@/live/copy.ts'
import { payloadFor, takesCopyKey, type CopyKey } from '@/view/copy-many.tsx'
import { ReferenceList } from '@/view/reference-list.tsx'
import { row } from './fixtures.ts'

afterEach(cleanup)

const mr = { ref: '!4013', title: 'feat(triage): tell the centre and the requester when a requested tool reaches the marketplace', url: 'https://gitlab.com/group/project/-/merge_requests/4013' }
const issue = { ref: '#187', title: 'Crash on start', url: 'https://github.com/example/repo/issues/187' }

describe('payloads', () => {
  test('a GitLab MR', () => {
    expect(payloadOf(mr)).toEqual({
      html: `<a href="${mr.url}">!4013</a> ${mr.title}`,
      plain: `[!4013](${mr.url}) ${mr.title}`,
    })
  })
  test('a GitHub issue', () => {
    expect(payloadOf(issue)).toEqual({
      html: `<a href="${issue.url}">#187</a> Crash on start`,
      plain: `[#187](${issue.url}) Crash on start`,
    })
  })
  test('escapes <, & and quotes in the title for html, leaves plain alone', () => {
    const p = payloadOf({ ...issue, title: `Fix <b>"a" & 'b'</b>` })
    expect(p.html).toBe(`<a href="${issue.url}">#187</a> Fix &lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;`)
    expect(p.plain).toBe(`[#187](${issue.url}) Fix <b>"a" & 'b'</b>`)
  })
  test('no link is never invented', () => {
    expect(payloadOf({ ...issue, url: null })).toEqual({ html: '#187 Crash on start', plain: '#187 Crash on start' })
  })
  test('all: one line per reference', () => {
    const p = payloadOfAll([mr, issue])
    expect(p.plain.split('\n')).toHaveLength(2)
    expect(p.html).toContain('<div><a href=')
  })
})

describe('the clipboard', () => {
  const g = globalThis as Record<string, unknown>
  let written: unknown[]
  let texts: string[]
  let had: unknown
  beforeEach(() => {
    written = []
    texts = []
    had = g.ClipboardItem
  })
  afterEach(() => {
    g.ClipboardItem = had
  })
  function clipboard(write: ((items: unknown[]) => Promise<void>) | undefined, writeText?: (t: string) => Promise<void>) {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText: writeText ?? (async (t: string) => void texts.push(t)) },
    })
  }

  test('writes html and plain in one item', async () => {
    g.ClipboardItem = class {
      constructor(public data: Record<string, Blob>) {}
    }
    clipboard(async (items) => void written.push(...items))
    expect(await copyPayload(payloadOf(issue))).toBe(true)
    const item = written[0] as { data: Record<string, Blob> }
    expect(Object.keys(item.data)).toEqual(['text/html', 'text/plain'])
    expect(await item.data['text/plain']!.text()).toBe(payloadOf(issue).plain)
    expect(texts).toEqual([])
  })

  test('falls back to writeText(plain) without ClipboardItem', async () => {
    g.ClipboardItem = undefined
    clipboard(async () => {})
    expect(await copyPayload(payloadOf(mr))).toBe(true)
    expect(texts).toEqual([payloadOf(mr).plain])
  })

  test('falls back to writeText(plain) when the write is refused', async () => {
    g.ClipboardItem = class {}
    clipboard(async () => {
      throw new Error('NotAllowedError')
    })
    expect(await copyPayload(payloadOf(mr))).toBe(true)
    expect(texts).toEqual([payloadOf(mr).plain])
  })

  test('says false when nothing works', async () => {
    g.ClipboardItem = undefined
    clipboard(undefined, async () => {
      throw new Error('no')
    })
    expect(await copyPayload(payloadOf(mr))).toBe(false)
  })
})

describe('the button', () => {
  test('is labelled, copies, shows a check, and does not fire the row', async () => {
    const texts: string[] = []
    ;(globalThis as Record<string, unknown>).ClipboardItem = undefined
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => void texts.push(t) },
    })
    const picked: string[] = []
    const rows = collect([row('gl!4013', { title: 'feat: x' }), row('gh#187')])
    const { container, getByLabelText } = render(
      <div onClick={() => picked.push('bubbled')}>
        <ReferenceList rows={rows} landedOn={null} selection={[]} onPick={(r) => picked.push(r)} onToggle={() => {}} />
      </div>,
    )
    expect(container.querySelectorAll('[data-copy]')).toHaveLength(2)
    const button = getByLabelText(/^Copy .*4013 with its link and title$/)
    expect(button.tagName).toBe('BUTTON')
    fireEvent.click(button)
    await waitFor(() => expect(texts).toHaveLength(1))
    expect(texts[0]).toContain('4013')
    expect(texts[0]).toContain('feat: x')
    expect(picked).toEqual([])
    await waitFor(() => expect(button.querySelector('svg.lucide-check')).not.toBeNull())
  })
})

describe('several references', () => {
  const third = { ref: '#3911', title: 'Fix <b> & "quotes"', url: 'https://github.com/example/repo/issues/3911' }

  test('one line each, in both formats, escaped for html only', () => {
    expect(payloadOfAll([mr, issue, third])).toEqual({
      html:
        `<div><a href="${mr.url}">!4013</a> ${mr.title}</div>`
        + `<div><a href="${issue.url}">#187</a> Crash on start</div>`
        + `<div><a href="${third.url}">#3911</a> Fix &lt;b&gt; &amp; &quot;quotes&quot;</div>`,
      plain: `[!4013](${mr.url}) ${mr.title}\n[#187](${issue.url}) Crash on start\n[#3911](${third.url}) Fix <b> & "quotes"`,
    })
  })

  test('ids only: space-separated, the same in both formats', () => {
    expect(idsOfAll([mr, issue, third])).toEqual({ html: '!4013 #187 #3911', plain: '!4013 #187 #3911' })
    expect(idsOfAll([{ ref: 'a<b', title: '', url: null }]).html).toBe('a&lt;b')
    expect(payloadFor('ids', [mr, issue])).toEqual(idsOfAll([mr, issue]))
    expect(payloadFor('linked', [mr, issue])).toEqual(payloadOfAll([mr, issue]))
  })

  test('as listed on screen, each once, and only what is listed', () => {
    const shown = [mr, issue, third, { ...issue }]
    expect(selectedInOrder(shown, ['#3911', '!4013', '#187', '#404']).map((row) => row.ref)).toEqual(['!4013', '#187', '#3911'])
    expect(selectedInOrder(shown, [])).toEqual([])
  })
})

describe('Cmd+C', () => {
  const list = document.createElement('ul')
  const item = document.createElement('button')
  list.appendChild(item)
  const field = document.createElement('input')
  const elsewhere = document.createElement('button')
  document.body.append(list, field, elsewhere)
  const key = (more: Partial<CopyKey> = {}): CopyKey => ({
    key: 'c',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: document.body,
    ...more,
  })

  test('is taken on the body or in the list, with Cmd or Ctrl', () => {
    expect(takesCopyKey(key(), list, false)).toBe(true)
    expect(takesCopyKey(key({ target: item }), list, false)).toBe(true)
    expect(takesCopyKey(key({ key: 'C', metaKey: false, ctrlKey: true }), list, false)).toBe(true)
  })

  test('is left alone for a text selection, a field, elsewhere, other chords and other keys', () => {
    expect(takesCopyKey(key(), list, true)).toBe(false)
    expect(takesCopyKey(key({ target: field }), list, false)).toBe(false)
    expect(takesCopyKey(key({ target: elsewhere }), list, false)).toBe(false)
    expect(takesCopyKey(key({ shiftKey: true }), list, false)).toBe(false)
    expect(takesCopyKey(key({ altKey: true }), list, false)).toBe(false)
    expect(takesCopyKey(key({ metaKey: false }), list, false)).toBe(false)
    expect(takesCopyKey(key({ key: 'v' }), list, false)).toBe(false)
    expect(takesCopyKey(key({ defaultPrevented: true }), list, false)).toBe(false)
    expect(takesCopyKey(key({ target: null }), list, false)).toBe(false)
  })
})
