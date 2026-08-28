import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    greet: (epic: string | null, kept: string | null = null, selection: string[] = []) =>
      post({
        type: MESSAGE.HELLO,
        protocol: PROTOCOL,
        session: 'test-1',
        context: { epic, project: 'example', theme: 'light', selection },
        state: kept,
      }),
    /**
     * A later context, which is what the host sends after any `selection.set`
     * and when the reader changes epic. It carries no `state`: a module's own
     * kept string travels in the greeting only, because context is broadcast to
     * every framed module and this belongs to one of them.
     */
    context: (epic: string | null, selection: string[] = []) =>
      post({ type: MESSAGE.CONTEXT, protocol: PROTOCOL, epic, project: 'example', theme: 'light', selection }),
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
    /** Every call of one method, in order, with the params it carried. */
    calls: (method: string) =>
      said.filter((message) => message.type === MESSAGE.REQUEST && message.method === method).map((m) => m.params),
  }
}

/** Which rows the document is currently drawing as selected. */
const ticked = () =>
  [...document.querySelectorAll('li[data-ref][data-selected="true"]')].map((li) => li.getAttribute('data-ref'))

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

describe('picking references out', () => {
  /** Greet, answer with `count` rows, and hand back the stub. */
  const listed = async (count: number, kept: string | null = null) => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic', kept))
    act(() => roadmap.answer('live.get', reading(count)))
    await settle()
    return roadmap
  }

  const rowButton = (ref: string) =>
    document.querySelector(`li[data-ref="${ref}"] > button`) as HTMLButtonElement | null

  test('a plain click asks the host to select that row, and nothing is ticked until it answers', async () => {
    const roadmap = await listed(5)
    act(() => rowButton('gh#3')?.click())
    /* The request went. The tick has NOT: the selection this page draws is the
       one the host stated, and the host has not stated anything yet. An
       optimistic tick here would be a page claiming a canvas-wide fact on its
       own authority. */
    expect(roadmap.calls('selection.set')).toEqual([{ refs: ['gh#3'] }])
    expect(ticked()).toEqual([])

    act(() => roadmap.context('an-epic', ['gh#3']))
    await settle()
    expect(ticked()).toEqual(['gh#3'])
  })

  test('the call carries refs and nothing else, though the page knows more', async () => {
    /* This page read `gh#3` out of `ghIssues` and knows it is an issue. The
       protocol is explicit that the knowledge must not travel: the host relays
       this to every module and can vouch for the refs, not for what they are. */
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', reading(3)))
    await settle()
    act(() => rowButton('gh#2')?.click())
    const [params] = roadmap.calls('selection.set')
    expect(Object.keys(params as object)).toEqual(['refs'])
  })

  test('a checkbox adds to the selection and takes away from it', async () => {
    const roadmap = await listed(5)
    act(() => roadmap.context('an-epic', ['gh#1']))
    await settle()

    const box = (ref: string) =>
      document.querySelector(`li[data-ref="${ref}"] [data-slot="checkbox"]`) as HTMLElement | null
    act(() => box('gh#4')?.click())
    expect(roadmap.calls('selection.set').at(-1)).toEqual({ refs: ['gh#1', 'gh#4'] })

    act(() => roadmap.context('an-epic', ['gh#1', 'gh#4']))
    await settle()
    expect(ticked()).toEqual(['gh#1', 'gh#4'])

    act(() => box('gh#1')?.click())
    expect(roadmap.calls('selection.set').at(-1)).toEqual({ refs: ['gh#4'] })
  })

  test('clicking the one selected row again clears the selection', async () => {
    const roadmap = await listed(3)
    act(() => roadmap.context('an-epic', ['gh#2']))
    await settle()
    act(() => rowButton('gh#2')?.click())
    /* An empty list is a real call, not an absence — it is the only way to say
       "nothing is selected", and it is why there is no clear button. */
    expect(roadmap.calls('selection.set').at(-1)).toEqual({ refs: [] })
  })

  test('a context for another epic clears the ticks rather than leaving stale ones', async () => {
    const roadmap = await listed(5)
    act(() => roadmap.context('an-epic', ['gh#2']))
    await settle()
    expect(ticked()).toEqual(['gh#2'])

    /* The host clears the selection as part of moving, and says so in the same
       message that names the new epic. The rows here are replaced too, and the
       point of the assertion is that the ticks go with them. */
    act(() => roadmap.context('another-epic', []))
    act(() => roadmap.answer('live.get', reading(5)))
    await settle()
    expect(ticked()).toEqual([])
  })

  test('a context that changes only the selection does not throw the reading away', async () => {
    const roadmap = await listed(5)
    expect(roadmap.asked().filter((m) => m === 'live.get')).toHaveLength(1)
    act(() => roadmap.context('an-epic', ['gh#1']))
    await settle()
    /* Every selection anywhere on the canvas comes back as a context. Re-asking
       on each of them would empty this list and refill it on every tick. */
    expect(roadmap.asked().filter((m) => m === 'live.get')).toHaveLength(1)
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(5)
  })

  test('the tracker is still reachable, as a link of its own on every row', async () => {
    await listed(4)
    const links = [...document.querySelectorAll('li[data-ref] a[target="_blank"]')]
    expect(links).toHaveLength(4)
    expect(links[0]?.getAttribute('href')).toContain('github.com')
    /* And it says where it goes, because an icon that opens a new tab has to be
       readable before it is pressed. */
    expect(links[0]?.getAttribute('aria-label')).toContain('GitHub')
  })
})

describe('remembering the filter and the order', () => {
  test('what the greeting kept is on screen before anything else happens', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic', '{"v":1,"q":"","k":"issue","s":"closed","o":"ref"}'))
    act(() => roadmap.answer('live.get', reading(8)))
    await settle()
    /* Two of the eight are closed. The count is the assertion because it is the
       thing that proves the filter was applied rather than merely stored. */
    expect(document.body.textContent).toContain('2 of 8 shown')
  })

  test('a host keeping nothing leaves the page in its defaults, which is a state it is correct in', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic', null))
    act(() => roadmap.answer('live.get', reading(8)))
    await settle()
    expect(document.body.textContent).toContain('8 references')
  })

  test('a change to the filter is handed to the host to keep, once it settles', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    act(() => roadmap.greet('an-epic'))
    act(() => roadmap.answer('live.get', reading(8)))
    await settle()
    const input = document.querySelector('input') as HTMLInputElement
    /* `fireEvent` rather than setting `.value` and dispatching by hand: React
       keeps a tracker on the node and an assignment updates it too, so the
       hand-rolled version fires an event React decides is a no-op. */
    fireEvent.change(input, { target: { value: 'number 3' } })
    /* Nothing yet — a write per keystroke is thirteen records of a filter
       nobody had. */
    expect(roadmap.calls('state.set')).toHaveLength(0)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 500))
    })
    const written = roadmap.calls('state.set').at(-1) as { state: string }
    expect(JSON.parse(written.state).q).toBe('number 3')
  })

  test('nothing is written before the greeting has been read, or the memory erases itself', async () => {
    const roadmap = stubRoadmap()
    render(<App />)
    /* The page starts in its defaults and the host has not yet said what it
       kept. A write here would save those defaults over the settings that are
       on their way. */
    await act(async () => {
      await new Promise((done) => setTimeout(done, 500))
    })
    expect(roadmap.calls('state.set')).toHaveLength(0)
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
