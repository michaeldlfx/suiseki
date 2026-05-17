import pierreDark from "@pierre/theme/pierre-dark"
import pierreDarkVibrant from "@pierre/theme/pierre-dark-vibrant"
import pierreLight from "@pierre/theme/pierre-light"
import pierreLightVibrant from "@pierre/theme/pierre-light-vibrant"
import type { ThemeRegistrationRaw } from "shiki"

export const PIERRE_THEMES = {
  "pierre-dark": { ...pierreDark, name: "pierre-dark" } as ThemeRegistrationRaw,
  "pierre-light": {
    ...pierreLight,
    name: "pierre-light",
  } as ThemeRegistrationRaw,
  "pierre-dark-vibrant": {
    ...pierreDarkVibrant,
    name: "pierre-dark-vibrant",
  } as ThemeRegistrationRaw,
  "pierre-light-vibrant": {
    ...pierreLightVibrant,
    name: "pierre-light-vibrant",
  } as ThemeRegistrationRaw,
} as const

export type PierreThemeName = keyof typeof PIERRE_THEMES

export function isPierreThemeName(
  themeName: string,
): themeName is PierreThemeName {
  return Object.hasOwn(PIERRE_THEMES, themeName)
}
