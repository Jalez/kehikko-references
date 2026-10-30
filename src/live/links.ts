import { isWebAddress, type AddressOpenResult } from 'kehikot-module-protocol'

/**
 * A link out of this module, handed to the canvas instead of a new tab
 * (protocol 2.16.0, `address.open`).
 *
 * When the host answers `address.open`, a press on a link sends its address to
 * the canvas: a module there that shows pages (the Browser) opens it, and with
 * none the host asks the person whether to open it in their browser or add one.
 * Either way this page does nothing more. With an older host, or an address the
 * protocol would not take, the link does what it always did: a new tab.
 */

/** Whether a press on a link to `url` is handed to the canvas rather than followed. */
export function handsLink(url: string | null | undefined, canHand: boolean): url is string {
  return canHand && isWebAddress(url)
}

/**
 * Whether the page should still follow the link itself, after handing it over:
 * when nothing answered (`null`) or the host declined. `shown` and `offered`
 * both mean the canvas has it.
 */
export function stillFollow(answer: AddressOpenResult | null): boolean {
  return answer === null || answer.outcome === 'declined'
}

/** The click handler a link carries: hands the address over, and falls back to a new tab. */
export function handLink(
  url: string,
  open: (url: string) => Promise<AddressOpenResult | null>,
  fallback: (url: string) => void = (to) => void window.open(to, '_blank', 'noopener,noreferrer'),
): Promise<void> {
  return open(url).then((answer) => {
    if (stillFollow(answer)) fallback(url)
  })
}

/**
 * Open `url` in the person's own browser, never in a module that shows pages.
 *
 * This is a request for a new window and nothing more, and that is the whole
 * mechanism: in a browser tab it is a new tab, and in the desktop app the shell
 * answers every new-window request from a framed page by handing a web address to
 * the operating system's opener, the default browser (kehikko-desktop
 * `src-tauri/src/links.rs`). No hand-over to the canvas (`address.open`) is made,
 * so no Browser on the kehikko takes it. Only an `https:` address, or `http:` to
 * this machine (`isWebAddress`), is opened; anything else returns false.
 */
export function openOutside(
  url: string | null | undefined,
  open: (url: string) => unknown = (to) => window.open(to, '_blank', 'noopener,noreferrer'),
): boolean {
  if (!isWebAddress(url)) return false
  open(url)
  return true
}
