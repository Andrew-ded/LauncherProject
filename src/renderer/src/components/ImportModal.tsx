import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project, ProjectInput, ScanCandidate, ScanResult, SettingsView } from '@shared/types'
import { TILE_COLORS } from '@shared/meta'
import { Modal } from './Modal'
import { HostBadge, LangBadge, ProjectTile } from './Badges'
import { IconFolder, IconRefresh, IconTrash, IconWarn } from './Icons'
import { errText } from '../lib/format'

interface Props {
  settings: SettingsView
  onSettings: (s: SettingsView) => void
  onImported: (added: Project[]) => void
  onClose: () => void
}

/** Цвета раздаём по кругу в порядке списка — соседние плашки всегда разные. */
const colorAt = (i: number): string => TILE_COLORS[i % TILE_COLORS.length]

function toInput(c: ScanCandidate, color: string): ProjectInput {
  return {
    name: c.suggestedName,
    path: c.path,
    langs: c.langs,
    ide: c.suggestedIde,
    openTarget: c.targets[c.suggestedIde][0] ?? '',
    color,
    repo: c.repo
  }
}

/** Последняя часть пути относительно общей папки: «D:\Work\AuthService» → «AuthService». */
function relName(c: ScanCandidate): string {
  return c.path.slice(c.root.length).replace(/^[\\/]+/, '') || c.path
}

/** Импорт: просматривает подпапки общих папок и предлагает добавить найденные проекты галочками. */
export function ImportModal({ settings, onSettings, onImported, onClose }: Props) {
  const [roots, setRoots] = useState(settings.scanRoots)
  const [scan, setScan] = useState<ScanResult>()
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (list: string[]) => {
    setError(undefined)
    if (!list.length) {
      setScan({ candidates: [], errors: [] })
      return
    }
    setScanning(true)
    try {
      const r = await window.api.scanRoots(list)
      setScan(r)
      // Новые проекты отмечаем сразу — обычно хочется добавить всё
      setSelected(new Set(r.candidates.filter((c) => !c.alreadyAdded).map((c) => c.path)))
    } catch (e) {
      setError(errText(e))
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void run(settings.scanRoots)
    // Только при открытии окна
  }, [])

  const saveRoots = async (next: string[]): Promise<void> => {
    try {
      const s = await window.api.saveSettings({ scanRoots: next })
      onSettings(s)
      setRoots(s.scanRoots)
      await run(s.scanRoots)
    } catch (e) {
      setError(errText(e))
    }
  }

  const addRoot = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) await saveRoots([...roots, folder])
  }

  const candidates = scan?.candidates ?? []
  const fresh = useMemo(() => candidates.filter((c) => !c.alreadyAdded), [candidates])
  const already = candidates.length - fresh.length
  const multiRoot = roots.length > 1

  const toggle = (path: string): void =>
    setSelected((cur) => {
      const n = new Set(cur)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })

  const allOn = fresh.length > 0 && fresh.every((c) => selected.has(c.path))

  const importSelected = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const inputs = candidates
        .map((c, i) => ({ c, color: colorAt(i) }))
        .filter(({ c }) => !c.alreadyAdded && selected.has(c.path))
        .map(({ c, color }) => toInput(c, color))
      const added = await window.api.addProjects(inputs)
      onImported(added)
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Найти проекты в папках"
      subtitle={roots.length ? `Просматриваю подпапки: ${roots.length === 1 ? roots[0] : `${roots.length} папки`}` : 'Укажи общую папку, где лежат проекты'}
      width={720}
      onClose={onClose}
      headExtra={
        <button type="button" className="icon-btn" onClick={() => run(roots)} disabled={scanning || !roots.length} aria-label="Пересканировать" title="Пересканировать">
          <IconRefresh />
        </button>
      }
      footer={
        <>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn-dark" onClick={importSelected} disabled={busy || scanning || selected.size === 0}>
            {selected.size ? `Добавить ${selected.size}` : 'Добавить'}
          </button>
        </>
      }
    >
      <div className="root-list">
        {roots.map((r) => (
          <div className="root-row" key={r}>
            <IconFolder size={16} />
            <span className="mono grow" title={r}>
              {r}
            </span>
            <button type="button" className="icon-btn" aria-label={`Убрать папку ${r}`} title="Убрать из списка" onClick={() => saveRoots(roots.filter((x) => x !== r))}>
              <IconTrash size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-line btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addRoot}>
          Добавить папку…
        </button>
      </div>

      {scan?.errors.map((e) => (
        <div className="error-box" key={e.root}>
          <IconWarn size={18} />
          <span>
            <span className="mono">{e.root}</span>: {e.error}
          </span>
        </div>
      ))}

      {scanning && <div className="placeholder">Просматриваю папки…</div>}

      {!scanning && scan && roots.length > 0 && (
        <>
          <div className="import-head">
            <span>
              Новых: <b>{fresh.length}</b>
              {already > 0 && <span className="muted"> · уже в лаунчере: {already}</span>}
            </span>
            {fresh.length > 0 && (
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => setSelected(allOn ? new Set() : new Set(fresh.map((c) => c.path)))}
              >
                {allOn ? 'Снять все' : 'Выбрать все'}
              </button>
            )}
          </div>

          {candidates.length === 0 && (
            <div className="placeholder">В подпапках не нашлось ничего похожего на проект (.sln, Gradle, package.json, .git…).</div>
          )}

          <div className="import-list">
            {candidates.map((c, i) => (
              <label key={c.path} className={`import-row${c.alreadyAdded ? ' done' : ''}`}>
                <input type="checkbox" checked={c.alreadyAdded || selected.has(c.path)} disabled={c.alreadyAdded} onChange={() => toggle(c.path)} />
                <ProjectTile name={c.suggestedName} color={colorAt(i)} size={36} />
                <span className="import-txt">
                  <span className="import-name">
                    <span className="nm">{c.suggestedName}</span>
                    {c.langs.map((l) => (
                      <LangBadge key={l} lang={l} size={20} />
                    ))}
                  </span>
                  <span className="import-path mono" title={c.path}>
                    {multiRoot ? c.path : relName(c)}
                  </span>
                </span>
                {c.repo && <HostBadge host={c.repo.host} size={22} />}
                {c.alreadyAdded && <span className="label">уже есть</span>}
              </label>
            ))}
          </div>
          {fresh.length > 0 && (
            <span className="field-hint">Язык, IDE и репозиторий подставятся сами. Поправить можно потом: правая кнопка по плашке → «Изменить».</span>
          )}
        </>
      )}

      {error && (
        <div className="error-box">
          <IconWarn size={18} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
