import { useState } from 'react'
import type { GitState, Project, RepoActivity } from '@shared/types'
import { HOSTS, webUrl } from '@shared/meta'
import { Modal } from './Modal'
import { HostBadge } from './Badges'
import { IconExternal, IconIssue, IconPr, IconRefresh, IconWarn } from './Icons'
import { count, timeAgo } from '../lib/format'

interface Props {
  project: Project
  git?: GitState
  activity?: RepoActivity
  loading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
  onClose: () => void
}

export function RepoModal({ project, git, activity, loading, onRefresh, onOpenSettings, onClose }: Props) {
  const [tab, setTab] = useState<'pr' | 'issues'>('pr')
  const repo = project.repo!
  const prWord = repo.host === 'gitlab' ? 'Merge requests' : 'Pull requests'
  const items = activity ? (tab === 'pr' ? activity.prs : activity.issues) : []
  const open = (url: string): void => void window.api.openExternal(url)
  const branchText = git?.branch ? ` · ${git.branch}` : ''

  return (
    <Modal
      title={project.name}
      subtitle={`${repo.baseUrl.replace(/^https?:\/\//, '')}/${repo.fullPath}${branchText}`}
      icon={<HostBadge host={repo.host} size={32} />}
      width={640}
      onClose={onClose}
      headExtra={
        <>
          <button type="button" className="icon-btn" onClick={onRefresh} disabled={loading} aria-label="Обновить" title="Обновить">
            <IconRefresh />
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => open(webUrl(repo))}>
            В браузере
            <IconExternal size={14} />
          </button>
        </>
      }
    >
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'pr'} onClick={() => setTab('pr')}>
          {prWord} · {activity ? count(activity.prTotal, activity.prMore) : '…'}
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'issues'} onClick={() => setTab('issues')}>
          Issues · {activity ? count(activity.issueTotal, activity.issueMore) : '…'}
        </button>
      </div>

      {activity?.error && (
        <div className="error-box">
          <IconWarn size={18} />
          <div style={{ flex: 1 }}>
            {activity.error}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-line btn-sm" onClick={onOpenSettings}>
                Настройки {HOSTS[repo.host].name}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="feed">
        {!activity && <div className="placeholder">Загружаю…</div>}
        {activity && !activity.error && items.length === 0 && <div className="placeholder">Пусто, можно выдохнуть.</div>}
        {items.map((it) => (
          <button type="button" key={it.number} className="feed-item" onClick={() => open(it.url)} title="Открыть в браузере">
            <span className={`ic ${tab === 'pr' ? 'c-ok' : 'c-warn'}`}>{tab === 'pr' ? <IconPr size={17} /> : <IconIssue size={17} />}</span>
            <span className="txt">
              <span className="ttl">{it.title}</span>
              <span className="meta">
                <span className="mono">{repo.host === 'gitlab' && tab === 'pr' ? '!' : '#'}{it.number}</span>
                {it.branches && <span className="mono">{it.branches}</span>}
                <span>{it.author}</span>
                <span>{timeAgo(it.updatedAt)}</span>
                {it.draft && <span className="label draft">черновик</span>}
                {it.labels.slice(0, 4).map((l) => (
                  <span key={l} className="label">
                    {l}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>

      {activity && !activity.error && (
        <span className="field-hint">Обновлено {timeAgo(activity.fetchedAt)}</span>
      )}
    </Modal>
  )
}
