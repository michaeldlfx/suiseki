import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { parse } from "smol-toml"
import { generateAnnotatedConfig, runConfigCommand } from "./config-command"

let stdoutChunks: string[]
let originalWrite: typeof process.stdout.write

describe("config-command.ts", () => {
  beforeEach(() => {
    stdoutChunks = []
    originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as typeof process.stdout.write
  })

  afterEach(() => {
    process.stdout.write = originalWrite
  })

  describe("generateAnnotatedConfig", () => {
    test("produces valid TOML", () => {
      const content = generateAnnotatedConfig()
      expect(() => parse(content)).not.toThrow()
    })

    test("includes all pierre config keys", () => {
      const content = generateAnnotatedConfig()
      expect(content).toContain("view =")
      expect(content).toContain("line-numbers =")
      expect(content).toContain("change-indicator =")
      expect(content).toContain("diff-background =")
      expect(content).toContain("file-header =")
      expect(content).toContain("hunk-header =")
      expect(content).toContain("word-diff =")
      expect(content).toContain("max-line-diff-length =")
    })

    test("includes all shiki config keys", () => {
      const content = generateAnnotatedConfig()
      expect(content).toContain("theme =")
      expect(content).toContain("max-line-length =")
    })

    test("includes all SUISEKI_* env var names in comments", () => {
      const content = generateAnnotatedConfig()
      expect(content).toContain("SUISEKI_PIERRE_VIEW")
      expect(content).toContain("SUISEKI_PIERRE_LINE_NUMBERS")
      expect(content).toContain("SUISEKI_PIERRE_CHANGE_INDICATOR")
      expect(content).toContain("SUISEKI_PIERRE_DIFF_BACKGROUND")
      expect(content).toContain("SUISEKI_PIERRE_FILE_HEADER")
      expect(content).toContain("SUISEKI_PIERRE_HUNK_HEADER")
      expect(content).toContain("SUISEKI_PIERRE_WORD_DIFF")
      expect(content).toContain("SUISEKI_PIERRE_MAX_LINE_DIFF_LENGTH")
      expect(content).toContain("SUISEKI_SHIKI_THEME")
      expect(content).toContain("SUISEKI_SHIKI_MAX_LINE_LENGTH")
    })

    test("includes default values", () => {
      const content = generateAnnotatedConfig()
      const parsed = parse(content)
      expect(parsed).toMatchObject({
        pierre: {
          view: "unified",
          "line-numbers": true,
          "change-indicator": "sign",
          "diff-background": true,
          "file-header": true,
          "hunk-header": "none",
          "word-diff": "word-alt",
          "max-line-diff-length": 1000,
        },
        shiki: {
          theme: "pierre-dark",
          "max-line-length": 10000,
        },
      })
    })
  })

  describe("runConfigCommand", () => {
    test("writes annotated config to stdout", async () => {
      await runConfigCommand()
      const output = stdoutChunks.join("")
      expect(output).toContain("[pierre]")
      expect(output).toContain("[shiki]")
      expect(output).toContain("view =")
    })
  })
})
