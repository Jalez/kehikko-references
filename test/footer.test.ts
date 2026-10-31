import { describe, expect, test } from 'bun:test'
import { LIMITS, footerItemsSchema } from 'kehikot-module-protocol'

import { COPY_REFUSED, COPY_TOO_MUCH, FOOTER, OPEN_ONE, OPEN_REFUSED, carriedCopy, declaresFooter, footerItems, footerPressed, type FooterActs } from '@/live/footer.ts'

/** The footer the page declares to a host that draws it, and what a press on it does. */

const NOW = Date.parse('2026-08-27T12:00:00Z')
const facts = { project: '/Users/somebody/Projects/harbour', showing: 412, total: 412, now: NOW }
const parses = (items: unknown) => expect(footerItemsSchema.safeParse(items).success).toBe(true)

describe('footerItems', () => {
  test('the whole list and nothing selected: the count alone', () => {
    const items = footerItems(facts)
    parses(items)
    expect(items).toEqual([{ kind: 'text', id: 'count', text: '412 references', tooltip: '/Users/somebody/Projects/harbour · 412 references' }])
  })

  test('narrowed, scoped, dated and with refs unread: each its own optional text, the count first', () => {
    const items = footerItems({
      ...facts,
      showing: 37,
      scope: 'epic',
      at: '2026-08-21T12:00:00Z',
      unread: [{ ref: '#9', reason: 'not-found' }],
    })
    parses(items)
    expect(items.map((item) => [item.id, 'text' in item ? item.text : null, item.optional ?? false])).toEqual([
      ['count', '37 of 412 shown', false],
      ['scope', 'this epic', true],
      ['age', 'read 6 d ago', true],
      ['unread', '1 unread', true],
    ])
    expect(items.find((item) => item.id === 'unread')?.tooltip).toBe('#9: its tracker has no such issue or change')
  })

  test('a selection: the count of it, then open, copy, copy ids and clear at the end', () => {
    const items = footerItems(facts, { count: 3, openable: 3, copied: null, epics: null })
    parses(items)
    expect(items.slice(1).map((item) => item.id)).toEqual(['selected', 'open', 'copy', 'copy-ids', 'clear'])
    expect(items.slice(1).every((item) => item.align === 'end')).toBe(true)
    expect(items.find((item) => item.id === 'selected')).toMatchObject({ text: '3 selected' })
    expect(items.find((item) => item.id === 'open')).toMatchObject({ kind: 'run', icon: 'external', disabled: OPEN_ONE })
    expect(items.find((item) => item.id === 'clear')).toMatchObject({ kind: 'run', icon: 'x' })
  })

  test('several to open: flat, saying one at a time; none to open is disabled with a sentence; a copy is said', () => {
    const many = footerItems(facts, { count: 9, openable: 9, copied: 9, epics: null, urls: Array.from({ length: 9 }, (_, n) => `https://x.test/${n}`) })
    parses(many)
    expect(many.find((item) => item.id === 'open')).toMatchObject({ disabled: OPEN_ONE })
    expect(many.find((item) => item.id === 'open')).not.toHaveProperty('open')
    expect(many.find((item) => item.id === 'selected')).toMatchObject({ text: 'Copied 9' })
    const none = footerItems(facts, { count: 1, openable: 0, copied: null, epics: null })
    parses(none)
    expect(none.find((item) => item.id === 'open')?.kind === 'run' && none.find((item) => item.id === 'open')).toMatchObject({
      disabled: 'None of the selected references has an address to open.',
    })
  })

  test('the epics read: a jump to each, the open one marked; none: no jump and the sentence on the count', () => {
    const items = footerItems(facts, {
      count: 1,
      openable: 1,
      copied: null,
      epics: {
        state: 'read',
        links: [
          { slug: 'other', title: 'Another epic', count: 1, of: 1, parts: [], open: false },
          { slug: 'an-epic', title: 'The open one', count: 1, of: 1, parts: ['Wiring'], open: true },
        ],
      },
    })
    parses(items)
    const go = items.find((item) => item.id === FOOTER.epics)
    expect(go).toMatchObject({ kind: 'go', options: [{ id: 'other', label: 'Another epic' }, { id: 'an-epic', label: 'The open one (open now)' }] })
    const none = footerItems(facts, { count: 1, openable: 1, copied: null, epics: { state: 'read', links: [] } })
    parses(none)
    expect(none.some((item) => item.id === FOOTER.epics)).toBe(false)
    expect(none.find((item) => item.id === 'selected')?.tooltip).toBe('Not in any epic of this project.')
  })

  test('a long title and a long list of unread refs stay inside the limits', () => {
    const unread = Array.from({ length: 60 }, (_, at) => ({ ref: `#${at}`, reason: 'pending' as const }))
    const items = footerItems({ ...facts, unread }, {
      count: 1,
      openable: 1,
      copied: null,
      epics: { state: 'read', links: [{ slug: 'x', title: 'A'.repeat(80), count: 1, of: 1, parts: [], open: true }] },
    })
    parses(items)
  })
})

describe('the host carries out copy and open (protocol 2.40.0)', () => {
  const payload = { plain: '[#1](https://x.test/1) One', html: '<div><a href="https://x.test/1">#1</a> One</div>' }

  test('the footer is declared only where the host draws it and carries both acts; anywhere else the page keeps its own bar', () => {
    expect(declaresFooter(true, ['copy', 'open'])).toBe(true)
    expect(declaresFooter(true, ['copy'])).toBe(false)
    expect(declaresFooter(true, null)).toBe(false)
    expect(declaresFooter(false, ['copy', 'open'])).toBe(false)
    expect(declaresFooter(null, ['copy', 'open'])).toBe(false)
  })

  test('Copy and Copy ids hand the host their text; Open hands it the one https address', () => {
    const items = footerItems(facts, { count: 1, openable: 1, copied: null, epics: null, linked: payload, ids: { plain: '#1', html: '#1' }, urls: ['https://x.test/1'] })
    parses(items)
    expect(items.find((item) => item.id === 'copy')).toMatchObject({ copy: payload })
    expect(items.find((item) => item.id === 'copy-ids')).toMatchObject({ copy: { plain: '#1', html: '#1' } })
    expect(items.find((item) => item.id === 'open')).toMatchObject({ open: 'https://x.test/1', disabled: null })
  })

  test('an http or a local address is not handed to the host to open', () => {
    const items = footerItems(facts, { count: 1, openable: 1, copied: null, epics: null, urls: ['http://localhost:3000/x'] })
    parses(items)
    expect(items.find((item) => item.id === 'open')).not.toHaveProperty('open')
  })

  test('the payload caps: html dropped first, then the copy is flat with a sentence', () => {
    expect(carriedCopy({ plain: 'a', html: 'h'.repeat(LIMITS.RUN_COPY_HTML + 1) })).toEqual({ plain: 'a' })
    expect(carriedCopy({ plain: 'p'.repeat(LIMITS.RUN_COPY_PLAIN + 1) })).toBeNull()
    const huge = footerItems(facts, { count: 2, openable: 0, copied: null, epics: null, linked: { plain: 'p'.repeat(LIMITS.RUN_COPY_PLAIN + 1) } })
    parses(huge)
    expect(huge.find((item) => item.id === 'copy')).toMatchObject({ disabled: COPY_TOO_MUCH })
  })
})

describe('footerPressed', () => {
  const acts = () => {
    const did: string[] = []
    const all: FooterActs = {
      copied: () => void did.push('copied'),
      clear: () => void did.push('clear'),
      goToEpic: async (slug) => (did.push(`go ${slug}`), slug !== 'nope'),
    }
    return { did, all }
  }

  test('a copy the host carried is said here, and nothing is written by this page', async () => {
    const { did, all } = acts()
    expect(await footerPressed('copy', undefined, all, 'copy')).toBeUndefined()
    expect(await footerPressed('copy-ids', undefined, all, 'copy')).toBeUndefined()
    expect(await footerPressed('open', undefined, all, 'open')).toBeUndefined()
    expect(await footerPressed('clear', undefined, all)).toBeUndefined()
    expect(did).toEqual(['copied', 'copied', 'clear'])
  })

  test('a copy or an open the host did not carry is not taken, and says what to do instead', async () => {
    expect(await footerPressed('copy', undefined, acts().all)).toBe(COPY_REFUSED)
    expect(await footerPressed('open', undefined, acts().all)).toBe(OPEN_REFUSED)
  })

  test('the epic jump goes to the option picked; a host that declines is said', async () => {
    const { did, all } = acts()
    expect(await footerPressed('epics', 'other', all)).toBeUndefined()
    expect(did).toEqual(['go other'])
    expect(await footerPressed('epics', 'nope', all)).toContain('would not go')
  })

  test('an item it does not have is refused with a sentence', async () => {
    expect(await footerPressed('frobnicate', undefined, acts().all)).toContain('frobnicate')
  })
})
