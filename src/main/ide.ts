import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ActionResult, IdeId, IdeInfo } from '@shared/types'
import { IDES, IDE_ORDER } from '@shared/meta'

// Где обычно лежат IDE на Windows. Если не нашлось — путь задаётся руками в настройках.

const env = (name: string): string => process.env[name] ?? ''

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => p && existsSync(p))
}

/** Ищет в каталоге подпапки по префиксу (например, «JetBrains Rider 2025.2») и берёт самую свежую. */
function inVersionedDirs(parent: string, prefix: string, tail: string): string | undefined {
  if (!parent || !existsSync(parent)) return undefined
  try {
    const dirs = readdirSync(parent, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
      .map((d) => d.name)
      .sort()
      .reverse()
    return firstExisting(dirs.map((d) => join(parent, d, tail)))
  } catch {
    return undefined
  }
}

function findVisualStudio(): string | undefined {
  const vswhere = join(env('ProgramFiles(x86)'), 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  if (!existsSync(vswhere)) return undefined
  try {
    const out = execFileSync(vswhere, ['-latest', '-prerelease', '-property', 'productPath'], { encoding: 'utf-8', windowsHide: true })
    const path = out.trim().split(/\r?\n/)[0]
    return path && existsSync(path) ? path : undefined
  } catch {
    return undefined
  }
}

const finders: Record<IdeId, () => string | undefined> = {
  rider: () =>
    firstExisting([
      join(env('LOCALAPPDATA'), 'Programs', 'Rider', 'bin', 'rider64.exe'),
      join(env('LOCALAPPDATA'), 'JetBrains', 'Toolbox', 'scripts', 'rider.cmd')
    ]) ?? inVersionedDirs(join(env('ProgramFiles'), 'JetBrains'), 'JetBrains Rider', join('bin', 'rider64.exe')),
  vs: findVisualStudio,
  vscode: () =>
    firstExisting([
      join(env('LOCALAPPDATA'), 'Programs', 'Microsoft VS Code', 'Code.exe'),
      join(env('ProgramFiles'), 'Microsoft VS Code', 'Code.exe')
    ]),
  androidstudio: () =>
    firstExisting([
      join(env('ProgramFiles'), 'Android', 'Android Studio', 'bin', 'studio64.exe'),
      join(env('LOCALAPPDATA'), 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
      join(env('LOCALAPPDATA'), 'JetBrains', 'Toolbox', 'scripts', 'studio.cmd')
    ])
}

const autoCache = new Map<IdeId, string | undefined>()

function autoFind(id: IdeId): string | undefined {
  if (!autoCache.has(id)) autoCache.set(id, process.platform === 'win32' ? finders[id]() : undefined)
  return autoCache.get(id)
}

export function resetIdeCache(): void {
  autoCache.clear()
}

export function ideInfos(overrides: Partial<Record<IdeId, string>>): IdeInfo[] {
  return IDE_ORDER.map((id) => {
    const manual = overrides[id]?.trim()
    return manual
      ? { id, name: IDES[id].name, exe: manual, auto: false }
      : { id, name: IDES[id].name, exe: autoFind(id), auto: true }
  })
}

export function resolveIde(id: IdeId, overrides: Partial<Record<IdeId, string>>): string | undefined {
  return overrides[id]?.trim() || autoFind(id)
}

/** Запускает процесс отвязанным от лаунчера и ждёт, пока станет понятно, стартанул он или нет. */
export function launchDetached(exe: string, args: string[], cwd?: string): Promise<ActionResult> {
  return new Promise((done) => {
    const isScript = /\.(cmd|bat)$/i.test(exe)
    const child = isScript
      ? spawn(`"${exe}"`, args.map((a) => `"${a}"`), { cwd, detached: true, stdio: 'ignore', shell: true, windowsHide: true })
      : spawn(exe, args, { cwd, detached: true, stdio: 'ignore' })
    child.once('error', (e) => done({ ok: false, error: e.message }))
    child.once('spawn', () => {
      child.unref()
      done({ ok: true })
    })
  })
}

export async function openTerminal(folder: string): Promise<ActionResult> {
  if (process.platform !== 'win32') return launchDetached('x-terminal-emulator', [], folder)
  // Windows Terminal, если стоит; иначе обычный cmd в новом окне
  const wt = await launchDetached('wt.exe', ['-d', folder])
  if (wt.ok) return wt
  return launchDetached('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/K'], folder)
}
