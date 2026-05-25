export const GITHUB_REPO = "michaeldlfx/suiseki"

export class UpgradeError extends Error {
  override name = "UpgradeError"
}

type ResolveReleaseAssetNameParams = {
  platform: NodeJS.Platform
  arch: string
}

export function resolveReleaseAssetName({
  platform,
  arch,
}: ResolveReleaseAssetNameParams): string {
  let archPart: string
  if (arch === "arm64") {
    archPart = "arm64"
  } else if (arch === "x64") {
    archPart = "x64"
  } else {
    throw new UpgradeError(`Unsupported architecture: ${arch}`)
  }

  if (platform === "darwin") {
    return `suiseki-darwin-${archPart}`
  }
  if (platform === "linux") {
    return `suiseki-linux-${archPart}`
  }
  if (platform === "win32") {
    return `suiseki-windows-${archPart}.exe`
  }
  throw new UpgradeError(`Unsupported platform: ${platform}`)
}

// Returns 1 if a > b, -1 if a < b, 0 if equal. Compares dotted numeric
// segments (1.2.10 > 1.2.9); non-numeric/pre-release suffixes are not handled
// because releases are always plain semver from `bun pm version`.
export function compareVersions(a: string, b: string): number {
  const segmentsA = a.split(".").map((segment) => Number.parseInt(segment, 10))
  const segmentsB = b.split(".").map((segment) => Number.parseInt(segment, 10))
  const length = Math.max(segmentsA.length, segmentsB.length)
  for (let index = 0; index < length; index++) {
    const valueA = segmentsA[index] ?? 0
    const valueB = segmentsB[index] ?? 0
    if (valueA > valueB) return 1
    if (valueA < valueB) return -1
  }
  return 0
}

export function parseChecksumsFile(text: string): Record<string, string> {
  const checksums: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^([0-9a-f]+)\s+(.+)$/)
    if (match?.[1] != null && match[2] != null) {
      checksums[match[2]] = match[1]
    }
  }
  return checksums
}

function sha256Hex(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

// The network/filesystem side effects sit behind this port so the upgrade
// decision logic stays unit-testable. The real adapter (gitHubReleaseClient)
// lives in upgrade-io.ts; tests use an in-memory fake.
export type ReleaseClient = {
  fetchLatestVersion: () => Promise<string>
  downloadBytes: (url: string) => Promise<Uint8Array>
  replaceRunningBinary: (bytes: Uint8Array) => Promise<void>
}

export type UpgradeParams = {
  platform: NodeJS.Platform
  arch: string
  currentVersion: string
  client: ReleaseClient
}

export async function upgrade({
  platform,
  arch,
  currentVersion,
  client,
}: UpgradeParams): Promise<string> {
  if (platform === "win32") {
    throw new UpgradeError(
      "In-place upgrade is not supported on Windows. Download the latest .exe from " +
        `https://github.com/${GITHUB_REPO}/releases`,
    )
  }

  const latestVersion = await client.fetchLatestVersion()
  // A "dev" binary (compiled without the version stamp) has no real version to
  // compare, so always pull the latest release — a clean way back to mainline.
  if (
    currentVersion !== "dev" &&
    compareVersions(latestVersion, currentVersion) <= 0
  ) {
    return `suiseki ${currentVersion} is already the latest version.`
  }

  const assetName = resolveReleaseAssetName({ platform, arch })

  const baseUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${latestVersion}`
  const binaryBytes = await client.downloadBytes(`${baseUrl}/${assetName}`)
  const checksumsText = new TextDecoder().decode(
    await client.downloadBytes(`${baseUrl}/checksums.txt`),
  )

  const expectedChecksum = parseChecksumsFile(checksumsText)[assetName]
  if (expectedChecksum == null) {
    throw new UpgradeError(`No checksum published for ${assetName}`)
  }

  const actualChecksum = sha256Hex(binaryBytes)
  if (actualChecksum !== expectedChecksum) {
    throw new UpgradeError(
      `Checksum mismatch for ${assetName} (expected ${expectedChecksum}, got ${actualChecksum})`,
    )
  }

  await client.replaceRunningBinary(binaryBytes)
  return `Upgraded suiseki ${currentVersion} -> ${latestVersion}.`
}
