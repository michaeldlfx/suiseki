import { chmod, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { type } from "arktype"
import {
  GITHUB_REPO,
  type ReleaseClient,
  UpgradeError,
  upgrade,
} from "./upgrade-command"
import { version } from "./version"

const vLatestRelease = type({ tag_name: "string" })

// Bun standalone executables resolve modules from a virtual filesystem
// ("/$bunfs/..." on Unix, "~BUN" on Windows). `bun run` from source resolves to
// real paths. Upgrade replaces process.execPath, which is only the suiseki
// binary in a standalone build — under `bun run` it is the bun runtime.
function isCompiledStandalone(): boolean {
  return (
    import.meta.url.includes("/$bunfs/") || import.meta.url.includes("~BUN")
  )
}

async function fetchLatestVersion(): Promise<string> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "suiseki",
      },
    })
  } catch (error) {
    throw new UpgradeError(
      `Could not reach GitHub to check for updates: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!response.ok) {
    throw new UpgradeError(
      `GitHub releases API returned ${response.status} ${response.statusText}`,
    )
  }

  const parsed = vLatestRelease(await response.json())
  if (parsed instanceof type.errors) {
    throw new UpgradeError(
      `Unexpected response from GitHub releases API: ${parsed.summary}`,
    )
  }

  return parsed.tag_name.replace(/^v/, "")
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { "User-Agent": "suiseki" } })
  if (!response.ok) {
    throw new UpgradeError(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

async function replaceRunningBinary(bytes: Uint8Array): Promise<void> {
  const executablePath = process.execPath
  const directory = dirname(executablePath)
  const temporaryPath = join(directory, `.suiseki-upgrade-${process.pid}`)

  try {
    await writeFile(temporaryPath, bytes)
    await chmod(temporaryPath, 0o755)
    // Rename over the running binary. On Unix the running process keeps its
    // open inode, so replacing the file is safe and atomic within the directory.
    await rename(temporaryPath, executablePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    const code = (error as NodeJS.ErrnoException).code
    if (code === "EACCES" || code === "EPERM") {
      throw new UpgradeError(
        `Permission denied writing to ${directory}. Re-run with elevated permissions (e.g. sudo suiseki upgrade).`,
      )
    }
    throw error
  }
}

const gitHubReleaseClient: ReleaseClient = {
  fetchLatestVersion,
  downloadBytes,
  replaceRunningBinary,
}

export async function runUpgradeCommand(): Promise<void> {
  if (!isCompiledStandalone()) {
    throw new UpgradeError(
      "upgrade only works on an installed suiseki binary, not when running from source. " +
        `Install a release with: curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/install.sh | sh`,
    )
  }

  const message = await upgrade({
    platform: process.platform,
    arch: process.arch,
    currentVersion: version,
    client: gitHubReleaseClient,
  })
  process.stdout.write(`${message}\n`)
}
