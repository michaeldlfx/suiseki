import { type } from "arktype"
import { type SuisekiConfigOverrides, vCliConfigOverrides } from "./config"

type CliValueTarget =
  | {
      key: keyof NonNullable<SuisekiConfigOverrides["pierre"]>
      section: "pierre"
    }
  | {
      key: keyof NonNullable<SuisekiConfigOverrides["shiki"]>
      section: "shiki"
    }

type CliBooleanTarget =
  | {
      key: keyof NonNullable<SuisekiConfigOverrides["pierre"]>
      section: "pierre"
    }
  | {
      key: keyof NonNullable<SuisekiConfigOverrides["shiki"]>
      section: "shiki"
    }

export type ParsedCliOptions = {
  gitArguments: string[]
  help: boolean
  noPager: boolean
  overrides: SuisekiConfigOverrides
}

type DraftCliConfigOverrides = {
  pierre?: Record<string, unknown>
  shiki?: Record<string, unknown>
}

type DraftParsedCliOptions = Omit<ParsedCliOptions, "overrides"> & {
  overrides: DraftCliConfigOverrides
}

const VALUE_FLAGS: Record<string, CliValueTarget> = {
  "--view": { section: "pierre", key: "view" },
  "--change-indicator": {
    section: "pierre",
    key: "change-indicator",
  },
  "--hunk-header": { section: "pierre", key: "hunk-header" },
  "--word-diff": { section: "pierre", key: "word-diff" },
  "--max-line-diff-length": {
    section: "pierre",
    key: "max-line-diff-length",
  },
  "--theme": { section: "shiki", key: "theme" },
  "--max-line-length": {
    section: "shiki",
    key: "max-line-length",
  },
}

const BOOLEAN_FLAGS: Record<string, CliBooleanTarget> = {
  "--line-numbers": { section: "pierre", key: "line-numbers" },
  "--diff-background": { section: "pierre", key: "diff-background" },
  "--file-header": { section: "pierre", key: "file-header" },
}

const NEGATED_BOOLEAN_FLAGS: Record<string, CliBooleanTarget> = {
  "--no-line-numbers": { section: "pierre", key: "line-numbers" },
  "--no-diff-background": { section: "pierre", key: "diff-background" },
  "--no-file-header": { section: "pierre", key: "file-header" },
}

export class CliOptionsError extends Error {
  override name = "CliOptionsError"
}

export function parseCliOptions(argumentsFromCli: string[]): ParsedCliOptions {
  const parsedOptions: DraftParsedCliOptions = {
    gitArguments: [],
    help: false,
    noPager: false,
    overrides: {},
  }

  for (let index = 0; index < argumentsFromCli.length; index++) {
    const argument = argumentsFromCli[index]
    if (argument == null) {
      break
    }

    if (argument === "--") {
      parsedOptions.gitArguments.push(...argumentsFromCli.slice(index + 1))
      break
    }

    if (argument === "--help" || argument === "-h") {
      parsedOptions.help = true
      continue
    }

    if (argument === "--no-pager") {
      parsedOptions.noPager = true
      continue
    }

    if (argument === "--color-only") {
      continue
    }

    const [flag, inlineValue] = splitInlineValue(argument)
    const valueTarget = VALUE_FLAGS[flag]
    if (valueTarget != null) {
      const rawValue =
        inlineValue ??
        readNextFlagValue({
          argumentsFromCli,
          flag,
          index,
        })
      setConfigOverride({
        overrides: parsedOptions.overrides,
        target: valueTarget,
        value: rawValue,
      })

      if (inlineValue == null) {
        index++
      }
      continue
    }

    const booleanTarget = BOOLEAN_FLAGS[flag]
    if (booleanTarget != null) {
      setConfigOverride({
        overrides: parsedOptions.overrides,
        target: booleanTarget,
        value:
          inlineValue == null
            ? true
            : parseBooleanFlag({ flag, rawValue: inlineValue }),
      })
      continue
    }

    const negatedBooleanTarget = NEGATED_BOOLEAN_FLAGS[flag]
    if (negatedBooleanTarget != null) {
      setConfigOverride({
        overrides: parsedOptions.overrides,
        target: negatedBooleanTarget,
        value:
          inlineValue == null
            ? false
            : !parseBooleanFlag({ flag, rawValue: inlineValue }),
      })
      continue
    }

    parsedOptions.gitArguments.push(argument)
  }

  return {
    ...parsedOptions,
    overrides: validateCliConfigOverrides(parsedOptions.overrides),
  }
}

type SplitInlineValueResult = [flag: string, value: string | undefined]

function splitInlineValue(argument: string): SplitInlineValueResult {
  const separatorIndex = argument.indexOf("=")

  if (separatorIndex === -1) {
    return [argument, undefined]
  }

  return [argument.slice(0, separatorIndex), argument.slice(separatorIndex + 1)]
}

type ReadNextFlagValueParams = {
  argumentsFromCli: string[]
  flag: string
  index: number
}

function readNextFlagValue({
  argumentsFromCli,
  flag,
  index,
}: ReadNextFlagValueParams): string {
  const rawValue = argumentsFromCli[index + 1]

  if (rawValue == null || rawValue === "") {
    throw new CliOptionsError(`${flag} requires a value`)
  }

  return rawValue
}

type ParseBooleanFlagParams = {
  flag: string
  rawValue: string
}

function parseBooleanFlag({ flag, rawValue }: ParseBooleanFlagParams): boolean {
  const normalizedValue = rawValue.toLowerCase()

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false
  }

  throw new CliOptionsError(
    `${flag} must be one of true, false, 1, 0, yes, no, on, or off`,
  )
}

type SetConfigOverrideParams = {
  overrides: DraftCliConfigOverrides
  target: CliBooleanTarget | CliValueTarget
  value: boolean | string
}

function setConfigOverride({
  overrides,
  target,
  value,
}: SetConfigOverrideParams): void {
  if (target.section === "pierre") {
    if (overrides.pierre == null) {
      overrides.pierre = {}
    }
    const section = overrides.pierre
    section[target.key] = value
    return
  }

  if (overrides.shiki == null) {
    overrides.shiki = {}
  }
  const section = overrides.shiki
  section[target.key] = value
}

function validateCliConfigOverrides(
  overrides: DraftCliConfigOverrides,
): SuisekiConfigOverrides {
  const validatedOverrides = vCliConfigOverrides(overrides)

  if (validatedOverrides instanceof type.errors) {
    throw new CliOptionsError(
      `Invalid CLI option: ${validatedOverrides.summary}`,
    )
  }

  return validatedOverrides
}
