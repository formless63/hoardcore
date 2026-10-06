import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { getServerConfig } from '~/server/config.server'
import type { EncryptedProxyPassword } from './source-routing.schemas'

function key() {
  const config = getServerConfig()
  const root = config.INTEGRATION_ENCRYPTION_KEY ?? config.BETTER_AUTH_SECRET
  if (!root) throw new Error('An application encryption secret is required for proxy credentials')
  return createHash('sha256').update('hoardcore/source-proxy/v1\0').update(root).digest()
}

export function encryptProxyPassword(password: string, sourceId: string): EncryptedProxyPassword {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), nonce)
  cipher.setAAD(Buffer.from(sourceId))
  return { ciphertext: Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64url'),
    nonce: nonce.toString('base64url'), authTag: cipher.getAuthTag().toString('base64url') }
}

export function decryptProxyPassword(value: EncryptedProxyPassword, sourceId: string): string {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(value.nonce, 'base64url'))
    decipher.setAAD(Buffer.from(sourceId))
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
  } catch { throw new Error('Unable to decrypt source proxy password; re-enter it in Network routing') }
}
