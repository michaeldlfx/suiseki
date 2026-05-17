import { describe, expect, test } from "bun:test"
import { getSingletonHighlighter } from "shiki"
import { resolveThemePalette } from "./theme-palette"

describe("theme-palette.ts", () => {
  describe("resolveThemePalette", () => {
    test("resolves palette from github-dark theme", async () => {
      const highlighter = await getSingletonHighlighter({
        themes: ["github-dark"],
        langs: [],
      })

      const palette = resolveThemePalette({
        highlighter,
        theme: "github-dark",
      })

      expect(palette.foreground).toEqual("#e1e4e8")
      expect(palette.addition).toBeTruthy()
      expect(palette.deletion).toBeTruthy()
      expect(palette.accent).toBeTruthy()
      expect(palette.dimmed).toBeTruthy()
      expect(palette.additionBackground).toBeTruthy()
      expect(palette.additionInlineBackground).toBeTruthy()
      expect(palette.deletionBackground).toBeTruthy()
      expect(palette.deletionInlineBackground).toBeTruthy()
      expect(palette.separatorBackground).toBeTruthy()
    })

    test("resolves palette from github-light theme", async () => {
      const highlighter = await getSingletonHighlighter({
        themes: ["github-light"],
        langs: [],
      })

      const palette = resolveThemePalette({
        highlighter,
        theme: "github-light",
      })

      expect(palette.foreground).toEqual("#24292e")
      expect(palette.addition).toBeTruthy()
      expect(palette.deletion).toBeTruthy()
    })

    test("produces different palettes for dark and light themes", async () => {
      const highlighter = await getSingletonHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [],
      })

      const darkPalette = resolveThemePalette({
        highlighter,
        theme: "github-dark",
      })
      const lightPalette = resolveThemePalette({
        highlighter,
        theme: "github-light",
      })

      expect(darkPalette.foreground).not.toEqual(lightPalette.foreground)
      expect(darkPalette.additionBackground).not.toEqual(
        lightPalette.additionBackground,
      )
      expect(darkPalette.deletionBackground).not.toEqual(
        lightPalette.deletionBackground,
      )
    })

    test("all palette values are valid hex color strings", async () => {
      const highlighter = await getSingletonHighlighter({
        themes: ["github-dark"],
        langs: [],
      })

      const palette = resolveThemePalette({
        highlighter,
        theme: "github-dark",
      })

      const hexPattern = /^#[0-9a-f]{6}$/
      const paletteValues = Object.values(palette)

      for (const value of paletteValues) {
        expect(value).toMatch(hexPattern)
      }
    })

    test("resolves palette from a theme with sparse colors map", async () => {
      const highlighter = await getSingletonHighlighter({
        themes: ["solarized-light"],
        langs: [],
      })

      const palette = resolveThemePalette({
        highlighter,
        theme: "solarized-light",
      })

      expect(palette.foreground).toBeTruthy()
      expect(palette.dimmed).toBeTruthy()
      expect(palette.addition).toBeTruthy()
      expect(palette.deletion).toBeTruthy()
      expect(palette.accent).toBeTruthy()
    })
  })
})
