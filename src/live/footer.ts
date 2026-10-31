import { LIMITS, type FooterItemInput } from 'kehikot-module-protocol'

import { headingSaid, type HeadingFacts } from '@/view/heading.tsx'
import { OPEN_MANY } from '@/view/selection-menu.tsx'
import { linkSaid, NOT_IN_ANY_EPIC, type EpicsState } from './epics.ts'

/**
 * The module's footer as the host draws it (`kehikot.footer`, protocol 2.38.0).
 *
 * The same facts the module's own bar (`view/heading.tsx`) draws, from the same
 * words (`headingSaid`), as items a host lays out in one row: the count first
 * (the one text a narrow row keeps), then the scope, the age and what is unread,
 * each `optional` so they go before the count does. While rows are selected,
 * the selection menu's acts follow at the row's end: open, copy, copy ids, the
 * epics the selection is in, and clear.
 *
 * Declared only when the greeting said the host draws it (`drawsFooter`); with
 * any other host the page draws its own bar and declares nothing. When there is
 * no list on screen (a cover, a wait, an absence) the page declares `[]`.
 */

/** What is selected, as the footer needs it, or nothing selected. */
export interface FooterSelection {
  count: number
  /** How many of the selected rows have an address to open. */
  openable: number
  /** How many were copied a moment ago, or null. */
  copied: number | null
  /** The "In epics" reading, or null where no host answers it. */
  epics: EpicsState | null
}

/** The footer's ids, which a press names. */
export const FOOTER = {
  count: 'count',
  scope: 'scope',
  age: 'age',
  unread: 'unread',
  selected: 'selected',
  open: 'open',
  copy: 'copy',
  copyIds: 'copy-ids',
  epics: 'epics',
  clear: 'clear',
} as const

/** Cut to `max` characters, with an ellipsis when cut. */
function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** The footer's items for what the page is showing. */
export function footerItems(facts: HeadingFacts, selection: FooterSelection | null = null): FooterItemInput[] {
  const said = headingSaid(facts)
  const tip = (text: string) => cut(text, LIMITS.FOOTER_TOOLTIP)
  const items: FooterItemInput[] = [{ kind: 'text', id: FOOTER.count, text: said.count, tooltip: tip(said.title) }]
  if (said.within) items.push({ kind: 'text', id: FOOTER.scope, text: said.within, optional: true, tooltip: tip(`What the count is of: ${said.within}.`) })
  if (said.age) items.push({ kind: 'text', id: FOOTER.age, text: said.age, optional: true })
  if (said.gaps) items.push({ kind: 'text', id: FOOTER.unread, text: said.gaps, optional: true, tooltip: tip(said.why.join('\n')) })
  if (!selection || selection.count < 1) return items

  const epics = selection.epics
  const none = epics?.state === 'read' && epics.links.length === 0
  items.push({
    kind: 'text',
    id: FOOTER.selected,
    text: selection.copied !== null ? `Copied ${selection.copied}` : `${selection.count} selected`,
    align: 'end',
    ...(none ? { tooltip: NOT_IN_ANY_EPIC } : epics?.state === 'failed' ? { tooltip: tip(epics.why) } : {}),
  })
  items.push({
    kind: 'run',
    id: FOOTER.open,
    label: 'Open in browser',
    icon: 'external',
    align: 'end',
    optional: true,
    confirm: selection.openable > OPEN_MANY,
    disabled: selection.openable === 0 ? 'None of the selected references has an address to open.' : null,
    tooltip: 'Open the selected references in your own browser.',
  })
  items.push({
    kind: 'run',
    id: FOOTER.copy,
    label: 'Copy',
    align: 'end',
    optional: true,
    tooltip: 'Copy the selected references with links and titles.',
  })
  items.push({ kind: 'run', id: FOOTER.copyIds, label: 'Copy ids', align: 'end', optional: true, tooltip: 'Copy the ids of the selected references.' })
  if (epics?.state === 'read') {
    const options = epics.links
      .filter((link) => link.slug.length <= LIMITS.HEADER_ID)
      .slice(0, LIMITS.HEADER_OPTIONS)
      .map((link) => ({ id: link.slug, label: cut(link.open ? `${link.title} (open now)` : link.title, LIMITS.HEADER_LABEL) }))
    if (options.length) {
      items.push({
        kind: 'go',
        id: FOOTER.epics,
        label: 'In epics',
        options,
        align: 'end',
        optional: true,
        tooltip: tip(
          ['The epics the selected references are in.', ...epics.links.map((link) => [link.title, linkSaid(link)].filter(Boolean).join(': '))].join('\n'),
        ),
      })
    }
  }
  items.push({ kind: 'run', id: FOOTER.clear, label: 'Clear selection', icon: 'x', align: 'end' })
  return items
}

/** What a footer press can do, handed in by the page. */
export interface FooterActs {
  open: () => void
  copy: (kind: 'linked' | 'ids') => Promise<boolean>
  clear: () => void
  goToEpic: (slug: string) => Promise<boolean>
}

/** Why a copy from the footer may not land: a press relayed by the host is not a press in this page. */
export const COPY_REFUSED = 'This page could not reach the clipboard from a press outside it. Press ⌘C in the list to copy the selected references.'

/**
 * A press on one of the footer's items: nothing for "taken", a sentence for
 * "not taken, and why". The page declares the footer again from its new state.
 */
export async function footerPressed(item: string, value: unknown, acts: FooterActs): Promise<string | void> {
  if (item === FOOTER.open) return void acts.open()
  if (item === FOOTER.copy || item === FOOTER.copyIds) {
    return (await acts.copy(item === FOOTER.copy ? 'linked' : 'ids')) ? undefined : COPY_REFUSED
  }
  if (item === FOOTER.clear) return void acts.clear()
  if (item === FOOTER.epics) {
    if (typeof value !== 'string') return 'Pick an epic to go to.'
    return (await acts.goToEpic(value)) ? undefined : `The host would not go to ${value}.`
  }
  return `Nothing in this footer is called ${item}.`
}
