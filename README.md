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

## Layout of the program

```
manifest.ts          what this app says about itself; parsed at load
vite.config.ts       the page, the manifest and the health check, on one origin
run.sh               how a roadmap starts it, and how a person does
src/wire/host.ts     the bridge: the greeting, one question at a time, goto/went
src/wire/use-roadmap.ts   the only place messages become state
src/live/collect.ts  a reading -> rows, and the promise that none is dropped
src/live/sift.ts     the only place a row may be hidden, and only on request
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
