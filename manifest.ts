import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'roadmap-module-protocol'

/**
 * What this app says about itself when a roadmap asks.
 *
 * The manifest is the smaller half of this program and the only half a roadmap
 * ever reads before deciding whether to frame it. Read it as a description of
 * the ENRICHMENT rather than of the app: it says which tab to give the page,
 * and which two questions the app would like to ask if there is anybody there
 * to ask.
 *
 * ## Two capabilities, and the ones deliberately absent
 *
 * - `epics:read`, so that when nothing has said which epic is open the
 *   page can offer the list rather than a blank. It is the difference between
 *   an app somebody can steer and one that waits to be pointed at.
 * - `live:read`, which is the data. Everything on the list comes out of one
 *   `live.get`.
 *
 * Not declared, each for its own reason: `steps:read`, because a step's prose
 * is not a reference and this surface would only be quoting it; `stage:report`,
 * because nothing here is an assertion about work — this app reads and shows,
 * and a list that could also write would be a list somebody has to wonder
 * about; `events:emit`, because the one thing worth emitting from here would be
 * a notification nobody asked for.
 *
 * And per the protocol's own README: a declaration is not a request and is not
 * answered. The host refuses whatever it likes at every call whatever is
 * written here, so the page below is built to be refused — see `sight.ts`.
 *
 * ## No `mcp`, and that is a decision rather than an omission
 *
 * A module may name its own MCP door, and most of the apps beside this one do,
 * because they hold something an agent would want to write. This one holds
 * nothing. Every row it draws came from the roadmap seconds earlier and is
 * already readable by any agent connected to that roadmap; a second door onto
 * the same material would be a second answer to the same question, going stale
 * on its own schedule.
 *
 * ## No `storage`, and therefore an opaque origin
 *
 * The page keeps a filter in memory and forgets it on reload. That is the whole
 * of its state, so there is nothing to store, so asking for an origin back
 * would be asking for a thing it has no use for. The consequence is that a
 * roadmap addresses it by window rather than by origin — which is what the
 * bridge in `src/wire/host.ts` binds to anyway.
 */
export const ID = 'roadmap.references'
export const VERSION = '1.0.0'

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
  summary: 'Every issue, merge request and pull request an epic names, as one list.',
  entry: '/',
  modes: [{ id: 'references', label: 'References', scope: 'epic' }],
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: ['epics:read', 'live:read'],
    storage: false,
  },
})
