// Stamped into compiled binaries via `bun build --define SUISEKI_VERSION=...`
// (see scripts/build.sh). Plain `bun run` leaves it undefined, so dev builds
// report "dev". The canonical value lives in package.json; the release workflow
// asserts the git tag matches it before stamping.
declare const SUISEKI_VERSION: string

export const version =
  typeof SUISEKI_VERSION === "string" ? SUISEKI_VERSION : "dev"
