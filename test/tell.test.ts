import { describe, expect, test } from 'bun:test'
import { renderHook } from '@testing-library/react'

import { placeTeller, TELL_EVERY_MS } from 'kehikot-module-protocol/serve'

import { answer } from '../doors.ts'
import { reading, writing } from '../src/live/keep.ts'
import { DEFAULT_ORDER } from '../src/live/order.ts'
import type { Reference } from '../src/live/reference.ts'
import { activityNews, newsFor, placeOf, tellItem, tellPressed, TELL_ITEM, type TellFacts, type ToldBook } from '../src/live/tell.ts'
import { useTellAgents, type TellPost } from '../src/wire/use-tell.ts'
import { TICKET, tellDoor } from '../tell.ts'

/**
 * News for the agents at an epic (3.28.0): what is told, to whom, once, and how often.
 */

const T0 = Date.parse('2026-11-11T10:00:00Z')
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()

const change = (over: Partial<TellFacts> = {}): TellFacts => ({ ref: '!1801', at: at(0), kind: 'change', state: 'open', ...over })

describe('the words', () => {
  test('each kind of somebody else’s act says who, what and where, short', () => {
    const by = { login: 'mona', name: 'Mona', mine: false } as const
    expect(activityNews(change({ lastActivity: { ...by, kind: 'review', verdict: 'changes', at: at(1), path: 'src/api.ts' }, reviewers: [{ login: 'mona', state: 'changes', openThreads: 2 }] })))
      .toBe('Mona requested changes on !1801 · 2 threads on api.ts')
    expect(activityNews(change({ lastActivity: { ...by, kind: 'review', verdict: 'changes', at: at(1) }, discussions: { resolved: 0, unresolved: 1 } as never })))
      .toBe('Mona requested changes on !1801 · 1 thread')
    expect(activityNews(change({ lastActivity: { ...by, kind: 'review', verdict: 'approved', at: at(1) } }))).toBe('Mona approved !1801')
    expect(activityNews(change({ lastActivity: { ...by, kind: 'review', verdict: 'commented', at: at(1) } }))).toBe('Mona reviewed !1801')
    expect(activityNews(change({ lastActivity: { ...by, kind: 'comment', at: at(1), path: 'server/index.ts', line: 42 } }))).toBe('Mona commented on !1801 · line 42 of server/index.ts')
    expect(activityNews(change({ lastActivity: { ...by, kind: 'comment', at: at(1) } }))).toBe('Mona commented on !1801')
    expect(activityNews(change({ lastActivity: { ...by, kind: 'commit', at: at(1), commits: 3 } }))).toBe('Mona pushed 3 commits to !1801')
    expect(activityNews(change({ state: 'merged', lastActivity: { ...by, kind: 'state', at: at(1) } }))).toBe('Mona merged !1801')
    expect(activityNews({ ref: '#42', at: at(0), kind: 'issue', state: 'closed', lastActivity: { login: 'ali', mine: false, kind: 'state', at: at(1) } })).toBe('ali closed #42')
    expect(activityNews({ ref: '#42', at: at(0), kind: 'issue', state: 'open', createdAt: at(-100), lastActivity: { login: 'ali', mine: false, kind: 'state', at: at(1) } })).toBe('ali reopened #42')
  })

  test('CI failing, and passing again after a failure, are news; passing after passing is not', () => {
    const key = 'auth@wide'
    let book: ToldBook = newsFor({}, key, [change({ pipeline: { state: 'success', at: at(0) } })], T0).book
    let step = newsFor(book, key, [change({ pipeline: { state: 'failed', at: at(5) } })], T0 + 5 * 60_000)
    expect(step.news.map((n) => n.body)).toEqual(['CI failed on !1801'])
    book = step.book
    step = newsFor(book, key, [change({ pipeline: { state: 'running', at: at(6) } })], T0 + 6 * 60_000)
    expect(step.news).toEqual([])
    step = newsFor(step.book, key, [change({ pipeline: { state: 'success', at: at(9) } })], T0 + 9 * 60_000)
    expect(step.news.map((n) => n.body)).toEqual(['CI recovered on !1801'])
    step = newsFor(step.book, key, [change({ pipeline: { state: 'success', at: at(20) } })], T0 + 20 * 60_000)
    expect(step.news).toEqual([])
  })
})

describe('what is news', () => {
  const key = 'auth@wide'
  const start = newsFor({}, key, [change()], T0).book

  test('a place seen for the first time tells nothing: what came before is not news', () => {
    const first = newsFor({}, key, [change({ lastActivity: { login: 'mona', mine: false, kind: 'comment', at: at(-5) } })], T0)
    expect(first.news).toEqual([])
    expect(first.book[key]).toBeDefined()
  })

  test('the person’s own act is never told, nor one the host cannot say whose it is', () => {
    expect(newsFor(start, key, [change({ lastActivity: { login: 'me', mine: true, kind: 'commit', at: at(2) } })], T0 + 120_000).news).toEqual([])
    expect(newsFor(start, key, [change({ lastActivity: { login: 'who', kind: 'commit', at: at(2) } })], T0 + 120_000).news).toEqual([])
  })

  test('each act once', () => {
    const rows = [change({ lastActivity: { login: 'mona', mine: false, kind: 'review', verdict: 'approved', at: at(2) } })]
    const once = newsFor(start, key, rows, T0 + 120_000)
    expect(once.news.map((n) => n.body)).toEqual(['mona approved !1801'])
    expect(newsFor(once.book, key, rows, T0 + 180_000).news).toEqual([])
  })

  test('the toggle off records and tells nothing, and turning it on does not tell what happened meanwhile', () => {
    const rows = [change({ lastActivity: { login: 'mona', mine: false, kind: 'comment', at: at(2) } })]
    const off = newsFor(start, key, rows, T0 + 120_000, false)
    expect(off.news).toEqual([])
    expect(newsFor(off.book, key, rows, T0 + 180_000, true).news).toEqual([])
  })

  test('the place is the epic on this kehikko, or the epic alone when the kehikko has no key', () => {
    expect(placeOf('auth', 'wide')).toEqual({ epic: 'auth', kehikko: 'wide' })
    expect(placeOf('auth', '')).toEqual({ epic: 'auth' })
    expect(placeOf('auth', 'Not A Key')).toEqual({ epic: 'auth' })
  })
})

describe('the toggle', () => {
  test('in the View menu, on by default, person-only, and kept only when off', () => {
    expect(tellItem(true)).toEqual({ kind: 'toggle', id: TELL_ITEM, label: 'Tell agents about new activity', checked: true })
    expect('agents' in tellItem(true)).toBe(false)
    expect(tellPressed(TELL_ITEM, false)).toBe(false)
    expect(tellPressed('order', false)).toBeNull()
    expect(reading(writing({ ordering: DEFAULT_ORDER, tell: false }))?.tell).toBe(false)
    expect(reading(writing({ ordering: DEFAULT_ORDER, tell: true }))?.tell).toBeUndefined()
    expect(writing({ ordering: DEFAULT_ORDER, tell: true })).not.toContain('"n"')
  })
})

/* ------------------------------------------------------------------------ *
 * The door
 * ------------------------------------------------------------------------ */

function harness(store = new Map<string, string>()) {
  const told: { place: unknown; body: string }[] = []
  let clock = T0
  const door = tellDoor({
    module: 'kehikot.references',
    resolve: async (named) => (named === '/p' ? '/p' : null),
    tellerFor: () => ({
      tell: async (place, body) => {
        told.push({ place, body })
        return 'sent'
      },
      flush: async () => {},
      stop: () => {},
    }),
    now: () => clock,
    read: async (file) => store.get(file) ?? null,
    write: async (file, text) => void store.set(file, text),
  })
  return { door, told, store, tick: (ms: number) => (clock += ms) }
}

const post = (rows: TellFacts[], over: Partial<TellPost> = {}) => ({ project: '/p', epic: 'auth', kehikko: 'wide', tell: true, rows, ...over })
const mona = (minutes: number) => change({ lastActivity: { login: 'mona', name: 'Mona', mine: false, kind: 'review', verdict: 'changes', at: at(minutes) } })

describe('POST /api/tell', () => {
  test('tells the place once, and not again after a restart', async () => {
    const one = harness()
    await one.door('POST', post([change()]), TICKET)
    one.tick(120_000)
    const got = await one.door('POST', post([mona(2)]), TICKET)
    expect(got).toMatchObject({ status: 200, body: { ok: true, told: 1 } })
    expect(one.told).toEqual([{ place: { epic: 'auth', kehikko: 'wide' }, body: 'Mona requested changes on !1801' }])
    expect([...one.store.keys()]).toEqual(['/p/.kehikot/references/told.json'])

    /* A new process over the same record. */
    const two = harness(one.store)
    two.tick(240_000)
    await two.door('POST', post([mona(2)]), TICKET)
    expect(two.told).toEqual([])
  })

  test('off tells nothing', async () => {
    const h = harness()
    await h.door('POST', post([change()]), TICKET)
    await h.door('POST', post([mona(2)], { tell: false }), TICKET)
    expect(h.told).toEqual([])
  })

  test('another epic is another place: its record is its own', async () => {
    const h = harness()
    await h.door('POST', post([change()]), TICKET)
    /* The same item first seen at another epic is a first sight there. */
    await h.door('POST', post([mona(2)], { epic: 'billing' }), TICKET)
    expect(h.told).toEqual([])
  })

  test('two containers posting at once tell once', async () => {
    const h = harness()
    await h.door('POST', post([change()]), TICKET)
    await Promise.all([h.door('POST', post([mona(2)]), TICKET), h.door('POST', post([mona(2)]), TICKET)])
    expect(h.told).toHaveLength(1)
  })

  test('only this app’s page, only the host’s projects, only POST', async () => {
    const h = harness()
    expect(await h.door('POST', post([change()]), null)).toMatchObject({ status: 403 })
    expect(await h.door('POST', post([change()], { project: '/elsewhere' }), TICKET)).toMatchObject({ status: 404 })
    expect(await h.door('POST', { project: '/p' }, TICKET)).toMatchObject({ status: 400 })
    expect(await h.door('GET', null, TICKET)).toMatchObject({ status: 405 })
    expect(h.store.size).toBe(0)
  })

  test('is mounted on the doors', async () => {
    expect(await answer('POST', '/api/tell', new URLSearchParams(), {}, null)).toMatchObject({ status: 403 })
  })
})

describe('the rate', () => {
  test('one message to a place a minute; the rest go as one digest when it is up', async () => {
    const sent: { place: unknown; body: string }[] = []
    let clock = T0
    const timers: { run: () => void; ms: number }[] = []
    const teller = placeTeller({
      module: 'kehikot.references',
      project: '/p',
      now: () => clock,
      setTimer: (run, ms) => (timers.push({ run, ms }), timers.length),
      clearTimer: () => {},
      send: async (params) => {
        sent.push({ place: params.to.place, body: params.body })
        return { ok: true, data: { outcome: 'sent', id: sent.length } } as never
      },
    })
    const store = new Map<string, string>()
    const door = tellDoor({
      module: 'kehikot.references',
      resolve: async () => '/p',
      tellerFor: () => teller,
      now: () => clock,
      read: async (file) => store.get(file) ?? null,
      write: async (file, text) => void store.set(file, text),
    })
    await door('POST', post([change(), { ...change({ ref: '!1802' }) }]), TICKET)
    clock += 60_000
    await door('POST', post([mona(1), change({ ref: '!1802', lastActivity: { login: 'ali', mine: false, kind: 'commit', commits: 2, at: at(1) } })]), TICKET)
    clock += 1_000
    await door('POST', post([mona(1), change({ ref: '!1802', pipeline: { state: 'failed', at: at(1) }, lastActivity: { login: 'ali', mine: false, kind: 'commit', commits: 2, at: at(1) } })]), TICKET)
    expect(sent).toEqual([{ place: { epic: 'auth', kehikko: 'wide' }, body: 'Mona requested changes on !1801' }])
    expect(timers).toHaveLength(1)
    clock += TELL_EVERY_MS
    timers[0]!.run()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(2)
    expect(sent[1]!.body).toBe('2 updates:\n- ali pushed 2 commits to !1802\n- CI failed on !1802')
  })
})

describe('the page', () => {
  const row = (ref: string, over: Partial<Reference> = {}): Reference =>
    ({ key: ref, ref, kind: 'change', origin: 'github', state: 'open', stateReason: null, closedByMerge: false, draft: false, title: ref, at: at(0), url: null, labels: [], people: [], assignees: [], assignedFaces: [], unreadable: false, ...over }) as Reference

  test('hands its server only the open epic’s items, once per reading', () => {
    const posts: TellPost[] = []
    const rows = [row('!1801'), row('!9999')]
    const props = { hosted: true, project: '/p', epic: 'auth', epicRefs: ['!1801'], kehikko: 'wide', rows, read: true, on: true, post: async (body: TellPost) => void posts.push(body) }
    const { rerender } = renderHook((p: typeof props) => useTellAgents(p), { initialProps: props })
    rerender({ ...props })
    expect(posts).toHaveLength(1)
    expect(posts[0]!.rows.map((r) => r.ref)).toEqual(['!1801'])
    expect(posts[0]).toMatchObject({ project: '/p', epic: 'auth', kehikko: 'wide', tell: true })
  })

  test('says nothing with no epic open, or before the toggle is restored', () => {
    const posts: TellPost[] = []
    const post = async (body: TellPost) => void posts.push(body)
    renderHook(() => useTellAgents({ hosted: true, project: '/p', epic: null, epicRefs: null, kehikko: 'wide', rows: [row('!1801')], read: true, on: true, post }))
    renderHook(() => useTellAgents({ hosted: false, project: '/p', epic: 'auth', epicRefs: ['!1801'], kehikko: 'wide', rows: [row('!1801')], read: true, on: true, post }))
    expect(posts).toEqual([])
  })
})
