import { createContext, useContext } from 'react'
import type { CustomIcons, ForgeHost, LangId, PlatformId } from '@shared/types'
import { HOSTS, LANGS, PLATFORMS, monogram } from '@shared/meta'

/** Свои картинки из настроек. Если картинки нет — рисуется буквенный значок. */
export const IconsContext = createContext<CustomIcons>({ hosts: {}, langs: {}, platforms: {} })

/** Значок языка: своя картинка или квадратик «C#», «Kt», «TS». Название — во всплывающей подсказке. */
export function LangBadge({ lang, size = 22 }: { lang: LangId; size?: number }) {
  const custom = useContext(IconsContext).langs[lang]
  const l = LANGS[lang]
  if (custom) return <img className="badge-img" src={custom} alt={l.name} title={l.name} style={{ width: size, height: size }} />
  return (
    <span className="badge" title={l.name} style={{ background: l.color, width: size, height: size, fontSize: size * 0.45 }}>
      {l.short}
    </span>
  )
}

/** Значок хостинга репозитория. */
export function HostBadge({ host, size = 22 }: { host: ForgeHost; size?: number }) {
  const custom = useContext(IconsContext).hosts[host]
  const h = HOSTS[host]
  if (custom) return <img className="badge-img" src={custom} alt={h.name} title={h.name} style={{ width: size, height: size }} />
  return (
    <span className="badge host" title={h.name} style={{ background: h.color, width: size, height: size, fontSize: size * 0.48, borderRadius: size / 3 }}>
      {h.short}
    </span>
  )
}

interface TileProps {
  name: string
  color: string
  /** Своя картинка проекта */
  image?: string
  platform?: PlatformId | null
  size?: number
}

/**
 * Иконка проекта. По приоритету: своя картинка проекта → иконка его платформы из настроек →
 * монограмма на цветном фоне.
 */
export function ProjectTile({ name, color, image, platform, size = 46 }: TileProps) {
  const icons = useContext(IconsContext)
  const platformIcon = platform ? icons.platforms[platform] : undefined
  const box = { width: size, height: size, borderRadius: size * 0.3 }
  if (image) {
    return (
      <div className="tile" style={{ ...box, background: 'transparent' }}>
        <img src={image} alt="" />
      </div>
    )
  }
  if (platform && platformIcon) {
    return (
      <div className="tile" style={{ ...box, background: 'transparent' }} title={PLATFORMS[platform].name}>
        <img src={platformIcon} alt={PLATFORMS[platform].name} style={{ objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div className="tile" style={{ ...box, background: color, fontSize: size * 0.3 }}>
      {monogram(name)}
    </div>
  )
}
