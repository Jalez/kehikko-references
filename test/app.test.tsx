import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'
import { mailbox } from 'roadmap-module-protocol/client'

import { App } from '@/app.tsx'
import type { Fetcher } from '@/live/ask.ts'

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
     nobody asked it to, and every counting assertion below is off by one.

     This used to be `forget()` out of this module's own `wire/mailbox.ts`. It
     was found here, in this file, and the client carries it now as an optional
     member of `MessageSource` — declared optional because a test's fake source
     has no backlog to clear, and documented as being for a suite and never for
     a page: forgetting the backlog in a browser throws away the greeting the
     backlog exists to hold. */
  mailbox.forget?.()
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
    greet: (
      projectPath: string | null,
      kept: string | null = null,
      selection: string[] = [],
      filters: Record<string, string> = {},
    ) =>
      post({
        type: MESSAGE.HELLO,
        protocol: PROTOCOL,
        session: 'test-1',
        context: { epic: 'an-epic', project: 'roadmap', projectPath, theme: 'light', selection, filters },
        state: kept,
      }),
    /**
     * A later context, which is what the host sends after any `selection.set`
     * and when the reader moves. It carries no `state`: a module's own kept
     * string travels in the greeting only, because context is broadcast to every
     * framed module and this belongs to one of them.
     */
    context: (
      projectPath: string | null,
      selection: string[] = [],
      epic = 'an-epic',
      filters: Record<string, string> = {},
    ) =>
      post({
        type: MESSAGE.CONTEXT,
        protocol: PROTOCOL,
        epic,
        project: 'roadmap',
        projectPath,
        theme: 'light',
        selection,
        filters,
      }),
    goto: (ref: string) => post({ type: MESSAGE.GOTO, id: 'walk-1', ref }),
    /**
     * Answer the most recent request of one method, the way a host does.
     *
     * Needed the moment a page started AWAITING an answer rather than firing and
     * forgetting: `filters.set` is a request whose result the page reads, so a
     * stand-in host that never answered would leave every `Clear` and every
     * `goto` over a narrowed list waiting for a timeout. The two shapes are the
     * two the protocol has — a `data` payload, or a reason and a sentence.
     */
    answer: (method: string, outcome: { ok: true; data: unknown } | { ok: false; error: string }) => {
      const asked = said.findLast(
        (message) => message.type === MESSAGE.REQUEST && message.method === method,
      ) as { id: string } | undefined
      if (!asked) throw new Error(`nothing asked ${method}`)
      post(
        outcome.ok
          ? { type: MESSAGE.RESPONSE, id: asked.id, ok: true, data: outcome.data }
          : { type: MESSAGE.RESPONSE, id: asked.id, ok: false, reason: 'failed', error: outcome.error },
      )
    },
    /**
     * The host's refresh control, or an interval it is running. Neither says
     * which it was — the protocol forbids it, so this stub cannot offer the
     * distinction either.
     */
    refresh: () => post({ type: MESSAGE.REFRESH, protocol: PROTOCOL }),
    /** The last thing this page said about being read again. */
    refreshable: () =>
      said.findLast((message) => message.type === MESSAGE.REFRESHABLE) as
        | { can: boolean; at: string | null; busy: boolean }
        | undefined,
    /** The last groups this page offered to be narrowed by. */
    offered: () =>
      (said.findLast((message) => message.type === MESSAGE.FILTERS) as { groups?: unknown[] } | undefined)?.groups,
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
    /* The count is the one thing on this surface a host could not have drawn,
       and it is now the whole of the module's own chrome. */
    expect(document.body.textContent).toContain('400 references')
  })

  test('when the reading was taken is announced to the host, not left for it to guess', async () => {
    /* The three sentences the old header drew — `read <when>`, `last read
       <when>`, `this reading is not dated` — are this one field plus the host's
       formatting. It has to come from here, because only this side knows the
       reading came out of the cache beside the project rather than off GitHub
       just now. */
    const door = stubDoor({ [PROJECT]: answered(3, 'cache') })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    const said = roadmap.refreshable()
    expect(said?.can).toBe(true)
    expect(said?.busy).toBe(false)
    expect(Date.parse(String(said?.at))).toBe(Date.parse('2026-08-27T09:12:00Z'))
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

  test('the host’s refresh is the only thing that asks for a fresh read', async () => {
    /* The button used to be in this page's own header and is the host's now.
       What did not change is what it MEANS: `fresh=1`, past the cache, because
       somebody asking for a fresh reading gets one. The protocol forbids
       telling this page whether the press was a person or an interval, so
       taking the cache on one and not the other is not available to it. */
    const door = stubDoor({ [PROJECT]: answered(3) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT))
    await settle()
    expect(door.seen).toEqual([{ project: PROJECT, fresh: false }])

    act(() => roadmap.refresh())
    await settle()
    expect(door.seen.at(-1)).toEqual({ project: PROJECT, fresh: true })
  })

  test('the rows stay on screen while a refresh is in flight, and the host is told it is reading', async () => {
    /* The container has to be usable during a network call. A list that blanks for
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

    act(() => roadmap.refresh())
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    /* `busy` is what the host spins its own icon on and disables its own button
       with. This page is the only side that knows a read is in flight — the
       host posted a message into a frame and has no idea what happened next. */
    expect(roadmap.refreshable()?.busy).toBe(true)

    act(() => release?.())
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    expect(roadmap.refreshable()?.busy).toBe(false)
  })

  test('nothing is read on a timer, so an unwatched container spends no rate limit', async () => {
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
       other container on the canvas is unchanged. */
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

describe('remembering the order, which is all this module keeps for itself', () => {
  const shown = async (kept: string | null, rows = 8) => {
    const door = stubDoor({ [PROJECT]: answered(rows) })
    const roadmap = stubRoadmap()
    render(<App fetcher={door.fetcher} />)
    act(() => roadmap.greet(PROJECT, kept))
    await settle()
    return roadmap
  }

  /** Which column heading is currently carrying the sort. */
  const sortedBy = () =>
    [...document.querySelectorAll('[data-heading] button[aria-pressed="true"]')].map((one) =>
      one.getAttribute('aria-label'),
    )

  test('what the greeting kept is on screen before anything else happens', async () => {
    await shown('{"v":3,"o":"ref"}')
    /* The identifier heading carries the sort, which is the thing that proves
       the order was applied rather than merely stored. */
    expect(sortedBy().join(' ')).toContain('identifier')
  })

  test('every shape written before the filters moved is dropped whole rather than half-applied', async () => {
    /* Version 1 held a kind, a state and a query; version 2 held a query. The
       host holds all three per container now, and reading either string in part
       would restore an order and silently drop a filter somebody set. Both open
       in the defaults instead, and `moved` is the default. */
    await shown('{"v":1,"q":"number 3","k":"issue","s":"closed","o":"ref"}')
    expect(sortedBy().join(' ')).toContain('last moved')
    cleanup()
    await shown('{"v":2,"q":"number 3","o":"ref"}')
    expect(sortedBy().join(' ')).toContain('last moved')
  })

  test('a host keeping nothing leaves the page in its defaults, which is a state it is correct in', async () => {
    await shown(null)
    expect(document.body.textContent).toContain('8 references')
    expect(sortedBy().join(' ')).toContain('last moved')
  })

  test('a change to the order is handed to the host to keep, once it settles', async () => {
    const roadmap = await shown(null)
    fireEvent.click(screen.getByRole('button', { name: /identifier/i }))
    /* Nothing yet. The delay was chosen for a query that changed on every
       keystroke and is kept for a smaller reason: two orders tried in a row
       should be one write, and nothing is waiting on it. */
    expect(roadmap.calls('state.set')).toHaveLength(0)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 500))
    })
    const written = roadmap.calls('state.set').at(-1) as { state: string }
    expect(JSON.parse(written.state)).toEqual({ v: 3, o: 'ref' })
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

/**
 * The two thirds of the filter that the container's header draws.
 *
 * `kind` and `state` are offered as `roadmap.filters`, the choice comes back in
 * `context.filters`, and the page asks for it back with `filters.set` when
 * somebody presses `Clear` or a host walks it to a reference. The essay is at
 * the top of `live/sift.ts`; these are the four things that would break quietly.
 */
describe('the filters the header holds', () => {
  const listed = async (count: number, filters: Record<string, string> = {}) => {
    const roadmap = stubRoadmap()
    render(<App fetcher={stubDoor({ [PROJECT]: answered(count) }).fetcher} />)
    act(() => roadmap.greet(PROJECT, null, [], filters))
    await settle()
    return roadmap
  }

  test('nothing is offered before there is a reading, and then the counts are in the labels', async () => {
    const roadmap = stubRoadmap()
    render(<App fetcher={stubDoor({ [PROJECT]: answered(8) }).fetcher} />)
    /* An empty offer is a CLAIM the host acts on by pruning this container's
       stored choice. Making it before a reading has arrived erases the
       remembered filter on every load, which is a bug that looks like the
       feature working perfectly and then forgetting. */
    expect(roadmap.offered()).toBeUndefined()

    act(() => roadmap.greet(PROJECT))
    await settle()

    const groups = roadmap.offered() as {
      id: string
      kind?: string
      options: { id: string; label: string }[]
    }[]
    expect(groups.map((group) => group.id)).toEqual(['kehikko', 'kind', 'state', 'search'])
    /* Eight issues, two of them closed. The number is in the words because the
       protocol has no count field — see `filterOptionSchema`. */
    expect(groups[1]?.options.map((option) => option.label)).toEqual(['All 8', 'Issues 8'])
    expect(groups[2]?.options.map((option) => option.label)).toEqual(['Any 8', 'Open 6', 'Closed 2'])
    /* And nothing nobody can press: `Changes 0` and `Merged 0` would be menu
       entries whose only outcome is an empty list. The kehikko group is the
       one exception and is checked on its own below — its zero is offered so
       that the filter cannot switch itself off. */
    expect(JSON.stringify(groups.slice(1))).not.toContain(' 0')
    expect(groups[0]?.options.map((option) => option.label)).toEqual(['Everything 8', 'Picked here 0'])
    /* The last group is the typed query, which is why this module draws no
       chrome of its own any more. */
    expect(groups[3]?.kind).toBe('text')
  })

  test('a choice in the greeting narrows the list before anything else happens', async () => {
    await listed(8, { state: 'closed' })
    expect(document.body.textContent).toContain('2 of 8 shown')
  })

  test('a narrowing that matches nothing offers one press that puts ALL of it back', async () => {
    /* The last affordance in this module that undoes a filter, and it reaches
       every group including the typed query — `{}` is a whole choice, and an
       empty string is how a text group says it is at rest. The Clear beside the
       count is gone with the toolbar; the host's own "Show everything" is the
       other way to the same call. */
    const roadmap = await listed(8, { state: 'closed', search: 'nothing matches this' })
    expect(document.body.textContent).toContain('Nothing here matches what you asked for')

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }))
    await settle()
    expect(roadmap.calls('filters.set')).toEqual([{ filters: {} }])

    act(() => roadmap.answer('filters.set', { ok: true, data: { filters: {} } }))
    act(() => roadmap.context(PROJECT))
    await settle()
    expect(document.body.textContent).toContain('8 references')
  })

  test('a host that declines is quoted, rather than the press quietly doing nothing', async () => {
    const roadmap = await listed(8, { state: 'closed', search: 'nothing matches this' })
    fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }))
    await settle()
    act(() =>
      roadmap.answer('filters.set', {
        ok: false,
        error: 'roadmap.references is pinned, so it would not be told about the change it is asking for.',
      }),
    )
    await settle()
    /* The symptom without this sentence is a press that changes nothing at all,
       which reads as a broken button rather than as a host saying no. */
    expect(document.body.textContent).toContain('is pinned')
  })
})

/**
 * The list narrowed to what the kehikko has picked out — the one filter on
 * this page whose WHAT comes from another container.
 *
 * The four things that would break quietly: the list must follow the pick
 * while the group is on; it must ignore the pick while the group is off; an
 * empty pick must be a sentence and never an empty list; and the press that
 * puts rows back must leave the other groups where the reader set them.
 */
describe('narrowed to what the kehikko has picked', () => {
  const ON = { kehikko: 'picked' }
  const listed = async (selection: string[], filters: Record<string, string> = {}) => {
    const roadmap = stubRoadmap()
    render(<App fetcher={stubDoor({ [PROJECT]: answered(8) }).fetcher} />)
    act(() => roadmap.greet(PROJECT, null, selection, filters))
    await settle()
    return roadmap
  }

  test('on, the rows are the ones picked on the canvas, in the list’s own order', async () => {
    await listed(['gh#7', 'gh#2', 'gh#31337'], ON)
    expect(document.body.textContent).toContain('2 of 8 shown')
    expect([...document.querySelectorAll('li[data-ref]')].map((li) => li.getAttribute('data-ref'))).toEqual([
      'gh#2',
      'gh#7',
    ])
  })

  test('and follows the pick as it changes, which is the whole of what "reacts" means', async () => {
    const roadmap = await listed(['gh#7'], ON)
    expect(document.body.textContent).toContain('1 of 8 shown')
    /* A step ticked in another container, say. Nothing in THIS container was
       pressed; the context is the only thing that changed. */
    act(() => roadmap.context(PROJECT, ['gh#7', 'gh#3', 'gh#4'], 'an-epic', ON))
    await settle()
    expect(document.body.textContent).toContain('3 of 8 shown')
  })

  test('off, the pick may be anything and every row stays', async () => {
    await listed(['gh#7'])
    expect(document.body.textContent).toContain('8 references')
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(8)
  })

  test('on with nothing picked is a sentence, and never an empty list', async () => {
    await listed([], ON)
    expect(screen.getByText('Nothing is picked on this kehikko.')).toBeTruthy()
    expect(document.body.textContent).toContain('tick a step in a journey')
    expect(document.body.textContent).not.toContain('Nothing here matches')
    expect(document.querySelectorAll('li')).toHaveLength(0)
  })

  test('on with a pick this project does not hold says so, rather than blaming the menus', async () => {
    await listed(['#2274', '!1800'], ON)
    expect(screen.getByText('What is picked on this kehikko is not in this list.')).toBeTruthy()
    expect(document.body.textContent).toContain('2 references are picked out')
  })

  test('the one press turns off only this group, and leaves the others as the reader set them', async () => {
    const roadmap = await listed([], { ...ON, state: 'closed' })
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    await settle()
    /* The state the reader chose is asked for again; only the kehikko group is
       left out, which is how a group is put back to its fallback. */
    expect(roadmap.calls('filters.set')).toEqual([{ filters: { state: 'closed' } }])
  })

  test('the offer is re-sent as the pick changes, because its count is of rows the pick reaches', async () => {
    const roadmap = await listed([])
    const first = roadmap.offered() as { id: string; options: { label: string }[] }[]
    expect(first[0]?.options[1]?.label).toBe('Picked here 0')
    act(() => roadmap.context(PROJECT, ['gh#1', 'gh#2', 'gh#31337']))
    await settle()
    const next = roadmap.offered() as { id: string; options: { label: string }[] }[]
    expect(next[0]?.options[1]?.label).toBe('Picked here 2')
  })
})

describe('being walked to a reference', () => {
  const listed = async (count: number, filters: Record<string, string> = {}) => {
    const roadmap = stubRoadmap()
    render(<App fetcher={stubDoor({ [PROJECT]: answered(count) }).fetcher} />)
    act(() => roadmap.greet(PROJECT, null, [], filters))
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

  test('a row the header is hiding is asked for, and answered found once the host has settled', async () => {
    /* `gh#7` is open; the container is narrowed to closed, so the row exists and
       is not drawn. This is the case the whole move had to not break: a module
       that could not clear a host-held filter would have to answer `found: true`
       about a row nobody can see, or refuse a reference it is looking at. */
    const roadmap = await listed(20, { state: 'closed' })
    act(() => roadmap.goto('gh#7'))
    await settle()
    expect(roadmap.calls('filters.set')).toEqual([{ filters: {} }])
    /* Nothing is answered yet: the walk is not over until it is known whether
       the host did it. */
    expect(roadmap.said.findLast((message) => message.type === MESSAGE.WENT)).toBeUndefined()

    act(() => roadmap.answer('filters.set', { ok: true, data: { filters: {} } }))
    await settle()
    expect(roadmap.said.findLast((message) => message.type === MESSAGE.WENT)).toMatchObject({ found: true })
  })

  test('a host that declines the filter gets the honest refusal, not a walk to an invisible row', async () => {
    const roadmap = await listed(20, { state: 'closed' })
    act(() => roadmap.goto('gh#7'))
    await settle()
    act(() =>
      roadmap.answer('filters.set', {
        ok: false,
        error: 'roadmap.references is not on the kehikko that is open, so it has no filters here to move.',
      }),
    )
    await settle()
    const went = roadmap.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('gh#7')
    expect(String(went?.why)).toContain('not on the kehikko that is open')
  })

  test('a host that settles on something that still hides the row does not get a found either', async () => {
    /* What comes back is what the host SETTLED on, which is deliberately not
       what was asked for. A page that assumed otherwise would draw one thing and
       be told another on the next context — so the settled choice is put back
       through the same narrowing the list uses, against the actual row. */
    const roadmap = await listed(20, { state: 'closed' })
    act(() => roadmap.goto('gh#7'))
    await settle()
    act(() => roadmap.answer('filters.set', { ok: true, data: { filters: { state: 'closed' } } }))
    await settle()
    const went = roadmap.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('still hiding it')
  })
})
