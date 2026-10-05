#!/usr/bin/env bash
# Every module ships one of these, at the root of its directory, named exactly
# this. It is the whole of what a host knows about starting one: no
# arguments, no shell written into a registration file, one script the owner can
# read before they press anything.
#
# Two rules it has to keep:
#   - listen on $PORT when one is set, so two apps cannot be registered onto the
#     same port by accident. This line used to say that itself — `--port
#     "${PORT:-7820}" --strictPort` — and it no longer does. `serves()` in
#     `vite.config.ts` reads $PORT now, falling back to `PREFERRED_PORT` in
#     `manifest.ts`, which is the one place the number is written. The rule is
#     unchanged: whoever starts this chose the port, and a host that spawns
#     this script passes the port from the registration, which is the address it
#     is about to go and read.
#
#     `--strictPort` went with it, and that is the part worth saying out loud.
#     What it bought was an app that DIED on a taken port — `Error: Port 7820 is
#     already in use`, exit 1 — rather than one answering somewhere nobody was
#     looking, and that was the only honest option while nothing handled a
#     collision. `serves()` handles it: a free 7820 is taken in silence, this app
#     already answering there ends the start cleanly instead of making a second
#     copy, and anything else is a loud move to the next free port with
#     `~/Library/Application Support/Kehikot/modules` rewritten to wherever the server actually bound. The
#     registry is what a host reads, so the registry is what is kept true.
#   - stay in the foreground. Whoever started this process stops that process; a
#     script that forks and returns leaves them holding a pid that stops
#     nothing. Hence `exec`: the server becomes this process rather than a child
#     of it, and a signal aimed here lands on the thing that is listening.
#
# It is also simply how a person runs this app on their own: `./run.sh`, or
# `PORT=7821 ./run.sh`. There is nothing about it that needs a host.
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

# Install when nothing is installed, AND whenever bun.lock or package.json is
# newer than the last install here — the same rule as the host's own run.sh. A
# pull that moves the protocol pin leaves the old package in node_modules, and
# a page that imports a name the old package does not have draws nothing.
# `--frozen-lockfile`, so a start installs exactly what bun.lock says and never
# rewrites it behind somebody's back. The stamp is written only after an
# install that succeeded.
INSTALLED=node_modules/.kehikot-installed
VITE_FORCE=
if [ ! -d node_modules ] || [ ! -f "$INSTALLED" ] || [ bun.lock -nt "$INSTALLED" ] || [ package.json -nt "$INSTALLED" ]; then
  echo "installing…" >&2
  if [ -f bun.lock ]; then
    bun install --frozen-lockfile >&2 || { echo "bun install --frozen-lockfile failed: bun.lock does not match package.json. Run \`bun install\` and commit bun.lock." >&2; exit 1; }
  else
    bun install >&2
  fi
  touch "$INSTALLED"
  # Rebuild Vite's pre-bundle rather than trust one made from the old packages.
  VITE_FORCE=--force
fi

exec bunx vite $VITE_FORCE
