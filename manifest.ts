import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'kehikot-module-protocol'

/**
 * What this app says about itself when a host asks.
 *
 * The manifest is the smaller half of this program and the only half a host
 * ever reads before deciding whether to frame it. Read it as a description of
 * the ENRICHMENT rather than of the app: it says which tab to give the page,
 * and which questions the app would like to ask if there is anybody there to
 * ask.
 *
 * ## What changed, and what a reader of the old manifest should know
 *
 * This file used to declare four capabilities and the data came through one of
 * them. Every row was an answer to `live.get` — the host app's cached reading
 * of the trackers, refreshed by somebody remembering to run a refresher — so the
 * list was as current as the last time a person thought about it. The owner
 * asked the obvious question:
 *
 * > Issues/MRs can be gotten from the project's own GitHub, no? Doesn't need
 * > separate maintenance.
 *
 * They could, and for a while this app's own server ran `gh issue list` and
 * `gh pr list` in the project folder. That saw GitHub and nothing else, and it
 * was a second reader of trackers the host was reading anyway. Since 3.0.0
 * (issue #4) the rows are the host's SHARED reading — `tracker.get`, GitHub and
 * GitLab together, read once for every module on the canvas — and the two
 * declarations that say so are `trackers:read` and `trackers:refresh`.
 *
 * ## The capabilities, and the ones that left
 *
 * - `selection:set`, which is the one write on this list and is a shared one.
 *   The protocol spells it out and the wording matters: "every module on the
 *   canvas is told". Picking a row here changes what the reader's other containers
 *   are looking at, and that is the point rather than a side effect — the
 *   argument is in `contextSchema`, and it is why the selection travels as
 *   context instead of as a message from this app to a named neighbour. It is
 *   declared because somebody deciding whether to run this program should read
 *   that sentence before they do, not because declaring it grants anything.
 *   Nothing about it changed with the data source, deliberately: a ref is still
 *   the string `gh#105`, spelled the way the shared reading spells it
 *   (`spellTrackerRef` in the protocol), and other modules go on recognising
 *   it.
 * - `filters:set`, which is the newest and the one worth a paragraph of its own.
 *   None of this app's filtering is drawn in this app any more. The scope, the
 *   `hide` toggles, the kehikko pick AND the typed query are offered as
 *   `kehikot.filters` — the last of them as a `text` group, which the protocol
 *   grew for exactly this module — and all four are drawn in the container's
 *   own header beside every other module's. That is what the owner asked for, twice, and it is how the rest of
 *   this family already behaves.
 *
 *   Offering costs no capability, because an offer is fire and forget. This
 *   declaration is for the other direction: two things this page promises need
 *   to be able to ASK for the choice back. `view.goto` answers "go to `gh#105`"
 *   by clearing whatever is hiding that row, and the one press offered when the
 *   narrowing has hidden everything promises to put all of it back. Without this
 *   declaration both calls are refused by the host and both promises become
 *   partly true, which is worse than either being absent.
 *
 *   It is a REQUEST rather than a permission: the host may decline — the
 *   container is pinned, or is not on the kehikko that is open — and
 *   `src/app.tsx` draws the host's own sentence when it does. The argument for
 *   the whole move is at the top of `src/live/sift.ts`.
 * - `state:keep`, which is how the ORDER survives a reload, and nothing else any
 *   more. The host keeps one opaque string for this module and never reads it —
 *   the sentence in the protocol is "the host does not read it", and the
 *   format lives entirely in `src/live/keep.ts`. It used to carry the kind, the
 *   state and the query; the host holds all three per container now, so a copy
 *   here would be a second memory of one setting. What is left is the order,
 *   which is not a filter, hides nothing, and is therefore nothing the host
 *   draws or remembers.
 *
 * - `trackers:read`, which is where every row comes from: `tracker.get` with
 *   `project: true`, the host's reading of everything it reads for the open
 *   project — the refs every epic names, the refs modules have asked about, and
 *   the recent issues and changes of each source it lists. Answered at once
 *   from what the host holds, so asking spends nothing at any tracker. See
 *   `src/live/ask.ts`.
 * - `trackers:refresh`, which is what the refresh control now does. The host
 *   still draws the button from `kehikot.refreshable` and the press still comes
 *   back as `kehikot.refresh`; what changed is the answer to it, which is
 *   `tracker.refresh` — the host reading GitHub and GitLab again for every
 *   module in the project. Declared apart from reading because it SPENDS
 *   something: the person's rate limit, on behalf of everybody on the canvas.
 *   Somebody deciding whether to run this program should read that before they
 *   do.
 *
 * `live:read` came out because nothing calls it any more. There is no
 * `live.get` anywhere in this program: the rows come from `tracker.get`, which
 * is the same reading under its own door. Leaving the declaration in would be this module telling
 * every person who reads its manifest that it intends to ask a question it will
 * never ask — permission described to a program that will never exercise it —
 * and Paper removed `epics:read` for exactly that reason.
 *
 * `epics:read` came out with it once, because the picker it served had gone,
 * and it is back with `steps:read` beside it for a different job. The list is
 * narrowed by default to the references the open epic names (issue #1), and
 * those are an epic's steps' refs and its umbrella: `steps.list` answers the
 * first under `steps:read` and `epic.get` the second under `epics:read`. They
 * are asked of the host rather than read off `.kehikot/roadmap/epics/` by this
 * app's server, because those files are the host's and the host already
 * answers out of them — see `epicRefs` in `src/wire/use-kehikot.ts`. Either
 * refused alone still narrows to what the other granted; both refused leaves
 * the whole project on screen with the heading saying so, never an empty list.
 *
 * Not declared, each for its own reason: `stage:report`,
 * because nothing here is an assertion about work — this app reads and shows,
 * and a list that could also write would be a list somebody has to wonder about;
 * `events:emit`, because the one thing worth emitting from here would be a
 * notification nobody asked for.
 *
 * And per the protocol's own README: a declaration is not a request and is not
 * answered. The host refuses whatever it likes at every call whatever is written
 * here, so the page below is built to be refused — see `sight.ts`.
 *
 * ## The READING is the project's; the list on screen is the epic's by default
 *
 * The rows are everything the host reads for the project: the refs every epic
 * names AND the recent issues and changes of each listed source, on GitHub and
 * GitLab both. So a GitLab project's issues and merge requests list beside a
 * GitHub one's, from one reading with one age, and the epic's own refs are in
 * it even when they are older than the recent ones.
 *
 * What changed in 2.3.0 (issue #1) is what is DRAWN. A fresh list of every one of 466
 * references, under an epic that names about 80, read as noise. The epic itself
 * says which refs are its own — every step's `refs` and the umbrella — so the
 * scope group narrows to those by default, or to what the picked-out containers
 * show while any are picked, and "Everything" is one press away. The rows the
 * scope hides are still read, still counted, and still reachable by `goto`.
 *
 * ## `scope: 'epic'`, which is now true in full
 *
 * `epic` means the tab is "told which epic is open and told again on every
 * switch", and this app uses both halves: the project whose reading to ask
 * for, and the epic to narrow to. It used to use only the first and say so here.
 *
 * ## No `mcp`, and that is a decision rather than an omission
 *
 * A module may name its own MCP door, and most of the apps beside this one do,
 * because they hold something an agent would want to write. This one holds
 * nothing at all: it draws the host's reading of the trackers. An agent that
 * wants this material asks the host, which is where it lives; a second door
 * onto it would be a second answer to the same question, going stale on its
 * own schedule — which is the whole failure this module keeps removing.
 *
 * ## `storage: true`, which this app used to be right to refuse
 *
 * Written when `/api/references` ran `gh` behind this port. That door is gone
 * (issue #4) and the declaration stays: it costs a page that holds nothing
 * almost nothing, and taking it out puts back the opaque-origin trap described
 * in `vite.config.ts`. The argument, as it was made:
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
 * door that is now shut.
 *
 * And the filter still travels by `state:keep` rather than by `localStorage`,
 * even though `localStorage` would now work. The host holding one opaque string
 * it cannot read is a better arrangement than this origin holding a value that
 * survives somebody clearing site data differently from how they expect; the
 * capability was never a workaround for the sandbox, it was the right shape.
 */
export const ID = 'kehikot.references'

/**
 * Three, because the data source moved again; before it two, for the same
 * reason; and minors between, because every control did.
 *
 * `3.2.0`: the list honours the parts focus. While parts of the open epic are
 * picked out in the host's bar (`context.parts`, protocol 0.29.0), only the
 * rows those parts list are drawn, a second heading line says which parts and
 * how many rows are outside them, and a `goto` to a row outside them is
 * answered `found: false` with that reason. A minor, because with nothing
 * picked — and under a host that has never heard of parts — it behaves exactly
 * as 3.1.0 did.
 *
 * `3.1.0` (issue #7): the scope follows the epic while it is open. A ref added
 * to a step, or a new umbrella, comes under "This epic" when the host says the
 * epic's content changed, where it used to wait for the window to be reloaded.
 * A minor, because nothing is withdrawn and nothing new is asked for: the same
 * two questions, asked once more. Under a host that has never heard of
 * `context.content` it behaves exactly as 3.0.0 did.
 *
 * `3.0.0` (issue #4): the rows are the host's shared tracker reading —
 * `tracker.get` — rather than this app's own `gh`, so GitLab and GitHub refs
 * list together and nothing reads a tracker twice. It needs a host that answers
 * `tracker.get`; an older one gets a sentence saying so rather than a list. The
 * refresh control asks the host to read again (`tracker.refresh`), the page
 * re-asks when `context.tracker.at` moves, and the heading's age is the shared
 * reading's, with each failing source named under it. The refs, the selection,
 * the filters and the kept order are unchanged.
 *
 * A version is for whoever is reading two copies of this program and wondering
 * why they disagree, and "the rows come from somewhere else now" is the largest
 * possible answer to that. The page, the refs and the selection were unchanged
 * by it; everything behind them was not.
 *
 * `2.3.0` is what the list SHOWS: narrowed by default to the open epic's refs,
 * with kind and state folded into one `hide` group of the shared ref facets,
 * closed-reason facets among them. A container that stored a kind or a state
 * under 2.2.0 loses that choice — the groups are gone and the host prunes them
 * — and narrows by nothing it did not ask for.
 *
 * `2.2.0` was the largest change a person SEES before that: this app draws no chrome of
 * its own any more. The header and the toolbar are gone, and with them the
 * project line, the freshness line, the Refresh button, the query box, the seven
 * filter buttons, the order trigger and the Clear. What is left is the table and
 * one heading row carrying the column sorts and the count. Every one of those
 * things is somewhere better — the three filters and the query in the
 * container's own header, the refresh and the freshness line as
 * `kehikot.refreshable`, the order on the columns it orders — except the count,
 * which could not move, because the host cannot count rows it does not render.
 *
 * Still a minor rather than a major, because nothing this module answers or
 * promises has been withdrawn: the refs are spelled the same, `view.goto` still
 * clears what is hiding its target, and one press still puts everything back. It
 * needs a host that speaks `kehikot.refreshable` and `text` filter groups to
 * have a refresh control or a search box at all, which is the one thing a reader
 * of two copies has to know — along with the string kept under `state:keep`
 * going to version 3, dropping everything but the order. `src/live/keep.ts` says
 * why.
 */
export const VERSION = '3.2.0'

/**
 * The port this app would rather have.
 *
 * `run.sh` used to demand it — `--port "${PORT:-7820}" --strictPort` — which
 * meant a taken 7820 printed `Error: Port 7820 is already in use` and exited 1,
 * and this app did not start because of a program it has nothing to do with.
 * The number is said here instead, next to the id, and `serves()` in
 * `vite.config.ts` is what acts on it.
 *
 * This module has no `register.ts`, so unlike its siblings it has only one
 * reader for this constant. It is still here rather than in `vite.config.ts`,
 * because the id is here and a preferred port with the name it belongs to is
 * legible in a way that one buried in a plugin argument is not — and because a
 * `register.ts` is the obvious thing to add next, and it would want this.
 *
 * It is a PREFERENCE and not a promise. 7830 through 7960 belong to the other
 * modules on this machine, and if something else holds 7820 when this starts,
 * `serves()` moves to the next free port and rewrites `~/Library/Application Support/Kehikot/modules` to
 * match — see `kehikot-module-protocol/serve`. A host reads the registry, so
 * the registry is what has to be true; this number is only where to start
 * looking.
 */
export const PREFERRED_PORT = 7820

/**
 * Parsed here, at module load, rather than shipped as a bare object.
 *
 * The protocol package is explicit that its schemas are a convenience and never
 * the host's check — the host runs its own copy over what arrives on the wire.
 * That cuts both ways: running it HERE is the cheapest way for this app to find
 * out it has written a manifest no host will accept, and to find out at start
 * rather than from a host's refusal in somebody else's log. A summary one
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
   * And "merge request" is back. It came out while this app read GitHub only
   * and claiming GitLab would have been untrue; the host's shared reading
   * covers both, so it is true again.
   */
  /* Where a host files this module in its list, most fitting first. */
  tags: ['planning', 'review'],
  summary: 'Every issue, merge request and pull request in this project, from GitHub and GitLab, as one list.',
  /**
   * What an agent should do about this module, given that it is here.
   *
   * Not the summary: that says what this IS, for a person deciding whether to
   * place it. This says what its PRESENCE OBLIGES, and a host composes it into
   * the prompt every agent on the canvas is handed — attributed to this module,
   * because it is this module's claim and not the host's.
   */
  guidance:
    'Every issue, merge request and pull request the host reads for this project — GitHub and GitLab ' +
    'together — is listed here, and the list shows the ones the open epic names unless the header’s scope is ' +
    'set to Everything — check the scope before concluding a reference does not exist. Before ' +
    'deciding what to work on, read the list rather than assuming the work is the one thing you were ' +
    'pointed at — very often a change is already open for it. Picking a row sets the canvas selection ' +
    'and other modules react to it, so select the reference you are working on and leave it selected ' +
    'while you work.',
  entry: '/',
  modes: [{ id: 'references', label: 'References', scope: 'epic' }],
  /**
   * What this page DOES with the context it is handed — the receiving half of
   * the selection, and the newest claim in this file.
   *
   * `selection`, because the program genuinely moves: the `Kehikko` group
   * offered to the container header has an option that narrows this list to
   * the references picked out on the canvas, and while it is on, every pick —
   * a row here, a step ticked in Journeys, anything in any other container —
   * changes which rows are drawn. That is the test the protocol's essay on
   * `reacts` sets, and it is met; it would not have been met by the ticks
   * alone, which this page has always drawn from the selection without doing
   * anything about it. A tick is display. Narrowing is a reaction.
   *
   * Together with `selection:set` below this manifest now names both ends of
   * one relationship, and so does Journeys'. The host's `relations.ts` draws
   * the pair as "Consumes / Provides to" in the registered list, and draws it
   * as weaker evidence than a carried event on purpose — both ends are what
   * the modules say about themselves, and the host performs no delivery it
   * could vouch for. Nothing here is granted by the word and nothing is routed
   * on it. The context arrives whether or not it is written.
   *
   * `containers`, because the scope narrows to what the picked-out containers
   * say they are showing while any are picked — tick a paper and a journey on
   * the kehikko and this list follows them. `dispositions`, because a person's
   * mark on why a reference closed decides which `closed:*` facet it has in the
   * `hide` group, over the tracker's own reason; marking a ref `won't do`
   * elsewhere moves it here. Both are reactions in the protocol's sense: the
   * rows on screen change.
   *
   * `tracker`, because the rows ARE the shared reading: when
   * `context.tracker.at` moves — a refresh pressed in any container, the
   * project's own schedule — this page asks `tracker.get` again and the rows
   * change. See `standingOn` in `src/wire/use-kehikot.ts`.
   *
   * `content`, because the scope is what the open epic names, and an epic is
   * edited while it is open (issue #7): when `context.content` says the host's
   * epics or the journeys changed for this epic, the page asks `steps.list`
   * and `epic.get` again and the rows under "This epic" change. See `stampOn`
   * in the same file. Only the receiving half: this app keeps no material of
   * its own, so there is no `content:report` below and nothing here ever calls
   * `content.changed`.
   *
   * `parts`, because the rows narrow to the references of the parts of the
   * epic a person picked out in the host's bar — `refInFocus`, the protocol's
   * rule — and the heading says which parts and how many rows are outside
   * them. With none picked the list is what it was. The picking is the host's
   * own control, so there is no capability for it below.
   *
   * Not `passage`. Nothing here reads one.
   */
  reacts: ['selection', 'containers', 'dispositions', 'tracker', 'content', 'parts'],
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: ['selection:set', 'filters:set', 'state:keep', 'epics:read', 'steps:read', 'trackers:read', 'trackers:refresh'],
    storage: true,
  },
})
