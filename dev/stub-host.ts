#!/usr/bin/env bun
import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'

/**
 * A roadmap that is not a roadmap, for looking at this app the way it is
 * actually used.
 *
 *   bun run dev/stub-host.ts                  # then open http://127.0.0.1:7821
 *   http://127.0.0.1:7821/?answer=null        # an epic nobody has refreshed
 *   http://127.0.0.1:7821/?answer=empty       # a reading with nothing in it
 *   http://127.0.0.1:7821/?answer=refuse      # a host that says no
 *   http://127.0.0.1:7821/?answer=silent      # a host that says nothing at all
 *   http://127.0.0.1:7821/?answer=full&rows=400
 *
 * ## Why this exists rather than a mock in a test
 *
 * Because the five things this app is careful about are five things a person
 * has to LOOK at: an absence drawn as a paragraph reads as honest or reads as
 * an error message, and no assertion settles which. The tests hold the words;
 * this holds the experience of meeting them.
 *
 * It is deliberately a bad host, too. It greets from a page on a real origin
 * with the frame sandboxed to an opaque one, which is the awkward asymmetry the
 * bridge is written against, and its `?answer=` switch exists so that every
 * refusal path can be seen rather than reasoned about.
 *
 * It is not shipped to anybody and nothing in `src/` knows it exists.
 */

const PORT = Number(process.env.STUB_PORT ?? 7821)
const MODULE = process.env.MODULE_URL ?? 'http://127.0.0.1:7820/'

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>a stub roadmap</title>
<style>
  body { font: 13px system-ui; margin: 0; background: #fafafa; color: #111 }
  header { padding: 8px 12px; border-bottom: 1px solid #ddd; display: flex; gap: 12px; align-items: baseline }
  a { color: #06c }
  #frame { display: block; width: 100%; height: 80vh; border: 0; border-top: 1px solid #ddd }
  #narrow { width: 320px; border-right: 1px solid #ddd }
</style></head>
<body>
  <header>
    <strong>stub roadmap</strong>
    <span id="what"></span>
    <a href="?answer=full&rows=400">400 rows</a>
    <a href="?answer=full&rows=3">3 rows</a>
    <a href="?answer=empty">empty reading</a>
    <a href="?answer=null">never refreshed</a>
    <a href="?answer=refuse">refused</a>
    <a href="?answer=silent">silent</a>
    <a href="?answer=full&rows=60&narrow=1">narrow column</a>
    <button id="walk">goto gh#7</button>
  </header>
  <iframe id="frame" sandbox="allow-scripts" src="${MODULE}"></iframe>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var answer = q.get('answer') || 'full';
  var rows = Number(q.get('rows') || 400);
  var epic = q.get('epic') || 'practices-are-the-only-governor';
  document.getElementById('what').textContent = 'answering live.get with: ' + answer;
  if (q.get('narrow')) document.getElementById('frame').id = 'narrow', document.getElementById('narrow').style.height = '80vh';

  function reading(n) {
    var ghIssues = {}, ghPrs = {}, i;
    for (i = 1; i <= n; i++) {
      var bag = i % 3 === 0 ? ghPrs : ghIssues;
      bag['gh#' + i] = {
        state: i % 7 === 0 ? 'closed' : i % 5 === 0 ? 'merged' : 'opened',
        draft: i % 11 === 0,
        title: 'the thing that has to become true, number ' + i,
        at: '2026-08-' + String((i % 28) + 1).padStart(2, '0') + 'T10:00:00Z',
        url: 'https://github.com/example/repo/issues/' + i,
        labels: i % 2 ? ['area::db'] : ['type::bug', 'importance::P1'],
        assignees: i % 4 ? ['ada lovelace'] : [],
        author: i % 3 === 0 ? 'grace hopper' : undefined
      };
    }
    /* One deliberately damaged entry, because the row for it is a thing worth
       seeing rather than a thing to take on trust. */
    ghIssues['gh#' + (n + 1)] = null;
    return { generated: '2026-08-27T09:12:00Z', issues: {}, mrs: {}, ghIssues: ghIssues, ghPrs: ghPrs, links: {}, blockers: {} };
  }

  var frame = document.querySelector('iframe');
  frame.addEventListener('load', function () {
    frame.contentWindow.postMessage({
      type: '${MESSAGE.HELLO}',
      protocol: ${PROTOCOL},
      session: 'stub-1',
      context: { epic: epic, project: 'example', theme: 'light' }
    }, '*');
  });

  addEventListener('message', function (ev) {
    if (ev.source !== frame.contentWindow) return;
    var d = ev.data;
    if (!d || typeof d.type !== 'string') return;
    console.log('module said', d);
    if (d.type !== '${MESSAGE.REQUEST}') return;
    if (answer === 'silent') return;
    var reply = { type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: null };
    if (d.method === 'epics.list') reply.data = [{ epic: epic, title: 'Practices are the only governor' }];
    else if (d.method === 'live.get') {
      if (answer === 'refuse') reply = { type: '${MESSAGE.RESPONSE}', id: d.id, ok: false, reason: 'failed', error: 'the state directory could not be read' };
      else if (answer === 'null') reply.data = null;
      else if (answer === 'empty') reply.data = { generated: '2026-08-27T09:12:00Z', issues: {}, mrs: {}, ghIssues: {}, ghPrs: {}, links: {}, blockers: {} };
      else reply.data = reading(rows);
    } else reply = { type: '${MESSAGE.RESPONSE}', id: d.id, ok: false, reason: 'unknown-method', error: 'this stub answers epics.list and live.get' };
    frame.contentWindow.postMessage(reply, '*');
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
