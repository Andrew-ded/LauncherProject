import { safeStorage } from 'electron'

// На Windows safeStorage шифрует через DPAPI: расшифровать токен может только твоя учётка на этом ПК.

export function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Шифрование недоступно в этой системе — токен не сохранён')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decrypt(enc?: string): string | undefined {
  if (!enc) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    // Например, settings.json скопировали с другого ПК — токен придётся ввести заново.
    return undefined
  }
}
