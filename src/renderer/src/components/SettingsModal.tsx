import { useState } from 'react'
import type { ForgeHost, IdeId, SettingsPatch, SettingsView } from '@shared/types'
import { Modal } from './Modal'
import { HostBadge } from './Badges'
import { IconWarn } from './Icons'
import { errText } from '../lib/format'

interface Props {
  settings: SettingsView
  onSaved: (s: SettingsView) => void
  onClose: () => void
}

/** Токены GitHub/GitLab, адрес GitLab и пути к IDE. Токены хранятся зашифрованными, обратно в окно не отдаются. */
export function SettingsModal({ settings, onSaved, onClose }: Props) {
  const [s, setS] = useState(settings)
  const [ghToken, setGhToken] = useState('')
  const [glToken, setGlToken] = useState('')
  const [glUrl, setGlUrl] = useState(settings.gitlab.baseUrl)
  const [selfSigned, setSelfSigned] = useState(settings.gitlab.allowSelfSigned)
  const [exe, setExe] = useState<Partial<Record<IdeId, string>>>(
    Object.fromEntries(settings.ides.filter((i) => !i.auto && i.exe).map((i) => [i.id, i.exe!]))
  )
  const [test, setTest] = useState<Partial<Record<ForgeHost, { ok: boolean; text: string }>>>({})
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

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
          aria-label={`Токен ${host === 'github' ? 'GitHub' : 'GitLab'}`}
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
      <div className="row">
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

      <div className="row" style={{ marginTop: 8 }}>
        <HostBadge host="github" size={26} />
        <h3 className="section-title" style={{ margin: 0 }}>GitHub</h3>
      </div>
      {tokenBlock('github', s.github.hasToken, ghToken, setGhToken)}
      <span className="field-hint">Без токена публичные репы тоже работают, но лимит — 60 запросов в час.</span>

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
        <div className="error-box">
          <IconWarn size={18} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
