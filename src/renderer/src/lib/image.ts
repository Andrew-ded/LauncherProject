// Выравнивание картинок-иконок: у одних логотип занимает весь квадрат, у других половину,
// остальное — прозрачный фон. Обрезаем прозрачные поля и вписываем содержимое в квадрат
// с одинаковым отступом, чтобы на экране все иконки выглядели одного размера.

export interface NormalizeOptions {
  /** Сторона итогового квадрата в пикселях */
  size: number
  /** Отступ от края до содержимого, доля стороны (0.1 = содержимое занимает 80%) */
  padding: number
}

/** Значки хостингов и языков: содержимое ≈ 80% квадрата (как «512 → 400»). */
export const BADGE_ICON: NormalizeOptions = { size: 128, padding: 0.1 }
/** Иконка платформы на плитке проекта: те же 80%, но крупнее по пикселям. */
export const PLATFORM_ICON: NormalizeOptions = { size: 256, padding: 0.1 }
/** Своя картинка проекта: заполняет плитку целиком. */
export const TILE_ICON: NormalizeOptions = { size: 256, padding: 0 }

/** Пиксель считается фоном, если почти прозрачный. */
const ALPHA_THRESHOLD = 10

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось прочитать картинку'))
    img.src = src
  })
}

/** Границы непрозрачной части картинки. Если картинка пустая — вся картинка. */
function contentBox(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export async function normalizeIcon(src: string, opts: NormalizeOptions): Promise<string> {
  const img = await loadImage(src)
  // У SVG без width/height натуральный размер бывает нулевым — рисуем его крупно
  const srcW = img.naturalWidth || 512
  const srcH = img.naturalHeight || 512

  // 1. Рисуем как есть и ищем непрозрачную область
  const probe = document.createElement('canvas')
  probe.width = srcW
  probe.height = srcH
  const pctx = probe.getContext('2d', { willReadFrequently: true })!
  pctx.drawImage(img, 0, 0, srcW, srcH)
  const box = contentBox(pctx.getImageData(0, 0, srcW, srcH).data, srcW, srcH)

  // 2. Вписываем найденную область в квадрат с отступом, сохраняя пропорции
  const out = document.createElement('canvas')
  out.width = opts.size
  out.height = opts.size
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const inner = opts.size * (1 - opts.padding * 2)
  const scale = inner / Math.max(box.w, box.h)
  const dw = box.w * scale
  const dh = box.h * scale
  ctx.drawImage(probe, box.x, box.y, box.w, box.h, (opts.size - dw) / 2, (opts.size - dh) / 2, dw, dh)
  return out.toDataURL('image/png')
}
