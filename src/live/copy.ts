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
 * stack they are in once, bottom first, the copied changes marked. A line of
 * changes is a numbered list; a forked stack is a tree, in a code block in the
 * Markdown and `<pre>` in the html, so the fork survives the paste.
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

/** Several rows (or one), one line each, in the same two formats, and then the stacks they are in. */
export function payloadOfAll(rows: Copyable[]): Payload {
  const each = rows.map(payloadOf)
  let html = each.map((p) => `<div>${p.html}</div>`).join('')
  let plain = each.map((p) => p.plain).join('\n')
  for (const { place, copied } of stacksOf(rows)) {
    const heading = stackHeading(place, copied)
    const lines = stackLines(place, copied, true)
    if (place.forked) {
      plain += `\n\n${heading}\n\`\`\`text\n${lines.join('\n')}\n\`\`\``
      html += `<p>${escapeHtml(heading)}</p><pre>${escapeHtml(lines.join('\n'))}</pre>`
    } else {
      plain += `\n\n${heading}\n${lines.join('\n')}`
      html += `<p>${escapeHtml(heading)}</p><ol>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`
    }
  }
  return { html, plain }
}

/**
 * Just the references, space-separated (`!4019 !4039 #3911`), for a prompt or a
 * commit message, and then the stacks they are in as references only: a line of
 * changes on one line (`#12 → #13 → #15`), a forked stack as a tree. The same
 * text in both formats, so a rich paste gets no markup.
 */
export function idsOfAll(rows: Copyable[]): Payload {
  let plain = rows.map((row) => row.ref).join(' ')
  for (const { place, copied } of stacksOf(rows)) {
    const heading = stackHeading(place, copied)
    plain += place.forked
      ? `\n\n${heading}\n${stackLines(place, [], false).join('\n')}`
      : `\n\n${heading} ${place.members.map((m) => m.ref).join(' → ')}`
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
