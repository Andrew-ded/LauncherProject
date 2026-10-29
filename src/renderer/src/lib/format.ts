// Мелкие форматтеры для интерфейса.

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** «5 минут назад», «2 дня назад», «3 нед. назад» */
export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`
  const d = Math.round(h / 24)
  if (d < 14) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`
  const w = Math.round(d / 7)
  if (d < 60) return `${w} нед. назад`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo} мес. назад`
  return `${Math.round(d / 365)} г. назад`
}

export function count(n: number, more?: boolean): string {
  return more ? `${n}+` : String(n)
}

/** Текст ошибки из IPC без технического префикса Electron. */
export function errText(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}
