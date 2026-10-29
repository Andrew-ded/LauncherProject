import { useEffect, useState } from 'react'
import type { DetectResult, ForgeHost, IdeId, LangId, Project, ProjectInput, SettingsView } from '@shared/types'
import { HOSTS, IDES, IDE_ORDER, LANGS, LANG_ORDER, TILE_COLORS } from '@shared/meta'
import { Modal } from './Modal'
import { ProjectTile } from './Badges'
import { IconWarn } from './Icons'
import { errText } from '../lib/format'

export type ProjectModalMode = { kind: 'new'; path?: string } | { kind: 'edit'; project: Project }

interface Props {
  mode: ProjectModalMode
  settings?: SettingsView
  onSaved: (p: Project) => void
  onClose: () => void
}

type RepoChoice = 'none' | ForgeHost

/** Добавление и редактирование проекта. При выборе папки сама подставляет язык, IDE и репозиторий. */
export function ProjectModal({ mode, settings, onSaved, onClose }: Props) {
  const editing = mode.kind === 'edit' ? mode.project : undefined
  const [path, setPath] = useState(editing?.path ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [langs, setLangs] = useState<LangId[]>(editing?.langs ?? [])
  const [ide, setIde] = useState<IdeId>(editing?.ide ?? 'rider')
  const [openTarget, setOpenTarget] = useState(editing?.openTarget ?? '')
  const [color, setColor] = useState(editing?.color ?? TILE_COLORS[Math.floor(Math.random() * TILE_COLORS.length)])
  const [icon, setIcon] = useState<string | undefined>(editing?.iconDataUrl)
  const [repoHost, setRepoHost] = useState<RepoChoice>(editing?.repo?.host ?? 'none')
  const [repoPath, setRepoPath] = useState(editing?.repo?.fullPath ?? '')
  const [repoBase, setRepoBase] = useState(editing?.repo?.baseUrl ?? '')
  const [detect, setDetect] = useState<DetectResult>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const gitlabDefault = settings?.gitlab.baseUrl ?? ''

  // Разбор папки. В режиме редактирования поля не перетираем — нужен только список вариантов openTarget.
  const runDetect = async (folder: string, fill: boolean): Promise<void> => {
    if (!folder) return
    setError(undefined)
    try {
      const d = await window.api.detect(folder)
      setDetect(d)
      if (!fill) return
      setName(d.suggestedName)
      setLangs(d.langs)
      setIde(d.suggestedIde)
      setOpenTarget(d.targets[d.suggestedIde][0] ?? '')
      if (d.repo) {
        setRepoHost(d.repo.host)
        setRepoPath(d.repo.fullPath)
        setRepoBase(d.repo.baseUrl)
      } else {
        setRepoHost('none')
        setRepoPath('')
        setRepoBase('')
      }
    } catch (e) {
      setDetect(undefined)
      setError(errText(e))
    }
  }

  useEffect(() => {
    if (mode.kind === 'new' && mode.path) {
      setPath(mode.path)
      void runDetect(mode.path, true)
    } else if (editing) {
      void runDetect(editing.path, false)
    }
    // Только при открытии окна
  }, [])

  const choose = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) {
      setPath(folder)
      await runDetect(folder, mode.kind === 'new' || folder !== editing?.path)
    }
  }

  const pickIde = (id: IdeId): void => {
    setIde(id)
    const options = detect?.targets[id] ?? ['']
    if (!options.includes(openTarget)) setOpenTarget(options[0] ?? '')
  }

  const pickHost = (h: RepoChoice): void => {
    setRepoHost(h)
    if (h === 'github') setRepoBase('https://github.com')
    if (h === 'gitlab' && (!repoBase || repoBase === 'https://github.com')) setRepoBase(gitlabDefault)
  }

  const toggleLang = (l: LangId): void => setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]))

  const pickImage = async (): Promise<void> => {
    try {
      const img = await window.api.pickImage()
      if (img) setIcon(img)
    } catch (e) {
      setError(errText(e))
    }
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    const input: ProjectInput = {
      name,
      path,
      langs: LANG_ORDER.filter((l) => langs.includes(l)),
      ide,
      openTarget,
      color,
      iconDataUrl: icon,
      repo: repoHost !== 'none' && repoPath.trim() ? { host: repoHost, baseUrl: repoHost === 'github' ? 'https://github.com' : repoBase, fullPath: repoPath } : undefined
    }
    if (repoHost === 'gitlab' && repoPath.trim() && !repoBase.trim()) {
      setError('Укажи адрес GitLab — или задай его один раз в настройках')
      setBusy(false)
      return
    }
    try {
      const saved = editing ? await window.api.updateProject(editing.id, input) : await window.api.addProject(input)
      onSaved(saved)
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const ideInfo = (id: IdeId) => settings?.ides.find((x) => x.id === id)
  const targetOptions = detect?.targets[ide] ?? (openTarget ? [openTarget] : [''])
  const allTargets = Array.from(new Set([...targetOptions, openTarget]))
  const shownLangs = LANG_ORDER.filter((l) => langs.includes(l) || ['csharp', 'kotlin', 'typescript', 'javascript'].includes(l))

  return (
    <Modal
      title={editing ? 'Проект' : 'Новый проект'}
      width={660}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn-dark" onClick={save} disabled={busy || !path || !name.trim()}>
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">Папка проекта</span>
        <div className="row">
          <input className="input mono grow" value={path} readOnly placeholder="Выбери папку или перетащи её в окно" aria-label="Папка проекта" />
          <button type="button" className="btn btn-line" onClick={choose}>
            Выбрать…
          </button>
        </div>
      </div>

      {detect && detect.found.length > 0 && (
        <div className="found" aria-label="Что нашлось в папке">
          {detect.found.map((f) => (
            <FoundRow key={f.file} file={f.file} meaning={f.meaning} />
          ))}
        </div>
      )}
      {detect?.unknownRemote && (
        <div className="field-hint">
          Remote указывает на {detect.unknownRemote} — этот хостинг не поддерживается. Если это GitLab, впиши его адрес в настройках.
        </div>
      )}

      <label className="field">
        <span className="field-label">Название</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">Языки</span>
        <div className="chips">
          {shownLangs.map((l) => (
            <button key={l} type="button" className="chip" aria-pressed={langs.includes(l)} onClick={() => toggleLang(l)}>
              {LANGS[l].name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Открывать в</span>
        <div className="chips">
          {IDE_ORDER.map((id) => {
            const info = ideInfo(id)
            return (
              <button key={id} type="button" className="chip" aria-pressed={ide === id} onClick={() => pickIde(id)}>
                {IDES[id].name}
                {info && !info.exe && <span className="sub">не найдена</span>}
              </button>
            )
          })}
        </div>
        {allTargets.length > 1 || allTargets[0] !== '' ? (
          <label className="field" style={{ marginTop: 4 }}>
            <span className="field-hint">Что передать {IDES[ide].name}</span>
            <select className="input mono" value={openTarget} onChange={(e) => setOpenTarget(e.target.value)}>
              {allTargets.map((t) => (
                <option key={t} value={t}>
                  {t || 'Саму папку проекта'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="field">
        <span className="field-label">Репозиторий</span>
        <div className="seg" role="group" aria-label="Хостинг">
          {(['none', 'github', 'gitlab'] as RepoChoice[]).map((h) => (
            <button key={h} type="button" aria-pressed={repoHost === h} onClick={() => pickHost(h)}>
              {h === 'none' ? 'Нет' : HOSTS[h].name}
            </button>
          ))}
        </div>
        {repoHost !== 'none' && (
          <div className="row" style={{ marginTop: 4 }}>
            {repoHost === 'gitlab' && (
              <input className="input mono" style={{ flex: '0 1 240px' }} value={repoBase} onChange={(e) => setRepoBase(e.target.value)} placeholder="https://gitlab.local" aria-label="Адрес GitLab" />
            )}
            <input className="input mono grow" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder={repoHost === 'github' ? 'owner/repo' : 'group/repo'} aria-label="Путь репозитория" />
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 14 }}>
        <ProjectTile name={name || '?'} color={color} image={icon} size={52} />
        <div className="field" style={{ flex: 1 }}>
          <span className="field-label">Иконка</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {TILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                aria-label={`Цвет ${c}`}
                aria-pressed={!icon && color === c}
                style={{ background: c }}
                onClick={() => {
                  setColor(c)
                  setIcon(undefined)
                }}
              />
            ))}
            <button type="button" className="btn btn-line btn-sm" onClick={pickImage}>
              Своя картинка…
            </button>
            {icon && (
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setIcon(undefined)}>
                Убрать
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <IconWarn size={18} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}

function FoundRow({ file, meaning }: { file: string; meaning: string }) {
  return (
    <>
      <span className="f" title={file}>
        {file}
      </span>
      <span className="m">{meaning}</span>
    </>
  )
}
