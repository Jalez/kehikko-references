#!/usr/bin/env bun
import { MESSAGE, PROTOCOL } from 'roadmap-module-protocol'

/**
 * A roadmap that is not a roadmap, for looking at this app the way it is
 * actually used.
 *
 *   bun run dev/stub-host.ts                      # then open http://127.0.0.1:7821
 *   http://127.0.0.1:7821/?project=/Users/x/Projects/roadmap
 *   http://127.0.0.1:7821/?project=               # a host that named no folder
 *   http://127.0.0.1:7821/?project=/Users/x/Projects/roadmap&narrow=1
 *   http://127.0.0.1:7821/?tracker=failing      # a GitLab source whose last read failed
 *   http://127.0.0.1:7821/?tracker=empty        # a project the host reads no tracker for
 *   http://127.0.0.1:7821/?tracker=old          # a host that has never heard of tracker.get
 *
 * ## Why this exists rather than a mock in a test
 *
 * Because the things this app is careful about are things a person has to LOOK
 * at: an absence drawn as a paragraph reads as honest or reads as an error
 * message, and no assertion settles which. The tests hold the words; this holds
 * the experience of meeting them.
 *
 * ## What changed when the rows started coming from the host's shared reading
 *
 * This used to answer `live.get`, then nothing at all while the module ran its
 * own `gh`. Since issue #4 the rows are the host's shared tracker reading, so
 * this answers `tracker.get` with a canned reading — GitHub and GitLab rows
 * together, which is the point of the change — and `tracker.refresh` by moving
 * the reading's `at` and saying so in `context.tracker`, which is how the
 * module learns to ask again. `?tracker=` picks the other states worth
 * looking at. The real reading is the host's (Jalez/kehikko#25).
 *
 * Two things about the frame are worth reading before changing them:
 *
 *  - `allow-same-origin` is in the sandbox, because this module now declares
 *    `storage: true` and a real host frames it that way. Without it the page is
 *    on an opaque origin, and the module scripts load cross-origin into a page
 *    that cannot run them. That is the exact trap `vite.config.ts` has an
 *    essay about.
 *  - The selection round trip is answered, because it is the module's most
 *    valuable behaviour and the only way to see it work is to relay it back as
 *    context, which is what a real host does.
 *  - The FILTER round trip is answered too, since the day the module stopped
 *    drawing its kind and state in its own bar. The two groups it offers are
 *    drawn here as two `select`s — a real host draws them in the container
 *    header — the choice goes back in every context, and `filters.set` is
 *    answered with what this stub SETTLED on rather than with what was asked
 *    for, because that difference is what a module has to be written against. A
 *    stub that echoed the request back would hide the one mistake this half of
 *    the protocol is shaped to prevent.
 *
 *    `?pinned=1` declines every `filters.set` with a sentence, which is the only
 *    way to look at what `Clear` and a `goto` do when a host says no.
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
    <span id="filters"></span>
    <span id="refresh"></span>
  </header>
  <iframe id="frame" sandbox="allow-scripts allow-forms allow-popups allow-same-origin" src="${MODULE}"></iframe>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  var project = q.has('project') ? q.get('project') : ${JSON.stringify(DEFAULT_PROJECT)};
  var epic = q.get('epic') || 'practices-are-the-only-governor';
  var selection = [];
  /* What the module offered to be narrowed by, and what this container is
     narrowed to. A real host keeps the second per container and outlives the
     module's reload; this one keeps it for as long as the page is open, which is
     long enough to see every behaviour that depends on it. */
  var offered = [];
  var chosen = {};
  /* What the module last said about being read again, and how often this
     container reads on its own. The split is the whole shape of the feature: the
     state is the MODULE's and the interval is the CONTAINER's. A real host keeps
     the interval per placement in its database; this one keeps it for as long as
     the page is open, which is long enough to watch it fire. */
  var reading = null;
  var every = null;
  /* The host's own reading, canned: when it last changed, and what it holds. */
  var trackerMode = q.get('tracker') || 'mixed';
  var trackerAt = '2026-08-27T09:12:00Z';
  var trackerBusy = false;
  function trackerRows() {
    if (trackerMode === 'empty') return [];
    var rows = [];
    for (var n = 1; n <= 24; n += 1) {
      rows.push({
        ref: 'gh#' + n, tracker: 'github', host: 'github.com', repo: 'example/repo', number: n,
        kind: n % 5 === 0 ? 'change' : 'issue', state: n % 5 === 0 ? 'merged' : n % 4 === 0 ? 'closed' : 'open',
        stateReason: n % 4 === 0 ? 'COMPLETED' : null,
        title: 'the thing that has to become true, number ' + n,
        url: 'https://github.com/example/repo/issues/' + n, labels: ['area::db'], assignees: ['ada lovelace'],
        links: [], updatedAt: '2026-08-' + String(n % 28 + 1).padStart(2, '0') + 'T10:00:00Z', readAt: trackerAt
      });
    }
    for (var m = 1; m <= 8; m += 1) {
      var change = m % 3 === 0;
      rows.push({
        ref: (change ? '!' : '#') + (1800 + m), tracker: 'gitlab', host: 'gitlab.com', repo: 'group/project', number: 1800 + m,
        kind: change ? 'change' : 'issue', state: m % 4 === 0 ? 'closed' : 'open',
        title: 'a GitLab ' + (change ? 'merge request' : 'issue') + ', number ' + (1800 + m),
        url: 'https://gitlab.com/group/project/-/' + (change ? 'merge_requests/' : 'issues/') + (1800 + m),
        labels: [], assignees: ['grace hopper'], links: [], updatedAt: '2026-08-2' + (m % 9) + 'T12:00:00Z', readAt: trackerAt
      });
    }
    return rows;
  }
  function trackerReading() {
    var sources = trackerMode === 'empty' ? [] : [
      { tracker: 'github', host: 'github.com', repo: 'example/repo', default: true, listed: true, at: trackerAt, error: null, refreshing: false },
      { tracker: 'gitlab', host: 'gitlab.com', repo: 'group/project', default: true, listed: true,
        at: trackerMode === 'failing' ? '2026-08-20T09:00:00Z' : trackerAt,
        error: trackerMode === 'failing' ? 'gitlab.com could not be reached from this machine.' : null, refreshing: false }
    ];
    return { at: trackerAt, refreshing: trackerBusy, sources: sources, rows: trackerRows(), missing: [{ ref: '#77', reason: 'not-found' }] };
  }
  var asked = 0;
  document.getElementById('what').textContent = 'projectPath: ' + (project ? project : '(null)');
  if (q.get('narrow')) document.getElementById('frame').id = 'narrow', document.getElementById('narrow').style.height = '80vh';

  var frame = document.querySelector('iframe');

  function context() {
    return {
      epic: epic,
      project: project ? project.split('/').pop() : null,
      projectPath: project || null,
      theme: q.get('theme') === 'dark' ? 'dark' : 'light',
      selection: selection,
      filters: chosen,
      tracker: { at: trackerAt, refreshing: trackerBusy }
    };
  }

  function tell() {
    frame.contentWindow.postMessage(Object.assign({ type: '${MESSAGE.CONTEXT}', protocol: ${PROTOCOL} }, context()), '*');
  }

  /* What a host keeps, which is deliberately not what it was asked for: a group
     the module is not offering is dropped, and a group sitting on its resting
     option is not written down at all. The module reads the answer rather than
     assuming it got what it asked for, and it can only be seen to do that
     against a host that actually behaves this way. */
  function settle(asked) {
    var kept = {};
    offered.forEach(function (group) {
      var want = asked[group.id];
      var known = group.options.some(function (option) { return option.id === want; });
      if (group.kind === 'text') {
        /* No options to reconcile against and no fallback to fall to: empty is
           how a typed group says it is at rest, and anything else is kept
           whatever the module now offers. A stored query is right there in the
           input to be edited, where a stored option id in no menu would be
           unreachable. */
        if (typeof want === 'string' && want !== '') kept[group.id] = want.slice(0, 200);
        return;
      }
      if (known && want !== group.fallback) kept[group.id] = want;
    });
    return kept;
  }

  /* The control a real host draws in the container's header. Rebuilt whenever the
     module re-announces, which it does whenever its counts change. */
  /* The control a real host draws in the container's header, and the sentence
     it draws is formatted from the module's own 'at' — never from when this
     stub last asked. See the essay on MESSAGE.REFRESHABLE. */
  function drawRefresh() {
    var box = document.getElementById('refresh');
    box.textContent = '';
    if (!reading || !reading.can) return;

    var now = document.createElement('button');
    now.textContent = reading.busy ? 'reading…' : 'refresh now';
    now.disabled = !!reading.busy;
    now.addEventListener('click', function () { ask(); });
    box.appendChild(now);

    var when = document.createElement('span');
    when.style.marginLeft = '6px';
    when.textContent = reading.at ? 'last read ' + reading.at : 'has not said when it last read';
    box.appendChild(when);

    var on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = every !== null;
    on.style.marginLeft = '8px';
    on.addEventListener('change', function () { every = on.checked ? 1 : null; drawRefresh(); });
    box.appendChild(on);

    var mins = document.createElement('input');
    mins.type = 'number';
    mins.min = '1';
    mins.value = String(every === null ? 1 : every);
    mins.style.width = '48px';
    mins.disabled = every === null;
    mins.addEventListener('change', function () { if (every !== null) every = Math.max(1, Number(mins.value) || 1); });
    box.appendChild(mins);

    var label = document.createElement('span');
    label.textContent = ' min';
    box.appendChild(label);
  }

  function ask() {
    asked = Date.now();
    frame.contentWindow.postMessage({ type: '${MESSAGE.REFRESH}', protocol: ${PROTOCOL} }, '*');
  }

  /* One ticker rather than a timer per setting, and it counts from when this
     host last ASKED rather than from the module's own 'at' — a module whose
     reads keep failing would otherwise be asked on every tick forever. Ten
     seconds here against thirty in the real host, because this exists to be
     watched. */
  setInterval(function () {
    if (every === null || !reading || !reading.can || reading.busy) return;
    if (Date.now() - asked < every * 60000) return;
    ask();
  }, 10000);

  function drawFilters() {
    var box = document.getElementById('filters');
    box.textContent = '';
    offered.forEach(function (group) {
      var select = document.createElement('select');
      select.title = group.label;
      if (group.kind === 'text') return;
      if (group.kind === 'text') {
        /* One input, inside the menu the filter control already opens. The
           argument for why that is allowable here and was refused in a header
           STRIP is on LIMITS.FILTER_TEXT in the protocol. Reported on change
           rather than per keystroke, which is the crudest version of what the
           real host debounces. */
        var typed = document.createElement('input');
        typed.type = 'search';
        typed.placeholder = group.label;
        typed.title = group.label;
        typed.value = chosen[group.id] || '';
        typed.addEventListener('change', function () {
          var asking = Object.assign({}, chosen);
          asking[group.id] = typed.value;
          chosen = settle(asking);
          drawFilters();
          tell();
        });
        box.appendChild(typed);
        return;
      }
      group.options.forEach(function (option) {
        var item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.label;
        if ((chosen[group.id] || group.fallback) === option.id) item.selected = true;
        select.appendChild(item);
      });
      select.addEventListener('change', function () {
        var asked = Object.assign({}, chosen);
        asked[group.id] = select.value;
        chosen = settle(asked);
        drawFilters();
        tell();
      });
      box.appendChild(select);
    });
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

    /* Fire and forget on the module's side, so there is nothing to answer — the
       whole reply is the control appearing, and the choice coming back in the
       next context. */
    if (d.type === '${MESSAGE.REFRESHABLE}') {
      /* Fire and forget, like the two offers. Nothing is answered and nothing
         is checked: 'at' is the module's statement about its own data, and a
         host that second-guessed it would be inventing the one fact it cannot
         have. */
      reading = { can: d.can !== false, at: d.at === undefined ? null : d.at, busy: !!d.busy };
      if (asked === 0) asked = Date.now();
      drawRefresh();
      return;
    }

    if (d.type === '${MESSAGE.FILTERS}') {
      offered = d.groups || [];
      chosen = settle(chosen);
      drawFilters();
      return;
    }

    if (d.type !== '${MESSAGE.REQUEST}') return;

    if (d.method === 'tracker.get' || d.method === 'tracker.refresh') {
      if (trackerMode === 'old') {
        frame.contentWindow.postMessage({
          type: '${MESSAGE.RESPONSE}', id: d.id, ok: false, reason: 'unknown-method', error: 'no such method: ' + d.method
        }, '*');
        return;
      }
      if (d.method === 'tracker.get') {
        frame.contentWindow.postMessage({ type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: trackerReading() }, '*');
        return;
      }
      /* A read that takes a moment, announced to everybody through the
         context the way a real host does, and answered when it lands. */
      trackerBusy = true;
      tell();
      setTimeout(function () {
        trackerBusy = false;
        trackerAt = new Date().toISOString();
        var failing = trackerMode === 'failing';
        frame.contentWindow.postMessage({
          type: '${MESSAGE.RESPONSE}', id: d.id, ok: true,
          data: { outcome: failing ? 'failed' : 'read', at: trackerAt, why: failing ? 'gitlab.com could not be reached from this machine.' : '' }
        }, '*');
        tell();
      }, 1200);
      return;
    }

    if (d.method === 'filters.set') {
      /* The three grounds a real host has for declining are all about a
         container this stub does not have — pinned, or on a kehikko nobody is
         looking at — so there is one switch for all of them, and it exists
         because a refusal is a state the module draws a sentence for. */
      if (q.get('pinned')) {
        frame.contentWindow.postMessage({
          type: '${MESSAGE.RESPONSE}', id: d.id, ok: false, reason: 'failed',
          error: 'roadmap.references is pinned, so it would not be told about the change it is asking for.'
        }, '*');
        return;
      }
      chosen = settle((d.params && d.params.filters) || {});
      drawFilters();
      frame.contentWindow.postMessage({ type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: { filters: chosen } }, '*');
      tell();
      return;
    }

    /* The selection is relayed back as context rather than merely acknowledged,
       because that round trip IS the behaviour: the module draws the selection
       the host stated and never the one it asked for. A stub that answered ok
       and sent nothing would make a correct module look broken. */
    if (d.method === 'selection.set') {
      selection = (d.params && d.params.refs) || [];
      document.getElementById('picked').textContent = 'selection: ' + JSON.stringify(selection);
      frame.contentWindow.postMessage({ type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: null }, '*');
      tell();
      return;
    }
    if (d.method === 'state.set') {
      sessionStorage.setItem('stub-kept', (d.params && d.params.state) || '');
      frame.contentWindow.postMessage({ type: '${MESSAGE.RESPONSE}', id: d.id, ok: true, data: null }, '*');
      return;
    }
    frame.contentWindow.postMessage({
      type: '${MESSAGE.RESPONSE}', id: d.id, ok: false, reason: 'unknown-method',
      error: 'this stub answers tracker.get, tracker.refresh, selection.set, filters.set and state.set, which is all this module asks for'
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
