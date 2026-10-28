import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

import { collect } from '@/live/collect.ts'
import { copyPayload, payloadOf, payloadOfAll } from '@/live/copy.ts'
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
