#!/usr/bin/env sh
set -e

# Compile a single suiseki binary with the version stamped in.
#
# Usage: scripts/build.sh <outfile> [bun-target]
#   <outfile>     where to write the binary (e.g. bin/suiseki)
#   [bun-target]  optional --compile --target value (e.g. bun-linux-x64-baseline)

OUTFILE="${1:-bin/suiseki}"
TARGET="$2"

# `bun pm pkg get version` prints the value JSON-quoted (e.g. "0.1.0"), which is
# exactly the JS string literal `--define` needs to inline into version.ts. With
# no version field it prints "{}".
VERSION_LITERAL="$(bun pm pkg get version)"

set -- src/cli.ts --compile --outfile "$OUTFILE"

# Stamp the version only when package.json declares one. Local/dev builds have no
# version field (it is added by CI on release), so leave it unstamped and let
# version.ts report "dev". Released binaries build from a tagged commit that has
# the version, so they stamp correctly.
if [ "$VERSION_LITERAL" != "{}" ]; then
  set -- "$@" --define "SUISEKI_VERSION=$VERSION_LITERAL"
fi

if [ -n "$TARGET" ]; then
  set -- "$@" --target="$TARGET"
fi

exec bun build "$@"
