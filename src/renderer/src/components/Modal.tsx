import { useEffect, type ReactNode } from 'react'
import { IconClose } from './Icons'

interface Props {
  title: string
  subtitle?: string
  icon?: ReactNode
  width?: number
  headExtra?: ReactNode
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}

/** Окно поверх списка. Закрывается по Esc и по клику мимо. */
export function Modal({ title, subtitle, icon, width = 600, headExtra, footer, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-head">
          {icon}
          <div className="titles">
            <h2 className="modal-title">{title}</h2>
            {subtitle && <span className="modal-sub">{subtitle}</span>}
          </div>
          {headExtra}
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
