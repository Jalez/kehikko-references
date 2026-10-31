import { describe, expect, test } from 'bun:test'
import { footerItemsSchema } from 'kehikot-module-protocol'

import { COPY_REFUSED, FOOTER, footerItems, footerPressed, type FooterActs } from '@/live/footer.ts'

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
    expect(items.find((item) => item.id === 'open')).toMatchObject({ kind: 'run', icon: 'external', confirm: false, disabled: null })
    expect(items.find((item) => item.id === 'clear')).toMatchObject({ kind: 'run', icon: 'x' })
  })

  test('many to open are confirmed; none to open is disabled with a sentence; a copy is said', () => {
    const many = footerItems(facts, { count: 9, openable: 9, copied: 9, epics: null })
    parses(many)
    expect(many.find((item) => item.id === 'open')).toMatchObject({ confirm: true })
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

describe('footerPressed', () => {
  const acts = (copies = true) => {
    const did: string[] = []
    const all: FooterActs = {
      open: () => void did.push('open'),
      copy: async (kind) => (did.push(`copy ${kind}`), copies),
      clear: () => void did.push('clear'),
      goToEpic: async (slug) => (did.push(`go ${slug}`), slug !== 'nope'),
    }
    return { did, all }
  }

  test('each run does its act and is taken', async () => {
    const { did, all } = acts()
    for (const item of ['open', 'copy', 'copy-ids', 'clear']) expect(await footerPressed(item, undefined, all)).toBeUndefined()
    expect(did).toEqual(['open', 'copy linked', 'copy ids', 'clear'])
  })

  test('a copy the clipboard refuses is not taken, and says how to copy instead', async () => {
    expect(await footerPressed('copy', undefined, acts(false).all)).toBe(COPY_REFUSED)
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
