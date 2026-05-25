import { describe, expect, test } from "bun:test"
import {
  compareVersions,
  parseChecksumsFile,
  type ReleaseClient,
  resolveReleaseAssetName,
  UpgradeError,
  upgrade,
} from "./upgrade-command"

// In-memory ReleaseClient: seed a release with setUpRelease(), then inspect
// replacedWith to confirm whether the binary would have been replaced. Stands in
// for the real network/filesystem adapter (gitHubReleaseClient) without I/O.
type SetUpReleaseParams = {
  version: string
  assetName: string
  bytes: Uint8Array
  checksum?: string
}

class InMemoryReleaseClient implements ReleaseClient {
  private latestVersion = "0.0.0"
  private assetBytes: Uint8Array = new Uint8Array()
  private checksumsText = ""
  replacedWith: Uint8Array | undefined

  setUpRelease({
    version,
    assetName,
    bytes,
    checksum,
  }: SetUpReleaseParams): this {
    this.latestVersion = version
    this.assetBytes = bytes
    const resolvedChecksum =
      checksum ?? new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    this.checksumsText = `${resolvedChecksum}  ${assetName}\n`
    return this
  }

  fetchLatestVersion(): Promise<string> {
    return Promise.resolve(this.latestVersion)
  }

  downloadBytes(url: string): Promise<Uint8Array> {
    return Promise.resolve(
      url.endsWith("checksums.txt")
        ? new TextEncoder().encode(this.checksumsText)
        : this.assetBytes,
    )
  }

  replaceRunningBinary(bytes: Uint8Array): Promise<void> {
    this.replacedWith = bytes
    return Promise.resolve()
  }
}

const LINUX_X64 = {
  platform: "linux" as NodeJS.Platform,
  arch: "x64",
}
const LINUX_X64_ASSET = "suiseki-linux-x64"

describe("upgrade-command.ts", () => {
  describe("upgrade", () => {
    test("refuses to upgrade on Windows", async () => {
      const client = new InMemoryReleaseClient()

      await expect(
        upgrade({
          ...LINUX_X64,
          platform: "win32",
          currentVersion: "0.1.0",
          client,
        }),
      ).rejects.toThrow(UpgradeError)
    })

    test("reports already-latest and does not replace when current >= latest", async () => {
      const client = new InMemoryReleaseClient().setUpRelease({
        version: "0.1.0",
        assetName: LINUX_X64_ASSET,
        bytes: new TextEncoder().encode("anything"),
      })

      const message = await upgrade({
        ...LINUX_X64,
        currentVersion: "0.1.0",
        client,
      })

      expect(message).toEqual("suiseki 0.1.0 is already the latest version.")
      expect(client.replacedWith).toBeUndefined()
    })

    test("downloads, verifies, and replaces when a newer release exists", async () => {
      const newBinary = new TextEncoder().encode("new-binary")
      const client = new InMemoryReleaseClient().setUpRelease({
        version: "0.2.0",
        assetName: LINUX_X64_ASSET,
        bytes: newBinary,
      })

      const message = await upgrade({
        ...LINUX_X64,
        currentVersion: "0.1.0",
        client,
      })

      expect(message).toEqual("Upgraded suiseki 0.1.0 -> 0.2.0.")
      expect(client.replacedWith).toEqual(newBinary)
    })

    test("always upgrades a dev build to the latest release", async () => {
      const newBinary = new TextEncoder().encode("new-binary")
      const client = new InMemoryReleaseClient().setUpRelease({
        version: "0.2.0",
        assetName: LINUX_X64_ASSET,
        bytes: newBinary,
      })

      const message = await upgrade({
        ...LINUX_X64,
        currentVersion: "dev",
        client,
      })

      expect(message).toEqual("Upgraded suiseki dev -> 0.2.0.")
      expect(client.replacedWith).toEqual(newBinary)
    })

    test("throws on a checksum mismatch and does not replace", async () => {
      const client = new InMemoryReleaseClient().setUpRelease({
        version: "0.2.0",
        assetName: LINUX_X64_ASSET,
        bytes: new TextEncoder().encode("new-binary"),
        checksum: "deadbeef",
      })

      await expect(
        upgrade({ ...LINUX_X64, currentVersion: "0.1.0", client }),
      ).rejects.toThrow("Checksum mismatch")
      expect(client.replacedWith).toBeUndefined()
    })

    test("throws when no checksum is published for the platform asset", async () => {
      const client = new InMemoryReleaseClient().setUpRelease({
        version: "0.2.0",
        assetName: "suiseki-darwin-arm64",
        bytes: new TextEncoder().encode("new-binary"),
      })

      await expect(
        upgrade({ ...LINUX_X64, currentVersion: "0.1.0", client }),
      ).rejects.toThrow("No checksum published")
    })
  })

  describe("resolveReleaseAssetName", () => {
    test("maps macOS targets", () => {
      expect(
        resolveReleaseAssetName({ platform: "darwin", arch: "arm64" }),
      ).toEqual("suiseki-darwin-arm64")
      expect(
        resolveReleaseAssetName({ platform: "darwin", arch: "x64" }),
      ).toEqual("suiseki-darwin-x64")
    })

    test("maps Linux targets", () => {
      expect(
        resolveReleaseAssetName({ platform: "linux", arch: "x64" }),
      ).toEqual("suiseki-linux-x64")
      expect(
        resolveReleaseAssetName({ platform: "linux", arch: "arm64" }),
      ).toEqual("suiseki-linux-arm64")
    })

    test("maps Windows targets with the .exe extension", () => {
      expect(
        resolveReleaseAssetName({ platform: "win32", arch: "x64" }),
      ).toEqual("suiseki-windows-x64.exe")
    })

    test("throws on an unsupported architecture", () => {
      expect(() =>
        resolveReleaseAssetName({ platform: "linux", arch: "ppc64" }),
      ).toThrow(UpgradeError)
    })

    test("throws on an unsupported platform", () => {
      expect(() =>
        resolveReleaseAssetName({ platform: "freebsd", arch: "x64" }),
      ).toThrow(UpgradeError)
    })
  })

  describe("compareVersions", () => {
    test("returns 0 for equal versions, ignoring trailing zero segments", () => {
      expect(compareVersions("1.2.3", "1.2.3")).toEqual(0)
      expect(compareVersions("1.2", "1.2.0")).toEqual(0)
    })

    test("compares segments numerically, not lexically", () => {
      expect(compareVersions("1.2.10", "1.2.9")).toEqual(1)
      expect(compareVersions("0.1.0", "0.2.0")).toEqual(-1)
    })

    test("treats a longer non-zero version as greater", () => {
      expect(compareVersions("1.2.1", "1.2")).toEqual(1)
    })
  })

  describe("parseChecksumsFile", () => {
    test("maps each filename to its hash", () => {
      const checksums = parseChecksumsFile(
        "abc123  suiseki-darwin-arm64\ndef456  suiseki-linux-x64\n",
      )

      expect(checksums["suiseki-darwin-arm64"]).toEqual("abc123")
      expect(checksums["suiseki-linux-x64"]).toEqual("def456")
    })

    test("ignores blank and malformed lines", () => {
      const checksums = parseChecksumsFile(
        "\nabc123  suiseki-darwin-arm64\nnot-a-checksum-line\n",
      )

      expect(checksums["suiseki-darwin-arm64"]).toEqual("abc123")
      expect(Object.keys(checksums)).toHaveLength(1)
    })
  })
})
