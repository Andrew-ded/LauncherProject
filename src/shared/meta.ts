import type { ForgeHost, IdeId, LangId, PlatformId } from './types'

export const LANGS: Record<LangId, { name: string; short: string; color: string }> = {
  csharp: { name: 'C#', short: 'C#', color: '#6B3FA0' },
  kotlin: { name: 'Kotlin', short: 'Kt', color: '#C2410C' },
  java: { name: 'Java', short: 'Jv', color: '#9A5B13' },
  typescript: { name: 'TypeScript', short: 'TS', color: '#2557C7' },
  javascript: { name: 'JavaScript', short: 'JS', color: '#8A6D00' },
  python: { name: 'Python', short: 'Py', color: '#2F5D8A' },
  cpp: { name: 'C++', short: 'C++', color: '#00599C' },
  sql: { name: 'SQL', short: 'SQL', color: '#5A5A5A' },
  powershell: { name: 'PowerShell', short: 'PS', color: '#1F4E79' }
}

export const LANG_ORDER: LangId[] = ['csharp', 'kotlin', 'java', 'typescript', 'javascript', 'python', 'cpp', 'sql', 'powershell']

export const IDES: Record<IdeId, { name: string; /** что открывает IDE */ opens: 'sln' | 'gradle' | 'folder' }> = {
  rider: { name: 'Rider', opens: 'sln' },
  vs: { name: 'Visual Studio', opens: 'sln' },
  vscode: { name: 'VS Code', opens: 'folder' },
  androidstudio: { name: 'Android Studio', opens: 'gradle' }
}

export const IDE_ORDER: IdeId[] = ['rider', 'vs', 'vscode', 'androidstudio']

export const HOSTS: Record<ForgeHost, { name: string; short: string; color: string }> = {
  github: { name: 'GitHub', short: 'GH', color: '#24292F' },
  gitlab: { name: 'GitLab', short: 'GL', color: '#B5401A' }
}

export const PLATFORMS: Record<PlatformId, { name: string; hint: string }> = {
  web: { name: 'Web', hint: 'сайт или сервис: ASP.NET Core, фронтенд' },
  windows: { name: 'Windows', hint: 'WPF, WinForms, Avalonia, служба, Electron' },
  android: { name: 'Android', hint: 'Gradle-проект с Android-плагином' }
}

export const PLATFORM_ORDER: PlatformId[] = ['web', 'windows', 'android']

export const TILE_COLORS = ['#2F4B8A', '#1F6F5C', '#8A4B2F', '#4C3F7A', '#9A3412', '#23415E', '#6B5B2E', '#3F3F46']

/** Монограмма из названия: «Сервис авторизации» → «СА», «DeployDock» → «DD», «otk» → «OT». */
export function monogram(name: string): string {
  const clean = name.trim()
  if (!clean) return '?'
  const words = clean.split(/[\s_\-.]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  const caps = clean.match(/\p{Lu}/gu)
  if (caps && caps.length >= 2) return caps.slice(0, 3).join('')
  return clean.slice(0, 2).toUpperCase()
}

export function webUrl(repo: { baseUrl: string; fullPath: string }): string {
  return `${repo.baseUrl.replace(/\/+$/, '')}/${repo.fullPath}`
}
