# References

Every issue, merge request and pull request in a project — GitHub and GitLab
together — as one dense list. A row is an identifier, a state, a title and who
is on it.

It is a program of its own: its own server, its own page, its own
`package.json`, its own port. A host frames it, tells it which project is
open, and hands it the rows.

```
bun install
./run.sh           # or PORT=7820 ./run.sh
bun test
bun run dev/stub-host.ts   # a host that is not one, for looking at all of it
```

Two documents come out of the server besides the page at `/`: the manifest at
`/.well-known/kehikot-module.json`, which is the one path a host ever asks for,
and `/healthz`. Nothing here spends a credential.

## Where the rows come from, and what changed

Three times now, and each move is the reason for the next.

They came from the host's `live.get` — a cached reading refreshed by somebody
remembering to run `refresh_epic`. Then, after the owner asked

> Issues/MRs can be gotten from the project's own GitHub, no? Doesn't need
> separate maintenance.

they came from this app's own server running `gh issue list` and `gh pr list`
in the project folder, cached in `.kehikot/references/tracker.json`. That was
fresh, and it saw GitHub and nothing else: a GitLab project showed its issues and
merge requests only through a hand-imported snapshot, and then refused to
refresh, because a GitHub-only read would have replaced the imported rows
(issue #4). It was also a second reader of trackers the host was already reading.

Since 3.0.0 the rows are the **host's shared tracker reading**:

- `tracker.get({ project: true })` under `trackers:read` — everything the host
  reads for the open project: the refs every epic names, the refs modules have
  asked about, and the 400 most recent issues and changes of each listed
  source, GitHub and GitLab. Answered at once from what the host holds.
- `tracker.refresh({ project: true })` under `trackers:refresh` — what the
  host's refresh control now does. The host reads the trackers again, for every
  module standing in the project, and joins two presses into one read.
- `reacts: ['tracker']` — `context.tracker = { at, refreshing }` is the signal.
  When `at` moves, from a press in any container or the project's schedule,
  this page asks `tracker.get` again; while `refreshing` is true it tells the
  host it is busy.

A row is the protocol's `TrackerRow`, and it is a `Sighting` as it stands —
`kind`, `state`, `stateReason`, `closedByMerge` under the facets module's own
names — so `facetsOf`, `dispositionOf` and `deriveDisposition` read it with
nothing translated. The private reader is gone: no `gh`, no `tracker/`, no
`/api/references`, no `tracker.json`. One left on disk by an older version is
read by nothing, and `rm -rf <project>/.kehikot/references` is a complete answer
to it.

It needs a host that answers `tracker.get` (Jalez/kehikko#25). An older one
gets a sentence saying so, not an empty list.

### The list on screen is the epic's by default

The reading is the project's, and on a real project it reads as noise — 466 rows
under an epic that names about 80 (issue #1). The epic itself says which refs
are its own: every step's `refs`, and its umbrella. So the container header has
a **Scope** group, on by default:

- **This epic** (the resting option) narrows to the refs the open epic names,
  asked of the host with `steps.list` and `epic.get`, and to the changes in the
  reading that are part of one of those issues ("Part of #3912": protocol
  2.26.0 `contributes` / `contributedBy`, `src/live/ties.ts`). Such a change's
  row says `part of #3912`, and the issue's `has contributions from !3907`. A
  change that closes one of those issues ("Closes #3913") is reached too, and
  keeps its `closes` tie; one way only, so an epic that names a change does not
  take in the issue it closes.
- **While containers are picked out** on the kehikko, the same option narrows to
  the union of what they say they are showing (`context.containers`,
  `showing.refs`) instead, with the same part-of and closing changes added, and
  its label says `Picked containers`. This
  container's own row is left out.
- **Everything** is the other option, one press away, and every "show all" on
  this page — the empty-list panels, `goto` — asks for it explicitly, because
  `{}` would put the scope back on the epic.
- **Asked to review** and **Mine, any role** narrow, across the whole project,
  to the references the host says you are asked to review, and to every one you
  have a role on (protocol 2.7.0 `myRoles`: asked to review, reviewed, author,
  assignee). Offered only while the reading says who you are; an empty one
  draws its own sentence. In the Scope group because all four filter groups
  are spent and "what is waiting on my review" is a set of references — one
  press from the default.
- **All epics** in the host (protocol 2.9.0, `context.scope: 'project'`): the
  group rests on **Everything** by itself — offered as `Everything (all epics)`,
  without "This epic", which has no one epic to name — and goes back to the
  epic's scope when an epic is picked again. Nothing is written to the stored
  choice. Picked containers and the role options still narrow.

### My role

Each row says what you are on it — `Reviewer (asked) · Author` — in a column
from 32rem (after the labels and the date are gone, before the people), and in
its tooltip at every width. Empty on a row you have no role on. The roles are
the host's (`myRoles`, worked out from who you are on that tracker); this app
computes nothing about people. A host older than 2.7.0, or one that does not
know who you are, leaves the column empty and the two Scope options unoffered.

### Markers: the stack, who holds it, and activity by somebody else

Beside the row's pressable box, at every width, up to four markers and the state (issues #23
and #25). Each says only what the host's reading says; none is worked out here
from a name.

- **The stack** — `⧉ 2/3` on a change whose base branch is another open
  change's head branch (protocol 2.8.0 `stack`, which the host works out across
  its reading). Its tooltip lists the whole stack bottom first, refs and
  titles, this one marked; a fork in the stack is indented. Pressing it opens
  the same list as buttons, and pressing one selects that change, as pressing
  its row would. The stack is worked out over every row read
  (`stackPlaces` in `live/markers.ts`), so a filter that hides the change
  underneath does not unstack this one.
- **Assigned** — the faces of whoever is assigned (see *Faces* below), naming
  them in the tooltip, and `(you among them)` when you are one. Nothing when
  nobody is: the row's tooltip says `nobody`, and a marker on most rows would
  be noise.
- **Review** — on a change somebody was asked to review: each reviewer's face
  with a badge for where they stand — an hourglass (asked, not started), an eye
  (reviewing), a ring with a bang (changes requested) or a ring with a tick
  (approved). The tooltip leads with the strongest any reviewer gives and names
  every reviewer with theirs.
- **State** — the row's state as a small coloured glyph, the pipeline mark's
  size and just before it, so the two read as a pair (`StateMark`; words in
  `live/state.ts`). A merge or pull request is `git-pull-request` open (green),
  `git-pull-request-draft` draft (muted), `git-merge` merged (purple),
  `git-pull-request-closed` closed (red); an issue is `circle-dot` open
  (green), `circle-check` closed — purple when done (a merged closer or
  `COMPLETED`), muted otherwise — and `circle-slash` not planned or a
  duplicate. A state the reading did not carry is a question mark, never open.
  Tooltip and `aria-label` say it in words: `Merge request · open`,
  `Issue · closed by !4019`.
- **Unaddressed activity** — on an OPEN reference whose last activity
  (protocol 2.8.0 `lastActivity`) was somebody else's, a dot on the row's "⋯"
  and the sentence — `Last activity: mona, a review, 3 h ago` — as its
  description and as an item in its menu, with the bell, that opens the page in
  your browser. Only when the host says whose it was against who you are
  (`lastActivity.mine`); when it does not know who you are there is nothing,
  never a guess from a name. Closed and merged references have nothing left to
  address.

Every marker is its own focusable element with an `aria-label` saying the
whole sentence, and its shadcn tooltip (`components/ui/tooltip.tsx`) opens on
keyboard focus as well as hover. Every state has its own shape; colour is
only the second telling. The row's own tooltip says all of them too.

From 24rem of the frame every row's marker cluster is one width — an empty
slot where a marker is not — so the date, role and people columns line up down
the list. The assigned and review columns are as wide as this list needs
(`facesColumns`: 20px for one face, 12 more per face up to three and a `+N`, so
56px at most), set once on the list as `--faces-assigned` and `--faces-review`:
a list where nobody has more than one assignee pays for one face, not four. Below it the cluster is only as wide as what it says, and in the
narrowest frames a row whose identifier, state and markers do not fit on one
line puts the markers and the tracker link on a second line rather than over
the state.

### Copying, and opening outside

Each row's copy button puts its reference, linked, and its title on the
clipboard (`live/copy.ts`): `text/html` with the reference as a link, and
`text/plain` as Markdown, `[!4013](url) title`. With two or more rows selected,
the heading ends in "Copy N references" (`view/copy-many.tsx`): one line per
selected row, in the order the list shows them, in the same two formats; its
small menu also copies just the ids, space-separated (`!4019 !4039 #3911`).
Cmd+C (Ctrl+C) does the linked copy while rows are selected, unless text is
selected or focus is in a field (`takesCopyKey`). The copy is written in this
page, never from a header item: a clipboard write needs the press in this frame.

Clicking a row selects it, and a module that shows pages shows it. Each row
ends in a "⋯" menu (`view/row-menu.tsx`, a shadcn dropdown): "Open in your
browser" opens the tracker's page in the person's own browser (`openOutside` in
`live/links.ts`), a new-window request that the desktop shell hands to the
operating system's opener, never handed to the canvas; "Copy reference"; and the
last activity when it was somebody else's. From 24rem of the frame the copy button
sits beside "⋯"; below that only "⋯" is left.

### Faces

The assignee and reviewer markers draw people as tiny round avatars (16px),
overlapping by 4px, at most three and then `+N` (`src/view/faces.tsx`). The
pictures come from the host's reading (protocol 2.10.0 `people`, a map from
each login a row names to `{ name?, avatarUrl? }`); a person with no picture,
or whose picture fails to load, is their initials on a plain disc. Every
`<img>` has the person's name as its `alt`, `referrerpolicy="no-referrer"` and
`loading="lazy"`; the marker's `aria-label` and tooltip name everybody, not
only the three drawn. A reviewer's state is a badge shape on their face, so it
is never colour alone.

A picture is loaded only from the forge's own avatar hosts (`src/live/faces.ts`):

- GitHub: `avatars.githubusercontent.com`, nothing else.
- GitLab: the row's own GitLab host (its `/uploads/…` pictures) and
  `secure.gravatar.com`, which GitLab hands out for a person with no upload —
  on a GitLab row only.

Anything else (another host, `http:`, credentials in the URL) is refused in
`collect` and drawn as initials. The page's Content Security Policy says the
same: the first reading that names a source pins `img-src 'self'` plus exactly
those hosts as a `<meta http-equiv="Content-Security-Policy">`
(`pinImagePolicy`), and no picture is asked for before then or from a host it
does not name. It is pinned at run time because which GitLab a project reads
is known only from its reading, and once because a policy can be narrowed but
never widened: a later reading on a GitLab host the pinned policy does not name
shows initials until the page is loaded again.

The scope never narrows to nothing it has not read. No epic open, or a host that
refuses both questions, leaves the whole project on screen and the option says
`This epic (not read)`. An epic that names nothing in the reading draws its own
panel rather than "nothing matches what you asked for", because nobody asked.

Since 3.1.0 the scope follows the epic while it is open (issue #7), which is
`reacts: ['content']`. `context.content` says whose material changed and for
which epic; when any entry moves for
the open epic, whoever keeps the material — `contentStamp` — the page asks `steps.list` and `epic.get`
again, and only those. The list is re-scoped where it stands: the answer
replaces the epic's refs and nothing else, so the filters, the selection and
where the reader had scrolled to are as they were. A burst of changes while a
question is out is one more question after it, and a re-ask that fails leaves
the scope as it was. It needs a host that sends `context.content`
(Jalez/kehikko#40); under an older one the scope is read when the epic is
opened and on refresh, as before.

### The heading: how much, of what, and how old

`37 of 412 shown · this epic · read 6 d ago · 2 unread`. The age is the shared
reading's own `at` — when the host's reading last changed — never the moment the
page asked, and it is what `kehikot.refreshable` announces too. `unread` counts
the refs the reading names and has no row for (`missing[]`: not read yet, not
found, on no tracker this project reads, or its tracker failed), and the tooltip
lists each with why — a ref the epic names that is on no row would otherwise be
simply absent.

Under the heading, a source whose last read failed is named with its host and
repository, the host's error, and the age of the rows it gave before. The rows
stay. That is the state the old cache existed to draw — rows AND a sentence —
kept by the host now, per source, because "gitlab.example.org could not be
reached" is more use than "something failed" in a project that reads two.

### Focused on parts of the epic

An epic may be divided into parts, and a person may pick some of them out in
the host's bar. `context.parts` (protocol 0.29.0) lists every part of the open
epic with the refs the host says belong to it, and flags the picked ones; this
module says `reacts: ['parts']`.

- **Nothing picked** — an epic with no parts, no epic, a host that has never
  heard of parts — and the list is exactly what it was.
- **While any part is picked**, only the rows a picked part lists are drawn
  (`refInFocus`, the protocol's rule). A reference no part lists is outside
  every focus: counted, not shown. The scope, the toggles and the query narrow
  as before, on top.
- **Nothing announces it** while there is a row to draw: no second heading
  line, no count of what is outside. The host's bar shows the pick and the
  rows are the message. (`focusOf` in `src/live/sift.ts` still counts what the
  focus alone is hiding, only to tell an emptied list from an empty one.)
- **A focus that leaves no row** says one sentence where the rows would be —
  *Nothing in the picked part is in this list.* — and nothing else: no count,
  no names, no button.
- **`view.goto` to a row outside the focus** is answered `found: false` with
  that reason, and no filter is moved for it, because clearing the filters
  would not put the row on screen.

The focus is not a filter group. This module does not offer it, `filters.set`
does not move it, and "Show everything" does not clear it — which is why it is
counted on its own line rather than folded into `37 of 412 shown`.

### What did not change, deliberately

**A ref is still the string `gh#105`** — spelled the way the reading spells it
(`spellTrackerRef`), which is how Kehikot already wrote them. It goes out on
`selection.set` and other modules look things up by it.

**The selection round trip, the filters and the kept order are untouched.** A
click asks; the host answers by sending a context; the tick appears when that
comes back.

## Seven capabilities

`selection:set`, `filters:set`, `state:keep`, `epics:read`, `steps:read`,
`trackers:read` and `trackers:refresh`.

`filters:set` is there because two promises on this page need to ask for the
choice BACK: `view.goto`, which answers "go to `gh#105`" by clearing whatever is
hiding that row, and the one press that puts everything back. It is a request
rather than a permission: a host may decline, and the page draws the host's own
sentence when it does.

`trackers:refresh` is declared apart from reading because it SPENDS something:
the person's rate limit, on behalf of every module on the canvas.

`reacts` names `selection`, `containers`, `dispositions`, `tracker`, `content`
and `parts` — the kehikko pick, the picked-out containers the scope follows,
the marks people put on why a reference closed (which decide its `closed:*`
facet below), the shared reading moving, the open epic being edited, and the
parts of the epic picked out in the host's bar.

`storage: true` stays, though the door it protected is gone; `manifest.ts` and
`vite.config.ts` say why. The check is still one line:

```
curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7820/ | grep -i access-control
```

It must print nothing.

## When the reading is asked for

On the project **changing**, on `context.tracker.at` **moving**, and after a
**refresh**. Not on any other context, not on a timer of this module's own, and
never on a render.

Context carries the canvas's selection, so the host sends one after every
`selection.set`, including ours. Asking for four hundred rows on each would
rebuild the list per tick of a checkbox. So the question is keyed to the two
things that change its answer: which project, and when the host's reading last
changed.

The refresh control is the host's, and it arrives in two ways this module cannot
tell apart: a press, or an interval somebody set on that container. Both mean
`tracker.refresh`. A refresh that did not read everything — `failed`,
`declined`, or refused — puts the host's sentence above the list.

### The container stays usable while a read is in flight

`busy` is held beside `sight` rather than inside it. A read over rows already on
screen leaves them there, and only the host's refresh icon says something is
happening. `busy` is this page's question, a refresh it asked for, or the host
reading on its own account (`context.tracker.refreshing`).

The whole-container wait exists for exactly two cases: the question is out and
nothing is drawn, or the host answered with a reading that has never been read
(`at: null`) while a read is under way.

## The absences

The whole argument of this surface. There are many ways to have no rows and they
are not the same fact:

| | what it means |
|---|---|
| **Waiting for Kehikot…** | The page loaded under a second ago. A greeting may still come. |
| **Nothing is framing this page — open References in Kehikot.** | Nothing greeted it. There is no project, no reading, and nothing to list — which is not an empty list. |
| **No project is open — open one in Kehikot.** | Framed, and `projectPath` was null. Not a fault. |
| **References’ own server is not answering.** + Try again | The process that serves this page has stopped. The rows are the host’s, but a page whose server is gone cannot be reloaded or updated, so it says so. |
| **This page is older than its server — reloading…** | The server restarted since the page loaded. It reloads itself, once. |
| **Reading the trackers for \<project\>.** | The question is out, or the host is reading for the first time. The one honest whole-container wait. |
| **The host reads no tracker for this project.** | The reading has no sources. Not an empty tracker: nothing was read. |
| **This project's tracker has nothing in it.** | A reading of named sources, containing nothing. The one genuinely empty list — and if a source failed, it says so rather than claiming there is no work. |

And one the reader caused: **Nothing here matches what you asked for**, which
names how many exist and hands them all back with one press.

And one the host's bar caused: **Nothing in the picked part is in this list**,
when parts of the epic are picked out and every row is outside them. One
sentence, and the only thing this page says about the picked parts.

### And the failures, which are three sentences now

A tracker that could not be read is the host's to describe, per source, beside
the rows it gave before. What is left for this page to fail at is the
conversation with the host:

| | heading | offers to ask again |
|---|---|---|
| `unknown-method` | This host has no shared tracker reading. | no — asking twice will not teach it |
| `refused` | The host would not hand over its tracker reading. | yes, and shows the host's words |
| `unreadable` | The host's tracker reading could not be read. | yes |

A failure asking again over rows already on screen keeps the rows and says so
above them.

## No windowing, and the measurement behind that

`bun run dev/measure.tsx`, on this machine:

```
   50  rows  collect    0.3ms  sift    0.0ms  render    44.4ms    1001 DOM nodes (20.0 per row)
  400  rows  collect    0.4ms  sift    0.1ms  render   152.3ms    8001 DOM nodes (20.0 per row)
 1000  rows  collect    0.5ms  sift    0.2ms  render   301.5ms   20001 DOM nodes (20.0 per row)
 4000  rows  collect    1.6ms  sift    0.8ms  render  1150.4ms   80001 DOM nodes (20.0 per row)
```

Re-measured rather than carried forward: the table here read eleven elements per
row and forty milliseconds at four hundred, and that was true before the row grew
a checkbox and a tracker link. Twenty elements and a hundred and fifty
milliseconds is what it costs now, and saying so is cheaper than leaving a number
somebody would plan against.

Four hundred rows is twenty elements each, a sixth of a second of work under this
program's control, and a document of eight thousand nodes. None of those numbers
is where a browser struggles. The number that would have been —
paint and layout for four hundred rows nobody can see — is handed back to the
browser by `content-visibility: auto` with `contain-intrinsic-size` on each row:
it skips the work for rows far from the viewport, reserves their height so the
scrollbar does not lie, and **leaves every row in the document**.

That last clause is why a windowing library was not used. Windowing buys the
same saving by taking rows OUT of the document, and on this surface that breaks
the one promise it makes: a reference that is in the reading but not in the DOM
cannot be reached by the browser's own find, by a screen reader walking the
list, or by Ctrl+F — and a reader who searches for their issue, finds nothing,
and concludes it was never filed has been misled by the page. The measurement
says windowing is not needed at the four hundred this app asks for. The promise
says it would not be worth it if it were.

Caveat, stated because it matters: those numbers come from happy-dom, which does
not paint. They measure the work this program does, not the frame rate. What
they settle is that nothing here is doing anything expensive at four hundred
rows; the paint argument is settled by `content-visibility` rather than by them.

Four hundred is also what the host lists per source — the 400 most recent
issues and changes — so a project reading two sources can hand over somewhat
more, and the numbers above say that is still nothing expensive.

## One layout, and what a narrow column loses

The row is a flex line in a `@container`, so it responds to the width of the
frame it is in rather than to the width of the window — those are not the same
number when the frame is a column in somebody else's page. As the container
narrows, pieces drop from the right in this order:

1. **Labels** (under 48rem) — the most decorative thing on the row, and still
   reachable, because the filter searches them.
2. **The date** (under 36rem) — it answers "is this fresh", which the header
   answers once for the whole list.
3. **The people** (under 24rem) — reluctantly, because *who is on it* is half
   of what somebody scans for. Searchable too, and the markers say who holds
   it at every width.
4. **The title** (under 24rem of the frame, issue #24) — see below.

Never dropped, at any width: **the identifier, the state and the markers**.
The identifier is what somebody is looking for, the state is what they came to
check, and the markers say whether somebody already holds it.

Whatever the width takes away is on the row as its own `title`, in the order the
wide layout would have drawn it. "The filter searches it" is a fair answer to
somebody who knows the word to type and no answer at all to somebody who does
not, so hovering a row says everything the row would say at full width.

### The title goes under 24rem, and the row is one line

The title used to be the one thing never dropped. It is dropped under 24rem of
the frame now because of where the list is read at that width: beside Journeys,
where pressing a row shows that reference in the journey with its title at full
length. A narrow row is for finding the one to press and seeing who holds it,
so its width goes to the identifier, the state and the markers. The title is in
the row's tooltip, and an `sr-only` copy keeps it in the pressable box's
accessible name, so a screen reader hears what the row is at every width.

The threshold asks the frame by name (`@sm/frame:`, the app's root is
`@container/frame`) rather than the pressable box, because the markers sit
beside that box: its width differs from row to row, and a title that came and
went with how many markers a row has would make a column of rows that disagree.

Under 20rem the row used to be two lines — the identifier and the state on the
first, the title on the whole of the second — because a one-line row in a
220-pixel container left the title **twelve pixels**. With no title to hold,
that second line went with it: the row is one line, 36 pixels, at every width
it fits, which is more rows on screen in the container with the least height
to spare. The fixed columns, which exist so a column of identifiers can be
scanned rather than read, come back at 28rem, where there is width to pay for
them.

The `@container` is the pressable middle of the row rather than the row, and the
consequence is not what it looks like: a `@xx:` class is measured against the
nearest container *ancestor*, and an element is not its own ancestor. So the
classes on that box are measured against the frame; the labels, date and people
columns, written on its children, are measured against the box, which is
narrower by the checkbox, the markers and the link. Which is right — "is there
room for the people" is a question about what is left after the row's controls
have taken theirs.

### Every filter is in the container's header, and the toolbar is gone

They used to be seven buttons and a text box in this app's own bar — `All ·
Issues · Changes`, `Any · Open · Merged · Closed`, and a query input — with a
whole essay about fitting them into 220 pixels and a `ResizeObserver` collapsing
them behind one labelled trigger below 21rem. Every one is a `kehikot.filters`
group now, drawn in the container's own header beside every other module's:
**Scope** (above); **Kehikko**, which narrows to what is picked on the canvas
while it is on (`Picked here`); **hide**; and the query — four, which is
`LIMITS.FILTER_GROUPS`.

**`hide` is the shared ref facets**, one `toggles` group from
`kehikot-module-protocol/facets` where there used to be two single choices for
kind and state. A pair of single choices can only say a cell of their product,
and what people wanted was "hide closed MRs/PRs, keep closed issues": a closed
issue is usually finished work and a closed change usually abandoned. So each of
`open issues`, `closed issues`, `open MRs/PRs`, `closed MRs/PRs` and `merged
MRs/PRs` is its own toggle, and so is each reason a closed ref closed — `done`,
`won’t do`, `duplicates`, `superseded`, `closed, reason unknown`. The vocabulary
and the group id are the protocol's, so any module that offers the same toggles does so under
the same id and a choice means the same thing in every container.

The reason a ref closed comes from a person's mark when there is one
(`context.dispositions`), and otherwise from the tracker: GitHub's `stateReason`
on the row, and for a GitLab issue the row's `closedByMerge` — or a `closed-by`
link to a change the same reading has as merged. A change that is only part of
the issue never counts there. A closed ref with neither is "reason unknown" — a state
to settle, never counted as done. A row whose state nobody could read has no
facets and no toggle ever hides it.

The counts ride in the labels because the protocol has no count field —
`closed issues (12)` — and are of the whole reading, not of the scope. A facet
nothing has is not offered unless it is switched on. A choice a container stored
under the old `kind` and `state` groups narrows nothing; the host prunes it once
the new offer lands.

**The query is a `text` group**, which the protocol grew for this module. It had
refused free text twice, on the grounds that a text box in a container header
needs room a 220-pixel header does not have, needs focus and needs a keyboard.
Every clause of that is true of the header STRIP and none of it is true of the
control, which is a twenty-four-pixel button that opens a MENU — a floating layer
with its own width and its own focus scope. The refusal was right about the strip
and wrong about the feature. The label doubles as the input's placeholder and its
accessible name, so it says what this search looks at: `Filter by number, title,
label or person`.

Two behaviours had to keep working across the move, and both did, because the
protocol also grew `filters.set` — a module asking for a WHOLE choice, where
`{ scope: 'all' }` is "clear the narrowing" (`{}` would leave the default scope
on):

- **`goto` still clears what is hiding its target**, and only when something is:
  a walk to a ref the epic names leaves the scope alone. There is nothing left
  here to clear locally, so all of it is asked for. It then reads what the host
  *settled* on, which is deliberately not what was asked for, and only answers
  `found: true` about a row that survives it.
- **One press still puts everything back.** It reaches every group, including
  the query — an empty string is how a text group says it is at rest.
  The host's own "Show everything" makes the same call; so does the button on the
  panel this app draws when the narrowing has hidden every row.

A host may decline — the container is pinned, or is not on the kehikko that is
open — and neither promise is allowed to be partly true. A declined clear draws
the host's own sentence above the list; a declined `goto` answers `found: false`
with it, so the reader gets the fallback link instead of a page where their
reference is not drawn.

**And this is the move that bought the room.** Moving the kind and the state
alone bought nothing at 220 pixels, which the previous version of this section
said plainly: the bar was two lines with the seven collapsed behind one trigger,
and two lines afterwards with the query, the order trigger, the count and Clear.
Moving the query is what let the bar go, and the header went with it. The reason
the owner gave was consistency, twice; the hundred pixels came as a consequence.

What went with the bar is the `ResizeObserver` and the two forms it chose
between. Nothing measures itself any more, and the CSS-only version's hazard —
two buttons called `Closed`, one of them unpressable, both reachable by the
browser's own find — is not a thing this module can have.

### The order is the View menu's "Sort by"

Five orders — `Recent`, `Oldest`, `Number`, `State`, `Kind` — declared as one
`kehikot.header` switch (`orderItem` in `src/live/order.ts`), which the host draws
in the container's View menu beside the filters. It was five buttons on column
headings (issue #18: "Wasting space with the sort by column"), and the row they
needed cost its height and a set of spacer cells at every width.

It is a header switch rather than a filter group, and the old reasoning still
holds: **a filter hides rows and an order does not**, so the order is not offered
as a `kehikot.filters` group, which is where a reader looks when a list seems
short. The module owns the state, declares the header again after every press,
and still remembers the chosen order through `state.set`. An agent may press it
(`agents: true`); it is only a view choice. Every order is reachable at any
width through the host's own menu, by keyboard.

### What is left, at 220 pixels

The table, and one heading row of about twenty pixels carrying only the count. Where there were two rows of chrome and a header — about
a hundred pixels over a list that had three hundred to divide — there is now one
line, and it is the table's heading rather than a strip of controls above it.

The count could not move and did not: `37 of 412 shown` is drawn by this module,
from numbers only this module can count, because the host sees rows it does not
render in a document it cannot read. A host can say THAT something is narrowed —
it fills in its funnel icon — and it cannot say how much. Hiding rows without
saying how many is the exact thing `live/sift.ts` exists to prevent, so the count
sits in the title column, the one cell no width drops, and shortens to `37/412`
below 24rem rather than disappearing.

### The header is gone, and the freshness line went with it

A project name, a freshness line and a Refresh button used to wrap across a row
of their own here, because none of the three shortens. All three moved.

The refresh and the freshness are `kehikot.refreshable` now: this module says it
can be read again and **when its reading was taken** — the shared reading's own
`at` — and the host draws the button, the sentence and an auto-refresh interval
it stores per container. A press is `tracker.refresh`; see above.

The project name is a prefix on the count in the table's heading, shown from
24rem up, with the full path on the heading's own `title` at every width. That is
the rule every row already keeps: what a narrow container takes away is still on
the tooltip. The full path is never dropped from a failure panel, because a fix
for one of those happens in a terminal.

### The order survives a reload, and it is the only thing this module keeps

The format lives entirely in `src/live/keep.ts` and is read as defensively as
anything else off the wire — a version that no longer matches, a field naming an
order that no longer exists, or a string that is not JSON all read as "nothing
kept" rather than half-applying.

The kind, the state and the query are *not* in it, and the version has gone up
twice for that: to 2 when the kind and the state moved, to 3 when the query did.
The host holds all three per container now, so a copy in this string would be two
memories of one setting, written at different moments by different programs. A
string in an older shape is dropped whole rather than read in part — a remembered
narrowing partly applied is a page in a state nobody chose, and it looks exactly
like a page that is working.

The selection is *not* in it either, for the same family of reason, and neither
is the auto-refresh interval. Both are facts about a container or a canvas rather
than about this module. What is left is the order, which is not a filter, hides
nothing, and is therefore nothing the host draws or remembers.

### The absences scroll too

Every panel in `absence.tsx` is the whole of a container when it is drawn, and one of
them is three paragraphs long. At 220×340 the last of those paragraphs — the one
that says what to do about the situation — was below the bottom edge with nothing
to scroll. Each panel is now its own scroller inside the frame, which is the
shape the list already had; see the note about `h-full` in `main.tsx`.

Measured in Chromium at 220, 280, 320, 400 and 1200 pixels, in both themes,
against the real tracker of `~/Projects/kehikko` — 83 issues and 63 pull
requests, 146 rows: no page scrolls sideways at any width, every row is in the
document, and each failure state draws its own heading in both themes.

## Picking references out

A plain click on a row **selects it**; the checkbox beside it adds and removes.
Clicking the one selected row again clears the selection, which is why there is
no clear button — an empty `refs` is a real call, and it is the only way to say
"nothing is selected".

The selection this page draws is the one the host stated, never the one it asked
for. `selection.set` goes out, the host relays it into the `kehikot.context` every
framed module receives, and the tick appears when that comes back. Measured
against the real host: one request per click, the context 45ms later, the tick
25ms after that, and `data-selected` still `false` at the instant the context
landed. An optimistic tick would be this page asserting a canvas-wide fact on its
own authority, and it would disagree with the host in exactly the cases that
matter — a refusal, a clamp, a second module changing it in the same breath.

The call carries **refs and nothing else**. This page knows `gh#105` is a pull
request, because the reading's row says `kind: 'change'`; the protocol forbids
sending that, because a host can vouch that these
are the refs somebody picked and cannot vouch for what they are.

Opening the tracker was the whole-row click and is now an external-link icon at
the end of every row, named in its tooltip. The cheap, repeated, in-place act got
the click area; the rare, one-way one got a visible affordance. A row whose
reading carried no link draws the icon dimmed and inert with a tooltip saying so,
rather than leaving a gap that reads as a rendering failure.

### Changes are visible and say they are changes

GitLab spells the difference into the identifier — `#41` against `!41` — and
GitHub numbers issues and pull requests in one sequence and spells them both
`gh#`. So a change carries a mark and an issue does not — a glyph on a handful of
rows is those rows standing out, where a glyph on all of them is a column of
noise — and the row's tooltip names it in the tracker's own word, "pull request"
or "merge request", rather than in the filter's word. Nobody has ever gone
looking for "a change".

The row's `kind` is the only thing that says which it is. Parsing `gh#41` to
decide would be this app guessing at a fact the tracker handed it.

## Layout of the program

```
manifest.ts             what this app says about itself; parsed at load
doors.ts                what this app answers, for one request; holds no socket
vite.config.ts          the protocol's doors() — page, manifest, health check — on one origin
run.sh                  how a host starts it, and how a person does
src/wire/use-kehikot.ts the protocol's useHost, plus what is this app's: the states of knowing, and when a question is asked
src/live/ask.ts         tracker.get and tracker.refresh, and every way their answers can disappoint
src/live/collect.ts     the shared reading's rows -> rows, and the promise that none is dropped
src/live/sift.ts        the only place a row may be hidden, all three groups offered to the header, and why
src/live/order.ts       five orders, and where a value the reading lacks belongs
src/live/keep.ts        the one setting this module still owns, and how it is distrusted
src/live/markers.ts     the stack, who holds it, and activity by somebody else: every marker's sentence
src/live/faces.ts       people's faces: which avatar hosts are allowed, the image policy, initials, column widths
src/live/sight.ts       the states of knowing
src/view/               the row and its markers, the list, the table’s heading, failing sources, and the words for absence
dev/stub-host.ts        a host that is not one, for looking at all of the above
dev/measure.tsx         the numbers in this file
```

## Tests

`bun test` — 314 of them, and none needs a host, a login, or a network. The
host is a function in `test/ask.test.ts` and a stand-in on the real bridge in
`test/app.test.tsx`; the readings it answers with are built in
`test/fixtures.ts` and checked against the protocol's own schemas. The host side
of the shared reading is Jalez/kehikko#25.

- `test/collect.test.ts` holds the promise: every row of the reading that names
  a ref becomes a row, a row the schema refuses is drawn as unreadable rather
  than dropped, GitHub and GitLab list together, and a row is a `Sighting` with
  nothing translated.
- `test/ask.test.ts` holds that both questions are ones the protocol accepts —
  `{ project: true }`, and `within: TRACKER_REFRESH_WITHIN_MS` on a refresh —
  and throws every refusal and malformed answer at the page's half.
- `test/doors.test.ts` holds that the server answers the health check and that
  no door reading a tracker has come back.
- `test/absence.test.tsx` holds the words, word for word, and holds that every
  failure kind has a heading and a "what this is not" that no other kind shares.
- `test/app.test.tsx` drives the whole composition through the real bridge: the
  greeting, the read, the selection round trip — the request goes, nothing is
  ticked, the context comes back, and only then is the row selected — that a
  context which changes only the selection asks nothing, that a context naming
  a different epic asks nothing either, that `context.tracker.at` moving does
  ask, that nothing is asked on a timer, that a refresh is `tracker.refresh`
  followed by the reading, and that the rows stay on screen while a refresh is
  in flight. It also holds both round trips with the host: that
  nothing is offered before there is a reading, that the counts are in the
  labels and the third group is the typed query, that one press asks for all
  three back, that a `goto` over a row the header is hiding asks — and answers
  `found: false` with the host's own sentence when the host says no — and that
  the reading's own `at` is ANNOUNCED rather than left for the host to guess
  from when it last asked.
- `test/order.test.ts` holds every order to being a permutation and holds the two
  judgement calls. `test/keep.test.ts` throws nine kinds of rubbish at what the
  host hands back. `test/narrow.test.tsx` holds which pieces of a row are allowed
  to carry a hiding rule at all — never the identifier, the state or the
  markers; the title only under 24rem of the frame, and then in the accessible
  name and the tooltip — that the row is one line, and that every threshold is
  a container query and never a viewport one. Its
  second half is the table's heading: that the count always names both numbers,
  that the whole of it is on the heading's own `title`, and that every order —
  including the two whose column a narrow row drops — stays reachable.
- `test/markers.test.tsx` holds the stack order (bottom first whatever order the
  reading gave, a fork after the change it shares, a missing change ending the
  walk), that pressing an entry of the stack selects it, the review word and the
  assigned sentence, and the activity marker: somebody else draws it, the person
  themselves does not, and a host that does not know who the person is draws
  nothing.
- `test/faces.test.tsx` holds the faces: the avatar shown (16px, lazy, no
  referrer, `alt` the name), initials when there is no picture or it fails to
  load, a picture on a disallowed host refused, nothing loaded before the image
  policy is pinned or from a host it does not name, the policy itself (exactly
  the avatar hosts, pinned once), overlap and `+N`, every reviewer's state badge
  a different shape, and the faces columns as wide as the list needs.
- The parts focus is held in three places: `test/sift.test.ts` (what narrows,
  that a ref in no part is outside, that the count is of what the rest of the
  narrowing would draw), `test/narrow.test.tsx` (the heading draws nothing
  about picked parts), and
  `test/app.test.tsx` (that `context.parts` reaches the rows through the real
  bridge, that a later context re-draws them, and that a `goto` outside the
  focus is refused without moving a filter). None of it has been run in a real
  host.
