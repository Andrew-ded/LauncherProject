// Типы, общие для main-процесса, preload и интерфейса.

export type LangId = 'csharp' | 'kotlin' | 'java' | 'typescript' | 'javascript' | 'python' | 'cpp' | 'sql' | 'powershell'

export type IdeId = 'rider' | 'vs' | 'vscode' | 'androidstudio'

export type ForgeHost = 'github' | 'gitlab'

/** Где работает результат: сайт/сервис, приложение Windows или Android */
export type PlatformId = 'web' | 'windows' | 'android'

export interface Note {
  id: string
  key: string
  value: string
}

/** Привязка проекта к удалённому репозиторию. */
export interface RepoRef {
  host: ForgeHost
  /** Корень веб-интерфейса: https://github.com или https://gitlab.yamz.local */
  baseUrl: string
  /** owner/repo для GitHub, group/subgroup/repo для GitLab */
  fullPath: string
}

export interface Project {
  id: string
  name: string
  /** Абсолютный путь до папки проекта */
  path: string
  langs: LangId[]
  ide: IdeId
  /** Что передать IDE, относительно path: .sln, папка с settings.gradle или '' (сама папка) */
  openTarget: string
  color: string
  /** Целевая платформа: её иконка показывается вместо монограммы. null — не определена */
  platform?: PlatformId | null
  /** Своя картинка вместо монограммы (data:URL) */
  iconDataUrl?: string
  notes: Note[]
  repo?: RepoRef
  createdAt: string
}

/** Данные для создания/редактирования — всё, кроме служебных полей. */
export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'notes'> & { notes?: Note[] }

/** Что main-процесс нашёл в выбранной папке. */
export interface DetectResult {
  path: string
  suggestedName: string
  langs: LangId[]
  suggestedIde: IdeId
  platform?: PlatformId
  /** Кандидаты на openTarget для каждой IDE */
  targets: Record<IdeId, string[]>
  repo?: RepoRef
  /** Remote есть, но хостинг не распознан (например, Gitea) */
  unknownRemote?: string
  found: { file: string; meaning: string }[]
}

/** Живое состояние git в папке проекта. */
export interface GitState {
  branch?: string
  detached?: boolean
}

export interface ForgeItem {
  number: number
  title: string
  author: string
  updatedAt: string
  url: string
  draft?: boolean
  /** Для PR/MR: "feature → main" */
  branches?: string
  labels: string[]
}

export interface RepoActivity {
  prs: ForgeItem[]
  issues: ForgeItem[]
  prTotal: number
  issueTotal: number
  /** Открытых больше, чем пришло в списке — показываем «100+» */
  prMore?: boolean
  issueMore?: boolean
  fetchedAt: string
  error?: string
}

export interface IdeInfo {
  id: IdeId
  name: string
  /** Путь, который будет использован при запуске (из настроек или найденный автоматически) */
  exe?: string
  /** Найден автоматически, а не задан вручную */
  auto: boolean
}

export type ThemeMode = 'system' | 'light' | 'dark'

/** Свои картинки вместо буквенных значков (data:URL). */
export interface CustomIcons {
  hosts: Partial<Record<ForgeHost, string>>
  langs: Partial<Record<LangId, string>>
  platforms: Partial<Record<PlatformId, string>>
}

/** Настройки в том виде, в котором их видит интерфейс — без самих токенов. */
export interface SettingsView {
  github: { hasToken: boolean }
  gitlab: { baseUrl: string; hasToken: boolean; allowSelfSigned: boolean }
  ides: IdeInfo[]
  theme: ThemeMode
  icons: CustomIcons
  /** Общие папки, в которых лежат проекты */
  scanRoots: string[]
  /** Версия выравнивания иконок: если меньше текущей, интерфейс перевыравнивает загруженные */
  iconsVersion: number
}

export interface SettingsPatch {
  githubToken?: string | null
  gitlabToken?: string | null
  gitlabBaseUrl?: string
  gitlabAllowSelfSigned?: boolean
  ideExe?: Partial<Record<IdeId, string>>
  theme?: ThemeMode
  /** null — вернуть стандартный значок */
  hostIcon?: { host: ForgeHost; dataUrl: string | null }
  langIcon?: { lang: LangId; dataUrl: string | null }
  platformIcon?: { platform: PlatformId; dataUrl: string | null }
  /** Заменить все иконки разом (после выравнивания) */
  icons?: CustomIcons
  iconsVersion?: number
  scanRoots?: string[]
}

/** Проект, найденный при сканировании общей папки. */
export interface ScanCandidate extends DetectResult {
  root: string
  /** Уже есть в лаунчере (совпал путь) */
  alreadyAdded: boolean
}

export interface ScanResult {
  candidates: ScanCandidate[]
  /** Папки, которые не удалось прочитать */
  errors: { root: string; error: string }[]
}

export type ContextAction = 'edit' | 'delete' | 'copyPath' | 'openTerminal' | `ide:${IdeId}`

export interface ActionResult {
  ok: boolean
  error?: string
}

/** API, которое preload выставляет в window.api */
export interface LauncherApi {
  listProjects(): Promise<Project[]>
  addProject(input: ProjectInput): Promise<Project>
  addProjects(inputs: ProjectInput[]): Promise<Project[]>
  updateProject(id: string, input: ProjectInput): Promise<Project>
  deleteProject(id: string): Promise<void>
  setNotes(id: string, notes: Note[]): Promise<void>

  pickFolder(): Promise<string | null>
  pickImage(): Promise<string | null>
  detect(folder: string): Promise<DetectResult>
  /** Ищет проекты в подпапках указанных общих папок */
  scanRoots(roots: string[]): Promise<ScanResult>
  gitState(id: string): Promise<GitState>
  gitStates(): Promise<Record<string, GitState>>

  openInIde(id: string, ide?: IdeId): Promise<ActionResult>
  openFolder(id: string): Promise<ActionResult>
  openTerminal(id: string): Promise<ActionResult>
  openExternal(url: string): Promise<void>
  showContextMenu(id: string): Promise<ContextAction | null>

  repoActivity(id: string): Promise<RepoActivity>

  getSettings(): Promise<SettingsView>
  saveSettings(patch: SettingsPatch): Promise<SettingsView>
  testForge(host: ForgeHost): Promise<ActionResult & { user?: string }>
  pickExe(): Promise<string | null>

  /** Абсолютный путь файла/папки, брошенной в окно */
  pathForFile(file: File): string
}
