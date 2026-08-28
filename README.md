# References

Every piece of work an epic names — issues, merge requests, pull requests — as
one dense list. A row is an identifier, a state, a title and who is on it.

It is a program of its own: its own server, its own page, its own
`package.json`, its own port. It runs when nothing else on the machine is
running. A roadmap can also frame it, and then it has data.

```
bun install
bun run build      # the page, into dist/
./run.sh           # or PORT=7820 ./run.sh
bun test
```

Two documents come out of the server: the page at `/`, and the manifest at
`/.well-known/roadmap-module.json`, which is the one path a host ever asks for.

## Where the rows come from

Nowhere in this program. It holds no store, talks to no tracker and has no
credential to talk with. Every row is read out of one answer to one question —
`live.get`, asked over the frame in the shape
[`roadmap-module-protocol`](../../packages/protocol) defines — and it asks
`epics.list` as well, only when nothing has said which epic is open, so the page
can offer a list instead of a blank.

The host greets first. This page binds to the window that greeted it rather than
to an origin, because with no `declares.storage` it runs on an opaque origin and
every message from it arrives as `"null"` — a string every sandboxed frame in
every tab shares. The window handle cannot be forged; the origin cannot identify
anybody. See the essay at the top of `src/wire/host.ts`.

### Two spellings, for now

The protocol package renamed this material from journeys to epics — `epics.list`
is the method, `live.get` takes `{ epic }`, and context carries `epic` — and the
host in this repository still reads `params.slug` and still answers
`journeys.list`. A module that spoke only the new spelling would be correct and
useless.

So, in three places and no others, this app speaks both: it sends `live.get`
with the name under both keys, it reads a listing row's name from `epic` or
`slug`, and it re-asks `journeys.list` when — and only when — a host refuses
`epics.list` with `unknown-method`, which is the protocol's own word for "never
heard of it". Any other refusal is a host that knows the method and said no, and
asking again under another name would be arguing with it. All three come out
when no host in the field reads the older spelling.

## The absences

The whole argument of this surface. There are six ways to have no rows and they
are not the same fact:

| | what it means |
|---|---|
| **Waiting to be greeted.** | The page loaded under a second ago. A greeting may still come. |
| **Nothing has told me anything.** | Nothing greeted it. There is no epic, no reading, and nothing to list — which is not an empty list. *An empty list would mean somebody went and looked and found no work. Nobody has looked.* |
| **A roadmap is here, and no epic is open.** | Framed, and the context named no epic. Offers the epics the host will name. |
| **Asking about \<epic\>.** | The question is out. The one honest wait on this page. |
| **The roadmap refused the question.** | Both halves of the protocol's refusal — the word for the code, the sentence for the person — plus what that reason means for the reader, which differs per reason. |
| **This epic has never been refreshed.** | `live.get` answered `null`. Not an empty set of references: no reading. |
| **The last refresh found no references here.** | A reading, containing nothing. The one genuinely empty list, and the only place the word *found* is honest. |

And one the reader caused: **Nothing here matches what you asked for**, which
names how many exist and hands them all back with one press.

The words are in `src/view/absence.tsx`, in one file so they can be read against
each other, and they are tested word for word in `test/absence.test.tsx`.

## No windowing, and the measurement behind that

`bun run dev/measure.tsx`, on this machine:

```
   50  rows  collect    0.3ms  sift    0.0ms  render    19.6ms     551 DOM nodes (11.0 per row)
  400  rows  collect    0.4ms  sift    0.1ms  render    41.3ms    4401 DOM nodes (11.0 per row)
 1000  rows  collect    0.4ms  sift    0.2ms  render    81.0ms   11001 DOM nodes (11.0 per row)
 4000  rows  collect    1.9ms  sift    0.8ms  render   253.3ms   44001 DOM nodes (11.0 per row)
```

Four hundred rows is eleven elements each, forty milliseconds of work under this
program's control, and a document of four and a half thousand nodes. None of
those numbers is where a browser struggles. The number that would have been —
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
says windowing is not needed. The promise says it would not be worth it if it
were.

Caveat, stated because it matters: those numbers come from happy-dom, which does
not paint. They measure the work this program does, not the frame rate. What
they settle is that nothing here is doing anything expensive at four hundred
rows; the paint argument is settled by `content-visibility` rather than by them.

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
was always vertical. Measured across a sweep of pane widths with the real reading
of one epic:

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

### The filter and the order survive a reload, and the host holds them

This page declares no storage, so `localStorage` throws rather than returning
nothing. `state:keep` is the way round it: the host keeps one opaque string per
module, never reads it, and hands it back in the greeting. The format lives
entirely in `src/live/keep.ts` and is read as defensively as anything else off
the wire — a version that no longer matches, a field naming a filter that no
longer exists, or a string that is not JSON all read as "nothing kept" rather
than half-applying.

The selection is *not* in it. That is the host's, it is a fact about the canvas
rather than about this module, and a copy here would go stale on its own schedule.

### The absences scroll too

Every panel in `absence.tsx` is the whole of a pane when it is drawn, and one of
them is three paragraphs long. At 220×340 the last of those paragraphs — the one
that says what to do about the situation — was below the bottom edge with nothing
to scroll. Each panel is now its own scroller inside the frame, which is the
shape the list already had; see the note about `h-full` in `main.tsx`.

Measured in Chromium at 220×300, 220×340, 260×400, 320×400, 400×300, 400×700 and
900×700, with the real reading for one epic: no page scrolls sideways, all 24
references are in the document at every size with a checkbox and a tracker link
each, and the current filter is on screen at every size and after every press —
as seven pressed buttons in the wide form and as the trigger's own label in the
collapsed one.

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

### Changes were visible and did not say they were changes

They were on the list all along. What was missing was any way to tell one from an
issue: GitLab spells the difference into the identifier — `#41` against `!41` —
and GitHub numbers issues and pull requests in one sequence and spells them both
`gh#`. In the real reading of one epic, twenty-two GitHub issues and two GitHub
pull requests, and nothing on either of those two rows said what they were. Only
`merged` distinguished them, and only by accident; an open pull request was
indistinguishable from anything.

So a change carries a mark and an issue does not — a glyph on two rows out of
twenty-four is those two standing out, where a glyph on all twenty-four is a
column of noise — and the row's tooltip names it in the tracker's own word,
"pull request" or "merge request", rather than in the filter's word. Nobody has
ever gone looking for "a change".

The other half of it is position rather than design, and is worth stating because
it is what a reader actually hits: in the default order those two changes were
rows 23 and 24 of 24, and a 220×340 pane shows three. The `Changes` filter and the
`Kind` order are the remedies, and both now sit behind a control whose label says
what it is set to.

## Layout of the program

```
manifest.ts          what this app says about itself; parsed at load
vite.config.ts       the page, the manifest and the health check, on one origin
run.sh               how a roadmap starts it, and how a person does
src/wire/host.ts     the bridge: the greeting, one question at a time, goto/went
src/wire/use-roadmap.ts   the only place messages become state
src/live/collect.ts  a reading -> rows, and the promise that none is dropped
src/live/sift.ts     the only place a row may be hidden, and only on request
src/live/order.ts    five orders, and where a value the reading lacks belongs
src/live/keep.ts     what the host is asked to remember, and how it is distrusted
src/live/sight.ts    the six states of knowing
src/view/            the row, the list, the toolbar, and the words for absence
dev/stub-host.ts     a roadmap that is not one, for looking at all of the above
dev/measure.tsx      the numbers in this file
```

## Tests

`bun test` — the wire against a host that lies, is not there, or answers a
question nobody asked; the six absences, word for word; the filter, including
that a state nobody could read is never counted as open; and, twice, that four
hundred references become four hundred rows.

`test/order.test.ts` holds every order to being a permutation — same rows, same
count, different sequence — and holds the two judgement calls: a dateless row is
last in both directions, and an unreadable state sorts after `closed`.
`test/keep.test.ts` throws nine kinds of rubbish at what the host hands back and
requires all of them to read as "nothing kept" rather than as half a filter.
`test/app.test.tsx` drives the selection round trip through the real bridge: the
request goes, nothing is ticked, the context comes back, and only then is the row
selected — plus that a context which changes only the selection does not throw
the reading away, which is what made every tick refetch twenty-four rows.

`test/narrow.test.tsx` is the odd one and says why in its own header: happy-dom
does no layout, so it cannot measure a title's width. What it holds instead is
which pieces of a row are allowed to carry a hiding rule at all — none of the
three that may never be dropped — that every threshold in the row is a container
query and never a viewport one, that the row carries what it drops as its own
tooltip, and that the filter groups wrap rather than overflow. The widths
themselves are measured in a browser; the numbers are above.
