import { type } from "arktype"

export const vStringBoolean = type('"true" | "false"').pipe(
  (value) => value === "true",
)
