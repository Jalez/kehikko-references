#!/usr/bin/env bun
import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'

/**
 * A roadmap that is not a roadmap, for looking at this app the way it is
 * actually used.
 *
 *   bun run dev/stub-host.ts                      # then open http://127.0.0.1:7821
 *   http://127.0.0.1:7821/?project=/Users/x/Projects/roadmap
 *   http://127.0.0.1:7821/?project=               # a host that named no folder
 *   http://127.0.0.1:7821/?project=/tmp/not-a-repo
 *   http://127.0.0.1:7821/?project=/Users/x/Projects/roadmap&narrow=1
 *
 * ## Why this exists rather than a mock in a test
 *
 * Because the things this app is careful about are things a person has to LOOK
 * at: an absence drawn as a paragraph reads as honest or reads as an error
 * message, and no assertion settles which. The tests hold the words; this holds
 * the experience of meeting them.
 *
 * ## What changed when the rows started coming from GitHub
 *
 * This used to answer `live.get` and had a `?answer=` switch for every way a
 * host could disappoint. It answers nothing now, because the module asks it
 * nothing: the rows come from the module's own door, and the only thing a host
 * contributes is `projectPath`. So the switch is a PATH, and every state this
 * app can be in is reachable by naming a different folder on this machine —
 * a real checkout, a folder with no `.git`, one that does not exist, a
 * repository with no remote. Which is a better harness than the old one, because
 * what it exercises is the real code path rather than a canned reply.
 *
 * Two things about the frame are worth reading before changing them:
 *
 *  - `allow-same-origin` is in the sandbox, because this module now declares
 *    `storage: true` and a real host frames it that way. Without it the page is
 *    on an opaque origin, its fetch to its own `/api/references` is
 *    cross-origin, and the list is empty for a reason nothing on screen
 *    explains. That is the exact trap `vite.config.ts` has an essay about.
 *  - The selection round trip is answered, because it is the module's most
 *    valuable behaviour and the only way to see it work is to relay it back as
 *    context, which is what a real host does.
 *
 * It is not shipped to anybody and nothing in `src/` knows it exists.
 */

const PORT = Number(process.env.STUB_PORT ?? 7821)
const MODULE = process.env.MODULE_URL ?? 'http://127.0.0.1:7820/'
const DEFAULT_PROJECT = process.env.STUB_PROJECT ?? process.cwd()

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>a stub roadmap</title>
<style>
  body { font: 13px system-ui; margin: 0; background: #fafafa; color: #111 }
  header { padding: 8px 12px; border-bottom: 1px solid #ddd; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap }
  a { color: #06c }
  #frame { display: block; width: 100%; height: 80vh; border: 0; border-top: 1px solid #ddd }
  #narrow { width: 320px; border-right: 1px solid #ddd }
  code { background: #eee; padding: 1px 4px }
</style></head>
<body>
  <header>
    <strong>stub roadmap</strong>
    <span id="what"></span>
    <button id="walk">goto gh#7</button>
    <span id="picked"></span>
  </header>
  <iframe id="frame" sandbox="allow-scripts allow-forms allow-popups allow-same-origin" src="${MODULE}"></iframe>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var project = q.has('project') ? q.get('project') : ${JSON.stringify(DEFAULT_PROJECT)};
  var epic = q.get('epic') || 'practices-are-the-only-governor';
  var selection = [];
  document.getElementById('what').textContent = 'projectPath: ' + (project ? project : '(null)');
  if (q.get('narrow')) document.getElementById('frame').id = 'narrow', document.getElementById('narrow').style.height = '80vh';

  var frame = document.querySelector('iframe');

  function context() {
    return {
      epic: epic,
      project: project ? project.split('/').pop() : null,
      projectPath: project || null,
      theme: q.get('theme') === 'dark' ? 'dark' : 'light',
      selection: selection
    };
  }

  frame.addEventListener('load', function () {
    frame.contentWindow.postMessage({
      type: '${MESSAGE.HELLO}',
      protocol: ${PROTOCOL},
      session: 'stub-1',
      context: context(),
      /* Kept across reloads, because that is the whole of what state:keep
         promises and a stub that answered ok and then forgot would make a
         working module look broken on the one path a person checks by hand. A
         real host keeps this per module; sessionStorage is this one's. */
      state: sessionStorage.getItem('stub-kept')
    }, '*');
  });

  addEventListener('message', function (ev) {
    if (ev.source !== frame.contentWindow) return;
    var d = ev.data;
    if (!d || typeof d.type !== 'string') return;
    console.log('module said', d);
    if (d.type !== '${MESSAGE.REQUEST}') return;

    /* The selection is relayed back as context rather than merely acknowledged,
       because that round trip IS the behaviour: the module draws the selection
       the host stated and never the one it asked for. A stub that answered ok
       and sent nothing would make a correct module look broken. */
    if (d.method === 'selection.set') {
      selection = (d.params && d.params.refs) || [];
      document.getElementById('picked').textContent = 'selection: ' + JSON.stringify(selection);
      frame.contentWindow.postMessage({ type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: null }, '*');
      frame.contentWindow.postMessage(Object.assign({ type: '${MESSAGE.CONTEXT}', protocol: ${PROTOCOL} }, context()), '*');
      return;
    }
    if (d.method === 'state.set') {
      sessionStorage.setItem('stub-kept', (d.params && d.params.state) || '');
      frame.contentWindow.postMessage({ type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: null }, '*');
      return;
    }
    frame.contentWindow.postMessage({
      type: '${MESSAGE.RESPONSE}', id: d.id, ok: false, reason: 'unknown-method',
      error: 'this stub answers selection.set and state.set, which is all this module asks for'
    }, '*');
  });

  document.getElementById('walk').addEventListener('click', function () {
    frame.contentWindow.postMessage({ type: '${MESSAGE.GOTO}', id: 'walk-1', ref: 'gh#7' }, '*');
  });
})();
</script></body></html>`

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: () => new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
})

console.log(`stub roadmap: http://127.0.0.1:${PORT}  (framing ${MODULE})`)
