import { describe, expect, test } from 'bun:test'

import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'

import { HostRefused, connect } from '@/wire/host.ts'

/**
 * The wire, against a host that is not a host, a host that lies, and a host
 * that is not there.
 *
 * These are the tests that would be skipped and shouldn't be. The happy path
 * across a frame is four lines of code and it works the first time; what breaks
 * in the field is the second sender, the answer to a question nobody asked, the
 * message that arrives before the greeting, and the roadmap that says nothing
 * at all — and every one of those is silent when it goes wrong, which is
 * exactly the class of failure a test can see and a person cannot.
 */

/** A window we can post at, standing in for the frame this page runs in. */
function fakeWindow() {
  const listeners = new Set<(ev: MessageEvent) => void>()
  const window_ = {
    parent: {} as Window,
    addEventListener: (_type: string, fn: (ev: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (ev: MessageEvent) => void) => listeners.delete(fn),
  }
  const deliver = (ev: { data: unknown; origin?: string; source?: unknown }) => {
    for (const fn of [...listeners]) fn(ev as unknown as MessageEvent)
  }
  return { window_: window_ as unknown as Window, deliver, listening: () => listeners.size }
}

/** Something with a `postMessage`, which is all a host is from in here. */
function speaker() {
  const said: unknown[] = []
  return { postMessage: (message: unknown) => said.push(message), said }
}

const hello = (source: unknown, context = { epic: 'a-epic', project: null, theme: 'light' as const }) => ({
  data: { type: MESSAGE.HELLO, protocol: PROTOCOL, session: 's1', context },
  origin: 'null',
  source,
})

describe('the greeting', () => {
  test('is answered with ready, to the window that sent it', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    connect('roadmap.references', {}, window_)
    deliver(hello(host))
    expect(host.said).toEqual([{ type: MESSAGE.READY, id: 'roadmap.references', protocol: PROTOCOL }])
  })

  test('hands over the context that rode along with it', () => {
    const { window_, deliver } = fakeWindow()
    let seen: string | null = 'not called'
    connect('roadmap.references', { onHello: (context) => (seen = context.epic) }, window_)
    deliver(hello(speaker()))
    expect(seen).toBe('a-epic')
  })

  test('a message that is not a greeting, before any greeting, is nothing', () => {
    const { window_, deliver } = fakeWindow()
    let switched = false
    connect('roadmap.references', { onContext: () => (switched = true) }, window_)
    deliver({ data: { type: MESSAGE.CONTEXT, protocol: 1, epic: 'x', project: null, theme: 'light' }, source: speaker() })
    expect(switched).toBe(false)
  })
})

describe('binding to the window, not the origin', () => {
  test('a second window saying the same words is ignored', () => {
    /* The failure this prevents is not dramatic and that is the point: a page
       framed by one roadmap, receiving context from another, would draw the
       wrong epic under the right title and say nothing about it. */
    const { window_, deliver } = fakeWindow()
    const real = speaker()
    const impostor = speaker()
    const heard: (string | null)[] = []
    connect('roadmap.references', { onContext: (context) => heard.push(context.epic) }, window_)
    deliver(hello(real))
    deliver({
      data: { type: MESSAGE.CONTEXT, protocol: 1, epic: 'somebody-elses', project: null, theme: 'light' },
      source: impostor,
    })
    deliver({
      data: { type: MESSAGE.CONTEXT, protocol: 1, epic: 'the-real-one', project: null, theme: 'light' },
      source: real,
    })
    expect(heard).toEqual(['the-real-one'])
  })

  test('rubbish on the wire is dropped rather than parsed', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    connect('roadmap.references', {}, window_)
    for (const data of [null, 'hello', { type: 'webpack/hot' }, { type: 'roadmap.hello' }, 7]) {
      deliver({ data, source: host })
    }
    /* The fourth one starts `roadmap.` and is still not a greeting: no
       protocol, no session, no context. A module that answered it would have
       bound itself to whatever posted it. */
    expect(host.said).toEqual([])
  })
})

describe('a question and its answer', () => {
  test('the answer is matched to the question by its id', async () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    const module_ = connect('roadmap.references', {}, window_)
    deliver(hello(host))
    const answer = module_.request('live.get', { epic: 'a-epic' })
    const asked = host.said[1] as { id: string; method: string; params: unknown }
    expect(asked.method).toBe('live.get')
    expect(asked.params).toEqual({ epic: 'a-epic' })
    deliver({ data: { type: MESSAGE.RESPONSE, id: asked.id, ok: true, data: { generated: 'now' } }, source: host })
    expect(await answer).toEqual({ generated: 'now' })
  })

  test('an answer to a question nobody asked changes nothing', async () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    const module_ = connect('roadmap.references', {}, window_)
    deliver(hello(host))
    const answer = module_.request('live.get', { epic: 'a-epic' })
    const asked = host.said[1] as { id: string }
    deliver({ data: { type: MESSAGE.RESPONSE, id: 'some-other-id', ok: true, data: 'wrong' }, source: host })
    deliver({ data: { type: MESSAGE.RESPONSE, id: asked.id, ok: true, data: 'right' }, source: host })
    expect(await answer).toBe('right')
  })

  test('a refusal arrives as both halves: a word and a sentence', async () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    const module_ = connect('roadmap.references', {}, window_)
    deliver(hello(host))
    const answer = module_.request('live.get', { epic: 'a-epic' })
    const asked = host.said[1] as { id: string }
    deliver({
      data: {
        type: MESSAGE.RESPONSE,
        id: asked.id,
        ok: false,
        reason: 'unknown-method',
        error: 'this roadmap does not answer live.get',
      },
      source: host,
    })
    await expect(answer).rejects.toBeInstanceOf(HostRefused)
    await answer.catch((error: HostRefused) => {
      expect(error.refusal.reason).toBe('unknown-method')
      expect(error.refusal.error).toBe('this roadmap does not answer live.get')
    })
  })

  test('asking before anybody has greeted us is refused at once, not queued', async () => {
    const { window_ } = fakeWindow()
    const module_ = connect('roadmap.references', {}, window_)
    await module_.request('live.get', {}).then(
      () => expect.unreachable(),
      (error: HostRefused) => expect(error.refusal.reason).toBe('silent'),
    )
  })

  test('stopping refuses what is still waiting rather than leaving it hanging', async () => {
    const { window_, deliver, listening } = fakeWindow()
    const host = speaker()
    const module_ = connect('roadmap.references', {}, window_)
    deliver(hello(host))
    const answer = module_.request('live.get', { epic: 'a-epic' })
    module_.stop()
    await answer.then(
      () => expect.unreachable(),
      (error: HostRefused) => expect(error.refusal.reason).toBe('silent'),
    )
    expect(listening()).toBe(0)
  })
})

describe('goto is always answered', () => {
  const gotoMessage = (ref: string) => ({ type: MESSAGE.GOTO, id: 'g1', ref })

  test('found, when the page says so', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    connect('roadmap.references', { onGoto: (_message, answer) => answer(true, '') }, window_)
    deliver(hello(host))
    deliver({ data: gotoMessage('gh#41'), source: host })
    expect(host.said[1]).toEqual({ type: MESSAGE.WENT, id: 'g1', found: true, why: '' })
  })

  test('not found, with a sentence a person can read', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    connect(
      'roadmap.references',
      { onGoto: (message, answer) => answer(false, `nothing here names ${message.ref}`) },
      window_,
    )
    deliver(hello(host))
    deliver({ data: gotoMessage('gh#41'), source: host })
    expect(host.said[1]).toEqual({ type: MESSAGE.WENT, id: 'g1', found: false, why: 'nothing here names gh#41' })
  })

  test('a listener that throws still answers, because the host is waiting', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    connect(
      'roadmap.references',
      {
        onGoto: () => {
          throw new Error('the view exploded')
        },
      },
      window_,
    )
    deliver(hello(host))
    deliver({ data: gotoMessage('gh#41'), source: host })
    expect((host.said[1] as { found: boolean }).found).toBe(false)
  })

  test('answering twice says one thing', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    connect(
      'roadmap.references',
      {
        onGoto: (_message, answer) => {
          answer(true, '')
          answer(false, 'no, wait')
        },
      },
      window_,
    )
    deliver(hello(host))
    deliver({ data: gotoMessage('gh#41'), source: host })
    expect(host.said).toHaveLength(2)
    expect((host.said[1] as { found: boolean }).found).toBe(true)
  })
})

describe('how tall it would like to be', () => {
  test('is clamped on our own side with the host’s own arithmetic', () => {
    const { window_, deliver } = fakeWindow()
    const host = speaker()
    const module_ = connect('roadmap.references', {}, window_)
    deliver(hello(host))
    module_.resize(10)
    module_.resize(999_999)
    expect(host.said.slice(1)).toEqual([
      { type: MESSAGE.RESIZE, height: 200 },
      { type: MESSAGE.RESIZE, height: 20_000 },
    ])
  })
})
