import { LIMITS, runOpenRefusal, type FooterItemInput, type RunCopy } from 'kehikot-module-protocol'

import { headingSaid, type HeadingFacts } from '@/view/heading.tsx'
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
 * Declared only when the greeting said the host draws it (`drawsFooter`) AND
 * carries out a copy and an open itself (`hostCarries`, protocol 2.40.0): a press
 * the host relays reaches this page with no user activation, so the clipboard and
 * new windows refuse this page. The copy runs hand the host their text (`copy`)
 * and Open hands it the address (`open`), and the host does the act in the
 * person's click. With any other host the page draws its own bar and selection
 * menu, where the person's click is in this page, and declares nothing
 * (`declaresFooter`). When there is no list on screen the page declares `[]`.
 */

/** Whether this page declares its footer: the host draws it and carries out both acts the selection needs. */
export function declaresFooter(drawsFooter: boolean | null | undefined, carries: readonly string[] | null | undefined): boolean {
  return drawsFooter === true && !!carries && carries.includes('copy') && carries.includes('open')
}

/** What is selected, as the footer needs it, or nothing selected. */
export interface FooterSelection {
  count: number
  /** How many of the selected rows have an address to open. */
  openable: number
  /** How many were copied a moment ago, or null. */
  copied: number | null
  /** The "In epics" reading, or null where no host answers it. */
  epics: EpicsState | null
  /** What Copy and Copy ids put on the clipboard (protocol 2.40.0: the host writes it). */
  linked?: RunCopy
  ids?: RunCopy
  /** The selected rows' addresses that can be opened, in order. */
  urls?: readonly string[]
}

/** A copy the host may carry: within the protocol's caps, the html dropped before the plain text is given up. */
export function carriedCopy(copy: RunCopy | undefined): RunCopy | null {
  if (!copy || copy.plain.length === 0 || copy.plain.length > LIMITS.RUN_COPY_PLAIN) return null
  if (copy.html !== undefined && (copy.html.length === 0 || copy.html.length > LIMITS.RUN_COPY_HTML)) return { plain: copy.plain }
  return copy
}

/** Why the footer cannot copy this much, said where the run is drawn. */
export const COPY_TOO_MUCH = 'That is more than the footer can copy at once. Press ⌘C in the list to copy the selected references.'
/** Why Open is flat with several selected: one press is one window. */
export const OPEN_ONE = 'The footer opens one reference at a time: select just one, or open each from its row.'

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
  /* Protocol 2.40.0: Open hands the host one https address, which it opens in the person's click. */
  const openable = (selection.urls ?? []).filter((url) => runOpenRefusal(url) === null)
  const one = openable.length === 1 ? openable[0] : undefined
  items.push({
    kind: 'run',
    id: FOOTER.open,
    label: 'Open in browser',
    icon: 'external',
    align: 'end',
    optional: true,
    disabled: selection.openable === 0 ? 'None of the selected references has an address to open.' : one === undefined ? OPEN_ONE : null,
    tooltip: 'Open the selected reference in your own browser.',
    ...(one !== undefined ? { open: one } : {}),
  })
  /* And the copies hand the host their text, which it writes in the person's click. */
  const linked = carriedCopy(selection.linked)
  const ids = carriedCopy(selection.ids)
  items.push({
    kind: 'run',
    id: FOOTER.copy,
    label: 'Copy',
    align: 'end',
    optional: true,
    tooltip: 'Copy the selected references with links and titles.',
    ...(linked ? { copy: linked } : { disabled: COPY_TOO_MUCH }),
  })
  items.push({
    kind: 'run',
    id: FOOTER.copyIds,
    label: 'Copy ids',
    align: 'end',
    optional: true,
    tooltip: 'Copy the ids of the selected references.',
    ...(ids ? { copy: ids } : { disabled: COPY_TOO_MUCH }),
  })
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
  /** The host copied the selection (protocol 2.40.0): say so ("Copied 3"); nothing is written here. */
  copied: () => void
  clear: () => void
  goToEpic: (slug: string) => Promise<boolean>
}

/** Why a copy from the footer did not land: the host could not write the clipboard. */
export const COPY_REFUSED = 'The clipboard did not take that copy. Press ⌘C in the list to copy the selected references.'
/** Why an open from the footer did not happen: the host did not open it. */
export const OPEN_REFUSED = 'Kehikot did not open that page. Open it from its row in the list.'

/**
 * A press on one of the footer's items: nothing for "taken", a sentence for
 * "not taken, and why". The page declares the footer again from its new state.
 */
export async function footerPressed(item: string, value: unknown, acts: FooterActs, carried?: 'copy' | 'open'): Promise<string | void> {
  /* The host did the act in the person's click (protocol 2.40.0); this page only says what came of it. */
  if (item === FOOTER.open) return carried === 'open' ? undefined : OPEN_REFUSED
  if (item === FOOTER.copy || item === FOOTER.copyIds) {
    if (carried !== 'copy') return COPY_REFUSED
    return void acts.copied()
  }
  if (item === FOOTER.clear) return void acts.clear()
  if (item === FOOTER.epics) {
    if (typeof value !== 'string') return 'Pick an epic to go to.'
    return (await acts.goToEpic(value)) ? undefined : `The host would not go to ${value}.`
  }
  return `Nothing in this footer is called ${item}.`
}
