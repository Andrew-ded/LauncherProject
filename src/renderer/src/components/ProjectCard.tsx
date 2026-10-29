import type { GitState, Project, RepoActivity } from '@shared/types'
import { IDES } from '@shared/meta'
import { HostBadge, LangBadge, ProjectTile } from './Badges'
import { IconBranch, IconFolder, IconIssue, IconNotes, IconPr, IconTerminal, IconWarn } from './Icons'
import { count } from '../lib/format'

interface Props {
  project: Project
  git?: GitState
  activity?: RepoActivity
  loading: boolean
  launching: boolean
  onOpen: () => void
  onRepo: () => void
  onNotes: () => void
  onFolder: () => void
  onTerminal: () => void
  onContext: () => void
}

export function ProjectCard({ project: p, git, activity, loading, launching, onOpen, onRepo, onNotes, onFolder, onTerminal, onContext }: Props) {
  const notesCount = p.notes.length

  return (
    <div
      className={`card${launching ? ' launching' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        onContext()
      }}
    >
      {/* Клик по любому месту блока открывает проект в его IDE */}
      <button type="button" className="card-hit" aria-label={`Открыть ${p.name} в ${IDES[p.ide].name}`} title={`Открыть в ${IDES[p.ide].name}`} onClick={onOpen} />

      <div className="card-top" title={p.path}>
        <ProjectTile name={p.name} color={p.color} image={p.iconDataUrl} platform={p.platform} />
        <div className="card-titles">
          <div className="card-name-row">
            <span className="card-name">{p.name}</span>
            {p.langs.map((l) => (
              <LangBadge key={l} lang={l} />
            ))}
          </div>
        </div>
        {git?.branch && (
          <span className="branch" title={git.detached ? `Detached HEAD: ${git.branch}` : `Ветка: ${git.branch}`}>
            <IconBranch size={13} />
            <span>{git.branch}</span>
          </span>
        )}
      </div>

      <div className="card-bottom">
        {p.repo ? (
          <button type="button" className="repo-btn" onClick={onRepo} aria-label={`PR и Issue: ${p.name}`}>
            <HostBadge host={p.repo.host} />
            {activity?.error ? (
              <span className="repo-stat c-warn" title={activity.error}>
                <IconWarn size={15} />
                <span style={{ fontSize: 12 }}>нет данных</span>
              </span>
            ) : (
              <>
                <span className="repo-stat c-ok" title="Открытые pull/merge requests">
                  <IconPr size={14} />
                  <span className="n">{activity ? count(activity.prTotal, activity.prMore) : loading ? '…' : '—'}</span>
                </span>
                <span className="repo-stat c-warn" title="Открытые issues">
                  <IconIssue size={14} />
                  <span className="n">{activity ? count(activity.issueTotal, activity.issueMore) : loading ? '…' : '—'}</span>
                </span>
              </>
            )}
          </button>
        ) : (
          <span className="no-repo">Без репозитория</span>
        )}
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={onNotes} aria-label={`Заметки: ${p.name}`} title={notesCount ? `Заметки (${notesCount})` : 'Заметки'}>
          <IconNotes size={19} />
        </button>
        <button type="button" className="icon-btn" onClick={onFolder} aria-label={`Открыть папку ${p.name} в проводнике`} title="Открыть в проводнике">
          <IconFolder size={19} />
        </button>
        <button type="button" className="icon-btn" onClick={onTerminal} aria-label={`Открыть терминал в папке ${p.name}`} title="Терминал в папке проекта">
          <IconTerminal size={19} />
        </button>
      </div>
    </div>
  )
}
