import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MESSAGE, PROTOCOL } from 'kehikot-module-protocol'
import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { App } from '@/app.tsx'
import { drawnOf } from '@/live/drawn.ts'
import { reading, row } from './fixtures.ts'

/**
 * Protocol 2.70.0: the host keeps its cover up until the page says it is drawn (`ready()`), and the
 * page is mounted through `mountPage`, inside the protocol's `ReportErrors`.
 */

globalThis.fetch = (() =>
  Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }))) as unknown as typeof fetch

afterEach(() => {
  cleanup()
  mailbox.forget?.()
  resetServerStanding()
})

const PROJECT = '/Users/somebody/Projects/harbour'
const held = reading([row('gh#1')]) as never

describe('when the page is drawn', () => {
  test('not while waiting to be greeted, asking, or on a first read with nothing yet', () => {
    expect(drawnOf('waiting', { at: 'listening' }, false)).toBe(false)
    expect(drawnOf(null, { at: 'asking', project: PROJECT }, false)).toBe(false)
    expect(drawnOf(null, { at: 'read', project: PROJECT, reading: held, trouble: null }, true)).toBe(false)
  })

  test('the list, a troubled reading, or a sentence of the cover', () => {
    expect(drawnOf(null, { at: 'read', project: PROJECT, reading: held, trouble: null }, false)).toBe(true)
    expect(drawnOf(null, { at: 'trouble', project: PROJECT, trouble: { kind: 'refused', why: 'no' } as never }, false)).toBe(true)
    expect(drawnOf('no-project', { at: 'no-project' }, false)).toBe(true)
    expect(drawnOf('down', { at: 'listening' }, false)).toBe(true)
  })
})

describe('ready() on the page', () => {
  test('said once, when the list is drawn, though the host keeps the page hidden until then', async () => {
    const said: Record<string, unknown>[] = []
    const source = {
      postMessage: (message: Record<string, unknown>) => {
        said.push(message)
        if (message.type === MESSAGE.REQUEST && message.method === 'tracker.get') {
          answer = () => post({ type: MESSAGE.RESPONSE, id: message.id, ok: true, data: reading([row('gh#1'), row('gh#2')]) })
        }
      },
    }
    let answer = () => {}
    const post = (data: unknown) => {
      const event = new MessageEvent('message', { data, origin: 'http://localhost:7777' })
      Object.defineProperty(event, 'source', { value: source })
      window.dispatchEvent(event)
    }
    render(<App />)
    post({
      type: MESSAGE.HELLO,
      protocol: PROTOCOL,
      session: 'drawn-1',
      context: { epic: 'an-epic', project: 'harbour', projectPath: PROJECT, theme: 'light', selection: [], filters: {} },
      state: null,
    })
    post({ type: MESSAGE.VISIBLE, visible: false })
    await waitFor(() => expect(said.some((m) => m.type === MESSAGE.REQUEST && m.method === 'tracker.get')).toBe(true))
    expect(said.find((m) => m.type === MESSAGE.READY)).toMatchObject({ hold: true })
    expect(said.filter((m) => m.type === MESSAGE.DRAWN)).toHaveLength(0)
    answer()
    await waitFor(() => expect(said.filter((m) => m.type === MESSAGE.DRAWN)).toHaveLength(1))
    expect(document.body.textContent).toContain('number 2')
    await new Promise((done) => setTimeout(done, 30))
    expect(said.filter((m) => m.type === MESSAGE.DRAWN)).toHaveLength(1)
  })
})

describe('mounting the page', () => {
  test('the entry mounts through mountPage, after the client', async () => {
    const entry = await Bun.file(new URL('../src/main.tsx', import.meta.url)).text()
    const client = entry.indexOf("import 'kehikot-module-protocol/client'")
    expect(client).toBeGreaterThan(-1)
    expect(entry.indexOf("from 'kehikot-module-protocol/client/mount'")).toBeGreaterThan(client)
    expect(entry).toContain("mountPage('root', <App />)")
    expect(entry).not.toContain('createRoot')
  })
})
