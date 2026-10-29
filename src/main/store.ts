import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IdeId, Project } from '@shared/types'

// Всё хранится в %APPDATA%\project-launcher — переживает перенос portable-exe.

export interface StoredSettings {
  github: { tokenEnc?: string }
  gitlab: { baseUrl: string; tokenEnc?: string; allowSelfSigned: boolean }
  ideExe: Partial<Record<IdeId, string>>
  window?: { width: number; height: number; x?: number; y?: number; maximized?: boolean }
}

const defaultSettings: StoredSettings = {
  github: {},
  gitlab: { baseUrl: '', allowSelfSigned: false },
  ideExe: {}
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
      ideExe: { ...s.ideExe }
    }
  },
  saveSettings(s: StoredSettings): void {
    writeJson('settings.json', s)
  }
}
