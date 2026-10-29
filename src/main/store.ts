import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CustomIcons, IdeId, Project, ThemeMode } from '@shared/types'

// Всё хранится в %APPDATA%\project-launcher — переживает перенос portable-exe.

export interface StoredSettings {
  github: { tokenEnc?: string }
  gitlab: { baseUrl: string; tokenEnc?: string; allowSelfSigned: boolean }
  ideExe: Partial<Record<IdeId, string>>
  theme: ThemeMode
  icons: CustomIcons
  scanRoots: string[]
  window?: { width: number; height: number; x?: number; y?: number; maximized?: boolean }
}

const defaultSettings: StoredSettings = {
  github: {},
  gitlab: { baseUrl: '', allowSelfSigned: false },
  ideExe: {},
  theme: 'system',
  icons: { hosts: {}, langs: {} },
  scanRoots: []
}

function dataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(file: string, fallback: T): T {
  const full = join(dataDir(), file)
  if (!existsSync(full)) return fallback
  try {
    return JSON.parse(readFileSync(full, 'utf-8')) as T
  } catch {
    // Битый файл не затираем молча — откладываем рядом, чтобы можно было вытащить руками.
    renameSync(full, `${full}.broken-${Date.now()}`)
    return fallback
  }
}

/** Запись через временный файл, чтобы при падении посреди записи не остаться с пустым JSON. */
function writeJson(file: string, value: unknown): void {
  const full = join(dataDir(), file)
  const tmp = `${full}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  renameSync(tmp, full)
}

export const store = {
  projects(): Project[] {
    return readJson<Project[]>('projects.json', [])
  },
  saveProjects(list: Project[]): void {
    writeJson('projects.json', list)
  },
  settings(): StoredSettings {
    const s = readJson<Partial<StoredSettings>>('settings.json', {})
    return {
      ...defaultSettings,
      ...s,
      github: { ...defaultSettings.github, ...s.github },
      gitlab: { ...defaultSettings.gitlab, ...s.gitlab },
      ideExe: { ...s.ideExe },
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
      icons: { hosts: { ...s.icons?.hosts }, langs: { ...s.icons?.langs } },
      scanRoots: Array.isArray(s.scanRoots) ? s.scanRoots.filter((x) => typeof x === 'string') : []
    }
  },
  saveSettings(s: StoredSettings): void {
    writeJson('settings.json', s)
  }
}
