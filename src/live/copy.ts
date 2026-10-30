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
 */

export interface Copyable {
  ref: string
  title: string
  url: string | null
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

/** Several rows, one line each, in the same two formats. */
export function payloadOfAll(rows: Copyable[]): Payload {
  const each = rows.map(payloadOf)
  return {
    html: each.map((p) => `<div>${p.html}</div>`).join(''),
    plain: each.map((p) => p.plain).join('\n'),
  }
}

/**
 * Just the references, space-separated (`!4019 !4039 #3911`), for a prompt or a
 * commit message. The same text in both formats, so a rich paste gets no markup.
 */
export function idsOfAll(rows: Copyable[]): Payload {
  const plain = rows.map((row) => row.ref).join(' ')
  return { html: escapeHtml(plain), plain }
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
