import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { getConfigFileCandidates } from "./config"
import { generateAnnotatedConfig } from "./config-command"

export type InitCommandIO = {
  promptOverwrite(targetPath: string): Promise<boolean>
}

export function getDefaultConfigPath(): string {
  const homeDirectory =
    Bun.env.HOME != null && Bun.env.HOME !== "" ? Bun.env.HOME : homedir()
  return join(homeDirectory, ".suiseki", "config.toml")
}

// Config files earlier in the loader's candidate list win, so any existing
// candidate ahead of the target shadows the file we are about to write.
async function findShadowingConfigPaths(targetPath: string): Promise<string[]> {
  const candidates = getConfigFileCandidates()
  const targetIndex = candidates.indexOf(targetPath)
  if (targetIndex <= 0) {
    return []
  }

  const shadowingPaths: string[] = []
  for (const candidate of candidates.slice(0, targetIndex)) {
    if (await Bun.file(candidate).exists()) {
      shadowingPaths.push(candidate)
    }
  }
  return shadowingPaths
}

type RunInitCommandWithIOParams = {
  targetPath: string
  io: InitCommandIO
}

export async function runInitCommandWithIO(
  params: RunInitCommandWithIOParams,
): Promise<void> {
  const { targetPath, io } = params

  const existingFile = Bun.file(targetPath)
  if (await existingFile.exists()) {
    const shouldOverwrite = await io.promptOverwrite(targetPath)
    if (!shouldOverwrite) {
      process.stdout.write("Aborted.\n")
      return
    }
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await Bun.write(targetPath, `${generateAnnotatedConfig()}\n`)
  process.stdout.write(`Created: ${targetPath}\n`)

  const shadowingPaths = await findShadowingConfigPaths(targetPath)
  if (shadowingPaths.length > 0) {
    process.stderr.write(
      `Note: a higher-precedence config already exists and will take effect instead:\n${shadowingPaths
        .map((path) => `  ${path}`)
        .join("\n")}\n`,
    )
  }
}
