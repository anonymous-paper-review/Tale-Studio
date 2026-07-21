import { createHash } from 'node:crypto'

/**
 * Maps a natural identifier to the versioned storage namespace used for new
 * objects. Never use a natural identifier directly in a storage key: a safe
 * identifier could otherwise equal another identifier's escaped form.
 */
export function storageKeySegment(raw: string): string {
  return `v1-${createHash('sha256').update(raw, 'utf8').digest('hex')}`
}
