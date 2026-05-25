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

# Stamp the version only when package.json declares one (with no version field it
# prints "{}"; leave it unstamped and let version.ts report "dev"). Dev builds get
# a "+dev" build-metadata suffix so a local binary is distinguishable from a
# release: it is semver-additive, so 0.1.1+dev sorts equal to 0.1.1 rather than
# claiming to be an earlier prerelease. The release pipeline sets SUISEKI_RELEASE
# to stamp the bare version (see build-release.sh).
if [ "$VERSION_LITERAL" != "{}" ]; then
  if [ -z "${SUISEKI_RELEASE:-}" ]; then
    # Insert the suffix inside the JSON quotes: "0.1.1" -> "0.1.1+dev".
    VERSION_LITERAL="${VERSION_LITERAL%\"}+dev\""
  fi
  set -- "$@" --define "SUISEKI_VERSION=$VERSION_LITERAL"
fi

if [ -n "$TARGET" ]; then
  set -- "$@" --target="$TARGET"
fi

exec bun build "$@"
