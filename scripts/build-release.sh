#!/usr/bin/env sh
set -e

# Cross-compile every release target into dist/ and write a checksums file.
# Bun compiles all targets from a single machine, so this runs locally and in CI
# alike (see .github/workflows/release.yaml).

DIST_DIR="dist"

# bun --target  ->  dist/ output filename.
# Keep these asset names in sync with install.sh and the Homebrew formula.
TARGETS="
bun-darwin-arm64:suiseki-darwin-arm64
bun-darwin-x64:suiseki-darwin-x64
bun-linux-x64-baseline:suiseki-linux-x64
bun-linux-arm64:suiseki-linux-arm64
bun-linux-x64-musl:suiseki-linux-x64-musl
bun-linux-arm64-musl:suiseki-linux-arm64-musl
bun-windows-x64:suiseki-windows-x64.exe
bun-windows-arm64:suiseki-windows-arm64.exe
"

VERSION="$(bun pm pkg get version | tr -d '"')"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "Building suiseki $VERSION release binaries..."
for entry in $TARGETS; do
  target="${entry%%:*}"
  outname="${entry##*:}"
  printf '  %-26s -> %s\n' "$target" "$DIST_DIR/$outname"
  scripts/build.sh "$DIST_DIR/$outname" "$target"
done

echo "Generating checksums..."
(
  cd "$DIST_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum suiseki-* >checksums.txt
  else
    shasum -a 256 suiseki-* >checksums.txt
  fi
)

echo "Done. Artifacts in $DIST_DIR/:"
ls -1 "$DIST_DIR"
