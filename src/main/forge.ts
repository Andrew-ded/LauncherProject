import { net } from 'electron'
import type { ActionResult, ForgeItem, RepoActivity, RepoRef } from '@shared/types'

// Клиенты GitHub и GitLab. Запросы идут через net.fetch — это сетевой стек Chromium,
// он берёт системный прокси и корпоративные сертификаты из хранилища Windows.

const PER_PAGE = 100
const TIMEOUT_MS = 12000

class ForgeError extends Error {}

interface Fetched<T> {
  data: T
  headers: Headers
}

async function getJson<T>(url: string, headers: Record<string, string>, hostLabel: string): Promise<Fetched<T>> {
  let res: Response
  try {
    res = await net.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/abort|timeout/i.test(msg)) throw new ForgeError(`${hostLabel} не ответил за ${TIMEOUT_MS / 1000} с`)
    if (/CERT|certificate/i.test(msg)) throw new ForgeError(`${hostLabel}: сертификат не прошёл проверку (см. настройки GitLab)`)
    throw new ForgeError(`Нет связи с ${hostLabel}: ${msg}`)
  }
  if (!res.ok) {
    if (res.status === 401) throw new ForgeError(`${hostLabel}: токен не подошёл или истёк`)
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      throw new ForgeError(`${hostLabel}: кончился лимит запросов — добавь токен в настройках`)
    }
    if (res.status === 403) throw new ForgeError(`${hostLabel}: нет доступа (403)`)
    if (res.status === 404) throw new ForgeError(`${hostLabel}: репозиторий не найден или к нему нет доступа`)
    throw new ForgeError(`${hostLabel}: ошибка ${res.status}`)
  }
  return { data: (await res.json()) as T, headers: res.headers }
}

const hasNextPage = (h: Headers): boolean => /rel="next"/.test(h.get('link') ?? '')

// ---------- GitHub ----------

interface GhUser { login: string }
interface GhPull { number: number; title: string; user: GhUser | null; updated_at: string; html_url: string; draft?: boolean; head: { ref: string }; base: { ref: string }; labels: { name: string }[] }
interface GhIssue { number: number; title: string; user: GhUser | null; updated_at: string; html_url: string; labels: { name: string }[]; pull_request?: unknown }

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function github(repo: RepoRef, token?: string): Promise<RepoActivity> {
  const api = `https://api.github.com/repos/${repo.fullPath}`
  const headers = ghHeaders(token)
  const [pulls, issues] = await Promise.all([
    getJson<GhPull[]>(`${api}/pulls?state=open&sort=updated&direction=desc&per_page=${PER_PAGE}`, headers, 'GitHub'),
    getJson<GhIssue[]>(`${api}/issues?state=open&sort=updated&direction=desc&per_page=${PER_PAGE}`, headers, 'GitHub')
  ])
  const prs: ForgeItem[] = pulls.data.map((p) => ({
    number: p.number,
    title: p.title,
    author: p.user?.login ?? '—',
    updatedAt: p.updated_at,
    url: p.html_url,
    draft: p.draft,
    branches: `${p.head.ref} → ${p.base.ref}`,
    labels: p.labels.map((l) => l.name)
  }))
  // В GitHub API pull request'ы тоже приходят в /issues — отсеиваем
  const iss: ForgeItem[] = issues.data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      author: i.user?.login ?? '—',
      updatedAt: i.updated_at,
      url: i.html_url,
      labels: i.labels.map((l) => l.name)
    }))
  return {
    prs,
    issues: iss,
    prTotal: prs.length,
    issueTotal: iss.length,
    prMore: hasNextPage(pulls.headers),
    issueMore: hasNextPage(issues.headers),
    fetchedAt: new Date().toISOString()
  }
}

// ---------- GitLab ----------

interface GlUser { username: string }
interface GlMr { iid: number; title: string; author: GlUser | null; updated_at: string; web_url: string; draft?: boolean; work_in_progress?: boolean; source_branch: string; target_branch: string; labels: string[] }
interface GlIssue { iid: number; title: string; author: GlUser | null; updated_at: string; web_url: string; labels: string[] }

function glHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (token) h['PRIVATE-TOKEN'] = token
  return h
}

function glTotal(h: Headers, fallback: number): { total: number; more: boolean } {
  const t = Number(h.get('x-total'))
  // На очень больших выборках GitLab не отдаёт x-total — тогда ориентируемся на ссылку next
  if (Number.isFinite(t) && h.get('x-total') !== null) return { total: t, more: false }
  return { total: fallback, more: hasNextPage(h) }
}

async function gitlab(repo: RepoRef, token?: string): Promise<RepoActivity> {
  const api = `${repo.baseUrl.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(repo.fullPath)}`
  const headers = glHeaders(token)
  const [mrs, issues] = await Promise.all([
    getJson<GlMr[]>(`${api}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=${PER_PAGE}`, headers, 'GitLab'),
    getJson<GlIssue[]>(`${api}/issues?state=opened&order_by=updated_at&sort=desc&per_page=${PER_PAGE}`, headers, 'GitLab')
  ])
  const prs: ForgeItem[] = mrs.data.map((m) => ({
    number: m.iid,
    title: m.title,
    author: m.author?.username ?? '—',
    updatedAt: m.updated_at,
    url: m.web_url,
    draft: m.draft ?? m.work_in_progress,
    branches: `${m.source_branch} → ${m.target_branch}`,
    labels: m.labels ?? []
  }))
  const iss: ForgeItem[] = issues.data.map((i) => ({
    number: i.iid,
    title: i.title,
    author: i.author?.username ?? '—',
    updatedAt: i.updated_at,
    url: i.web_url,
    labels: i.labels ?? []
  }))
  const pt = glTotal(mrs.headers, prs.length)
  const it = glTotal(issues.headers, iss.length)
  return {
    prs,
    issues: iss,
    prTotal: pt.total,
    issueTotal: it.total,
    prMore: pt.more,
    issueMore: it.more,
    fetchedAt: new Date().toISOString()
  }
}

// ---------- Общее ----------

export async function fetchActivity(repo: RepoRef, token?: string): Promise<RepoActivity> {
  try {
    return repo.host === 'github' ? await github(repo, token) : await gitlab(repo, token)
  } catch (e) {
    return {
      prs: [],
      issues: [],
      prTotal: 0,
      issueTotal: 0,
      fetchedAt: new Date().toISOString(),
      error: e instanceof ForgeError ? e.message : `Не удалось получить данные: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

export async function testConnection(host: 'github' | 'gitlab', baseUrl: string, token?: string): Promise<ActionResult & { user?: string }> {
  if (!token) return { ok: false, error: 'Токен не задан' }
  try {
    if (host === 'github') {
      const r = await getJson<GhUser>('https://api.github.com/user', ghHeaders(token), 'GitHub')
      return { ok: true, user: r.data.login }
    }
    if (!baseUrl) return { ok: false, error: 'Не задан адрес GitLab' }
    const r = await getJson<GlUser>(`${baseUrl.replace(/\/+$/, '')}/api/v4/user`, glHeaders(token), 'GitLab')
    return { ok: true, user: r.data.username }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
