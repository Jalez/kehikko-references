import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'

import { App } from '@/app.tsx'
import type { Fetcher } from '@/live/ask.ts'
import { forget } from '@/wire/mailbox.ts'

/**
 * The whole app, against a roadmap that is not there and then one that is.
 *
 * Every other file here tests a part. This one is the only place the parts are
 * wired the way a browser wires them — the real bridge listening on the real
 * `window`, the real components drawing the real sentences — and it exists
 * because the failures worth catching live in the seams: a greeting that
 * arrives and changes nothing, a trouble that becomes an empty list somewhere
 * between the door and the view, a walk that lands on a row the filter is
 * hiding.
 *
 * The stand-in host is a bare object with a `postMessage`. That is all a host
 * is from inside a frame, and building a fuller one would be building something
 * the code cannot tell from this. The stand-in door is a function returning a
 * `Response`, for the same reason: it is all a `fetch` is.
 */

afterEach(() => {
  cleanup()
  /* The mailbox is a singleton and this file shares one `window` across every
     case in it, so without this a greeting from the previous test is replayed
     into the next test's freshly mounted app — which then reads a tracker
     nobody asked it to, and every counting assertion below is off by one. */
  forget()
})

const PROJECT = '/Users/somebody/Projects/roadmap'
const OTHER = '/Users/somebody/Projects/kehikko'

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
    greet: (projectPath: string | null, kept: string | null = null, selection: string[] = []) =>
      post({
        type: MESSAGE.HELLO,
        protocol: PROTOCOL,
        session: 'test-1',
        context: { epic: 'an-epic', project: 'roadmap', projectPath, theme: 'light', selection },
        state: kept,
      }),
    /**
     * A later context, which is what the host sends after any `selection.set`
     * and when the reader moves. It carries no `state`: a module's own kept
     * string travels in the greeting only, because context is broadcast to every
     * framed module and this belongs to one of them.
     */
    context: (projectPath: string | null, selection: string[] = [], epic = 'an-epic') =>
      post({
        type: MESSAGE.CONTEXT,
        protocol: PROTOCOL,
        epic,
        project: 'roadmap',
        projectPath,
        theme: 'light',
        selection,
      }),
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

/** A reading with `count` GitHub issues in it, in the shape the door hands back. */
function reading(count: number, generated = '2026-08-27T09:12:00Z') {
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
  return { generated, issues: {}, mrs: {}, ghIssues, ghPrs: {} }
}

/**
 * A door, and a record of every read asked of it.
 *
 * `answers` is looked up by project, so a test can move the reader between two
 * projects and prove the list moved with them. Anything unlisted answers with a
 * `not-a-repo`, which is the honest thing for a folder nobody set up.
 */
function stubDoor(answers: Record<string, unknown>) {
  const seen: { project: string; fresh: boolean }[] = []
  const fetcher: Fetcher = (url) => {
    const query = new URLSearchParams(url.split('?')[1] ?? '')
    const project = query.get('project') ?? ''
    seen.push({ project, fresh: query.get('fresh') === '1' })
    const body = answers[project] ?? {
      ok: true,
      project,
      reading: null,
      from: null,
      trouble: 'not-a-repo',
      why: 'This project is not a git repository.',
      said: null,
    }
    return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
  }
  return { fetcher, seen, reads: () => seen.length }
}

/** What a door says when a read worked. */
const answered = (rows: number, from: 'gh' | 'cache' = 'gh', generated?: string) => ({
  ok: true,
  project: PROJECT,
  reading: reading(rows, generated),
  from,
  trouble: null,
  why: null,
  said: null,
})

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

describe('with nothing on the other end', () => {
  test('it says nothing has told it anything, and never draws an empty list', async () => {
    render(<App fetcher={stubDoor({}).fetcher} />)
    /* Before the grace passes it says what it is waiting for. */
    expect(screen.getByText('Waiting to be greeted.')).toBeTruthy()
    await act(async () => {
      await new Promise((done) => setTimeout(done, 800))
    })
    expect(screen.getByText('Nothing has told me anything.')).toBeTruthy()
    expect(document.querySelectorAll('li')).toHaveLength(0)
    expect(document.body.textContent).toContain('Nobody has looked.')
  })

  test('nothing is read, because nothing has said where to read from', async () => {
    const door = stubDoor({})
    render(<App fetcher={door.fetcher} />)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 800))
    })
    expect(door.reads()).toBe(0)
  })
})

describe('with a roadmap answering', () => {
  test('the greeting is answered and the project in it is read', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    expect(roadmap.said[0]).toMatchObject({ type: MESSAGE.READY, id: 'roadmap.references' })
    /* Nothing is asked of the HOST for the rows any more. `live.get` is gone,
       and this assertion is what would catch it coming back. */
    expect(roadmap.asked()).toEqual([])
    expect(door.seen).toEqual([{ project: PROJECT, fresh: false }])
    expect(screen.getByText('Reading the tracker in roadmap.')).toBeTruthy()
    await settle()
  })

  test('four hundred references become four hundred rows, with the count on screen', async () => {
    const door = stubDoor({ [PROJECT]: answered(400) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li')).toHaveLength(400)
    expect(document.body.textContent).toContain('400 references')
    expect(document.body.textContent).toContain('read 2026-08-27T09:12:00Z')
  })

  test('a cached reading says it is the last one rather than the current one', async () => {
    const door = stubDoor({ [PROJECT]: answered(3, 'cache') })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(document.body.textContent).toContain('last read 2026-08-27T09:12:00Z')
  })

  test('a context with no project folder says so rather than drawing an empty list', async () => {
    const door = stubDoor({})
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(null))
    await settle()
    expect(screen.getByText('A roadmap is here, and it named no project folder.')).toBeTruthy()
    expect(door.reads()).toBe(0)
    expect(document.querySelectorAll('li')).toHaveLength(0)
  })

  test('a tracker with nothing in it is an answer rather than a gap', async () => {
    const door = stubDoor({ [PROJECT]: answered(0) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(screen.getByText('This project’s tracker has nothing in it.')).toBeTruthy()
  })

  test('a failed read with nothing cached is drawn as its own failure', async () => {
    const door = stubDoor({
      [PROJECT]: {
        ok: true,
        project: PROJECT,
        reading: null,
        from: null,
        trouble: 'unauthenticated',
        why: 'The GitHub CLI on this machine is not logged in.',
        said: 'gh auth login',
      },
    })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(screen.getByText('This machine is not logged in to GitHub.')).toBeTruthy()
    expect(document.body.textContent).toContain('gh auth login')
    expect(document.querySelectorAll('li')).toHaveLength(0)
  })

  test('a failed read over a cache shows the rows AND says they are not current', async () => {
    /* The state the whole caching design exists to be able to draw. Neither of
       the two easy lies: not an error over a list somebody could have had, and
       not a list quietly pretending to be fresh. */
    const door = stubDoor({
      [PROJECT]: {
        ...answered(4, 'cache'),
        trouble: 'offline',
        why: 'GitHub could not be reached from this machine, so nothing was read.',
        said: 'dial tcp: no such host',
      },
    })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    expect(document.body.textContent).toContain('GitHub could not be reached')
    expect(document.body.textContent).toContain('the last reading of this project, not a current one')
  })
})

describe('when a read happens, and when it does not', () => {
  test('moving to another project reads that project', async () => {
    const door = stubDoor({ [PROJECT]: answered(3), [OTHER]: { ...answered(6), project: OTHER } })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(3)

    act(() => roadmap.context(OTHER, []))
    await settle()
    expect(door.seen.map((one) => one.project)).toEqual([PROJECT, OTHER])
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(6)
    expect(document.body.textContent).toContain('kehikko')
  })

  test('a context that changes only the selection reads nothing', async () => {
    /* Every selection anywhere on the canvas comes back as a context. Reading
       the tracker on each of them would be a subprocess and a network call per
       tick of a checkbox, and the click would look like a bug in the list. */
    const door = stubDoor({ [PROJECT]: answered(5) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(door.reads()).toBe(1)
    act(() => roadmap.context(PROJECT, ['gh#1']))
    await settle()
    expect(door.reads()).toBe(1)
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(5)
  })

  test('a context naming a different epic in the same project reads nothing either', async () => {
    /* The list is the project's now. An epic changing is not a reason to spend a
       network call, and this is the assertion that would catch it becoming one. */
    const door = stubDoor({ [PROJECT]: answered(5) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    act(() => roadmap.context(PROJECT, [], 'another-epic'))
    await settle()
    expect(door.reads()).toBe(1)
  })

  test('the Refresh press is the only thing that asks for a fresh read', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(door.seen).toEqual([{ project: PROJECT, fresh: false }])

    const refresh = screen.getByRole('button', { name: 'Read this project’s tracker again' })
    act(() => refresh.click())
    await settle()
    expect(door.seen.at(-1)).toEqual({ project: PROJECT, fresh: true })
  })

  test('the rows stay on screen while a refresh is in flight, and the header says what it is doing', async () => {
    /* The pane has to be usable during a network call. A list that blanks for
       three seconds is a list that looks broken, and this is the assertion that
       keeps `busy` from being folded back into `Sight`. */
    let release: (() => void) | null = null
    const door = stubDoor({ [PROJECT]: answered(4) })
    const gated: Fetcher = (url, init) => {
      if (!url.includes('fresh=1')) return door.fetcher(url, init)
      return new Promise((settleIt) => {
        release = () => settleIt(new Response(JSON.stringify(answered(4)), { headers: { 'content-type': 'application/json' } }))
      })
    }
    const roadmap = stubRoadmap()
    render(<App fetcher={gated} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)

    act(() => screen.getByRole('button', { name: 'Read this project’s tracker again' }).click())
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    expect(document.body.textContent).toContain('reading GitHub…')

    act(() => release?.())
    await settle()
    expect(document.body.textContent).not.toContain('reading GitHub…')
  })

  test('nothing is read on a timer, so an unwatched pane spends no rate limit', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    await act(async () => {
      await new Promise((done) => setTimeout(done, 900))
    })
    expect(door.reads()).toBe(1)
  })
})

describe('picking references out', () => {
  /** Greet, read `count` rows, and hand back the stub. */
  const listed = async (count: number, kept: string | null = null) => {
    const door = stubDoor({ [PROJECT]: answered(count) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT, kept))
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

    act(() => roadmap.context(PROJECT, ['gh#3']))
    await settle()
    expect(ticked()).toEqual(['gh#3'])
  })

  test('the ref that goes out is spelled exactly as it always was', async () => {
    /* Protocol-visible, and the single most important assertion in this file.
       The rows come from somewhere else now; what leaves this module for every
       other pane on the canvas is unchanged. */
    const roadmap = await listed(5)
    act(() => rowButton('gh#3')?.click())
    expect(roadmap.calls('selection.set')).toEqual([{ refs: ['gh#3'] }])
  })

  test('the call carries refs and nothing else, though the page knows more', async () => {
    /* This page read `gh#2` out of `ghIssues` and knows it is an issue. The
       protocol is explicit that the knowledge must not travel: the host relays
       this to every module and can vouch for the refs, not for what they are. */
    const roadmap = await listed(3)
    act(() => rowButton('gh#2')?.click())
    const [params] = roadmap.calls('selection.set')
    expect(Object.keys(params as object)).toEqual(['refs'])
  })

  test('a checkbox adds to the selection and takes away from it', async () => {
    const roadmap = await listed(5)
    act(() => roadmap.context(PROJECT, ['gh#1']))
    await settle()

    const box = (ref: string) =>
      document.querySelector(`li[data-ref="${ref}"] [data-slot="checkbox"]`) as HTMLElement | null
    act(() => box('gh#4')?.click())
    expect(roadmap.calls('selection.set').at(-1)).toEqual({ refs: ['gh#1', 'gh#4'] })

    act(() => roadmap.context(PROJECT, ['gh#1', 'gh#4']))
    await settle()
    expect(ticked()).toEqual(['gh#1', 'gh#4'])

    act(() => box('gh#1')?.click())
    expect(roadmap.calls('selection.set').at(-1)).toEqual({ refs: ['gh#4'] })
  })

  test('clicking the one selected row again clears the selection', async () => {
    const roadmap = await listed(3)
    act(() => roadmap.context(PROJECT, ['gh#2']))
    await settle()
    act(() => rowButton('gh#2')?.click())
    /* An empty list is a real call, not an absence — it is the only way to say
       "nothing is selected", and it is why there is no clear button. */
    expect(roadmap.calls('selection.set').at(-1)).toEqual({ refs: [] })
  })

  test('a context for another project clears the ticks rather than leaving stale ones', async () => {
    /* GitHub numbers start at one in every repository, so `gh#2` exists nearly
       everywhere. Carrying a tick across a project change would be the expected
       case rather than a contrived one. */
    const door = stubDoor({ [PROJECT]: answered(5), [OTHER]: { ...answered(5), project: OTHER } })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    act(() => roadmap.context(PROJECT, ['gh#2']))
    await settle()
    expect(ticked()).toEqual(['gh#2'])

    act(() => roadmap.context(OTHER, []))
    await settle()
    expect(ticked()).toEqual([])
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
  const shown = async (kept: string | null, rows = 8) => {
    const door = stubDoor({ [PROJECT]: answered(rows) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT, kept))
    await settle()
    return roadmap
  }

  test('what the greeting kept is on screen before anything else happens', async () => {
    await shown('{"v":1,"q":"","k":"issue","s":"closed","o":"ref"}')
    /* Two of the eight are closed. The count is the assertion because it is the
       thing that proves the filter was applied rather than merely stored. */
    expect(document.body.textContent).toContain('2 of 8 shown')
  })

  test('a host keeping nothing leaves the page in its defaults, which is a state it is correct in', async () => {
    await shown(null)
    expect(document.body.textContent).toContain('8 references')
  })

  test('a change to the filter is handed to the host to keep, once it settles', async () => {
    const roadmap = await shown(null)
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
    render(<App fetcher={stubDoor({}).fetcher} />)
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
  const listed = async (count: number) => {
    const roadmap = stubRoadmap()
    render(<App fetcher={stubDoor({ [PROJECT]: answered(count) }).fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    return roadmap
  }

  test('a reference that is here is answered found', async () => {
    const roadmap = await listed(20)
    act(() => roadmap.goto('gh#7'))
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50))
    })
    const went = roadmap.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ id: 'walk-1', found: true })
  })

  test('a reference that is not here is answered with a sentence, not silence', async () => {
    const roadmap = await listed(3)
    act(() => roadmap.goto('gh#999'))
    const went = roadmap.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('gh#999')
  })
})
