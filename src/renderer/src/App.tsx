import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContextAction, CustomIcons, GitState, IdeId, Project, RepoActivity, SettingsView } from '@shared/types'
import { IDES } from '@shared/meta'
import { ProjectCard } from './components/ProjectCard'
import { RepoModal } from './components/RepoModal'
import { NotesModal } from './components/NotesModal'
import { ProjectModal, type ProjectModalMode } from './components/ProjectModal'
import { SettingsModal } from './components/SettingsModal'
import { ImportModal } from './components/ImportModal'
import { IconsContext } from './components/Badges'
import { IconFolderSearch, IconPlus, IconSearch, IconSettings } from './components/Icons'
import { BADGE_ICON, normalizeIcon, PLATFORM_ICON, type NormalizeOptions } from './lib/image'

type ModalState =
  | { type: 'repo'; id: string }
  | { type: 'notes'; id: string }
  | { type: 'project'; mode: ProjectModalMode }
  | { type: 'settings' }
  | { type: 'import' }
  | null

interface Toast {
  text: string
  error?: boolean
}

const api = window.api

/** Текущая версия выравнивания иконок. Поднять, если поменяется алгоритм в lib/image. */
const ICONS_VERSION = 1

/** Перевыравнивает все загруженные иконки. Картинку, которую не удалось прочитать, оставляет как есть. */
async function normalizeAll(icons: CustomIcons): Promise<CustomIcons> {
  const each = async <K extends string>(map: Partial<Record<K, string>>, opts: NormalizeOptions): Promise<Partial<Record<K, string>>> => {
    const out: Partial<Record<K, string>> = {}
    for (const [k, v] of Object.entries(map) as [K, string][]) {
      try {
        out[k] = await normalizeIcon(v, opts)
      } catch {
        out[k] = v
      }
    }
    return out
  }
  return {
    hosts: await each(icons.hosts, BADGE_ICON),
    langs: await each(icons.langs, BADGE_ICON),
    platforms: await each(icons.platforms, PLATFORM_ICON)
  }
}
const ACTIVITY_TTL_MS = 3 * 60 * 1000
const PARALLEL = 4

export function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)
  const [git, setGit] = useState<Record<string, GitState>>({})
  const [activity, setActivity] = useState<Record<string, RepoActivity>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState<SettingsView>()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [launching, setLaunching] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const lastActivityAt = useRef(0)
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 5000 : 2200)
  }, [])

  // ---------- Загрузка данных ----------

  /** Тянет PR/Issue для проектов с репозиторием, не больше PARALLEL запросов одновременно. */
  const refreshActivity = useCallback(async (ids?: string[]) => {
    const targets = (ids ?? projectsRef.current.filter((p) => p.repo).map((p) => p.id)).slice()
    if (!targets.length) return
    lastActivityAt.current = Date.now()
    setLoadingIds((s) => new Set([...s, ...targets]))
    const worker = async (): Promise<void> => {
      for (let id = targets.shift(); id; id = targets.shift()) {
        try {
          const a = await api.repoActivity(id)
          setActivity((m) => ({ ...m, [id!]: a }))
        } catch {
          /* проект успели удалить или отвязать от репы */
        } finally {
          setLoadingIds((s) => {
            const n = new Set(s)
            n.delete(id!)
            return n
          })
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
  }, [])

  const refreshGit = useCallback(async () => {
    setGit(await api.gitStates())
  }, [])

  useEffect(() => {
    void (async () => {
      const [list, loadedSettings] = await Promise.all([api.listProjects(), api.getSettings()])
      let s = loadedSettings
      // Иконки, загруженные до появления выравнивания, приводим к одному размеру один раз
      if (s.iconsVersion < ICONS_VERSION) {
        try {
          s = await api.saveSettings({ icons: await normalizeAll(s.icons), iconsVersion: ICONS_VERSION })
        } catch {
          /* не вышло — покажем как есть, попробуем при следующем запуске */
        }
      }
      setProjects(list)
      projectsRef.current = list
      setSettings(s)
      setLoaded(true)
      await refreshGit()
      await refreshActivity()
    })()
  }, [refreshActivity, refreshGit])

  // Вернулся в окно — обновляем ветки (дёшево) и PR/Issue, если давно не обновляли
  useEffect(() => {
    const onFocus = (): void => {
      void refreshGit()
      if (Date.now() - lastActivityAt.current > ACTIVITY_TTL_MS) void refreshActivity()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshActivity, refreshGit])

  // ---------- Действия ----------

  const openInIde = useCallback(
    async (p: Project, ide?: IdeId) => {
      setLaunching(p.id)
      const r = await api.openInIde(p.id, ide)
      setTimeout(() => setLaunching((cur) => (cur === p.id ? null : cur)), 600)
      if (r.ok) showToast(`Открываю ${p.name} в ${IDES[ide ?? p.ide].name}…`)
      else showToast(r.error ?? 'Не удалось открыть', true)
    },
    [showToast]
  )

  const openFolder = async (p: Project): Promise<void> => {
    const r = await api.openFolder(p.id)
    if (!r.ok) showToast(r.error ?? 'Не удалось открыть папку', true)
  }

  const openTerminal = async (p: Project): Promise<void> => {
    const r = await api.openTerminal(p.id)
    if (!r.ok) showToast(r.error ?? 'Не удалось открыть терминал', true)
  }

  const removeProject = async (p: Project): Promise<void> => {
    if (!window.confirm(`Убрать «${p.name}» из лаунчера? Папка на диске останется как есть.`)) return
    await api.deleteProject(p.id)
    setProjects((list) => list.filter((x) => x.id !== p.id))
    showToast(`«${p.name}» убран`)
  }

  const onContext = async (p: Project): Promise<void> => {
    const action: ContextAction | null = await api.showContextMenu(p.id)
    if (!action) return
    if (action === 'edit') setModal({ type: 'project', mode: { kind: 'edit', project: p } })
    else if (action === 'delete') void removeProject(p)
    else if (action === 'copyPath') showToast('Путь скопирован')
    else if (action === 'openTerminal') {
      const r = await api.openTerminal(p.id)
      if (!r.ok) showToast(r.error ?? 'Не удалось открыть терминал', true)
    } else if (action.startsWith('ide:')) void openInIde(p, action.slice(4) as IdeId)
  }

  const onProjectSaved = (saved: Project): void => {
    setProjects((list) => {
      const exists = list.some((x) => x.id === saved.id)
      const next = exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]
      projectsRef.current = next
      return next
    })
    setModal(null)
    void api.gitState(saved.id).then((g) => setGit((m) => ({ ...m, [saved.id]: g })))
    if (saved.repo) void refreshActivity([saved.id])
    else setActivity((m) => {
      const n = { ...m }
      delete n[saved.id]
      return n
    })
  }

  const onImported = (added: Project[]): void => {
    setModal(null)
    if (!added.length) return
    setProjects((list) => {
      const next = [...list, ...added]
      projectsRef.current = next
      return next
    })
    showToast(`Добавлено проектов: ${added.length}`)
    void refreshGit()
    void refreshActivity(added.filter((p) => p.repo).map((p) => p.id))
  }

  // ---------- Поиск и клавиатура ----------

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return projects
      .filter((p) => !needle || `${p.name} ${p.path} ${p.repo?.fullPath ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [projects, q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (modal) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f' || e.code === 'KeyK' || e.code === 'KeyF')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.code === 'KeyN')) {
        e.preventDefault()
        setModal({ type: 'project', mode: { kind: 'new' } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  // ---------- Перетаскивание папки в окно ----------

  const dragDepth = useRef(0)
  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e) || modal) return
      dragDepth.current++
      setDragging(true)
    }
    const leave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setDragging(false)
    }
    const over = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (modal) return
      const file = e.dataTransfer?.files[0]
      if (!file) return
      const path = api.pathForFile(file)
      if (path) setModal({ type: 'project', mode: { kind: 'new', path } })
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [modal])

  // ---------- Разметка ----------

  const current = modal && 'id' in modal ? projects.find((p) => p.id === modal.id) : undefined

  const icons = settings?.icons ?? { hosts: {}, langs: {}, platforms: {} }

  return (
    <IconsContext.Provider value={icons}>
    <div className={`app${dragging ? ' dragging' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">П</div>
          <span className="brand-name">Проекты</span>
        </div>
        <label className="search">
          <IconSearch size={18} />
          <span className="sr-only">Поиск проекта</span>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название, путь или репозиторий…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible[0]) void openInIde(visible[0])
              if (e.key === 'Escape') setQ('')
            }}
          />
          <span className="kbd">Ctrl K</span>
        </label>
        <div className="topbar-actions">
          <button type="button" className="icon-btn lg" aria-label="Найти проекты в папках" title="Найти проекты в папках" onClick={() => setModal({ type: 'import' })}>
            <IconFolderSearch size={19} />
          </button>
          <button type="button" className="icon-btn lg" aria-label="Настройки" title="Настройки" onClick={() => setModal({ type: 'settings' })}>
            <IconSettings size={19} />
          </button>
          <button type="button" className="btn btn-dark" onClick={() => setModal({ type: 'project', mode: { kind: 'new' } })}>
            <IconPlus size={16} />
            Добавить проект
          </button>
        </div>
      </header>

      <main className="content">
        {loaded && projects.length === 0 ? (
          <div className="empty">
            <h2>Здесь пока пусто</h2>
            <span>Укажи общую папку, где лежат проекты, — лаунчер сам их найдёт. Или перетащи папку одного проекта в окно.</span>
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-dark" onClick={() => setModal({ type: 'import' })}>
                <IconFolderSearch size={17} />
                Найти проекты в папке
              </button>
              <button type="button" className="btn btn-line" onClick={() => setModal({ type: 'project', mode: { kind: 'new' } })}>
                <IconPlus size={16} />
                Добавить один
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="content-head">
              <h1>{q ? 'Найдено' : 'Все проекты'}</h1>
              <span className="muted">{visible.length}</span>
              <span className="hint">Клик — открыть в IDE · правая кнопка — ещё действия · Enter в поиске — открыть первый</span>
            </div>
            <div className="grid">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  git={git[p.id]}
                  activity={activity[p.id]}
                  loading={loadingIds.has(p.id)}
                  launching={launching === p.id}
                  onOpen={() => void openInIde(p)}
                  onRepo={() => setModal({ type: 'repo', id: p.id })}
                  onNotes={() => setModal({ type: 'notes', id: p.id })}
                  onFolder={() => void openFolder(p)}
                  onTerminal={() => void openTerminal(p)}
                  onContext={() => void onContext(p)}
                />
              ))}
            </div>
            {loaded && visible.length === 0 && <div className="placeholder">Ничего не нашлось.</div>}
          </>
        )}
      </main>

      {modal?.type === 'repo' && current?.repo && (
        <RepoModal
          project={current}
          git={git[current.id]}
          activity={activity[current.id]}
          loading={loadingIds.has(current.id)}
          onRefresh={() => void refreshActivity([current.id])}
          onOpenSettings={() => setModal({ type: 'settings' })}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'notes' && current && (
        <NotesModal
          project={current}
          onToast={showToast}
          onSaved={(notes) => setProjects((list) => list.map((x) => (x.id === current.id ? { ...x, notes } : x)))}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'project' && (
        <ProjectModal mode={modal.mode} settings={settings} onSaved={onProjectSaved} onClose={() => setModal(null)} />
      )}

      {modal?.type === 'settings' && settings && (
        <SettingsModal
          settings={settings}
          onSaved={setSettings}
          onImport={() => setModal({ type: 'import' })}
          onClose={() => {
            setModal(null)
            // Токены или адрес могли поменяться — перечитываем PR/Issue
            void refreshActivity()
          }}
        />
      )}

      {modal?.type === 'import' && settings && (
        <ImportModal settings={settings} onSettings={setSettings} onImported={onImported} onClose={() => setModal(null)} />
      )}

      {toast && (
        <div className={`toast${toast.error ? ' error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
    </IconsContext.Provider>
  )
}

