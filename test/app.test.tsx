import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'

import { App } from '@/app.tsx'

/**
 * The whole app, against a roadmap that is not there and then one that is.
 *
 * Every other file here tests a part. This one is the only place the parts are
 * wired the way a browser wires them — the real bridge listening on the real
 * `window`, the real components drawing the real sentences — and it exists
 * because the failures worth catching live in the seams: a greeting that
 * arrives and changes nothing, a `null` that becomes an empty list somewhere
 * between the wire and the view, a walk that lands on a row the filter is
 * hiding.
 *
 * The stand-in host is a bare object with a `postMessage`. That is all a host
 * is from inside a frame, and building a fuller one would be building something
 * the code cannot tell from this.
 */

afterEach(cleanup)

/** Something to be greeted by, and to read what the page says back to it. */
function stubRoadmap() {
  const said: Record<string, unknown>[] = []
  const source = { postMessage: (message: Record<string, unknown>) => said.push(message) }

  const post = (data: unknown) => {
    const event = new MessageEvent('message', { data, origin: 'http://localhost:7777' })
    /* `source` is read-only on a constructed MessageEvent, and the bridge binds
       to it — so it is defined here rather than passed. This is the one piece
       of stage machinery in the file. */
    Object.defineProperty(event, 'source', { value: source })
    window.dispatchEvent(event)
  }

  return {
    said,
    greet: (epic: string | null) =>
      post({
        type: MESSAGE.HELLO,
        protocol: PROTOCOL,
        session: 'test-1',
        context: { epic, project: 'example', theme: 'light' },
      }),
    /** Answer whatever question is outstanding, by the id it was asked with. */
    answer: (method: string, data: unknown) => {
      const asked = said.findLast((message) => message.type === MESSAGE.REQUEST && message.method === method)
      if (!asked) throw new Error(`the page never asked ${method}`)
      post({ type: MESSAGE.RESPONSE, id: asked.id, ok: true, data })
    },
    refuse: (method: string, reason: string, error: string) => {
      const asked = said.findLast((message) => message.type === MESSAGE.REQUEST && message.method === method)
      if (!asked) throw new Error(`the page never asked ${method}`)
      post({ type: MESSAGE.RESPONSE, id: asked.id, ok: false, reason, error })
    },
    goto: (ref: string) => post({ type: MESSAGE.GOTO, id: 'walk-1', ref }),
    asked: () => said.filter((message) => message.type === MESSAGE.REQUEST).map((message) => message.method),
  }
}

/** A reading with `count` GitHub issues in it, as a refresh files them. */
function reading(count: number) {
  const ghIssues: Record<string, unknown> = {}
  for (let n = 1; n <= count; n += 1) {
    ghIssues[`gh#${n}`] = {
      state: n % 4 === 0 ? 'closed' : 'opened',
      title: `the thing that has to become true, number ${n}`,
      at: '2026-08-20T10:00:00Z',
      url: `https://github.com/example/repo/issues/${n}`,
      assignees: ['ada lovelace'],
    }
  }
  return { generated: '2026-08-27T09:12:00Z', ghIssues }
}

const settle = () => act(async () => { await Promise.resolve() })

describe('with nothing on the other end', () => {
  test('it says nothing has told it anything, and never draws an empty list', async () => {
    render(<App />)
    /* Before the grace passes it says what it is waiting for. */
    expect(screen.getByText('Waiting to be greeted.')).toBeTruthy()
    await act(async () => {
      await new Promise((done) => setTimeout(done, 800))
    })
    expect(screen.getByText('Nothing has told me anything.')).toBeTruthy()
    expect(document.querySelectorAll('li')).toHaveLength(0)
    expect(document.body.textContent).toContain('Nobody has looked.')
  })
})

describe('with a roadmap answering', () => {
  test('the greeting is answered and the epic in it is asked about', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('practices-are-the-only-governor'))
    expect(roadmap.said[0]).toMatchObject({ type: MESSAGE.READY, id: 'roadmap.references' })
    expect(roadmap.asked()).toEqual(['live.get'])
    /* Both spellings of the one name, so that a host built against the protocol
       as it stands and a host built against the protocol as it was both find
       the key they read. See the note on the call in `use-roadmap.ts`. */
    expect(roadmap.said[1]).toMatchObject({
      params: { epic: 'practices-are-the-only-governor', slug: 'practices-are-the-only-governor' },
    })
    expect(screen.getByText('Asking about practices-are-the-only-governor.')).toBeTruthy()
  })

  test('four hundred references become four hundred rows, with the count on screen', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', reading(400)))
    await settle()
    expect(document.querySelectorAll('li')).toHaveLength(400)
    expect(document.body.textContent).toContain('400 references')
    expect(document.body.textContent).toContain('read 2026-08-27T09:12:00Z')
  })

  test('a null reading is never refreshed, not an empty list', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', null))
    await settle()
    expect(screen.getByText('This epic has never been refreshed.')).toBeTruthy()
    expect(document.body.textContent).toContain('not an empty set of references, but no reading')
  })

  test('a reading with nothing in it says the refresh found nothing', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', { generated: '2026-08-27T09:12:00Z', ghIssues: {}, ghPrs: {} }))
    await settle()
    expect(screen.getByText('The last refresh found no references here.')).toBeTruthy()
  })

  test('a refusal is drawn as a refusal, with the roadmap’s own sentence', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.refuse('live.get', 'failed', 'the state directory could not be read'))
    await settle()
    expect(screen.getByText('The roadmap refused the question.')).toBeTruthy()
    expect(document.body.textContent).toContain('the state directory could not be read')
  })

  test('no epic in the context asks for the list and offers what comes back', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet(null))
    expect(screen.getByText('A roadmap is here, and no epic is open.')).toBeTruthy()
    expect(roadmap.asked()).toEqual(['epics.list'])
    /* Answered in the older spelling, which is what the hosts in the field
       still say. The picker has to be usable against those. */
    act(() => roadmap.answer('epics.list', [{ slug: 'connected-apps', title: 'Connected apps' }]))
    await settle()
    expect(screen.getByRole('button', { name: 'Connected apps' })).toBeTruthy()
  })

  test('a host that has never heard of epics.list is asked the older question', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet(null))
    act(() => roadmap.refuse('epics.list', 'unknown-method', 'no such method'))
    await settle()
    expect(roadmap.asked()).toEqual(['epics.list', 'journeys.list'])
    act(() => roadmap.answer('journeys.list', [{ slug: 'files-stay-reachable', title: 'Files stay reachable' }]))
    await settle()
    expect(screen.getByRole('button', { name: 'Files stay reachable' })).toBeTruthy()
  })

  test('a host that refuses epics.list for any other reason is not argued with', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet(null))
    act(() => roadmap.refuse('epics.list', 'failed', 'the epic directory could not be read'))
    await settle()
    expect(roadmap.asked()).toEqual(['epics.list'])
  })
})

describe('being walked to a reference', () => {
  test('a reference that is here is answered found', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', reading(20)))
    await settle()
    act(() => roadmap.goto('gh#7'))
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50))
    })
    const went = roadmap.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ id: 'walk-1', found: true })
  })

  test('a reference that is not here is answered with a sentence, not silence', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', reading(3)))
    await settle()
    act(() => roadmap.goto('gh#999'))
    const went = roadmap.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('gh#999')
  })
})
