/**
 * What a row puts on the clipboard: its reference as the forge spells it
 * (`!4013`, `#187`; whatever the row already shows), linked to its web `url`,
 * and its title.
 *
 * Two formats in one write:
 *
 * - `text/html`: `<a href="URL">!4013</a> title`. Pasted into Slack, Teams, a
 *   document or a mail, the reference is a link and the title is text.
 * - `text/plain`: Markdown, `[!4013](URL) title`. GitHub, GitLab and a terminal
 *   take plain text, and Markdown is the plain text all of them render as a link.
 *
 * A row with no `url` is never given one (see `reference.ts`): its reference is
 * then plain in both formats.
 *
 * A row in a stack takes its stack along only when asked (`stack: true`; "with
 * stack" in the menus and the footer, off until the person turns it on, and
 * always on for a copy of the related references). Then the stack IS where its
 * rows are copied: at the first of them, the whole stack drawn as a tree, one
 * line per change, bottom first, each change under the one it is built on with
 * the `├─ `/`└─ `/`│  ` glyphs `tree` draws, then its link and title. Every
 * member is drawn the same way, copied or not, and linked whenever the reading
 * holds its `url` (`urls`): a reader of the paste wants to open any of them.
 *
 * A drawn tree, not a nested list: a pasted nested list loses its indentation
 * in most places, and with it the tree. The lines survive a paste as lines:
 *
 * - Markdown ends each line but the last with two spaces, the hard break
 *   GitHub, GitLab and every CommonMark reader take, and spells the prefix's
 *   spaces as no-break spaces, which nothing strips from the start of a line.
 *   No code block: the links stay links.
 * - HTML is one `<div>` per line, the prefix kept with `white-space:pre` and,
 *   for the places that drop styles (Slack, mail), `&nbsp;`.
 */

import type { StackPlace } from './markers.ts'
import { stackHeading, stackLines, stacksOf, stackTree } from './stack.ts'

export interface Copyable {
  ref: string
  title: string
  url: string | null
  /** Where it sits in a stack, when it does: copied along with it. */
  stack?: StackPlace
}

export interface Payload {
  html: string
  plain: string
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Markdown link text and the title keep their characters; only `[`, `]` and `\` in the ref could break the link. */
function markdownRef(ref: string): string {
  return ref.replace(/([\\[\]])/g, '\\$1')
}

function destination(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20')
}

export function payloadOf(row: Copyable): Payload {
  const title = row.title.replace(/\s+/g, ' ').trim()
  const html = row.url
    ? `<a href="${escapeHtml(row.url)}">${escapeHtml(row.ref)}</a>`
    : escapeHtml(row.ref)
  const plain = row.url ? `[${markdownRef(row.ref)}](${destination(row.url)})` : row.ref
  return {
    html: title ? `${html} ${escapeHtml(title)}` : html,
    plain: title ? `${plain} ${title}` : plain,
  }
}

/**
 * What a copy takes along. `whole`: a copy of an item's related references,
 * which carries its whole stack on purpose, whatever the choice.
 */
export interface CopyOptions {
  whole?: boolean
  /** Take the stacks the rows are in along. Off by default: a copy is the rows and nothing else. */
  stack?: boolean
  /**
   * Every row of the reading's web URL, by ref (`urlsOf`): a stack member that was
   * not copied is linked from here. One the reading has no URL for stays plain.
   */
  urls?: ReadonlyMap<string, string>
}

/** The ref → URL lookup a copy links its stack members from: every row of the reading that has one. */
export function urlsOf(rows: Iterable<{ ref: string; url: string | null }>): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of rows) if (row.url) out.set(row.ref, row.url)
  return out
}

/** The stacks the rows are in, each once. */
function stacksCopied(rows: Copyable[], options: CopyOptions): StackPlace[] {
  if (!options.stack && !options.whole) return []
  return stacksOf(rows).map(({ place }) => place)
}

/** What a copied stack is headed with: how many changes, and whether it forks. */
export function mergedHeading(place: StackPlace): string {
  return `${place.forked ? 'Forked stack' : 'Stack'} of ${place.members.length}:`
}

/** The hard break that ends a Markdown line: two spaces, which GitHub, GitLab and CommonMark all take. */
export const HARD_BREAK = '  '

/** A tree prefix whose spaces nothing strips or collapses: no-break spaces. */
function keptPrefix(prefix: string): string {
  return prefix.replace(/ /g, '\u00a0')
}

/**
 * One stack as a drawn tree in the two formats: its heading, then a line per
 * member — the tree prefix, the ref linked when a URL is known, the title.
 */
function mergedStack(place: StackPlace, byRef: ReadonlyMap<string, Copyable>, urls: ReadonlyMap<string, string> | undefined): Payload {
  const top = Math.min(...place.members.map((m) => m.depth))
  const lines = stackTree(place.members.map((m) => ({ ...m, depth: m.depth - top })))
  const plain: string[] = [mergedHeading(place)]
  let html = `<p>${escapeHtml(mergedHeading(place))}</p>`
  for (const line of lines) {
    const row = byRef.get(line.ref)
    const said = payloadOf({ ref: line.ref, title: row?.title ?? line.title, url: row?.url ?? urls?.get(line.ref) ?? null })
    const prefix = keptPrefix(line.prefix)
    plain.push(`${prefix}${said.plain}`)
    const drawn = prefix ? `<span style="white-space:pre;font-family:monospace">${escapeHtml(prefix).replace(/\u00a0/g, '&nbsp;')}</span>` : ''
    html += `<div>${drawn}${said.html}</div>`
  }
  return { plain: plain.join(`${HARD_BREAK}\n`), html }
}

/**
 * Several rows (or one), one line each with its title, in the same two formats. With their stacks,
 * a stacked row is copied inside its stack, which stands where the first of its rows would.
 */
export function payloadOfAll(rows: Copyable[], options: CopyOptions = {}): Payload {
  const stacks = stacksCopied(rows, options)
  if (!stacks.length) {
    const each = rows.map(payloadOf)
    return { html: each.map((p) => `<div>${p.html}</div>`).join(''), plain: each.map((p) => p.plain).join('\n') }
  }
  const byRef = new Map(rows.map((row) => [row.ref, row]))
  const stackOf = new Map<string, StackPlace>()
  for (const one of stacks) for (const m of one.members) stackOf.set(m.ref, one)
  const plain: string[] = []
  let html = ''
  const done = new Set<StackPlace>()
  for (const row of rows) {
    const one = stackOf.get(row.ref)
    if (!one) {
      const said = payloadOf(row)
      plain.push(said.plain)
      html += `<div>${said.html}</div>`
      continue
    }
    if (done.has(one)) continue
    done.add(one)
    const block = mergedStack(one, byRef, options.urls)
    /* A blank line before and after a stack, so Markdown keeps it apart from the lines around it. */
    plain.push(`${plain.length ? '\n' : ''}${block.plain}\n`)
    html += block.html
  }
  return { html, plain: plain.join('\n').replace(/\n{3,}/g, '\n\n').trim() }
}

/**
 * Just the references, space-separated (`!4019 !4039 #3911`), for a prompt or a
 * commit message, and then the stacks they are in as references only, in the
 * shape the linked copy gives them. The same text in both formats, so a rich
 * paste gets no markup.
 */
export function idsOfAll(rows: Copyable[], options: CopyOptions = {}): Payload {
  let plain = rows.map((row) => row.ref).join(' ')
  for (const place of stacksCopied(rows, options)) {
    const lines = stackLines(place)
    plain += place.forked ? `\n\n${stackHeading(place)}\n${lines.join('\n')}` : `\n\n${stackHeading(place)} ${lines[0]}`
  }
  return { html: plain.includes('\n') ? `<pre>${escapeHtml(plain)}</pre>` : escapeHtml(plain), plain }
}

/** What a copy took: how many references, and how many stacks came along. */
export interface Copied {
  count: number
  stacks: number
  /** The plain text that went on the clipboard, for saying what was copied. */
  plain: string
}

/** What was copied, as the bar and the footer say it: `Copied 3`, `Copied 2 + stack`, `Copied 4 + 2 stacks`. */
export function copiedSaid(copied: Pick<Copied, 'count' | 'stacks'>): string {
  if (copied.stacks === 0) return `Copied ${copied.count}`
  return `Copied ${copied.count} + ${copied.stacks === 1 ? 'stack' : `${copied.stacks} stacks`}`
}

/**
 * The selected rows in the order they are listed on screen, each ref once.
 *
 * The selection is the host's and is in the order somebody picked things in, and
 * may name refs this list is not drawing (narrowed away, or picked in another
 * container); a copy is of what the person can see, top to bottom.
 */
export function selectedInOrder<Row extends Copyable>(shown: readonly Row[], selection: readonly string[]): Row[] {
  const picked = new Set(selection)
  const seen = new Set<string>()
  return shown.filter((row) => {
    if (!picked.has(row.ref) || seen.has(row.ref)) return false
    seen.add(row.ref)
    return true
  })
}

/**
 * Both formats in one write; `writeText(plain)` when `ClipboardItem` is missing
 * or the write is refused (a frame without `clipboard-write` refuses both, and
 * then this says so by returning false).
 */
export async function copyPayload(payload: Payload): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard
  if (!clipboard) return false
  const Item = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
  if (Item && typeof clipboard.write === 'function') {
    try {
      await clipboard.write([
        new Item({
          'text/html': new Blob([payload.html], { type: 'text/html' }),
          'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
        }),
      ])
      return true
    } catch {
      /* fall through to plain text */
    }
  }
  try {
    await clipboard.writeText(payload.plain)
    return true
  } catch {
    return false
  }
}
