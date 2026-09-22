import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getServerConfig } from '~/server/config.server'

const CIPHER = 'aes-256-gcm'
const NONCE_BYTES = 12

export interface EncryptedLoxepToken {
  ciphertext: string
  nonce: string
  authTag: string
}

function encryptionKey(): Buffer {
  const config = getServerConfig()
  const root = config.INTEGRATION_ENCRYPTION_KEY ?? config.BETTER_AUTH_SECRET
  if (!root) throw new Error('BETTER_AUTH_SECRET or INTEGRATION_ENCRYPTION_KEY is required for companion credentials')
  return createHash('sha256').update('hoardcore/companion-credentials/v1\0').update(root).digest()
}

export function encryptLoxepToken(token: string): EncryptedLoxepToken {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(CIPHER, encryptionKey(), nonce)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64url'),
    nonce: nonce.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  }
}

export function decryptLoxepToken(encrypted: EncryptedLoxepToken): string {
  const decipher = createDecipheriv(CIPHER, encryptionKey(), Buffer.from(encrypted.nonce, 'base64url'))
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function hashLoxepToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function tokensMatch(presented: string, expectedHash: string | undefined): boolean {
  const actual = Buffer.from(hashLoxepToken(presented), 'hex')
  const expected = Buffer.from(expectedHash ?? hashLoxepToken('hoardcore-dummy-token'), 'hex')
  return timingSafeEqual(actual, expected)
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 12)
}
