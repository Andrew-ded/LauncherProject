import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ForgeHost, IdeId, LangId, SettingsPatch, SettingsView, ThemeMode } from '@shared/types'
import { HOSTS, LANGS, LANG_ORDER } from '@shared/meta'
import { Modal } from './Modal'
import { HostBadge, LangBadge } from './Badges'
import { IconFolder, IconTrash, IconWarn } from './Icons'
import { errText } from '../lib/format'

interface Props {
  settings: SettingsView
  onSaved: (s: SettingsView) => void
  onImport: () => void
  onClose: () => void
}

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'Как в системе' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' }
]

/**
 * Настройки. Тема, иконки и папки применяются сразу, по клику.
 * Токены, адрес GitLab и пути IDE — по кнопке «Сохранить». Токены обратно в окно не отдаются.
 */
export function SettingsModal({ settings, onSaved, onImport, onClose }: Props) {
  const [s, setS] = useState(settings)
  const [ghToken, setGhToken] = useState('')
  const [glToken, setGlToken] = useState('')
  const [glUrl, setGlUrl] = useState(settings.gitlab.baseUrl)
  const [selfSigned, setSelfSigned] = useState(settings.gitlab.allowSelfSigned)
  const [exe, setExe] = useState<Partial<Record<IdeId, string>>>(
    Object.fromEntries(settings.ides.filter((i) => !i.auto && i.exe).map((i) => [i.id, i.exe!]))
  )
  const [test, setTest] = useState<Partial<Record<ForgeHost, { ok: boolean; text: string }>>>({})
  const [allLangs, setAllLangs] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  // Ошибка рисуется внизу окна — прокручиваем к ней, чтобы не пропустить
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error])

  const apply = async (patch: SettingsPatch): Promise<SettingsView | undefined> => {
    setError(undefined)
    try {
      const next = await window.api.saveSettings(patch)
      setS(next)
      onSaved(next)
      return next
    } catch (e) {
      setError(errText(e))
      return undefined
    }
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    const patch: SettingsPatch = {
      gitlabBaseUrl: glUrl,
      gitlabAllowSelfSigned: selfSigned,
      ideExe: Object.fromEntries(s.ides.map((i) => [i.id, exe[i.id] ?? '']))
    }
    if (ghToken.trim()) patch.githubToken = ghToken
    if (glToken.trim()) patch.gitlabToken = glToken
    const next = await apply(patch)
    setBusy(false)
    if (next) onClose()
  }

  const runTest = async (host: ForgeHost): Promise<void> => {
    // Перед проверкой сохраняем то, что введено, иначе проверится старый токен
    const patch: SettingsPatch = host === 'github' ? {} : { gitlabBaseUrl: glUrl, gitlabAllowSelfSigned: selfSigned }
    if (host === 'github' && ghToken.trim()) patch.githubToken = ghToken
    if (host === 'gitlab' && glToken.trim()) patch.gitlabToken = glToken
    if (Object.keys(patch).length && !(await apply(patch))) return
    if (host === 'github') setGhToken('')
    else setGlToken('')
    setTest((t) => ({ ...t, [host]: { ok: true, text: 'Проверяю…' } }))
    const r = await window.api.testForge(host)
    setTest((t) => ({ ...t, [host]: r.ok ? { ok: true, text: `Работает, вошёл как ${r.user}` } : { ok: false, text: r.error ?? 'Не вышло' } }))
  }

  const browse = async (id: IdeId): Promise<void> => {
    const p = await window.api.pickExe()
    if (p) setExe((x) => ({ ...x, [id]: p }))
  }

  const uploadIcon = async (target: { host: ForgeHost } | { lang: LangId }): Promise<void> => {
    try {
      const dataUrl = await window.api.pickImage()
      if (!dataUrl) return
      await apply('host' in target ? { hostIcon: { host: target.host, dataUrl } } : { langIcon: { lang: target.lang, dataUrl } })
    } catch (e) {
      setError(errText(e))
    }
  }

  const addRoot = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) await apply({ scanRoots: [...s.scanRoots, folder] })
  }

  const tokenBlock = (host: ForgeHost, has: boolean, value: string, set: (v: string) => void) => (
    <div className="field">
      <span className="field-label">Токен</span>
      <div className="row">
        <input
          className="input mono grow"
          type="password"
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={has ? 'Сохранён — введи новый, чтобы заменить' : host === 'github' ? 'ghp_… (scope: repo для приватных)' : 'glpat-… (scope: read_api)'}
          aria-label={`Токен ${HOSTS[host].name}`}
        />
        <button type="button" className="btn btn-line" onClick={() => runTest(host)}>
          Проверить
        </button>
        {has && (
          <button type="button" className="btn btn-soft btn-danger" onClick={() => apply(host === 'github' ? { githubToken: null } : { gitlabToken: null })}>
            Удалить
          </button>
        )}
      </div>
      <span className="token-state">
        <span className={`dot${has ? '' : ' off'}`} />
        <span className="muted">{has ? 'Токен сохранён (зашифрован под твоей учёткой Windows)' : 'Токена нет'}</span>
        {test[host] && <span className={`test-result ${test[host]!.ok ? 'c-ok' : 'c-warn'}`}>· {test[host]!.text}</span>}
      </span>
    </div>
  )

  const iconRow = (key: string, label: string, badge: ReactNode, custom: boolean, onUpload: () => void, onReset: () => void) => (
    <div className="icon-row" key={key}>
      <span className="icon-preview">{badge}</span>
      <span className="icon-name">{label}</span>
      <span className="icon-actions">
        <button type="button" className="btn btn-line btn-sm" onClick={onUpload}>
          {custom ? 'Заменить…' : 'Загрузить…'}
        </button>
        {custom && (
          <button type="button" className="btn btn-soft btn-sm" onClick={onReset}>
            Сбросить
          </button>
        )}
      </span>
    </div>
  )

  const langsToShow = allLangs ? LANG_ORDER : LANG_ORDER.filter((l) => ['csharp', 'kotlin', 'typescript', 'javascript'].includes(l) || s.icons.langs[l])

  return (
    <Modal
      title="Настройки"
      width={680}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="btn btn-dark" onClick={save} disabled={busy}>
            Сохранить
          </button>
        </>
      }
    >
      {/* ---------- Оформление ---------- */}
      <h3 className="section-title">Тема</h3>
      <div className="seg" role="group" aria-label="Тема">
        {THEMES.map((t) => (
          <button key={t.id} type="button" aria-pressed={s.theme === t.id} onClick={() => apply({ theme: t.id })}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Папки с проектами ---------- */}
      <h3 className="section-title" style={{ marginTop: 8 }}>Папки с проектами</h3>
      <span className="field-hint" style={{ marginTop: -10 }}>
        Общие папки, где лежат проекты. Лаунчер просмотрит их подпапки и предложит добавить найденное.
      </span>
      {s.scanRoots.length > 0 && (
        <div className="root-list">
          {s.scanRoots.map((r) => (
            <div className="root-row" key={r}>
              <IconFolder size={16} />
              <span className="mono grow" title={r}>
                {r}
              </span>
              <button type="button" className="icon-btn" aria-label={`Убрать папку ${r}`} title="Убрать" onClick={() => apply({ scanRoots: s.scanRoots.filter((x) => x !== r) })}>
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <button type="button" className="btn btn-line btn-sm" onClick={addRoot}>
          Добавить папку…
        </button>
        <button type="button" className="btn btn-dark btn-sm" onClick={onImport} disabled={!s.scanRoots.length}>
          Найти проекты
        </button>
      </div>

      {/* ---------- Иконки ---------- */}
      <h3 className="section-title" style={{ marginTop: 8 }}>Иконки</h3>
      <span className="field-hint" style={{ marginTop: -10 }}>
        Свои картинки вместо буквенных значков: PNG, SVG или ICO, лучше квадратные и до 512 КБ.
      </span>
      <div className="icon-list">
        {(['github', 'gitlab'] as ForgeHost[]).map((h) =>
          iconRow(
            h,
            HOSTS[h].name,
            <HostBadge host={h} size={28} />,
            !!s.icons.hosts[h],
            () => uploadIcon({ host: h }),
            () => apply({ hostIcon: { host: h, dataUrl: null } })
          )
        )}
        {langsToShow.map((l) =>
          iconRow(
            l,
            LANGS[l].name,
            <LangBadge lang={l} size={28} />,
            !!s.icons.langs[l],
            () => uploadIcon({ lang: l }),
            () => apply({ langIcon: { lang: l, dataUrl: null } })
          )
        )}
      </div>
      {!allLangs && (
        <button type="button" className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start', marginTop: -6 }} onClick={() => setAllLangs(true)}>
          Остальные языки
        </button>
      )}

      {/* ---------- GitLab ---------- */}
      <div className="row" style={{ marginTop: 8 }}>
        <HostBadge host="gitlab" size={26} />
        <h3 className="section-title" style={{ margin: 0 }}>GitLab</h3>
      </div>
      <label className="field">
        <span className="field-label">Адрес</span>
        <input className="input mono" value={glUrl} onChange={(e) => setGlUrl(e.target.value)} placeholder="https://gitlab.yamz.local" />
        <span className="field-hint">По нему лаунчер узнаёт GitLab в remote проекта</span>
      </label>
      {tokenBlock('gitlab', s.gitlab.hasToken, glToken, setGlToken)}
      <label className="check">
        <input type="checkbox" checked={selfSigned} onChange={(e) => setSelfSigned(e.target.checked)} />
        Доверять самоподписанному сертификату этого GitLab
      </label>

      {/* ---------- GitHub ---------- */}
      <div className="row" style={{ marginTop: 8 }}>
        <HostBadge host="github" size={26} />
        <h3 className="section-title" style={{ margin: 0 }}>GitHub</h3>
      </div>
      {tokenBlock('github', s.github.hasToken, ghToken, setGhToken)}
      <span className="field-hint">Без токена публичные репы тоже работают, но лимит — 60 запросов в час.</span>

      {/* ---------- IDE ---------- */}
      <h3 className="section-title" style={{ marginTop: 8 }}>IDE</h3>
      {s.ides.map((i) => (
        <div className="field" key={i.id}>
          <span className="field-label">{i.name}</span>
          <div className="row">
            <input
              className="input mono grow"
              value={exe[i.id] ?? ''}
              onChange={(e) => setExe((x) => ({ ...x, [i.id]: e.target.value }))}
              placeholder={i.auto && i.exe ? `Найдена: ${i.exe}` : 'Не найдена — укажи путь к .exe'}
              aria-label={`Путь к ${i.name}`}
            />
            <button type="button" className="btn btn-line" onClick={() => browse(i.id)}>
              Обзор…
            </button>
          </div>
        </div>
      ))}
      <span className="field-hint">Пустое поле — путь ищется автоматически.</span>

      {error && (
        <div className="error-box" ref={errorRef}>
          <IconWarn size={18} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
