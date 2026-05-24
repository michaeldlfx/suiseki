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
# exactly the JS string literal `--define` needs to inline into version.ts.
VERSION_LITERAL="$(bun pm pkg get version)"

set -- src/cli.ts --compile \
  --define "SUISEKI_VERSION=$VERSION_LITERAL" \
  --outfile "$OUTFILE"

if [ -n "$TARGET" ]; then
  set -- "$@" --target="$TARGET"
fi

exec bun build "$@"
