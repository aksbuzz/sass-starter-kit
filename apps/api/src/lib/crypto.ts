import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO     = 'aes-256-gcm' as const
const KEY_LEN  = 32
const IV_LEN   = 12
const TAG_LEN  = 16

function toKeyBuffer(hexKey: string): Buffer {
  if (hexKey.length !== KEY_LEN * 2) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_LEN * 2} hex chars, got ${hexKey.length}`)
  }
  return Buffer.from(hexKey, 'hex')
}

export function encrypt(plaintext: string, hexKey: string): string {
  const key       = toKeyBuffer(hexKey)
  const iv        = randomBytes(IV_LEN)
  const cipher    = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag       = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(encoded: string, hexKey: string): string {
  const key   = toKeyBuffer(hexKey)
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Malformed encrypted value — expected iv:tag:ciphertext')

  const [ivHex, tagHex, cipherHex] = parts as [string, string, string]
  const iv         = Buffer.from(ivHex,    'hex')
  const tag        = Buffer.from(tagHex,   'hex')
  const ciphertext = Buffer.from(cipherHex,'hex')

  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
