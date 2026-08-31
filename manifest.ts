import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'roadmap-module-protocol'

/**
 * What this app says about itself when a roadmap asks.
 *
 * The manifest is the smaller half of this program and the only half a roadmap
 * ever reads before deciding whether to frame it. Read it as a description of
 * the ENRICHMENT rather than of the app: it says which tab to give the page,
 * and which questions the app would like to ask if there is anybody there to
 * ask.
 *
 * ## What changed, and what a reader of the old manifest should know
 *
 * This file used to declare four capabilities and the data came through one of
 * them. Every row was an answer to `live.get` — the roadmap app's cached reading
 * of the trackers, refreshed by somebody remembering to run a refresher — so the
 * list was as current as the last time a person thought about it. The owner
 * asked the obvious question:
 *
 * > Issues/MRs can be gotten from the project's own GitHub, no? Doesn't need
 * > separate maintenance.
 *
 * They can. `roadmap.context.projectPath` has carried an absolute project folder
 * since protocol 0.8, and this app's own server now runs `gh issue list` and
 * `gh pr list` in it. So two declarations came out and one went in, and each of
 * those three is a decision worth its paragraph.
 *
 * ## Two capabilities, and the two that left
 *
 * - `selection:set`, which is the one write on this list and is a shared one.
 *   The protocol spells it out and the wording matters: "every module on the
 *   canvas is told". Picking a row here changes what the reader's other panes
 *   are looking at, and that is the point rather than a side effect — the
 *   argument is in `contextSchema`, and it is why the selection travels as
 *   context instead of as a message from this app to a named neighbour. It is
 *   declared because somebody deciding whether to run this program should read
 *   that sentence before they do, not because declaring it grants anything.
 *   Nothing about it changed with the data source, deliberately: a ref is still
 *   the string `gh#105`, spelled in one function in `tracker/gh.ts`, and other
 *   modules go on recognising it.
 * - `state:keep`, which is how the filter and the order survive a reload. The
 *   host keeps one opaque string for this module and never reads it — the
 *   sentence in the protocol is "the roadmap does not read it", and the format
 *   lives entirely in `src/live/keep.ts`. It survives this rewrite untouched,
 *   because what a person filtered for is a fact about them rather than about
 *   where the rows came from.
 *
 * `live:read` came out because nothing calls it any more. There is no
 * `live.get` anywhere in this program: the rows come from a subprocess this
 * app's own server runs. Leaving the declaration in would be this module telling
 * every person who reads its manifest that it intends to ask a question it will
 * never ask — permission described to a program that will never exercise it —
 * and Paper removed `epics:read` for exactly that reason.
 *
 * `epics:read` came out with it, and that one deserves more than a line, because
 * it is a capability that WORKED. It existed so that a page with no epic open
 * could offer a picker instead of a blank. There is now no such state to be in:
 * the list is not about an epic, so a page with no epic open is a page with a
 * perfectly good list on it. Keeping the declaration would have meant keeping a
 * picker that steers nothing.
 *
 * Not declared, each for its own reason: `steps:read`, because a step's prose is
 * not a reference and this surface would only be quoting it; `stage:report`,
 * because nothing here is an assertion about work — this app reads and shows,
 * and a list that could also write would be a list somebody has to wonder about;
 * `events:emit`, because the one thing worth emitting from here would be a
 * notification nobody asked for.
 *
 * And per the protocol's own README: a declaration is not a request and is not
 * answered. The host refuses whatever it likes at every call whatever is written
 * here, so the page below is built to be refused — see `sight.ts`.
 *
 * ## The list is the PROJECT's now, and the summary says so
 *
 * This is the honest cost of the change and it is stated here rather than
 * discovered. The roadmap's reading was a curated set — the refs an epic's
 * narrative named, plus pull requests discovered against them. GitHub records
 * nowhere which epic an issue belongs to, so that set cannot be rebuilt from the
 * tracker, and the choice was between a fresh list of everything in the project
 * and a stale list of the right things.
 *
 * Freshness won because the failure of the other one is invisible. A closed
 * issue still reading `opened` looks exactly like an open issue; a list that is
 * longer than somebody expected looks exactly like what it is. The summary, the
 * guidance, the header and `absence.tsx` all say "this project" rather than
 * "this epic", and the mode's scope stays `epic` for the reason below.
 *
 * ## `scope: 'epic'` for a list that is not about an epic
 *
 * The enum has two values and neither fits, so the closer one is kept and the
 * gap is written down. `epic` means the tab is "told which epic is open and told
 * again on every switch"; `global` means "told nothing and never re-pointed".
 * This app must be re-pointed — when the reader moves to another project, the
 * context that says so is the only way it finds out — so `global` would be a
 * false claim about the thing that matters most, and `epic` is a true claim
 * about being told, with one field of what it is told now going unused. There is
 * no `project` scope to ask for; when there is, this line changes.
 *
 * ## No `mcp`, and that is a decision rather than an omission
 *
 * A module may name its own MCP door, and most of the apps beside this one do,
 * because they hold something an agent would want to write. This one holds
 * nothing but a cache of what GitHub already said. An agent that wants this
 * material has `gh` on the same machine and the same login; a second door onto
 * it would be a second answer to the same question, going stale on its own
 * schedule — which is the whole failure this rewrite removed.
 *
 * ## `storage: true`, which this app used to be right to refuse
 *
 * The old manifest declared `storage: false` and argued for it at length: the
 * page had a filter and an order to remember, `state:keep` remembered them, and
 * taking an opaque origin cost a page that held nothing exactly nothing. Every
 * word of that was true and it is no longer the situation.
 *
 * A host frames a module WITHOUT `allow-same-origin` unless its manifest
 * declares storage. That puts the page on an opaque origin, and an opaque page's
 * fetches to its OWN server are cross-origin, because its origin is `null` and
 * matches nothing. So this app's server would have to answer `/api/references`
 * with a permissive `Access-Control-Allow-Origin` or the page could not read it.
 *
 * And `/api/references` is not a static document. It runs `gh` under whoever is
 * logged in on this machine, in a project folder, and hands back that
 * repository's issues and pull requests. With a permissive CORS header, any page
 * in any tab in this browser could call it and read the answer — the tracker of
 * every private repository checked out on this machine, off loopback, with no
 * prompt. Loopback is a fence around the machine and not around the programs on
 * it, and that is not theoretical: Journeys had the same shape and it was
 * demonstrated with a one-line `curl` carrying `Origin: https://evil.example`.
 *
 * Declaring storage closes it at the root rather than papering over it. With a
 * real origin this page's scripts and its fetches are ordinary same-origin
 * requests, no CORS header is sent at all, and a stranger's fetch gets nothing
 * back. The sandbox is weakened by exactly what that costs, which is little: the
 * origin this page regains is `127.0.0.1:7820` and the host is on
 * `127.0.0.1:4181`. Different ports are different origins, so the page still
 * cannot reach into the host — it can only reach itself, which is all it asked
 * for.
 *
 * The honest caveat, said here rather than left to be discovered: this closes
 * the BROWSER's door and not the socket. Anything already running as this user
 * can `curl` the port, and no header stops that. What CORS was ever protecting
 * against is a stranger's page using this browser as a proxy, and that is the
 * door that is now shut. `tracker/project.ts` is what narrows the rest.
 *
 * And the filter still travels by `state:keep` rather than by `localStorage`,
 * even though `localStorage` would now work. The host holding one opaque string
 * it cannot read is a better arrangement than this origin holding a value that
 * survives somebody clearing site data differently from how they expect; the
 * capability was never a workaround for the sandbox, it was the right shape.
 */
export const ID = 'roadmap.references'

/**
 * Two, because the data source moved.
 *
 * A version is for whoever is reading two copies of this program and wondering
 * why they disagree, and "the rows come from somewhere else now" is the largest
 * possible answer to that. The page, the refs and the selection are unchanged;
 * everything behind them is not.
 */
export const VERSION = '2.0.0'

/**
 * Parsed here, at module load, rather than shipped as a bare object.
 *
 * The protocol package is explicit that its schemas are a convenience and never
 * the host's check — the host runs its own copy over what arrives on the wire.
 * That cuts both ways: running it HERE is the cheapest way for this app to find
 * out it has written a manifest no host will accept, and to find out at start
 * rather than from a roadmap's refusal in somebody else's log. A summary one
 * character over `LIMITS.SUMMARY` should stop this process, not that one.
 */
export const MANIFEST: Manifest = manifestSchema.parse({
  kind: MANIFEST_KIND,
  protocol: PROTOCOL,
  id: ID,
  name: 'References',
  version: VERSION,
  /**
   * What this IS, and the two words in it that were argued over.
   *
   * "this project" rather than "an epic", because that is what the list holds
   * now and a summary that said otherwise would be the module lying in the one
   * sentence a person reads before installing it.
   *
   * And no "merge request". This app reads GitHub and does not read GitLab —
   * `glab` exists, is installed on this machine, and is not called, because
   * nothing in this workspace is on GitLab and untested code shipped under a
   * summary that claims it works is worse than an absence. The row, the filter
   * and the `!41` spelling are all still in place for the day somebody has a
   * GitLab project to prove it against; see the note at the foot of
   * `tracker/gh.ts`.
   */
  summary: 'Every issue and pull request in this project, read from its own GitHub, as one list.',
  /**
   * What an agent should do about this module, given that it is here.
   *
   * Not the summary: that says what this IS, for a person deciding whether to
   * place it. This says what its PRESENCE OBLIGES, and a host composes it into
   * the prompt every agent on the canvas is handed — attributed to this module,
   * because it is this module's claim and not the host's.
   */
  guidance:
    'Every issue and pull request in this project is listed here, read from the project’s own GitHub ' +
    'rather than from any copy, so it is current rather than as current as the last refresh. Before ' +
    'deciding what to work on, read the list rather than assuming the work is the one thing you were ' +
    'pointed at — very often a change is already open for it. Picking a row sets the canvas selection ' +
    'and other modules react to it, so select the reference you are working on and leave it selected ' +
    'while you work.',
  entry: '/',
  modes: [{ id: 'references', label: 'References', scope: 'epic' }],
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: ['selection:set', 'state:keep'],
    storage: true,
  },
})
