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
 * A row in a stack takes its stack along (`live/stack.ts`): after the rows, each
 * stack they are in once, bottom first, as references only (the titles are in
 * the list above, once). A line of changes is one line (`!21 → !22 → !23`); a
 * forked stack is a tree, in a code block in the Markdown and `<pre>` in the
 * html, so the fork survives the paste. A member that was not copied says
 * `(not selected)`; nothing else is marked.
 */

import type { StackPlace } from './markers.ts'
import { stackHeading, stackLines, stacksOf } from './stack.ts'

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

/** One stack's block in the two formats: the heading, then its references only, a tree in a code block for a fork. */
function stackBlock(place: StackPlace, copied: readonly string[], urls: ReadonlyMap<string, string | null>): Payload {
  const heading = stackHeading(place)
  const plainLines = stackLines(place, copied)
  const link = (ref: string) => {
    const url = urls.get(ref)
    return url ? `<a href="${escapeHtml(url)}">${escapeHtml(ref)}</a>` : escapeHtml(ref)
  }
  /* Each ref is fenced by NULs: the odd pieces are refs (linked), the even ones text. */
  const htmlLines = stackLines(place, copied, (ref) => `\u0000${ref}\u0000`).map((line) =>
    line.split('\u0000').map((piece, i) => (i % 2 ? link(piece) : escapeHtml(piece))).join(''),
  )
  if (place.forked) {
    return {
      plain: `${heading}\n\`\`\`text\n${plainLines.join('\n')}\n\`\`\``,
      html: `<p>${escapeHtml(heading)}</p><pre>${htmlLines.join('\n')}</pre>`,
    }
  }
  return { plain: `${heading}\n${plainLines.join('\n')}`, html: `<p>${escapeHtml(heading)}</p><p>${htmlLines.join('')}</p>` }
}

/** Several rows (or one), one line each with its title, in the same two formats, and then each stack they are in, as references. */
export function payloadOfAll(rows: Copyable[]): Payload {
  const each = rows.map(payloadOf)
  let html = each.map((p) => `<div>${p.html}</div>`).join('')
  let plain = each.map((p) => p.plain).join('\n')
  const urls = new Map(rows.map((row) => [row.ref, row.url]))
  for (const { place, copied } of stacksOf(rows)) {
    const block = stackBlock(place, copied, urls)
    plain += `\n\n${block.plain}`
    html += block.html
  }
  return { html, plain }
}

/**
 * Just the references, space-separated (`!4019 !4039 #3911`), for a prompt or a
 * commit message, and then the stacks they are in as references only, in the
 * shape the linked copy gives them. The same text in both formats, so a rich
 * paste gets no markup.
 */
export function idsOfAll(rows: Copyable[]): Payload {
  let plain = rows.map((row) => row.ref).join(' ')
  for (const { place, copied } of stacksOf(rows)) {
    const lines = stackLines(place, copied)
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
