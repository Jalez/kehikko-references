import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MESSAGE, PROTOCOL } from 'kehikot-module-protocol'
import { mailbox, probeServer, resetServerStanding, serverStanding } from 'kehikot-module-protocol/client'
import { COVER_WORDS } from 'kehikot-module-protocol/client/react'

import { App } from '@/app.tsx'
import { reading as readingOf, row } from './fixtures.ts'

/**
 * The whole app, against a host that is not there and then one that is.
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

/**
 * This app's own server, which answers one thing: that it is there. The page
 * asks on a refresh press, and with nothing answering it would — rightly — put
 * up the cover for a server that has gone. The cases about exactly that swap
 * this out and put it back.
 */
globalThis.fetch = (() =>
  Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }))) as unknown as typeof fetch

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
  /* And the server's standing is one fact per page, which `stale` never heals. */
  resetServerStanding()
})

const PROJECT = '/Users/somebody/Projects/harbour'
const OTHER = '/Users/somebody/Projects/kehikko'

/** What a host holds for a container: a word per choice group, a list per toggles group. */
type Choice = Record<string, string | string[]>

/** How a stand-in host answers one question: data, or a refusal with its reason. */
type Answer = { ok: true; data: unknown } | { ok: false; reason?: 'failed' | 'unknown-method'; error: string }

/**
 * The host's shared tracker reading, per project, and a record of every time
 * it was asked for.
 *
 * `answers` is looked up by the project the stand-in host is standing in, so a
 * test can move the reader between two projects and prove the list moved with
 * them. A project nobody listed answers with a reading of no sources, which is
 * the honest thing for a folder nobody set a tracker up for. `'hold'` answers
 * nothing, so a case can answer late with `host.answer`.
 */
function stubDoor(answers: Record<string, Answer | 'hold'>, refresh: Answer | 'hold' = REFRESHED) {
  const seen: { project: string | null }[] = []
  return { seen, reads: () => seen.length, answers, refresh }
}
type Door = ReturnType<typeof stubDoor>

/** What a host says when a refresh read everything. */
const REFRESHED: Answer = { ok: true, data: { outcome: 'read', at: '2026-08-27T09:13:00Z', why: '' } }

/** Something to be greeted by, and to read what the page says back to it. */
function stubHost(door: Door = stubDoor({})) {
  const said: Record<string, unknown>[] = []
  /* Which project the host last said it was standing in: `tracker.get` asks
     for `project: true`, and the host knows which project that is. */
  let standing: string | null = null

  const post = (data: unknown) => {
    const event = new MessageEvent('message', { data, origin: 'http://localhost:7777' })
    /* `source` is read-only on a constructed MessageEvent, and the bridge binds
       to it — so it is defined here rather than passed. This is the one piece
       of stage machinery in the file. */
    Object.defineProperty(event, 'source', { value: source })
    window.dispatchEvent(event)
  }
  const respond = (id: string, outcome: Answer) =>
    post(
      outcome.ok
        ? { type: MESSAGE.RESPONSE, id, ok: true, data: outcome.data }
        : { type: MESSAGE.RESPONSE, id, ok: false, reason: outcome.reason ?? 'failed', error: outcome.error },
    )

  /* The two tracker questions are answered by the stand-in itself, a
     microtask later, the way a host answers from what it holds. */
  const source = {
    postMessage: (message: Record<string, unknown>) => {
      said.push(message)
      if (message.type !== MESSAGE.REQUEST) return
      const id = message.id as string
      if (message.method === 'tracker.get') {
        door.seen.push({ project: standing })
        const outcome = (standing && door.answers[standing]) || { ok: true, data: readingOf([], { sources: [] }) }
        if (outcome !== 'hold') queueMicrotask(() => respond(id, outcome))
      }
      if (message.method === 'tracker.refresh' && door.refresh !== 'hold') {
        const outcome = door.refresh
        queueMicrotask(() => respond(id, outcome))
      }
    },
  }

  return {
    said,
    greet: (
      projectPath: string | null,
      kept: string | null = null,
      selection: string[] = [],
      filters: Choice = {},
      more: Record<string, unknown> = {},
    ) => {
      standing = projectPath
      post({
        type: MESSAGE.HELLO,
        protocol: PROTOCOL,
        session: 'test-1',
        context: { epic: 'an-epic', project: 'harbour', projectPath, theme: 'light', selection, filters, ...more },
        state: kept,
      })
    },
    /**
     * A later context, which is what the host sends after any `selection.set`
     * and when the reader moves. It carries no `state`: a module's own kept
     * string travels in the greeting only, because context is broadcast to every
     * framed module and this belongs to one of them.
     */
    context: (
      projectPath: string | null,
      selection: string[] = [],
      epic: string | null = 'an-epic',
      filters: Choice = {},
      more: Record<string, unknown> = {},
    ) => {
      standing = projectPath
      post({
        type: MESSAGE.CONTEXT,
        protocol: PROTOCOL,
        epic,
        project: 'harbour',
        projectPath,
        theme: 'light',
        selection,
        filters,
        ...more,
      })
    },
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
    answer: (
      method: string,
      outcome: Answer,
      /* The first rather than the most recent, to answer a question late — or
         a number, for the one asked at that place in between. */
      which: 'last' | 'first' | number = 'last',
    ) => {
      const asking = (message: Record<string, unknown>) => message.type === MESSAGE.REQUEST && message.method === method
      const asked = (
        typeof which === 'number'
          ? said.filter(asking)[which]
          : which === 'first'
            ? said.find(asking)
            : said.findLast(asking)
      ) as { id: string } | undefined
      if (!asked) throw new Error(`nothing asked ${method}`)
      respond(asked.id, outcome)
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

/** The rows of a reading with `count` GitHub issues in it, every fourth closed. */
function issues(count: number) {
  return Array.from({ length: count }, (_, at) =>
    row(`gh#${at + 1}`, { state: (at + 1) % 4 === 0 ? 'closed' : 'open', assignees: ['ada lovelace'] }),
  )
}

/** What a host says when its reading holds `count` issues. */
const answered = (count: number, more: Record<string, unknown> = {}): Answer => ({
  ok: true,
  data: readingOf(issues(count), more),
})

/* A macrotask, so every answer the stand-in queued has landed and been drawn. */
const settle = () => act(async () => { await new Promise((done) => setTimeout(done, 0)) })

describe('with nothing on the other end', () => {
  test('it says nothing has told it anything, and never draws an empty list', async () => {
    render(<App />)
    /* Before the grace passes it says what it is waiting for. */
    expect(screen.getByText(COVER_WORDS.waiting())).toBeTruthy()
    expect(document.querySelector('[data-cover]')?.getAttribute('data-cover')).toBe('waiting')
    await act(async () => {
      await new Promise((done) => setTimeout(done, 800))
    })
    expect(screen.getByText('Nothing is framing this page — open References in Kehikot.')).toBeTruthy()
    expect(document.querySelector('[data-cover]')?.getAttribute('data-cover')).toBe('unhosted')
    /* Not an empty list, and not a sentence that reads like one. */
    expect(document.querySelectorAll('li')).toHaveLength(0)
    expect((document.body.textContent ?? '').toLowerCase()).not.toContain('no references')
  })
})

describe('with a host answering', () => {
  test('the greeting is answered and the host’s reading of the project is asked for', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    expect(host.said[0]).toMatchObject({ type: MESSAGE.READY, id: 'kehikot.references' })
    /* The rows are the host's shared reading, asked for the whole project; the
       epic's refs are asked for the scope. `live.get` is gone, and nothing reads
       a tracker from this page. */
    expect(host.asked().sort()).toEqual(['epic.get', 'steps.list', 'tracker.get'])
    expect(host.calls('tracker.get')).toEqual([{ project: true }])
    expect(door.seen).toEqual([{ project: PROJECT }])
    expect(screen.getByText('Reading the trackers for harbour.')).toBeTruthy()
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(3)
  })

  test('GitHub and GitLab refs list together, from the one reading', async () => {
    const host = stubHost(
      stubDoor({
        [PROJECT]: {
          ok: true,
          data: readingOf([row('gh#1'), row('#2'), row('!3', { state: 'merged' })]),
        },
      }),
    )
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect([...document.querySelectorAll('li[data-ref]')].map((li) => li.getAttribute('data-ref')).sort()).toEqual([
      '!3',
      '#2',
      'gh#1',
    ])
    expect(document.querySelector('li[data-ref="!3"]')?.getAttribute('title')).toContain('merge request')
  })

  test('four hundred references become four hundred rows, with the count on screen', async () => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(400) }))
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li')).toHaveLength(400)
    /* The count is the one thing on this surface a host could not have drawn,
       and it is now the whole of the module's own chrome. */
    expect(document.body.textContent).toContain('400 references')
  })

  test('the reading’s own date is announced to the host, not the moment it was asked', async () => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(3) }))
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    const said = host.refreshable()
    expect(said?.can).toBe(true)
    expect(said?.busy).toBe(false)
    expect(said?.at).toBe('2026-08-27T09:12:00Z')
  })

  test('a context with no project folder says so rather than drawing an empty list', async () => {
    const door = stubDoor({})
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(null))
    await settle()
    expect(screen.getByText(COVER_WORDS['no-project']())).toBeTruthy()
    expect(door.reads()).toBe(0)
    expect(document.querySelectorAll('li')).toHaveLength(0)
    /* Which project a canvas stands in is the host's: nothing here offers to pick one. */
    expect(document.querySelectorAll('button')).toHaveLength(0)
  })

  test('this app’s own server not answering covers the list, and Try again asks before reading again', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(3)

    const real = globalThis.fetch
    const before = host.calls('tracker.get').length
    globalThis.fetch = (() => Promise.reject(new TypeError('Load failed'))) as unknown as typeof fetch
    try {
      await act(async () => void (await probeServer()))
      expect(screen.getByText('References’ own server is not answering.')).toBeTruthy()
      expect(document.querySelectorAll('li[data-ref]')).toHaveLength(0)

      /* Still down: the press asks, hears nothing, and reads nothing from the host. */
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await settle()
      expect(serverStanding()).toBe('down')
      expect(host.calls('tracker.get')).toHaveLength(before)

      /* Back: the cover goes and the reading is asked for again. */
      globalThis.fetch = (() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }))) as unknown as typeof fetch
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await settle()
      await settle()
    } finally {
      globalThis.fetch = real
    }
    expect(host.calls('tracker.get')).toHaveLength(before + 1)
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(3)
  })

  test('a page older than its server says so over everything else', async () => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(3) }))
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    const real = globalThis.fetch
    /* The mark the protocol's `refuseTicket` puts on a refusal: another process is answering. */
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: 'no', refused: 'ticket' }), { status: 403, headers: { 'content-type': 'application/json' } }),
      )) as unknown as typeof fetch
    try {
      await act(async () => void (await probeServer()))
    } finally {
      globalThis.fetch = real
    }
    expect(document.querySelector('[data-cover]')?.getAttribute('data-cover')).toBe('stale')
  })

  test('a tracker with nothing in it is an answer rather than a gap', async () => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(0) }))
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(screen.getByText('This project’s tracker has nothing in it.')).toBeTruthy()
  })

  test('a reading with nothing in it YET, and a read under way, is a wait rather than an empty tracker', async () => {
    const host = stubHost(stubDoor({ [PROJECT]: { ok: true, data: readingOf([], { at: null, refreshing: true }) } }))
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(screen.getByText('Reading the trackers for harbour.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('has nothing in it')
  })

  test('a host that will not hand over its reading is quoted, with a way to ask again', async () => {
    const host = stubHost(
      stubDoor({ [PROJECT]: { ok: false, error: 'kehikot.references may not read trackers.' } }),
    )
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(screen.getByText('The host would not hand over its tracker reading.')).toBeTruthy()
    expect(document.body.textContent).toContain('kehikot.references may not read trackers.')
    expect(document.querySelectorAll('li')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy()
  })

  test('a host older than the shared reading says so, and offers nothing to press', async () => {
    /* Jalez/kehikko#25 is the host side. A host without it answers
       `unknown-method`, and asking twice will not teach it. */
    const host = stubHost(
      stubDoor({ [PROJECT]: { ok: false, reason: 'unknown-method', error: 'no such method: tracker.get' } }),
    )
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(screen.getByText('This host has no shared tracker reading.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull()
  })

  test('a source that failed shows its older rows AND says, per source, why they are not newer', async () => {
    /* The state the old cache existed to draw, kept by the host now. Neither of
       the two easy lies: not an error over a list somebody could have had, and
       not a list quietly pretending to be fresh. */
    const failing = {
      tracker: 'gitlab',
      host: 'gitlab.example.org',
      repo: 'group/project',
      default: true,
      listed: true,
      at: '2026-08-26T09:12:00Z',
      error: 'gitlab.example.org could not be reached.',
      refreshing: false,
    }
    const host = stubHost(
      stubDoor({ [PROJECT]: { ok: true, data: readingOf([...issues(3), row('#7')], { sources: [failing] as never }) } }),
    )
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    expect(document.body.textContent).toContain('gitlab.example.org/group/project could not be read')
    expect(document.body.textContent).toContain('Its rows below are as it was last read')
  })
})

describe('when the reading is asked for, and when it is not', () => {
  test('moving to another project asks for that project', async () => {
    const door = stubDoor({ [PROJECT]: answered(3), [OTHER]: answered(6) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(3)

    act(() => host.context(OTHER, []))
    await settle()
    expect(door.seen.map((one) => one.project)).toEqual([PROJECT, OTHER])
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(6)
    expect(document.body.textContent).toContain('kehikko')
  })

  test('a context that changes only the selection asks nothing', async () => {
    /* Every selection anywhere on the canvas comes back as a context. Asking
       for four hundred rows on each would rebuild the list per tick of a
       checkbox, and the click would look like a bug in the list. */
    const door = stubDoor({ [PROJECT]: answered(5) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(door.reads()).toBe(1)
    act(() => host.context(PROJECT, ['gh#1']))
    await settle()
    expect(door.reads()).toBe(1)
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(5)
  })

  test('a context naming a different epic in the same project asks nothing either', async () => {
    const door = stubDoor({ [PROJECT]: answered(5) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    act(() => host.context(PROJECT, [], 'another-epic'))
    await settle()
    expect(door.reads()).toBe(1)
  })

  test('the host’s reading moving is what asks again — the tracker this module reacts to', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT, null, [], {}, { tracker: { at: '2026-08-27T09:12:00Z', refreshing: false } }))
    await settle()
    expect(door.reads()).toBe(1)

    /* A refresh pressed in another container: the host is reading, and says so. */
    act(() => host.context(PROJECT, [], 'an-epic', {}, { tracker: { at: '2026-08-27T09:12:00Z', refreshing: true } }))
    await settle()
    expect(door.reads()).toBe(1)
    expect(host.refreshable()?.busy).toBe(true)

    /* It landed: `at` moved, so the reading is asked for again. */
    door.answers[PROJECT] = answered(5, { at: '2026-08-27T10:00:00Z' })
    act(() => host.context(PROJECT, [], 'an-epic', {}, { tracker: { at: '2026-08-27T10:00:00Z', refreshing: false } }))
    await settle()
    expect(door.reads()).toBe(2)
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(5)
    expect(host.refreshable()).toMatchObject({ busy: false, at: '2026-08-27T10:00:00Z' })
  })

  test('the host’s refresh asks the host to read the trackers again, then asks for the reading', async () => {
    /* The button is the host's, drawn from `kehikot.refreshable`. What it does
       is `tracker.refresh` for the project — every module in it is told — and
       the protocol forbids telling this page whether the press was a person or
       an interval, so both do the same. */
    const door = stubDoor({ [PROJECT]: answered(3) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(host.calls('tracker.refresh')).toEqual([])

    act(() => host.refresh())
    await settle()
    expect(host.calls('tracker.refresh')).toEqual([{ project: true }])
    expect(door.reads()).toBe(2)
  })

  test('the rows stay on screen while a refresh is in flight, and the host is told it is reading', async () => {
    /* The container has to be usable during a read of two trackers. A list
       that blanks for ten seconds is a list that looks broken, and this is the
       assertion that keeps `busy` from being folded back into `Sight`. */
    const host = stubHost(stubDoor({ [PROJECT]: answered(4) }, 'hold'))
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)

    act(() => host.refresh())
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    expect(host.refreshable()?.busy).toBe(true)

    act(() => host.answer('tracker.refresh', REFRESHED))
    await settle()
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
    expect(host.refreshable()?.busy).toBe(false)
  })

  test('a refresh that could not read everything says so, in the host’s words', async () => {
    const host = stubHost(
      stubDoor(
        { [PROJECT]: answered(4) },
        { ok: true, data: { outcome: 'failed', at: '2026-08-27T09:12:00Z', why: 'gitlab.com could not be reached.' } },
      ),
    )
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    act(() => host.refresh())
    await settle()
    expect(document.body.textContent).toContain('gitlab.com could not be reached.')
    expect(document.querySelectorAll('li[data-ref]')).toHaveLength(4)
  })

  test('nothing is asked on a timer', async () => {
    const door = stubDoor({ [PROJECT]: answered(3) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
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
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT, kept))
    await settle()
    return host
  }

  const rowButton = (ref: string) =>
    document.querySelector(`li[data-ref="${ref}"] > button`) as HTMLButtonElement | null

  test('a plain click asks the host to select that row, and nothing is ticked until it answers', async () => {
    const host = await listed(5)
    act(() => rowButton('gh#3')?.click())
    /* The request went. The tick has NOT: the selection this page draws is the
       one the host stated, and the host has not stated anything yet. An
       optimistic tick here would be a page claiming a canvas-wide fact on its
       own authority. */
    expect(host.calls('selection.set')).toEqual([{ refs: ['gh#3'] }])
    expect(ticked()).toEqual([])

    act(() => host.context(PROJECT, ['gh#3']))
    await settle()
    expect(ticked()).toEqual(['gh#3'])
  })

  test('the ref that goes out is spelled exactly as it always was', async () => {
    /* Protocol-visible, and the single most important assertion in this file.
       The rows come from somewhere else now; what leaves this module for every
       other container on the canvas is unchanged. */
    const host = await listed(5)
    act(() => rowButton('gh#3')?.click())
    expect(host.calls('selection.set')).toEqual([{ refs: ['gh#3'] }])
  })

  test('the call carries refs and nothing else, though the page knows more', async () => {
    /* This page read `gh#2` out of `ghIssues` and knows it is an issue. The
       protocol is explicit that the knowledge must not travel: the host relays
       this to every module and can vouch for the refs, not for what they are. */
    const host = await listed(3)
    act(() => rowButton('gh#2')?.click())
    const [params] = host.calls('selection.set')
    expect(Object.keys(params as object)).toEqual(['refs'])
  })

  test('a checkbox adds to the selection and takes away from it', async () => {
    const host = await listed(5)
    act(() => host.context(PROJECT, ['gh#1']))
    await settle()

    const box = (ref: string) =>
      document.querySelector(`li[data-ref="${ref}"] [data-slot="checkbox"]`) as HTMLElement | null
    act(() => box('gh#4')?.click())
    expect(host.calls('selection.set').at(-1)).toEqual({ refs: ['gh#1', 'gh#4'] })

    act(() => host.context(PROJECT, ['gh#1', 'gh#4']))
    await settle()
    expect(ticked()).toEqual(['gh#1', 'gh#4'])

    act(() => box('gh#1')?.click())
    expect(host.calls('selection.set').at(-1)).toEqual({ refs: ['gh#4'] })
  })

  test('clicking the one selected row again clears the selection', async () => {
    const host = await listed(3)
    act(() => host.context(PROJECT, ['gh#2']))
    await settle()
    act(() => rowButton('gh#2')?.click())
    /* An empty list is a real call, not an absence — it is the only way to say
       "nothing is selected", and it is why there is no clear button. */
    expect(host.calls('selection.set').at(-1)).toEqual({ refs: [] })
  })

  test('a context for another project clears the ticks rather than leaving stale ones', async () => {
    /* GitHub numbers start at one in every repository, so `gh#2` exists nearly
       everywhere. Carrying a tick across a project change would be the expected
       case rather than a contrived one. */
    const door = stubDoor({ [PROJECT]: answered(5), [OTHER]: answered(5) })
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT))
    await settle()
    act(() => host.context(PROJECT, ['gh#2']))
    await settle()
    expect(ticked()).toEqual(['gh#2'])

    act(() => host.context(OTHER, []))
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
    const host = stubHost(door)
    render(<App />)
    act(() => host.greet(PROJECT, kept))
    await settle()
    return host
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
    const host = await shown(null)
    fireEvent.click(screen.getByRole('button', { name: /identifier/i }))
    /* Nothing yet. The delay was chosen for a query that changed on every
       keystroke and is kept for a smaller reason: two orders tried in a row
       should be one write, and nothing is waiting on it. */
    expect(host.calls('state.set')).toHaveLength(0)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 500))
    })
    const written = host.calls('state.set').at(-1) as { state: string }
    expect(JSON.parse(written.state)).toEqual({ v: 3, o: 'ref' })
  })

  test('nothing is written before the greeting has been read, or the memory erases itself', async () => {
    const host = stubHost(stubDoor({}))
    render(<App />)
    /* The page starts in its defaults and the host has not yet said what it
       kept. A write here would save those defaults over the settings that are
       on their way. */
    await act(async () => {
      await new Promise((done) => setTimeout(done, 500))
    })
    expect(host.calls('state.set')).toHaveLength(0)
  })
})

/**
 * The two thirds of the filter that the container's header draws.
 *
 * `kind` and `state` are offered as `kehikot.filters`, the choice comes back in
 * `context.filters`, and the page asks for it back with `filters.set` when
 * somebody presses `Clear` or a host walks it to a reference. The essay is at
 * the top of `live/sift.ts`; these are the four things that would break quietly.
 */
describe('the filters the header holds', () => {
  const listed = async (count: number, filters: Choice = {}) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(count) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, [], filters))
    await settle()
    return host
  }

  test('nothing is offered before there is a reading, and then the counts are in the labels', async () => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(8) }))
    render(<App />)
    /* An empty offer is a CLAIM the host acts on by pruning this container's
       stored choice. Making it before a reading has arrived erases the
       remembered filter on every load, which is a bug that looks like the
       feature working perfectly and then forgetting. */
    expect(host.offered()).toBeUndefined()

    act(() => host.greet(PROJECT))
    await settle()

    const groups = host.offered() as {
      id: string
      kind?: string
      options: { id: string; label: string }[]
    }[]
    expect(groups.map((group) => group.id)).toEqual(['scope', 'kehikko', 'hide', 'search'])
    /* The scope first, on the epic by default — not read yet, so it says so
       rather than counting zero. */
    expect(groups[0]?.options.map((option) => option.label)).toEqual(['This epic (not read)', 'Everything 8'])
    expect(groups[1]?.options.map((option) => option.label)).toEqual(['Everything 8', 'Picked here 0'])
    /* Eight issues, two of them closed, as the shared facets. The number is in
       the words because the protocol has no count field. And nothing nobody
       can press: no change facet, because there are no changes. */
    expect(groups[2]?.kind).toBe('toggles')
    expect(groups[2]?.options.map((option) => option.label)).toEqual([
      'open issues (6)',
      'closed issues (2)',
      'closed, reason unknown (2)',
    ])
    /* The last group is the typed query, which is why this module draws no
       chrome of its own any more. */
    expect(groups[3]?.kind).toBe('text')
  })

  test('a choice in the greeting narrows the list before anything else happens', async () => {
    await listed(8, { hide: ['issue:open'] })
    expect(document.body.textContent).toContain('2 of 8 shown')
  })

  test('a narrowing that matches nothing offers one press that puts ALL of it back', async () => {
    /* The last affordance in this module that undoes a filter, and it reaches
       every group including the typed query — `{}` is a whole choice, and an
       empty string is how a text group says it is at rest. The Clear beside the
       count is gone with the toolbar; the host's own "Show everything" is the
       other way to the same call. */
    const host = await listed(8, { hide: ['issue:open'], search: 'nothing matches this' })
    expect(document.body.textContent).toContain('Nothing here matches what you asked for')

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }))
    await settle()
    expect(host.calls('filters.set')).toEqual([{ filters: { scope: 'all' } }])

    act(() => host.answer('filters.set', { ok: true, data: { filters: { scope: 'all' } } }))
    act(() => host.context(PROJECT, [], 'an-epic', { scope: 'all' }))
    await settle()
    expect(document.body.textContent).toContain('8 references')
  })

  test('a host that declines is quoted, rather than the press quietly doing nothing', async () => {
    const host = await listed(8, { hide: ['issue:open'], search: 'nothing matches this' })
    fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }))
    await settle()
    act(() =>
      host.answer('filters.set', {
        ok: false,
        error: 'kehikot.references is pinned, so it would not be told about the change it is asking for.',
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
  const listed = async (selection: string[], filters: Choice = {}) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(8) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, selection, filters))
    await settle()
    return host
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
    const host = await listed(['gh#7'], ON)
    expect(document.body.textContent).toContain('1 of 8 shown')
    /* A step ticked in another container, say. Nothing in THIS container was
       pressed; the context is the only thing that changed. */
    act(() => host.context(PROJECT, ['gh#7', 'gh#3', 'gh#4'], 'an-epic', ON))
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
    const host = await listed([], { ...ON, hide: ['issue:open'] })
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    await settle()
    /* The state the reader chose is asked for again; only the kehikko group is
       left out, which is how a group is put back to its fallback. */
    expect(host.calls('filters.set')).toEqual([{ filters: { hide: ['issue:open'] } }])
  })

  test('the offer is re-sent as the pick changes, because its count is of rows the pick reaches', async () => {
    const host = await listed([])
    const first = host.offered() as { id: string; options: { label: string }[] }[]
    expect(first[1]?.options[1]?.label).toBe('Picked here 0')
    act(() => host.context(PROJECT, ['gh#1', 'gh#2', 'gh#31337']))
    await settle()
    const next = host.offered() as { id: string; options: { label: string }[] }[]
    expect(next[1]?.options[1]?.label).toBe('Picked here 2')
  })
})

describe('being walked to a reference', () => {
  const listed = async (count: number, filters: Choice = {}) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(count) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, [], filters))
    await settle()
    return host
  }

  test('a reference that is here is answered found', async () => {
    const host = await listed(20)
    act(() => host.goto('gh#7'))
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50))
    })
    const went = host.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ id: 'walk-1', found: true })
  })

  test('a reference that is not here is answered with a sentence, not silence', async () => {
    const host = await listed(3)
    act(() => host.goto('gh#999'))
    const went = host.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('gh#999')
  })

  test('a row the header is hiding is asked for, and answered found once the host has settled', async () => {
    /* `gh#7` is open; the container is narrowed to closed, so the row exists and
       is not drawn. This is the case the whole move had to not break: a module
       that could not clear a host-held filter would have to answer `found: true`
       about a row nobody can see, or refuse a reference it is looking at. */
    const host = await listed(20, { hide: ['issue:open'] })
    act(() => host.goto('gh#7'))
    await settle()
    expect(host.calls('filters.set')).toEqual([{ filters: { scope: 'all' } }])
    /* Nothing is answered yet: the walk is not over until it is known whether
       the host did it. */
    expect(host.said.findLast((message) => message.type === MESSAGE.WENT)).toBeUndefined()

    act(() => host.answer('filters.set', { ok: true, data: { filters: { scope: 'all' } } }))
    await settle()
    expect(host.said.findLast((message) => message.type === MESSAGE.WENT)).toMatchObject({ found: true })
  })

  test('a host that declines the filter gets the honest refusal, not a walk to an invisible row', async () => {
    const host = await listed(20, { hide: ['issue:open'] })
    act(() => host.goto('gh#7'))
    await settle()
    act(() =>
      host.answer('filters.set', {
        ok: false,
        error: 'kehikot.references is not on the kehikko that is open, so it has no filters here to move.',
      }),
    )
    await settle()
    const went = host.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('gh#7')
    expect(String(went?.why)).toContain('not on the kehikko that is open')
  })

  test('a host that settles on something that still hides the row does not get a found either', async () => {
    /* What comes back is what the host SETTLED on, which is deliberately not
       what was asked for. A page that assumed otherwise would draw one thing and
       be told another on the next context — so the settled choice is put back
       through the same narrowing the list uses, against the actual row. */
    const host = await listed(20, { hide: ['issue:open'] })
    act(() => host.goto('gh#7'))
    await settle()
    act(() => host.answer('filters.set', { ok: true, data: { filters: { hide: ['issue:open'] } } }))
    await settle()
    const went = host.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('still hiding it')
  })
})

/**
 * The scope, on by default: narrowed to what the open epic names (issue #1).
 *
 * The things that would break quietly: the list must narrow once the epic is
 * read and not before; a host that refuses must leave the whole project rather
 * than nothing; Everything must be one press; picked containers must win over
 * the epic; and a walk to a ref the scope hides must turn the scope off.
 */
describe('narrowed to the open epic', () => {
  const listed = async (filters: Choice = {}, more: Record<string, unknown> = {}) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(8) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, [], filters, more))
    await settle()
    return host
  }
  const named = (host: ReturnType<typeof stubHost>) => {
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs: ['gh#2', 'gh#3'] }, { refs: ['#77'] }] } }))
    act(() => host.answer('epic.get', { ok: true, data: { slug: 'an-epic', umbrella: 'gh#5', steps: [] } }))
  }

  test('asks the host what the epic names, and narrows to it once answered', async () => {
    const host = await listed()
    expect(host.calls('steps.list')).toEqual([{ epic: 'an-epic' }])
    expect(host.calls('epic.get')).toEqual([{ epic: 'an-epic' }])
    /* Not read yet: the whole project, never an empty list. */
    expect(document.body.textContent).toContain('8 references')

    named(host)
    await settle()
    expect(document.body.textContent).toContain('3 of 8 shown')
    expect(document.body.textContent).toContain('this epic')
    expect([...document.querySelectorAll('li[data-ref]')].map((li) => li.getAttribute('data-ref'))).toEqual([
      'gh#2',
      'gh#3',
      'gh#5',
    ])
    const scope = (host.offered() as { options: { label: string }[] }[])[0]!
    expect(scope.options.map((option) => option.label)).toEqual(['This epic 3', 'Everything 8'])
  })

  test('Everything is one choice away', async () => {
    const host = await listed({ scope: 'all' })
    named(host)
    await settle()
    expect(document.body.textContent).toContain('8 references')
    expect(document.body.textContent).not.toContain('this epic')
  })

  test('a host that refuses both questions leaves the whole project, not an empty list', async () => {
    const host = await listed()
    act(() => host.answer('steps.list', { ok: false, error: 'kehikot.references may not read steps.' }))
    act(() => host.answer('epic.get', { ok: false, error: 'kehikot.references may not read epics.' }))
    await settle()
    expect(document.body.textContent).toContain('8 references')
  })

  test('an epic that names nothing in this tracker says so, and its press asks for Everything alone', async () => {
    const host = await listed({ hide: ['change:closed'] })
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs: ['#77'] }] } }))
    act(() => host.answer('epic.get', { ok: true, data: { umbrella: null } }))
    await settle()
    expect(screen.getByText('Nothing this epic names is in this list.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Nothing here matches')
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    await settle()
    expect(host.calls('filters.set')).toEqual([{ filters: { hide: ['change:closed'], scope: 'all' } }])
  })

  test('picked-out containers win over the epic, and this container is not one of them', async () => {
    const host = await listed()
    named(host)
    act(() =>
      host.context(PROJECT, [], 'an-epic', {}, {
        containers: [
          { module: 'kehikot.journeys', selected: true, showing: { refs: ['gh#7', 'gh#8'] } },
          { module: 'kehikot.paper', selected: false, showing: { refs: ['gh#1'] } },
          /* Its own ticks would narrow it to its own clicks. */
          { module: 'kehikot.references', selected: true, showing: { refs: ['gh#6'] } },
        ],
      }),
    )
    await settle()
    expect(document.body.textContent).toContain('2 of 8 shown')
    expect(document.body.textContent).toContain('picked containers')
    /* And unticking them puts the epic back. */
    act(() => host.context(PROJECT, [], 'an-epic', {}, { containers: [] }))
    await settle()
    expect(document.body.textContent).toContain('3 of 8 shown')
  })

  test('a new epic is asked about again, and a slow answer about the old one is ignored', async () => {
    const host = await listed()
    act(() => host.context(PROJECT, [], 'another-epic'))
    await settle()
    expect(host.calls('steps.list')).toEqual([{ epic: 'an-epic' }, { epic: 'another-epic' }])
    /* The answer about the new epic arrives first, then the old one's. */
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs: ['gh#1'] }] } }))
    act(() => host.answer('epic.get', { ok: true, data: {} }))
    await settle()
    expect(document.body.textContent).toContain('1 of 8 shown')
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs: ['gh#2', 'gh#3'] }] } }, 'first'))
    act(() => host.answer('epic.get', { ok: true, data: {} }, 'first'))
    await settle()
    expect(document.body.textContent).toContain('1 of 8 shown')
  })

  test('a walk to a ref the scope hides turns the scope to Everything; one it keeps asks for nothing', async () => {
    const host = await listed()
    named(host)
    await settle()
    act(() => host.goto('gh#2'))
    await settle()
    expect(host.calls('filters.set')).toEqual([])
    expect(host.said.findLast((message) => message.type === MESSAGE.WENT)).toMatchObject({ found: true })

    act(() => host.goto('gh#7'))
    await settle()
    expect(host.calls('filters.set')).toEqual([{ filters: { scope: 'all' } }])
  })
})

describe('the shared facets, with the marks people put on them', () => {
  const listed = async (filters: Choice = {}, more: Record<string, unknown> = {}) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(8) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, [], filters, more))
    await settle()
    return host
  }

  test('a container stored under the old kind and state groups narrows nothing', async () => {
    /* What a host holding a 2.2.0 choice sends in the greeting, before this
       version has offered anything for it to reconcile against. */
    const host = await listed({ kind: 'change', state: 'merged' })
    expect(document.body.textContent).toContain('8 references')
    expect((host.offered() as { id: string }[]).map((group) => group.id)).not.toContain('kind')
  })

  test('a mark from somebody moves a closed ref under the facet they chose', async () => {
    /* gh#4 and gh#8 are closed with no reason. Marked `wont-do`, gh#4 is
       hidden with the won't-do facet on, and gh#8 is not. */
    const marks = [{ ref: 'gh#4', value: 'wont-do' }]
    const host = await listed({ hide: ['closed:wont-do'] }, { dispositions: marks })
    expect(document.body.textContent).toContain('7 of 8 shown')
    expect(document.querySelector('li[data-ref="gh#4"]')).toBeNull()
    const hide = (host.offered() as { id: string; options: { label: string }[] }[]).find((g) => g.id === 'hide')!
    expect(hide.options.map((option) => option.label)).toContain('won’t do (1)')

    /* And unmarked, it is back to "reason unknown", which nothing is hiding. */
    act(() => host.context(PROJECT, [], 'an-epic', { hide: ['closed:wont-do'] }, { dispositions: [] }))
    await settle()
    expect(document.body.textContent).toContain('8 references')
  })
})

/**
 * The scope following the epic while it is open (issue #7).
 *
 * `steps.list` and `epic.get` used to be asked when the open epic changed and
 * at no other time, so a ref added to a step did not come under "This epic"
 * until the window was reloaded. `context.content` says whose material changed
 * and for which epic; this page re-asks the two questions when the entries for
 * what it shows move, and at no other time.
 *
 * The things that would break quietly: a change to another epic or another
 * module's material must ask nothing; a burst must not be a question per
 * change; and the list must be re-scoped where it stands — the same rows, the
 * same scroll, the same ticks — rather than rebuilt.
 */
describe('following the open epic as its content changes', () => {
  const HIDING = { hide: ['issue:closed'] }
  const PICKED = ['gh#2']
  const at = (minute: number) => `2026-08-27T10:${String(minute).padStart(2, '0')}:00Z`
  const hostChanged = (minute: number, epic: string | null = 'an-epic') => ({ source: 'host', epic, at: at(minute) })
  const journeysChanged = (minute: number) => ({ source: 'kehikot.journeys', epic: null, at: at(minute) })

  /** Answer the two questions most recently asked. */
  const names = (host: ReturnType<typeof stubHost>, refs: string[], umbrella: string | null = 'gh#5') => {
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs }] } }))
    act(() => host.answer('epic.get', { ok: true, data: { slug: 'an-epic', umbrella, steps: [] } }))
  }
  /** Greet, read eight rows, and answer what the epic names: gh#2, gh#3 and the umbrella gh#5. */
  const listed = async (content: unknown[] = []) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(8) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, PICKED, HIDING, { content }))
    await settle()
    names(host, ['gh#2', 'gh#3'])
    await settle()
    return host
  }
  /** A later context that changes nothing but what is said to have changed. */
  const told = (host: ReturnType<typeof stubHost>, content: unknown[], epic = 'an-epic') =>
    act(() => host.context(PROJECT, PICKED, epic, HIDING, { content }))
  const drawn = () =>
    [...document.querySelectorAll('li[data-ref]')].map((li) => li.getAttribute('data-ref')).sort()

  test('a change to the host’s epic asks both questions once more, and re-scopes the list where it stands', async () => {
    const host = await listed()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5'])
    expect(ticked()).toEqual(['gh#2'])

    /* What a reader is holding on to: a row, where they have scrolled to, and
       what is ticked. */
    const row = document.querySelector('li[data-ref="gh#3"]')
    const scroller = document.querySelector('ul')!.parentElement!
    scroller.scrollTop = 72

    told(host, [hostChanged(1)])
    await settle()
    expect(host.calls('steps.list')).toEqual([{ epic: 'an-epic' }, { epic: 'an-epic' }])
    expect(host.calls('epic.get')).toEqual([{ epic: 'an-epic' }, { epic: 'an-epic' }])
    /* The reading is not what changed, so it is not asked for again. */
    expect(host.calls('tracker.get')).toHaveLength(1)
    /* And nothing is taken away while the answer is on its way. */
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5'])

    /* A step gained gh#6, and gh#4 — which the header is hiding. */
    names(host, ['gh#2', 'gh#3', 'gh#6', 'gh#4'])
    await settle()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5', 'gh#6'])
    expect(document.body.textContent).toContain('4 of 8 shown')
    /* The header's filter still narrows, the tick is still the tick, the row
       is the same element and the list has not moved under the reader. */
    expect(document.querySelector('li[data-ref="gh#4"]')).toBeNull()
    expect(ticked()).toEqual(['gh#2'])
    expect(document.querySelector('li[data-ref="gh#3"]')).toBe(row)
    expect(document.querySelector('ul')!.parentElement).toBe(scroller)
    expect(scroller.scrollTop).toBe(72)
    /* The count in the header's own menu follows too. */
    const scope = (host.offered() as { options: { label: string }[] }[])[0]!
    expect(scope.options[0]?.label).toBe('This epic 5')
    /* Once: the answer landing asks nothing further. */
    expect(host.calls('steps.list')).toHaveLength(2)
    expect(host.calls('epic.get')).toHaveLength(2)
  })

  test('a change under the journeys asks too, though the host cannot say which epic it was for', async () => {
    const host = await listed()
    told(host, [journeysChanged(1)])
    await settle()
    expect(host.calls('steps.list')).toHaveLength(2)
    expect(host.calls('epic.get')).toHaveLength(2)
    names(host, ['gh#2'], null)
    await settle()
    expect(drawn()).toEqual(['gh#2'])
  })

  test('a change to another epic, or to another module’s material, asks nothing', async () => {
    const host = await listed()
    told(host, [hostChanged(1, 'another-epic')])
    await settle()
    told(host, [hostChanged(1, 'another-epic'), { source: 'kehikot.paper', epic: 'an-epic', at: at(2) }])
    await settle()
    expect(host.calls('steps.list')).toHaveLength(1)
    expect(host.calls('epic.get')).toHaveLength(1)
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5'])
  })

  test('the same changes said again ask nothing, and neither does a greeting that already carries some', async () => {
    /* Every click on the canvas is a context, and each carries the whole list. */
    const host = await listed([hostChanged(1)])
    expect(host.calls('steps.list')).toHaveLength(1)
    told(host, [hostChanged(1)])
    await settle()
    act(() => host.context(PROJECT, ['gh#3'], 'an-epic', HIDING, { content: [hostChanged(1)] }))
    await settle()
    expect(host.calls('steps.list')).toHaveLength(1)
    expect(host.calls('epic.get')).toHaveLength(1)
  })

  test('a burst of changes while one question is out is one more question after it, not one each', async () => {
    const host = await listed()
    told(host, [hostChanged(1)])
    await settle()
    expect(host.calls('steps.list')).toHaveLength(2)

    /* Three more land before the host has answered. */
    told(host, [hostChanged(2)])
    told(host, [hostChanged(2), journeysChanged(3)])
    told(host, [hostChanged(4), journeysChanged(3)])
    await settle()
    expect(host.calls('steps.list')).toHaveLength(2)
    expect(host.calls('epic.get')).toHaveLength(2)

    /* The answer that was out is drawn — it is newer than what was there — and
       ONE question follows it, for everything that changed meanwhile. */
    names(host, ['gh#2', 'gh#3', 'gh#6'])
    await settle()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5', 'gh#6'])
    expect(host.calls('steps.list')).toHaveLength(3)
    expect(host.calls('epic.get')).toHaveLength(3)

    names(host, ['gh#2', 'gh#3', 'gh#6', 'gh#7'])
    await settle()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5', 'gh#6', 'gh#7'])
    expect(host.calls('steps.list')).toHaveLength(3)
    expect(host.calls('epic.get')).toHaveLength(3)
  })

  test('a question that fails leaves the scope as it was, rather than the whole project or nothing', async () => {
    const refused: Answer = { ok: false, error: 'The host could not read that epic just now.' }
    const host = await listed()
    told(host, [hostChanged(1)])
    await settle()
    act(() => host.answer('steps.list', refused))
    act(() => host.answer('epic.get', refused))
    await settle()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5'])

    /* And one of the two failing does not narrow the epic to what the other said. */
    told(host, [hostChanged(2)])
    await settle()
    expect(host.calls('steps.list')).toHaveLength(3)
    act(() => host.answer('steps.list', refused))
    act(() => host.answer('epic.get', { ok: true, data: { slug: 'an-epic', umbrella: 'gh#5', steps: [] } }))
    await settle()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5'])
  })

  test('an answer about an epic the reader has left is dropped, and so is the question queued behind it', async () => {
    const host = await listed()
    told(host, [hostChanged(1)])
    told(host, [hostChanged(2)])
    await settle()
    expect(host.calls('steps.list')).toHaveLength(2)

    told(host, [hostChanged(2)], 'another-epic')
    await settle()
    expect(host.calls('steps.list')).toHaveLength(3)
    expect(host.calls('steps.list').at(-1)).toEqual({ epic: 'another-epic' })
    names(host, ['gh#1'], null)
    await settle()
    expect(drawn()).toEqual(['gh#1'])

    /* The old epic's answer arrives last. It is not drawn, and it is not the
       cue for the question that was waiting on it. */
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs: ['gh#2', 'gh#3', 'gh#6'] }] } }, 1))
    act(() => host.answer('epic.get', { ok: true, data: { umbrella: 'gh#5' } }, 1))
    await settle()
    expect(drawn()).toEqual(['gh#1'])
    expect(host.calls('steps.list')).toHaveLength(3)
  })
})

/**
 * The parts focus: parts of the epic picked out in the host's bar
 * (`context.parts`).
 *
 * Driven through the bridge, because the failure worth a test here is not in
 * the arithmetic — `sift.test.ts` holds that — but in the plumbing: a hook
 * that parses the context itself and never passes `parts` on would leave every
 * pure function correct and the list unnarrowed. So: the greeting's parts
 * reach the rows; a later context that changes the focus re-draws them; no
 * focus is exactly the list as it was; and the count of what is outside is on
 * screen whenever anything is.
 */
describe('focused on parts of the epic', () => {
  const part = (id: string, heading: string, refs: string[], picked: boolean) => ({ id, heading, refs, picked })
  const parts = (seam: boolean, tests: boolean) => [
    part('seam', 'The posting seam', ['gh#2', 'gh#3'], seam),
    part('tests', 'What the tests check', ['gh#5', 'gl#404'], tests),
  ]
  const listed = async (more: Record<string, unknown> = {}, filters: Choice = { scope: 'all' }) => {
    const host = stubHost(stubDoor({ [PROJECT]: answered(8) }))
    render(<App />)
    act(() => host.greet(PROJECT, null, [], filters, more))
    await settle()
    return host
  }
  const drawn = () => [...document.querySelectorAll('li[data-ref]')].map((li) => li.getAttribute('data-ref'))
  const focusLine = () => document.querySelector('[data-heading="focus"]')

  test('parts that are listed and not picked change nothing at all', async () => {
    await listed({ parts: parts(false, false) })
    expect(drawn()).toHaveLength(8)
    expect(document.body.textContent).toContain('8 references')
    expect(focusLine()).toBeNull()
  })

  test('a part picked in the greeting narrows the rows and says how many are outside it', async () => {
    await listed({ parts: parts(true, false) })
    expect(drawn()).toEqual(['gh#2', 'gh#3'])
    expect(document.body.textContent).toContain('2 of 8 shown')
    expect(focusLine()?.textContent).toBe('6 references outside the picked part (The posting seam).')
  })

  test('a change of focus in a later context re-draws the list, and unpicking puts it all back', async () => {
    const host = await listed({ parts: parts(true, false) })
    act(() => host.context(PROJECT, [], 'an-epic', { scope: 'all' }, { parts: parts(true, true) }))
    await settle()
    expect(drawn()).toEqual(['gh#2', 'gh#3', 'gh#5'])
    expect(focusLine()?.textContent).toBe('5 references outside the 2 picked parts (The posting seam, What the tests check).')

    act(() => host.context(PROJECT, [], 'an-epic', { scope: 'all' }, { parts: parts(false, false) }))
    await settle()
    expect(drawn()).toHaveLength(8)
    expect(focusLine()).toBeNull()

    /* And a host that stops sending the field at all is a host with no focus. */
    act(() => host.context(PROJECT, [], 'an-epic', { scope: 'all' }, { parts: parts(false, true) }))
    await settle()
    expect(drawn()).toEqual(['gh#5'])
    act(() => host.context(PROJECT, [], 'an-epic', { scope: 'all' }))
    await settle()
    expect(drawn()).toHaveLength(8)
  })

  test('the count is of the rows the scope would have drawn, when the scope is narrowing too', async () => {
    const host = await listed({ parts: parts(true, false) }, {})
    act(() => host.answer('steps.list', { ok: true, data: { steps: [{ refs: ['gh#2', 'gh#5'] }] } }))
    act(() => host.answer('epic.get', { ok: true, data: { slug: 'an-epic', umbrella: 'gh#7', steps: [] } }))
    await settle()
    /* The epic names three; the part lists one of them. */
    expect(drawn()).toEqual(['gh#2'])
    expect(document.body.textContent).toContain('1 of 8 shown')
    expect(focusLine()?.textContent).toBe('2 references outside the picked part (The posting seam).')
  })

  test('a focus that leaves no row says so in its own words, with the heading still counting', async () => {
    await listed({ parts: [part('elsewhere', 'Filed elsewhere', ['gl#404'], true)] })
    expect(drawn()).toEqual([])
    expect(screen.getByText('Nothing in the picked part is in this list.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('matches what you asked for')
    expect(focusLine()?.textContent).toBe('8 references outside the picked part (Filed elsewhere).')
  })

  test('a walk to a row outside the focus is refused with the reason, and no filter is moved for it', async () => {
    const host = await listed({ parts: parts(true, false) }, { hide: ['issue:closed'] })
    act(() => host.goto('gh#7'))
    await settle()
    const went = host.said.findLast((message) => message.type === MESSAGE.WENT)
    expect(went).toMatchObject({ found: false })
    expect(String(went?.why)).toContain('gh#7')
    expect(String(went?.why)).toContain('outside the parts of the epic')
    expect(host.calls('filters.set')).toEqual([])

    /* One inside it walks as it always did. */
    act(() => host.goto('gh#2'))
    await settle()
    expect(host.said.findLast((message) => message.type === MESSAGE.WENT)).toMatchObject({ found: true })
  })
})
