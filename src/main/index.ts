import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, screen, session, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import type {
  ActionResult, ContextAction, ForgeHost, IdeId, LangId, Note, Project, ProjectInput, ScanResult, SettingsPatch, SettingsView
} from '@shared/types'
import { IDES, IDE_ORDER, LANGS, TILE_COLORS } from '@shared/meta'
import { store } from './store'
import { decrypt, encrypt } from './secrets'
import { detectFolder, samePathKey, scanRoot } from './detect'
import { readGitState } from './git'
import { ideInfos, launchDetached, openTerminal, resetIdeCache, resolveIde } from './ide'
import { fetchActivity, testConnection } from './forge'

let win: BrowserWindow | null = null

const BG_LIGHT = '#F6F3EC'
const BG_DARK = '#171613'
const windowBg = (): string => (nativeTheme.shouldUseDarkColors ? BG_DARK : BG_LIGHT)

/** Картинка-иконка: только data:image и не больше ~700 КБ в base64. */
const isIconDataUrl = (x: unknown): x is string => typeof x === 'string' && /^data:image\/[\w.+-]+;base64,/.test(x) && x.length < 700_000

// ---------- Окно ----------

function createWindow(): void {
  const saved = store.settings().window
  const visible = saved?.x !== undefined && saved.y !== undefined &&
    screen.getAllDisplays().some((d) => {
      const b = d.workArea
      return saved.x! >= b.x - 50 && saved.y! >= b.y - 50 && saved.x! < b.x + b.width && saved.y! < b.y + b.height
    })

  win = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 820,
    x: visible ? saved?.x : undefined,
    y: visible ? saved?.y : undefined,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: windowBg(),
    title: 'Project Launcher',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (saved?.maximized) win.maximize()

  win.once('ready-to-show', () => win?.show())

  // Меню выключено, поэтому DevTools в разработке — по F12
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools()
    })
  }

  // Любые внешние ссылки — в системный браузер, а не внутрь лаунчера
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  win.on('close', () => {
    if (!win) return
    const s = store.settings()
    const b = win.getNormalBounds()
    s.window = { width: b.width, height: b.height, x: b.x, y: b.y, maximized: win.isMaximized() }
    store.saveSettings(s)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Разрешаем самоподписанный сертификат только для GitLab из настроек и только если это включено. */
function applyCertPolicy(): void {
  session.defaultSession.setCertificateVerifyProc((req, callback) => {
    const gl = store.settings().gitlab
    if (gl.allowSelfSigned && gl.baseUrl) {
      try {
        if (new URL(gl.baseUrl).hostname === req.hostname) return callback(0)
      } catch {
        /* кривой адрес — обычная проверка */
      }
    }
    callback(-3) // -3: решение принимает Chromium, как обычно
  })
}

// ---------- Проекты ----------

function getProject(id: string): Project {
  const p = store.projects().find((x) => x.id === id)
  if (!p) throw new Error('Проект не найден')
  return p
}

const isLang = (x: unknown): x is LangId => typeof x === 'string' && x in LANGS
const isIde = (x: unknown): x is IdeId => typeof x === 'string' && x in IDES

/** Приводим ввод из интерфейса к ожидаемой форме, чтобы в projects.json не попало лишнего. */
function sanitize(input: ProjectInput): Omit<Project, 'id' | 'createdAt' | 'notes'> {
  const name = String(input.name ?? '').trim()
  const path = String(input.path ?? '').trim()
  if (!name) throw new Error('Нужно название')
  if (!path) throw new Error('Нужна папка')
  const repo = input.repo && (input.repo.host === 'github' || input.repo.host === 'gitlab') && input.repo.fullPath?.trim()
    ? {
        host: input.repo.host,
        baseUrl: String(input.repo.baseUrl ?? '').trim().replace(/\/+$/, ''),
        fullPath: input.repo.fullPath.trim().replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
      }
    : undefined
  return {
    name,
    path,
    langs: Array.isArray(input.langs) ? input.langs.filter(isLang) : [],
    ide: isIde(input.ide) ? input.ide : 'vscode',
    openTarget: String(input.openTarget ?? ''),
    color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : TILE_COLORS[0],
    iconDataUrl: typeof input.iconDataUrl === 'string' && input.iconDataUrl.startsWith('data:image/') ? input.iconDataUrl : undefined,
    repo
  }
}

function sanitizeNotes(notes: unknown): Note[] {
  if (!Array.isArray(notes)) return []
  return notes
    .filter((n): n is Note => !!n && typeof n === 'object')
    .map((n) => ({ id: String(n.id || randomUUID()), key: String(n.key ?? ''), value: String(n.value ?? '') }))
    .filter((n) => n.key.trim() || n.value.trim())
}

// ---------- Настройки ----------

function settingsView(): SettingsView {
  const s = store.settings()
  return {
    github: { hasToken: !!decrypt(s.github.tokenEnc) },
    gitlab: { baseUrl: s.gitlab.baseUrl, hasToken: !!decrypt(s.gitlab.tokenEnc), allowSelfSigned: s.gitlab.allowSelfSigned },
    ides: ideInfos(s.ideExe),
    theme: s.theme,
    icons: s.icons,
    scanRoots: s.scanRoots
  }
}

/** Применяет тему к окну: Chromium сам переключит prefers-color-scheme в интерфейсе. */
function applyTheme(): void {
  nativeTheme.themeSource = store.settings().theme
  win?.setBackgroundColor(windowBg())
}

function newProject(input: ProjectInput): Project {
  return { ...sanitize(input), id: randomUUID(), notes: sanitizeNotes(input.notes), createdAt: new Date().toISOString() }
}

function tokenFor(host: ForgeHost): string | undefined {
  const s = store.settings()
  return decrypt(host === 'github' ? s.github.tokenEnc : s.gitlab.tokenEnc)
}

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.handle('projects:list', () => store.projects())

  ipcMain.handle('projects:add', (_e, input: ProjectInput) => {
    const list = store.projects()
    const project = newProject(input)
    list.push(project)
    store.saveProjects(list)
    return project
  })

  // Пакетное добавление после импорта из общей папки. Дубликаты по пути пропускаем.
  ipcMain.handle('projects:addMany', (_e, inputs: ProjectInput[]) => {
    if (!Array.isArray(inputs)) throw new Error('Пустой список')
    const list = store.projects()
    const known = new Set(list.map((p) => samePathKey(p.path)))
    const added: Project[] = []
    for (const input of inputs) {
      const key = samePathKey(String(input?.path ?? ''))
      if (known.has(key)) continue
      const p = newProject(input)
      known.add(key)
      added.push(p)
      list.push(p)
    }
    store.saveProjects(list)
    return added
  })

  ipcMain.handle('scan:roots', (_e, roots: string[]): ScanResult => {
    const s = store.settings()
    const known = new Set(store.projects().map((p) => samePathKey(p.path)))
    const opts = { gitlabBaseUrl: s.gitlab.baseUrl, hasIde: (id: IdeId) => !!resolveIde(id, s.ideExe), known }
    const result: ScanResult = { candidates: [], errors: [] }
    const seen = new Set<string>()
    for (const root of Array.isArray(roots) ? roots : []) {
      try {
        if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('Папка не найдена')
        for (const c of scanRoot(root, opts)) {
          const key = samePathKey(c.path)
          if (seen.has(key)) continue
          seen.add(key)
          result.candidates.push(c)
        }
      } catch (e) {
        result.errors.push({ root, error: e instanceof Error ? e.message : String(e) })
      }
    }
    result.candidates.sort((a, b) => a.suggestedName.localeCompare(b.suggestedName, 'ru'))
    return result
  })

  ipcMain.handle('projects:update', (_e, id: string, input: ProjectInput) => {
    const list = store.projects()
    const i = list.findIndex((p) => p.id === id)
    if (i < 0) throw new Error('Проект не найден')
    list[i] = { ...list[i], ...sanitize(input), notes: input.notes ? sanitizeNotes(input.notes) : list[i].notes }
    store.saveProjects(list)
    return list[i]
  })

  ipcMain.handle('projects:delete', (_e, id: string) => {
    store.saveProjects(store.projects().filter((p) => p.id !== id))
  })

  ipcMain.handle('projects:notes', (_e, id: string, notes: Note[]) => {
    const list = store.projects()
    const p = list.find((x) => x.id === id)
    if (!p) throw new Error('Проект не найден')
    p.notes = sanitizeNotes(notes)
    store.saveProjects(list)
  })

  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Папка проекта', properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:image', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Картинка для проекта',
      properties: ['openFile'],
      filters: [{ name: 'Картинки', extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp'] }]
    })
    if (r.canceled) return null
    const file = r.filePaths[0]
    if (statSync(file).size > 512 * 1024) throw new Error('Картинка больше 512 КБ — возьми поменьше')
    const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' }
    return `data:${mime[extname(file).toLowerCase()] ?? 'image/png'};base64,${readFileSync(file).toString('base64')}`
  })

  ipcMain.handle('dialog:exe', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Исполняемый файл IDE',
      properties: ['openFile'],
      filters: [{ name: 'Программы', extensions: ['exe', 'cmd', 'bat'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('detect', (_e, folder: string) => {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error('Это не папка')
    const s = store.settings()
    return detectFolder(folder, { gitlabBaseUrl: s.gitlab.baseUrl, hasIde: (id) => !!resolveIde(id, s.ideExe) })
  })

  ipcMain.handle('git:state', (_e, id: string) => readGitState(getProject(id).path))
  ipcMain.handle('git:states', () => Object.fromEntries(store.projects().map((p) => [p.id, readGitState(p.path)])))

  ipcMain.handle('open:ide', async (_e, id: string, ideOverride?: IdeId): Promise<ActionResult> => {
    const p = getProject(id)
    const ide = ideOverride && isIde(ideOverride) ? ideOverride : p.ide
    if (!existsSync(p.path)) return { ok: false, error: `Папка не найдена: ${p.path}` }
    const exe = resolveIde(ide, store.settings().ideExe)
    if (!exe) return { ok: false, error: `Не нашёл ${IDES[ide].name} — укажи путь в настройках` }
    // openTarget подобран под основную IDE; для «открыть в другой» берём то, что подходит ей
    let target = p.path
    if (ide === p.ide && p.openTarget) target = join(p.path, p.openTarget)
    else if (ide !== p.ide && IDES[ide].opens === IDES[p.ide].opens && p.openTarget) target = join(p.path, p.openTarget)
    if (!existsSync(target)) return { ok: false, error: `Не найден ${target} — поправь проект` }
    return launchDetached(exe, [target], p.path)
  })

  ipcMain.handle('open:folder', async (_e, id: string): Promise<ActionResult> => {
    const p = getProject(id)
    const err = await shell.openPath(p.path)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.handle('open:terminal', (_e, id: string) => openTerminal(getProject(id).path))

  ipcMain.handle('open:external', async (_e, url: string) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle('menu:context', (_e, id: string) => {
    const p = getProject(id)
    return new Promise<ContextAction | null>((resolve) => {
      let settled = false
      const pick = (a: ContextAction | null): void => {
        if (!settled) {
          settled = true
          resolve(a)
        }
      }
      const others = IDE_ORDER.filter((x) => x !== p.ide).map((x) => ({
        label: IDES[x].name,
        click: () => pick(`ide:${x}`)
      }))
      const menu = Menu.buildFromTemplate([
        { label: 'Открыть в…', submenu: others },
        { label: 'Терминал в папке', click: () => pick('openTerminal') },
        {
          label: 'Скопировать путь',
          click: () => {
            clipboard.writeText(p.path)
            pick('copyPath')
          }
        },
        { type: 'separator' },
        { label: 'Изменить…', click: () => pick('edit') },
        { label: 'Удалить', click: () => pick('delete') }
      ])
      // callback срабатывает при закрытии меню; клик по пункту может прийти чуть позже — даём ему фору
      menu.popup({ window: win!, callback: () => setTimeout(() => pick(null), 100) })
    })
  })

  ipcMain.handle('repo:activity', async (_e, id: string) => {
    const p = getProject(id)
    if (!p.repo) throw new Error('У проекта нет репозитория')
    return fetchActivity(p.repo, tokenFor(p.repo.host))
  })

  ipcMain.handle('settings:get', () => settingsView())

  ipcMain.handle('settings:save', (_e, patch: SettingsPatch) => {
    const s = store.settings()
    if (patch.githubToken !== undefined) s.github.tokenEnc = patch.githubToken ? encrypt(patch.githubToken.trim()) : undefined
    if (patch.gitlabToken !== undefined) s.gitlab.tokenEnc = patch.gitlabToken ? encrypt(patch.gitlabToken.trim()) : undefined
    if (patch.gitlabBaseUrl !== undefined) {
      const url = patch.gitlabBaseUrl.trim().replace(/\/+$/, '')
      if (url && !/^https?:\/\//.test(url)) throw new Error('Адрес GitLab должен начинаться с http:// или https://')
      s.gitlab.baseUrl = url
    }
    if (patch.gitlabAllowSelfSigned !== undefined) s.gitlab.allowSelfSigned = !!patch.gitlabAllowSelfSigned
    if (patch.ideExe) {
      for (const id of IDE_ORDER) {
        const v = patch.ideExe[id]
        if (v !== undefined) {
          if (v.trim()) s.ideExe[id] = v.trim()
          else delete s.ideExe[id]
        }
      }
      resetIdeCache()
    }
    if (patch.theme === 'system' || patch.theme === 'light' || patch.theme === 'dark') s.theme = patch.theme
    if (patch.hostIcon && (patch.hostIcon.host === 'github' || patch.hostIcon.host === 'gitlab')) {
      const { host, dataUrl } = patch.hostIcon
      if (dataUrl === null) delete s.icons.hosts[host]
      else if (isIconDataUrl(dataUrl)) s.icons.hosts[host] = dataUrl
      else throw new Error('Не похоже на картинку или она слишком большая')
    }
    if (patch.langIcon && isLang(patch.langIcon.lang)) {
      const { lang, dataUrl } = patch.langIcon
      if (dataUrl === null) delete s.icons.langs[lang]
      else if (isIconDataUrl(dataUrl)) s.icons.langs[lang] = dataUrl
      else throw new Error('Не похоже на картинку или она слишком большая')
    }
    if (Array.isArray(patch.scanRoots)) {
      const uniq = new Map<string, string>()
      for (const r of patch.scanRoots) if (typeof r === 'string' && r.trim()) uniq.set(samePathKey(r.trim()), r.trim())
      s.scanRoots = Array.from(uniq.values())
    }
    store.saveSettings(s)
    if (patch.theme) applyTheme()
    return settingsView()
  })

  ipcMain.handle('settings:test', (_e, host: ForgeHost) => {
    const s = store.settings()
    return testConnection(host, s.gitlab.baseUrl, tokenFor(host))
  })
}

// ---------- Запуск ----------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    nativeTheme.themeSource = store.settings().theme
    // Тема «как в системе»: система переключилась — перекрашиваем фон окна под неё
    nativeTheme.on('updated', () => win?.setBackgroundColor(windowBg()))
    applyCertPolicy()
    registerIpc()
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
