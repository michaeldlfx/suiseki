import { describe, expect, test } from "bun:test"
import { classifyViewTarget } from "./view-target"

describe("classifyViewTarget", () => {
  test("reads stdin for '-'", () => {
    expect(
      classifyViewTarget({
        exists: false,
        isDirectory: false,
        isStdinTty: true,
        pathArgument: "-",
      }),
    ).toEqual("stdin")
  })

  test("trees the current directory when no path is given on a TTY", () => {
    expect(
      classifyViewTarget({
        exists: false,
        isDirectory: false,
        isStdinTty: true,
        pathArgument: undefined,
      }),
    ).toEqual("tree")
  })

  test("reads piped stdin when no path is given and stdin is not a TTY", () => {
    expect(
      classifyViewTarget({
        exists: false,
        isDirectory: false,
        isStdinTty: false,
        pathArgument: undefined,
      }),
    ).toEqual("stdin")
  })

  test("trees an existing directory", () => {
    expect(
      classifyViewTarget({
        exists: true,
        isDirectory: true,
        isStdinTty: true,
        pathArgument: "src",
      }),
    ).toEqual("tree")
  })

  test("views an existing file", () => {
    expect(
      classifyViewTarget({
        exists: true,
        isDirectory: false,
        isStdinTty: true,
        pathArgument: "file.ts",
      }),
    ).toEqual("file")
  })

  test("reports a missing path", () => {
    expect(
      classifyViewTarget({
        exists: false,
        isDirectory: false,
        isStdinTty: true,
        pathArgument: "nope.ts",
      }),
    ).toEqual("missing")
  })
})
