import { useEffect, useRef, useState } from 'react'
import type { Note, Project } from '@shared/types'
import { Modal } from './Modal'
import { ProjectTile } from './Badges'
import { IconCopy, IconTrash } from './Icons'

interface Props {
  project: Project
  onSaved: (notes: Note[]) => void
  onToast: (text: string) => void
  onClose: () => void
}

const newId = (): string => crypto.randomUUID()

/** Заметки «ключ → значение»: порт, команда запуска, где лежат конфиги. Сохраняются сами. */
export function NotesModal({ project, onSaved, onToast, onClose }: Props) {
  const [notes, setNotes] = useState<Note[]>(project.notes)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const keyRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(notes)
  latest.current = notes

  const persist = (list: Note[]): void => {
    void window.api.setNotes(project.id, list).then(() => onSaved(list.filter((n) => n.key.trim() || n.value.trim())))
  }

  // Правки в полях сохраняем с задержкой, чтобы не писать файл на каждую букву
  const update = (list: Note[]): void => {
    setNotes(list)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => persist(list), 500)
  }

  // При закрытии окна дописываем то, что не успело уйти по таймеру
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      persist(latest.current)
    },
    []
  )

  const add = (): void => {
    if (!key.trim() && !value.trim()) return
    const list = [...notes, { id: newId(), key: key.trim(), value: value.trim() }]
    setNotes(list)
    persist(list)
    setKey('')
    setValue('')
    keyRef.current?.focus()
  }

  const remove = (id: string): void => {
    const list = notes.filter((n) => n.id !== id)
    setNotes(list)
    persist(list)
  }

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => onToast('Скопировано'))
  }

  return (
    <Modal
      title="Заметки"
      subtitle={project.name}
      icon={<ProjectTile name={project.name} color={project.color} image={project.iconDataUrl} size={32} />}
      width={600}
      onClose={onClose}
    >
      <div className="notes">
        {notes.length === 0 && <div className="placeholder">Пока пусто. Порт, команда запуска, строка подключения — всё, что вечно ищешь.</div>}
        {notes.map((n, i) => (
          <div className="note-row" key={n.id}>
            <input
              className="note-input key"
              value={n.key}
              placeholder="Ключ"
              aria-label="Ключ"
              onChange={(e) => update(notes.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
            />
            <input
              className="note-input val"
              value={n.value}
              placeholder="Значение"
              aria-label="Значение"
              onChange={(e) => update(notes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
            <div className="note-actions">
              <button type="button" className="icon-btn" aria-label="Скопировать значение" title="Скопировать" onClick={() => copy(n.value)}>
                <IconCopy size={15} />
              </button>
              <button type="button" className="icon-btn" aria-label="Удалить заметку" title="Удалить" onClick={() => remove(n.id)}>
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <form
        className="note-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label>
          <span className="sr-only">Новый ключ</span>
          <input ref={keyRef} className="input" placeholder="Ключ" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
        </label>
        <label>
          <span className="sr-only">Новое значение</span>
          <input className="input mono" placeholder="Порт, команда, путь…" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-dark" style={{ height: 42 }}>
          Добавить
        </button>
      </form>
    </Modal>
  )
}
