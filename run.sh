#!/usr/bin/env bash
# Every module ships one of these, at the root of its directory, named exactly
# this. It is the whole of what a roadmap knows about starting one: no
# arguments, no shell written into a registration file, one script the owner can
# read before they press anything.
#
# Two rules it has to keep:
#   - listen on $PORT when one is set, so two apps cannot be registered onto the
#     same port by accident;
#   - stay in the foreground. Whoever started this process stops that process; a
#     script that forks and returns leaves them holding a pid that stops
#     nothing. Hence `exec`: the server becomes this process rather than a child
#     of it, and a signal aimed here lands on the thing that is listening.
#
# It is also simply how a person runs this app on their own: `./run.sh`, or
# `PORT=7820 ./run.sh`. There is nothing about it that needs a roadmap.
#
# ## There is no build here any more, and no `dist`
#
# There used to be. The page was built into `dist/`, a small server handed it
# off disk, and that server said in words when the build was missing. The
# argument for it was that starting should be starting — a start that shells out
# to a build is a start that fails when the network is down.
#
# The argument was fine and the shape was still wrong, because this program is
# not deployed: it runs on the machine of the person editing it. What `dist`
# actually bought was a STALE page served with a 200 — every symptom of a
# working app and none of the changes — and that failure has now cost this
# codebase whole afternoons three separate times, in three different programs.
# A missing build announces itself. A stale one does not.
#
# So Vite serves the page, as Vite is for: no build step, no artifact in the
# tree, an edit visible on save. The manifest and the health check are
# middleware in front of the same server — see `doors()` in `vite.config.ts` —
# because a module is one origin or it is nothing.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing…" >&2
  bun install >&2
fi

exec bunx vite --host 127.0.0.1 --port "${PORT:-7820}" --strictPort
