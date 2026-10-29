import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { GitState, RepoRef } from '@shared/types'

// Читаем .git напрямую, без запуска git.exe: быстро и не зависит от того, есть ли git в PATH.

/** Находит каталог .git для папки проекта (поднимаясь вверх, если проект — подпапка репозитория). */
export function findGitDir(folder: string): string | undefined {
  let dir = resolve(folder)
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, '.git')
    if (existsSync(candidate)) {
      const st = statSync(candidate)
      if (st.isDirectory()) return candidate
      // .git-файл у worktree и сабмодулей: "gitdir: <путь>"
      const m = readFileSync(candidate, 'utf-8').match(/^gitdir:\s*(.+)$/m)
      if (m) {
        const p = m[1].trim()
        return isAbsolute(p) ? p : resolve(dir, p)
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export function readGitState(folder: string): GitState {
  const gitDir = findGitDir(folder)
  if (!gitDir) return {}
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf-8').trim()
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    if (ref) return { branch: ref[1] }
    if (/^[0-9a-f]{7,}$/i.test(head)) return { branch: head.slice(0, 7), detached: true }
  } catch {
    /* HEAD не читается — показываем без ветки */
  }
  return {}
}

/** URL remote "origin" (или первого попавшегося remote) из .git/config. */
export function readRemoteUrl(folder: string): string | undefined {
  let gitDir = findGitDir(folder)
  if (!gitDir) return undefined
  // У worktree конфиг лежит в общем каталоге репозитория
  const commondir = join(gitDir, 'commondir')
  if (existsSync(commondir)) gitDir = resolve(gitDir, readFileSync(commondir, 'utf-8').trim())
  const cfgPath = join(gitDir, 'config')
  if (!existsSync(cfgPath)) return undefined

  const remotes: Record<string, string> = {}
  let current: string | undefined
  for (const raw of readFileSync(cfgPath, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim()
    const section = line.match(/^\[remote\s+"(.+)"\]$/)
    if (section) {
      current = section[1]
      continue
    }
    if (line.startsWith('[')) {
      current = undefined
      continue
    }
    const url = current && line.match(/^url\s*=\s*(.+)$/)
    if (url && current) remotes[current] = url[1].trim()
  }
  return remotes.origin ?? Object.values(remotes)[0]
}

/**
 * Разбирает URL remote в хост + путь репозитория.
 * Понимает https://host/a/b(.git), git@host:a/b.git и ssh://git@host:port/a/b.git.
 */
export function parseRemote(url: string, gitlabBaseUrl: string): { repo?: RepoRef; unknown?: string } {
  let host: string | undefined
  let path: string | undefined

  const scp = url.match(/^[\w.-]+@([^:/]+):(.+)$/)
  if (scp) {
    host = scp[1]
    path = scp[2]
  } else {
    try {
      const u = new URL(url)
      host = u.hostname
      path = u.pathname
    } catch {
      return { unknown: url }
    }
  }

  const fullPath = path.replace(/^\/+/, '').replace(/\.git\/?$/, '').replace(/\/+$/, '')
  if (!host || !fullPath) return { unknown: url }

  if (host === 'github.com') {
    return { repo: { host: 'github', baseUrl: 'https://github.com', fullPath } }
  }

  if (gitlabBaseUrl) {
    try {
      const gl = new URL(gitlabBaseUrl)
      if (gl.hostname === host) {
        // На self-hosted GitLab иногда стоит подпуть (https://srv/gitlab) — он не часть пути репы
        const sub = gl.pathname.replace(/^\/+|\/+$/g, '')
        const rel = sub && fullPath.startsWith(sub + '/') ? fullPath.slice(sub.length + 1) : fullPath
        return { repo: { host: 'gitlab', baseUrl: gitlabBaseUrl.replace(/\/+$/, ''), fullPath: rel } }
      }
    } catch {
      /* кривой URL в настройках — считаем хостинг неизвестным */
    }
  }
  if (host === 'gitlab.com') {
    return { repo: { host: 'gitlab', baseUrl: 'https://gitlab.com', fullPath } }
  }
  // Адрес GitLab в настройках не задан, но по имени хоста всё понятно (gitlab.yamz.local)
  if (/(^|\.)gitlab\./i.test(host)) {
    return { repo: { host: 'gitlab', baseUrl: `https://${host}`, fullPath } }
  }
  return { unknown: url }
}
