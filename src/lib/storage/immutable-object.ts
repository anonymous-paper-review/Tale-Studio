import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

type StorageConflictError = {
  status?: unknown
  statusCode?: unknown
  code?: unknown
}

type ObjectMetadata = {
  size?: unknown
  mimetype?: unknown
  contentType?: unknown
}

type StorageObject = {
  metadata?: ObjectMetadata
  size?: unknown
  mimetype?: unknown
  contentType?: unknown
}
export class ImmutableObjectMismatchError extends Error {
  constructor(path: string, mismatch: 'metadata' | 'content') {
    super(`immutable storage conflict with different object ${mismatch}: ${path}`)
    this.name = 'ImmutableObjectMismatchError'
  }
}

function isExactConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { status, statusCode, code } = error as StorageConflictError
  return (
    status === 409 ||
    status === '409' ||
    statusCode === 409 ||
    statusCode === '409' ||
    code === 409 ||
    code === '409'
  )
}

function objectSize(object: StorageObject): number | null {
  const size = object.metadata?.size ?? object.size
  return typeof size === 'number' && Number.isFinite(size)
    ? size
    : typeof size === 'string' && /^\d+$/.test(size)
      ? Number(size)
      : null
}

function objectContentType(object: StorageObject): string | null {
  const contentType = object.metadata?.mimetype ?? object.metadata?.contentType ?? object.mimetype ?? object.contentType
  return typeof contentType === 'string' ? contentType : null
}

function digest(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Upload an object once. A 409 is an exact-retry success only when the stored
 * object has the same content type, byte size, and SHA-256 digest.
 */
export async function uploadImmutableObject(
  path: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const bucket = supabaseAdmin.storage.from('media')
  const { error } = await bucket.upload(path, data, { contentType, upsert: false })
  if (!error) return
  if (!isExactConflict(error)) throw error

  const { data: existing, error: infoError } = await bucket.info(path)
  if (infoError || !existing) {
    throw infoError ?? new Error(`immutable storage conflict without object: ${path}`)
  }
  if (objectSize(existing) !== data.byteLength || objectContentType(existing) !== contentType) {
    throw new ImmutableObjectMismatchError(path, 'metadata')
  }

  const { data: existingData, error: downloadError } = await bucket.download(path)
  if (downloadError || !existingData) {
    throw downloadError ?? new Error(`immutable storage conflict without readable object: ${path}`)
  }
  const existingBytes = Buffer.from(await existingData.arrayBuffer())
  if (digest(existingBytes) !== digest(data)) {
    throw new ImmutableObjectMismatchError(path, 'content')
  }
}
