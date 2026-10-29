import type { ForgeHost, LangId } from '@shared/types'
import { HOSTS, LANGS, monogram } from '@shared/meta'

/** Квадратик языка: «C#», «Kt», «TS». Название — во всплывающей подсказке. */
export function LangBadge({ lang, size = 22 }: { lang: LangId; size?: number }) {
  const l = LANGS[lang]
  return (
    <span className="badge" title={l.name} style={{ background: l.color, width: size, height: size, fontSize: size * 0.45 }}>
      {l.short}
    </span>
  )
}

/** Значок хостинга репозитория. */
export function HostBadge({ host, size = 22 }: { host: ForgeHost; size?: number }) {
  const h = HOSTS[host]
  return (
    <span className="badge" title={h.name} style={{ background: h.color, width: size, height: size, fontSize: size * 0.48, borderRadius: size / 3 }}>
      {h.short}
    </span>
  )
}

/** Иконка проекта: своя картинка или монограмма на цветном фоне. */
export function ProjectTile({ name, color, image, size = 46 }: { name: string; color: string; image?: string; size?: number }) {
  return (
    <div className="tile" style={{ width: size, height: size, borderRadius: size * 0.3, background: image ? 'transparent' : color, fontSize: size * 0.3 }}>
      {image ? <img src={image} alt="" /> : monogram(name)}
    </div>
  )
}
