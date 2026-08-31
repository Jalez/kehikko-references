# References

Every issue and pull request in a project, read from the project's own GitHub,
as one dense list. A row is an identifier, a state, a title and who is on it.

It is a program of its own: its own server, its own page, its own
`package.json`, its own port. It runs when nothing else on the machine is
running. A roadmap can also frame it, and then it knows which project to read.

```
bun install
./run.sh           # or PORT=7820 ./run.sh
bun test
bun run dev/stub-host.ts   # a roadmap that is not one, for looking at all of it
```

Three documents come out of the server: the page at `/`, the manifest at
`/.well-known/roadmap-module.json`, which is the one path a host ever asks for,
and `/api/references`, which is this app's own door and the only thing here that
spends a credential.

## Where the rows come from, and what changed

They used to come from the roadmap. Every row was an answer to `live.get` — the
roadmap app's cached reading of the trackers, refreshed by somebody remembering
to run `refresh_epic` — so this list was exactly as current as the last time a
person thought about it, and "is this issue still open" was a question the page
could quote and not answer. The owner asked the obvious question:

> Issues/MRs can be gotten from the project's own GitHub, no? Doesn't need
> separate maintenance.

They can. `roadmap.context` has carried `projectPath` since protocol 0.8 — an
absolute folder on this machine that the host vouches for — and a folder with a
GitHub remote can simply be asked. So this app's own server runs

```
gh issue list --state all --limit 400 --json …
gh pr list    --state all --limit 400 --json …
```

with its working directory set to that folder, and the page fetches the result
from `/api/references`. There is no refresh to remember any more because there
is no second copy to go stale.

### What that cost, said plainly

**The list is the project's, not the epic's.** The roadmap's reading was a
curated set: the refs an epic's narrative named, plus pull requests discovered
against them. GitHub records nowhere which epic an issue belongs to, so that set
cannot be rebuilt from the tracker, and the choice was between a fresh list of
everything in the project and a stale list of the right things.

Freshness won, because the failure of the other one is invisible. A closed issue
still reading `opened` looks exactly like an open issue; a list that is longer
than somebody expected looks exactly like what it is. The summary, the guidance,
the header and every paragraph in `absence.tsx` say "this project".

### What did not change, deliberately

**A ref is still the string `gh#105`.** That is protocol-visible: it goes out on
`selection.set`, the host relays it into the context every framed module
receives, and Diff looks a patch up by it. So `tracker/gh.ts` builds the same
four bags `live.get` used to answer with — `issues`, `mrs`, `ghIssues`, `ghPrs`,
keyed exactly as the roadmap keyed them — and `src/live/collect.ts` is untouched
by the whole change. One function, `refOf`, spells a ref, and one test holds it.

**The selection round trip is untouched.** A click asks; the host answers by
sending a context; the tick appears when that comes back. See below.

**The filter and the order still travel by `state:keep`.** `localStorage` would
work now that the page has a real origin, and it is still not used. The host
holding one opaque string it cannot read was never a workaround for the sandbox;
it was the right shape.

### GitLab, and the decision not to pretend

`glab` is installed on this machine and is not called. Nothing in this workspace
is on GitLab, so a GitLab path would be code that has never once run against a
real repository, shipped under a summary claiming it works. So the summary no
longer says "merge request", the two GitLab bags are present and empty, and the
row, the filter and the `!41` spelling are all still in place waiting for the day
somebody has a GitLab project to prove one call to `glab mr list` against.

## Two capabilities, where there were four

`selection:set` and `state:keep`. `live:read` came out because nothing calls it:
there is no `live.get` anywhere in this program. `epics:read` came out with it,
and that one was a capability that WORKED — it existed so a page with no epic
open could offer a picker instead of a blank, and there is now no such state to
be in. Keeping either declaration would be this module telling everyone who reads
its manifest that it intends to ask a question it will never ask.

`storage: true` went in, and it is the one that is worth reading `manifest.ts`
about. The short version: an opaque origin cannot fetch its own server without a
permissive CORS header, and a permissive CORS header on a door that runs `gh`
under this machine's login lets any page in any tab read the tracker of every
private repository checked out here. Declaring storage keeps the real origin,
makes those fetches same-origin, and lets the server send no CORS header at all.
The check is one line and lives in `vite.config.ts`:

```
curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7820/ | grep -i access-control
```

It must print nothing.

## Running `gh` safely

**Nothing a request supplies ever becomes an argument.** There is no `--repo`
anywhere: `gh` reads the repository out of the git remote of the directory it is
run in, so the repository's identity comes from the project folder rather than
from a string somebody sent. `spawn` is given a program and an array with
`shell: false`, so there is no parser between here and `execve`.

What a caller does influence is the working directory, and `tracker/project.ts`
is the whole of what stands between a request and it — absolute, bounded, free of
control characters, resolved, existing, a directory, containing `.git`. That last
one is the largest narrowing: the set of folders this door will run in is the set
of git checkouts on this machine.

The residue is written down rather than hidden. The path arrives from the page,
which was told it by the host; between the host and here it crosses a
`postMessage` and a `fetch`, and this process cannot ask the host whether it
really said that. So a caller who can reach this port can read the issue list of
any repository checked out on this machine — which is why the manifest declares
storage and the server sends no CORS header, closing the browser's door. What is
left is a socket that anything already running as this user could reach anyway.

## When a read happens

On the project **changing**, and on the **Refresh** control. Not on a context
arriving, not on a timer, and never on a render.

Context stopped being a message that only means "the reader moved" — it carries
the canvas's selection, so the host sends one after every `selection.set`,
including ours, a few milliseconds after a click. Reading the tracker on each of
those would be a subprocess and a network call per tick of a checkbox, and the
click that caused it would look like a bug in the list. So the read is keyed to
the project changing, and a repeated context about the same project is a normal
event whose correct response is to read the theme and the selection and leave the
reading alone.

There is no interval anywhere in this module. An interval is a program spending
somebody's GitHub rate limit while nobody is looking at the pane, and it buys
freshness that a timestamp beside a button buys honestly.

### The pane stays usable while a read is in flight

`busy` is held beside `sight` rather than inside it, and that separation is the
whole of it. A read over rows already on screen leaves them there: the list goes
on scrolling, the filter goes on filtering, the selection goes on being the
selection, and the header says `reading GitHub…` instead of a timestamp. Folded
into the state machine, every refresh would blank the pane for as long as GitHub
took — and a list that shows nothing for three seconds is a list that looks
broken.

The whole-pane wait exists for exactly one case: busy **and** nothing to show.

### Caching, and where it lives

`<projectPath>/.kehikot/references/tracker.json`.

Beside the project rather than in this repository, matching the convention the
storage move is settling on — `.kehikot` because Kehikot is the app and a kehikko
is one canvas in it, and a subdirectory per module rather than a shared folder.
The folder name and the id-to-folder derivation are going into the protocol
package; at the time of writing they had not shipped, so the two constants are
spelled in `tracker/cache.ts` and come out the day they land.

The policy is four lines, in `doors.ts`:

1. A cache present and under ten minutes old, on a request that did not ask for
   freshness, is the answer. No process is started.
2. Otherwise `gh` runs.
3. A successful run is written down and returned.
4. A failed run returns the cache if there is one, **with** the failure, and the
   failure alone if there is not.

Step four is the one worth defending, and it is why this is not the stale list
nobody knows how to refresh. The page is always told which of the two it is
looking at and when the reading was taken, and it says so in the header:
`read 2026-08-31T10:49:48Z` for a live one and `last read …` for a cached one,
with a Refresh button beside it. A failed read over a cache draws the rows AND a
sentence above them saying the fresh read did not happen and why. Neither of the
two easy lies is available: not an error page over a list somebody could have
had, and not a list quietly pretending to be current.

The folder hides itself from git. `remember()` writes a `.gitignore` containing
`*` inside `.kehikot/references/`, which ignores that directory's whole contents
including itself, so git reports nothing for it. That is done instead of editing
`<projectPath>/.gitignore`, because this app has no business rewriting a file a
person maintains — and it makes the promise true whether or not somebody has
added a rule of their own. A hand-edited one is left alone.

## The absences

The whole argument of this surface. There are many ways to have no rows and they
are not the same fact:

| | what it means |
|---|---|
| **Waiting to be greeted.** | The page loaded under a second ago. A greeting may still come. |
| **Nothing has told me anything.** | Nothing greeted it. There is no project, no reading, and nothing to list — which is not an empty list. *An empty list would mean somebody went and looked and found no work. Nobody has looked.* |
| **A roadmap is here, and it named no project folder.** | Framed, and `projectPath` was null. Not a fault: a host with no filesystem of its own knows the project's name and has no folder to point at, and the protocol says so. |
| **Reading the tracker in \<project\>.** | `gh` is running. The one honest whole-pane wait, and only when there is nothing already drawn. |
| **This project's tracker has nothing in it.** | A reading, containing nothing. The one genuinely empty list, and the only place the word *found* would be honest. |

And one the reader caused: **Nothing here matches what you asked for**, which
names how many exist and hands them all back with one press.

### And the failures, which are seven sentences and not one

A CLI fails in more ways than a host does, and "could not read the tracker" over
all of them sends somebody to check their network when they are not logged in.
So `diagnose()` in `tracker/gh.ts` decides which, from the exit code and from
phrases captured out of real `gh` output on this machine, and the page draws the
door's sentence plus its own paragraph saying what it is NOT and what to do.

| | heading | offers a retry |
|---|---|---|
| `not-a-repo` | This project is not a git repository. | no — there is nothing to press |
| `no-remote` | This repository has no remote, so it has no tracker. | no |
| `no-gh` | The GitHub CLI is not on this machine. | no |
| `bad-project` | That project folder is not one this app can read. | no |
| `unauthenticated` | This machine is not logged in to GitHub. | yes |
| `offline` | GitHub could not be reached. | yes |
| `rate-limited` | GitHub is rate-limiting this machine. | yes |
| `refused` | The GitHub CLI refused this read. | yes, and shows `gh`'s own words |
| `door` | This app's own server did not answer. | yes |

`not-a-repo` is the one that is not a failure at all. A project can perfectly
well be a folder of LaTeX with no `.git` in it; nothing is broken, and its
paragraph has no remedy in it because there is nothing to remedy. The retry
button is withheld from the four that cannot pass on their own, because a button
that cannot work invites somebody to press it four times before reading the
sentence saying it will not help.

The words for the failures live in `tracker/`, beside the code that knows which
one it is — a deliberate exception to "the sentences live in `absence.tsx`",
because the door is the only thing holding the exit code and the CLI's own
output. What `absence.tsx` owns for those is the heading and the second
paragraph, which are about the reader rather than about the process.

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

`--limit 400` in `tracker/gh.ts` is that number said back to `gh`, and the page
says how many it asked for rather than implying it saw everything.

## One layout, and what a narrow column loses

The row is a flex line in a `@container`, so it responds to the width of the
frame it is in rather than to the width of the window — those are not the same
number when the frame is a column in somebody else's page. As the container
narrows, pieces drop from the right in this order:

1. **Labels** (under 48rem) — the most decorative thing on the row, and still
   reachable, because the filter searches them.
2. **The date** (under 36rem) — it answers "is this fresh", which the header
   answers once for the whole list.
3. **The people** (under 24rem) — reluctantly, and last, because *who is on it*
   is half of what somebody scans for. Searchable too.

Never dropped, at any width: **the identifier, the state and the title**. The
identifier is what somebody is looking for, the state is what they came to
check, and the title is how they recognise the right one when they only half
remember the number. A row that has lost one of those three has stopped being a
row and become a hint.

Whatever the width takes away is on the row as its own `title`, in the order the
wide layout would have drawn it. "The filter searches it" is a fair answer to
somebody who knows the word to type and no answer at all to somebody who does
not, so hovering a row says everything the row would say at full width.

### Two lines under 20rem, and the measurement that forced it

"Never dropped" was a claim rather than a fact until it was measured. In a
Chromium pane 220 pixels wide — an ordinary size on a grid canvas — the fixed
5.5rem identifier column and 4.5rem state column left the title **twelve
pixels**. The row was in the document and findable by Ctrl+F, and unreadable.

So under 20rem the row is two lines: the identifier and the state share the
first, the title has the whole of the second. It costs about sixteen pixels of
height per row, and the same measurement reads **154 pixels** of title — it was
196 before the row grew a checkbox and a tracker link, which take 28 and 30
pixels off the width at every size. The fixed columns, which exist so a column of
identifiers can be scanned rather than read, come back at 28rem, where there is
width to pay for them.

The `@container` is the pressable middle of the row rather than the row, and the
consequence is not what it looks like: a `@xx:` class is measured against the
nearest container *ancestor*, and an element is not its own ancestor. So the
stack-or-line decision, written on that box, is still measured against the pane;
the labels, date and people columns, written on its children, are measured
against the box, which is 58 pixels narrower. Which is right — "is there room for
a second line" is a question about the pane, and "is there room for the people"
is a question about what is left after the two controls have taken theirs.

### The filter bar wraps above 21rem and collapses below it

At 220 pixels the seven buttons and the count came to 226 and the whole page got
a sideways scrollbar. Wrapping fixed the scroll and did not fix the cost, which
was always vertical. Measured across a sweep of pane widths with a real reading:

```
        before   after
200px    149px    71px
220px    123px    71px
320px    101px    63px
340px     71px    71px
400px     71px    71px
900px     49px    49px
```

At 220×300 the bar was **123 pixels and the list it filtered was 132** — the
filter had become the same size as the thing filtered. So below **21rem (336
pixels)** the two groups collapse into one control, and the threshold sits inside
the measured step: every width below it was 101 pixels of bar or more, every
width at or above it was 81 or less. At 220×300 the list goes from 132 pixels to
184.

Scrolling the bar inside its own container is still rejected at every width, for
the reason the count exists: the pressed button *is* the current filter, and a
strip scrolled back to its left edge hides `Closed` while the list goes on showing
only closed things. Icon-only buttons were rejected on the vocabulary — `Any`,
`Open`, `Merged` and `Closed` have no honest glyphs.

What survives the collapse is the requirement rather than the form: the trigger's
label is the setting, never the word "Filters". It reads `All`, or `Closed`, or
`Changes · Merged · Oldest`. The set is one press away; the current state is not.

The bar renders one form and not two, and measures itself with a `ResizeObserver`
to decide which. A CSS-only version left both in the document at every width, and
two buttons called `Closed` — one of them unpressable — is something the
browser's own find reaches and a test cannot disambiguate.

### The order is a labelled trigger at every width

Five orders — `Recent`, `Oldest`, `Number`, `State`, `Kind` — and they live behind
a press even in a wide pane, which is the shape the filter was refused. The
difference is what the two controls can do: **a filter hides rows and an order
does not.** The failure this bar exists to prevent is somebody reading a list of
two and concluding the other twenty-two are not there, and only the filter can
cause it. So the filter has to be *readable* and the order only has to be
*visible*, which a trigger labelled `Oldest` satisfies.

A row with no date sorts **last in `Recent` and last in `Oldest`**, which looks
inconsistent and is the point: an empty date is not a small date, and floating
undated rows to the head of "oldest first" would read as a claim that they have
been sitting longest. A state nobody could read sorts after `closed`, for the
same reason. Ties keep the order `collect` produced, which is recency.

### The header, and the one control on it

A project name, a freshness line and a Refresh button, wrapping in a narrow pane
because none of the three shortens. The name is the last segment of the path with
the whole path on its `title` — a 220-pixel pane cannot hold
`/Users/somebody/Projects/roadmap` without pushing the page sideways, and the
segment is what people call the thing. The full path is never dropped from a
failure panel, because a fix for one of those happens in a terminal.

The button is a glyph named in its tooltip, which is the same trade the tracker
link on a row makes: a word would cost the project name most of a narrow line,
and this control is reached for rarely. It is disabled while a read is in flight,
because two reads racing is two subprocesses and one answer that wins for no
reason anybody could predict.

### The filter and the order survive a reload, and the host holds them

The format lives entirely in `src/live/keep.ts` and is read as defensively as
anything else off the wire — a version that no longer matches, a field naming a
filter that no longer exists, or a string that is not JSON all read as "nothing
kept" rather than half-applying.

The selection is *not* in it. That is the host's, it is a fact about the canvas
rather than about this module, and a copy here would go stale on its own
schedule.

### The absences scroll too

Every panel in `absence.tsx` is the whole of a pane when it is drawn, and one of
them is three paragraphs long. At 220×340 the last of those paragraphs — the one
that says what to do about the situation — was below the bottom edge with nothing
to scroll. Each panel is now its own scroller inside the frame, which is the
shape the list already had; see the note about `h-full` in `main.tsx`.

Measured in Chromium at 220, 280, 320, 400 and 1200 pixels, in both themes,
against the real tracker of `~/Projects/roadmap` — 83 issues and 63 pull
requests, 146 rows: no page scrolls sideways at any width, every row is in the
document, and each failure state draws its own heading in both themes.

## Picking references out

A plain click on a row **selects it**; the checkbox beside it adds and removes.
Clicking the one selected row again clears the selection, which is why there is
no clear button — an empty `refs` is a real call, and it is the only way to say
"nothing is selected".

The selection this page draws is the one the host stated, never the one it asked
for. `selection.set` goes out, the host relays it into the `roadmap.context` every
framed module receives, and the tick appears when that comes back. Measured
against the real host: one request per click, the context 45ms later, the tick
25ms after that, and `data-selected` still `false` at the instant the context
landed. An optimistic tick would be this page asserting a canvas-wide fact on its
own authority, and it would disagree with the host in exactly the cases that
matter — a refusal, a clamp, a second module changing it in the same breath.

The call carries **refs and nothing else**. This page knows `gh#105` is a pull
request, because it read it out of `ghPrs` and the bag is the only thing that
says so; the protocol forbids sending that, because a host can vouch that these
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

Which bag a row came out of is the only thing that says which it is. Parsing
`gh#41` to decide would be this app guessing at a fact the tracker handed it:
`gh pr list` returned that number, and that is how it told us.

## Layout of the program

```
manifest.ts             what this app says about itself; parsed at load
doors.ts                what this app answers, for one request; holds no socket
vite.config.ts          the page, the manifest, the doors and one header, on one origin
run.sh                  how a roadmap starts it, and how a person does
tracker/run.ts          how a CLI is run, and the seam that keeps everything above it testable
tracker/gh.ts           the argument lists, the seven troubles, and gh's JSON -> a reading
tracker/project.ts      which folders a read may run in, and the residue of that
tracker/cache.ts        the last reading, beside the project, and how somebody refreshes it
src/wire/host.ts        the bridge: the greeting, one question at a time, goto/went
src/wire/use-roadmap.ts the only place messages become state, and the only place a read is decided
src/live/ask.ts         one relative fetch, and every way its answer can disappoint
src/live/collect.ts     a reading -> rows, and the promise that none is dropped
src/live/sift.ts        the only place a row may be hidden, and only on request
src/live/order.ts       five orders, and where a value the reading lacks belongs
src/live/keep.ts        what the host is asked to remember, and how it is distrusted
src/live/sight.ts       the states of knowing
src/view/               the row, the list, the toolbar, and the words for absence
dev/stub-host.ts        a roadmap that is not one, for looking at all of the above
dev/measure.tsx         the numbers in this file
```

## Tests

`bun test` — 206 of them, and none shells out, needs a login, or notices whether
the machine is online. Two seams make that true and they are the same seam the
host uses: `Runner` in `tracker/run.ts` for the subprocess, and `Fetcher` in
`src/live/ask.ts` for the page's own call.

- `test/gh.test.ts` holds the argument lists — including that no element of one
  ever came from a request, and that there is no `--repo` for a hostile string
  to be — the seven troubles against `gh` output captured verbatim from this
  machine, and that `gh`'s JSON becomes rows `collect.ts` already knew how to
  read. One assertion in it is the whole protocol contract: `refOf(105)` is
  `gh#105`.
- `test/doors.test.ts` holds the caching policy against real temporary
  directories: when a read happens, when it does not, that the Refresh press is
  the only way past the cache, that a cache full of rubbish reads as no cache,
  and that a failed read over a cache hands back the rows AND the sentence.
- `test/ask.test.ts` throws every malformed answer at the page's half of the
  read, because the page and the door are separately deployable and a page
  talking to a door that has moved on is the ordinary state of a dev server
  mid-edit.
- `test/absence.test.tsx` holds the words, word for word, and holds that every
  failure kind has a heading and a "what this is not" that no other kind shares.
- `test/app.test.tsx` drives the whole composition through the real bridge: the
  greeting, the read, the selection round trip — the request goes, nothing is
  ticked, the context comes back, and only then is the row selected — that a
  context which changes only the selection reads nothing, that a context naming
  a different epic reads nothing either, that nothing is read on a timer, and
  that the rows stay on screen with `reading GitHub…` in the header while a
  refresh is in flight.
- `test/order.test.ts` holds every order to being a permutation and holds the two
  judgement calls. `test/keep.test.ts` throws nine kinds of rubbish at what the
  host hands back. `test/narrow.test.tsx` holds which pieces of a row are allowed
  to carry a hiding rule at all — none of the three that may never be dropped —
  and that every threshold is a container query and never a viewport one.
