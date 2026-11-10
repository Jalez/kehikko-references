/**
 * `kehikot.rows.json`, for `kehikot-check-rows` (protocol 2.70.0): the header and footer this page
 * declares, built by the page's own `orderItem` and `footerItems` over a few moments of the list.
 * `bun run rows` writes the file; `test/rows.test.ts` fails when it no longer matches.
 */
import { footerItems } from '../src/live/footer.ts'
import { orderItem } from '../src/live/order.ts'

const NOW = Date.parse('2026-08-27T12:00:00Z')
const facts = { project: '/Users/somebody/Projects/harbour', showing: 412, total: 412, at: '2026-08-27T11:58:00Z', now: NOW }

export function rowsStates() {
  return [
    {
      name: 'the whole list, nothing selected',
      header: [orderItem('moved')],
      footer: footerItems(facts),
      state: true,
    },
    {
      name: 'narrowed to the epic, one source failing, sorted otherwise',
      header: [orderItem('state')],
      footer: footerItems(
        { ...facts, showing: 37, scope: 'epic', unread: [{ ref: '#9', reason: 'not-found' }], fresh: 2 },
        null,
        { trouble: { text: 'gitlab.example.org/team/app could not be read', tooltip: 'The host could not reach it.', busy: false } },
      ),
      state: true,
    },
    {
      name: 'a reference selected, in two epics, one up',
      header: [orderItem('moved')],
      footer: footerItems(
        facts,
        {
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
          linked: { plain: '#12 Migrate the store' },
          ids: { plain: '#12' },
          urls: ['https://github.com/o/r/issues/12'],
        },
        { position: '3 of 412' },
      ),
      state: true,
    },
  ]
}

export const ROWS_PATH = new URL('../kehikot.rows.json', import.meta.url)
export const rowsText = () => `${JSON.stringify(rowsStates(), null, 2)}\n`

if (import.meta.main) await Bun.write(ROWS_PATH, rowsText())
