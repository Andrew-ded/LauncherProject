import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import type { DetectResult, IdeId, LangId, ScanCandidate } from '@shared/types'
import { parseRemote, readRemoteUrl } from './git'

// Смотрим содержимое папки и по характерным файлам угадываем язык, IDE и то, что ей открывать.

const SKIP_DIRS = new Set([
  'node_modules', 'bin', 'obj', '.git', '.vs', '.idea', '.vscode', '.gradle', 'build', 'dist', 'out',
  'packages', 'target', '.venv', 'venv', '__pycache__', 'TestResults', 'publish', 'wwwroot'
])
const MAX_DEPTH = 3
const MAX_ENTRIES = 6000

interface Scan {
  files: string[] // относительные пути
  dirs: string[]
}

function scan(root: string): Scan {
  const result: Scan = { files: [], dirs: [] }
  let seen = 0
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || seen > MAX_ENTRIES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (++seen > MAX_ENTRIES) return
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
        result.dirs.push(relative(root, full))
        walk(full, depth + 1)
      } else if (e.isFile()) {
        result.files.push(relative(root, full))
      }
    }
  }
  walk(root, 0)
  return result
}

const depthOf = (p: string): number => p.split(/[\\/]/).length
const byDepth = (a: string, b: string): number => depthOf(a) - depthOf(b) || a.localeCompare(b)

export function detectFolder(
  root: string,
  opts: { gitlabBaseUrl: string; hasIde: (id: IdeId) => boolean }
): DetectResult {
  const { files } = scan(root)
  const lower = files.map((f) => f.toLowerCase())
  const found: DetectResult['found'] = []
  const langs = new Set<LangId>()
  const has = (pred: (f: string) => boolean): string[] => files.filter((_, i) => pred(lower[i]))

  // .NET
  const slns = has((f) => f.endsWith('.sln') || f.endsWith('.slnx')).sort(byDepth)
  const csprojs = has((f) => f.endsWith('.csproj')).sort(byDepth)
  if (slns.length || csprojs.length || has((f) => f.endsWith('.cs')).length) langs.add('csharp')
  slns.slice(0, 3).forEach((f) => found.push({ file: f, meaning: 'C#' }))
  if (!slns.length) csprojs.slice(0, 2).forEach((f) => found.push({ file: f, meaning: 'C#' }))

  // Gradle: Kotlin или Java
  const gradleSettings = has((f) => /(^|[\\/])settings\.gradle(\.kts)?$/.test(f)).sort(byDepth)
  const gradleBuilds = has((f) => /(^|[\\/])build\.gradle(\.kts)?$/.test(f)).sort(byDepth)
  const ktFiles = has((f) => f.endsWith('.kt') || f.endsWith('.kts'))
  const javaFiles = has((f) => f.endsWith('.java'))
  if (gradleBuilds.length || gradleSettings.length) {
    const marker = gradleSettings[0] ?? gradleBuilds[0]
    if (ktFiles.length || marker.endsWith('.kts')) {
      langs.add('kotlin')
      found.push({ file: marker, meaning: 'Kotlin' })
    } else {
      langs.add('java')
      found.push({ file: marker, meaning: 'Java' })
    }
  } else if (ktFiles.length) langs.add('kotlin')
  else if (javaFiles.length) langs.add('java')

  // Node / фронт
  const pkg = has((f) => /(^|[\\/])package\.json$/.test(f)).sort(byDepth)
  const tsconfig = has((f) => /(^|[\\/])tsconfig(\.[\w-]+)?\.json$/.test(f))
  const tsFiles = has((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts'))
  if (tsconfig.length || tsFiles.length) {
    langs.add('typescript')
    found.push({ file: tsconfig[0] ?? pkg[0] ?? tsFiles[0], meaning: 'TypeScript' })
  } else if (pkg.length) {
    langs.add('javascript')
    found.push({ file: pkg[0], meaning: 'JavaScript' })
  }

  // Прочее
  const py = has((f) => f.endsWith('.py') || /(^|[\\/])(pyproject\.toml|requirements\.txt)$/.test(f))
  if (py.length) {
    langs.add('python')
    found.push({ file: py.sort(byDepth)[0], meaning: 'Python' })
  }
  const cpp = has((f) => f.endsWith('.vcxproj') || /(^|[\\/])cmakelists\.txt$/.test(f))
  if (cpp.length) {
    langs.add('cpp')
    found.push({ file: cpp.sort(byDepth)[0], meaning: 'C++' })
  }
  const sqlproj = has((f) => f.endsWith('.sqlproj'))
  const sqlFiles = has((f) => f.endsWith('.sql'))
  if (sqlproj.length || (langs.size === 0 && sqlFiles.length)) langs.add('sql')
  if (langs.size === 0 && has((f) => f.endsWith('.ps1')).length) langs.add('powershell')

  // Что открывать каждой IDE
  const gradleRoots = (gradleSettings.length ? gradleSettings : gradleBuilds).map((f) => dirname(f)).map((d) => (d === '.' ? '' : d))
  const targets: Record<IdeId, string[]> = {
    rider: slns.length ? slns : csprojs.length ? csprojs : [''],
    vs: slns.length ? slns : csprojs.length ? csprojs : [''],
    vscode: [''],
    androidstudio: gradleRoots.length ? Array.from(new Set(gradleRoots)) : ['']
  }

  // Какую IDE предложить
  let suggestedIde: IdeId = 'vscode'
  if (langs.has('csharp')) suggestedIde = opts.hasIde('rider') || !opts.hasIde('vs') ? 'rider' : 'vs'
  else if (langs.has('kotlin') || langs.has('java')) suggestedIde = 'androidstudio'

  // Название: имя единственного .sln в корне, иначе имя папки
  const rootSln = slns.filter((f) => depthOf(f) === 1)
  const suggestedName = rootSln.length === 1 ? basename(rootSln[0], extname(rootSln[0])) : basename(root)

  // Репозиторий
  const remote = readRemoteUrl(root)
  let repo: DetectResult['repo']
  let unknownRemote: string | undefined
  if (remote) {
    const parsed = parseRemote(remote, opts.gitlabBaseUrl)
    repo = parsed.repo
    unknownRemote = parsed.unknown
    found.push({ file: '.git → origin', meaning: parsed.repo ? `${parsed.repo.baseUrl.replace(/^https?:\/\//, '')}/${parsed.repo.fullPath}` : remote })
  }

  return { path: root, suggestedName, langs: Array.from(langs), suggestedIde, targets, repo, unknownRemote, found }
}

/** Путь в виде, пригодном для сравнения: без хвостовых слэшей, на Windows — без учёта регистра. */
export function samePathKey(p: string): string {
  const r = resolve(p).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? r.toLowerCase() : r
}

/**
 * Обходит подпапки общей папки (один уровень вглубь) и возвращает те, что похожи на проект:
 * нашёлся язык, .git или remote.
 */
export function scanRoot(
  root: string,
  opts: { gitlabBaseUrl: string; hasIde: (id: IdeId) => boolean; known: Set<string> }
): ScanCandidate[] {
  const entries = readdirSync(root, { withFileTypes: true })
  const result: ScanCandidate[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('$') || SKIP_DIRS.has(e.name)) continue
    const folder = join(root, e.name)
    let d: DetectResult
    try {
      d = detectFolder(folder, opts)
    } catch {
      continue // нет доступа к подпапке — просто пропускаем
    }
    const looksLikeProject = d.langs.length > 0 || !!d.repo || !!d.unknownRemote || existsSync(join(folder, '.git'))
    if (!looksLikeProject) continue
    result.push({ ...d, root, alreadyAdded: opts.known.has(samePathKey(folder)) })
  }
  return result
}
