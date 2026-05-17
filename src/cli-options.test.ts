import { describe, expect, test } from "bun:test"
import { CliOptionsError, parseCliOptions } from "./cli-options"

describe("cli-options.ts", () => {
  describe("parseCliOptions", () => {
    test("parses value flags into config overrides", () => {
      const parsedOptions = parseCliOptions([
        "--view",
        "split",
        "--theme=github-light",
        "--word-diff",
        "char",
        "--max-line-diff-length",
        "250",
        "HEAD~1",
        "HEAD",
      ])

      expect(parsedOptions.overrides).toEqual({
        pierre: {
          view: "split",
          "word-diff": "char",
          "max-line-diff-length": 250,
        },
        shiki: {
          theme: "github-light",
        },
      })
      expect(parsedOptions.gitArguments).toEqual(["HEAD~1", "HEAD"])
    })

    test("parses boolean flags and pager flags", () => {
      const parsedOptions = parseCliOptions([
        "--no-line-numbers",
        "--diff-background=false",
        "--file-header",
        "--no-pager",
      ])

      expect(parsedOptions.overrides).toEqual({
        pierre: {
          "line-numbers": false,
          "diff-background": false,
          "file-header": true,
        },
      })
      expect(parsedOptions.noPager).toEqual(true)
    })

    test("passes unknown flags through as git arguments", () => {
      const parsedOptions = parseCliOptions(["--staged", "--", "--view"])

      expect(parsedOptions.gitArguments).toEqual(["--staged", "--view"])
      expect(parsedOptions.overrides).toEqual({})
    })

    test("treats color-only as a supported no-op for git diff filters", () => {
      const parsedOptions = parseCliOptions(["--color-only"])

      expect(parsedOptions.gitArguments).toEqual([])
      expect(parsedOptions.overrides).toEqual({})
    })

    test("throws when a value flag is missing a value", () => {
      expect(() => parseCliOptions(["--view"])).toThrow(CliOptionsError)
      expect(() => parseCliOptions(["--view"])).toThrow("requires a value")
    })

    test("throws when a numeric flag has an invalid value", () => {
      expect(() => parseCliOptions(["--max-line-length", "nope"])).toThrow(
        CliOptionsError,
      )
      expect(() => parseCliOptions(["--max-line-length", "nope"])).toThrow(
        "Invalid CLI option",
      )
    })

    test("throws when a value flag fails runtime validation", () => {
      expect(() => parseCliOptions(["--view", "sideways"])).toThrow(
        CliOptionsError,
      )
      expect(() => parseCliOptions(["--view", "sideways"])).toThrow(
        "Invalid CLI option",
      )
    })

    test("throws when a numeric flag fails runtime validation", () => {
      expect(() => parseCliOptions(["--max-line-length", "0"])).toThrow(
        CliOptionsError,
      )
      expect(() => parseCliOptions(["--max-line-length", "0"])).toThrow(
        "Invalid CLI option",
      )
    })
  })
})
