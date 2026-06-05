// FAL webhook 서명 검증 (ED25519 + JWKS).
//
// FAL은 완료 콜백마다 ED25519 서명을 첨부한다. 위조된 /api/fal/webhook 호출을 막기 위해
// 아래 절차로 검증한다 (FAL 공식 문서 기준):
//   1. 헤더 4종(request-id / user-id / timestamp / signature) 존재 확인
//   2. timestamp가 현재 ±5분 이내인지 (replay 방지)
//   3. message = `${requestId}\n${userId}\n${timestamp}\n${sha256_hex(rawBody)}`
//   4. JWKS(https://rest.fal.ai/.well-known/jwks.json)의 ED25519 공개키들로 hex 디코딩한 서명 검증
//
// libsodium 없이 Node 내장 crypto로 OKP/Ed25519 JWK를 import해 검증한다.
import crypto from 'node:crypto'

const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json'
const JWKS_TTL_MS = 24 * 60 * 60 * 1000 // 24h 캐시 (FAL 권장)
const TIMESTAMP_TOLERANCE_SEC = 300 // ±5분

let jwksCache: { keys: crypto.KeyObject[]; fetchedAt: number } | null = null

async function getPublicKeys(): Promise<crypto.KeyObject[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const json = (await res.json()) as {
    keys?: Array<{ x?: string; kty?: string; crv?: string }>
  }
  const keys: crypto.KeyObject[] = []
  for (const jwk of json.keys ?? []) {
    if (!jwk.x) continue
    try {
      keys.push(
        crypto.createPublicKey({
          key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
          format: 'jwk',
        }),
      )
    } catch {
      // malformed key → skip
    }
  }
  if (keys.length === 0) throw new Error('no ED25519 keys found in JWKS')
  jwksCache = { keys, fetchedAt: Date.now() }
  return keys
}

export interface FalWebhookHeaders {
  requestId: string | null
  userId: string | null
  timestamp: string | null
  signature: string | null
}

export function readFalWebhookHeaders(h: Headers): FalWebhookHeaders {
  return {
    requestId: h.get('x-fal-webhook-request-id'),
    userId: h.get('x-fal-webhook-user-id'),
    timestamp: h.get('x-fal-webhook-timestamp'),
    signature: h.get('x-fal-webhook-signature'),
  }
}

/** 서명 유효 시 true. 검증 실패/에러 시 false (요청 거부). */
export async function verifyFalWebhook(
  headers: FalWebhookHeaders,
  rawBody: string,
): Promise<boolean> {
  const { requestId, userId, timestamp, signature } = headers
  if (!requestId || !userId || !timestamp || !signature) return false

  // 2. timestamp ±5분
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > TIMESTAMP_TOLERANCE_SEC) return false

  // signature: hex → 64 byte ED25519
  let signatureBytes: Buffer
  try {
    signatureBytes = Buffer.from(signature, 'hex')
  } catch {
    return false
  }
  if (signatureBytes.length !== 64) return false

  // 3. message 구성
  const bodyHashHex = crypto
    .createHash('sha256')
    .update(rawBody, 'utf8')
    .digest('hex')
  const message = Buffer.from(
    [requestId, userId, timestamp, bodyHashHex].join('\n'),
    'utf8',
  )

  // 4. JWKS 공개키들로 검증 (하나라도 통과하면 유효)
  let keys: crypto.KeyObject[]
  try {
    keys = await getPublicKeys()
  } catch {
    return false
  }
  for (const key of keys) {
    try {
      if (crypto.verify(null, message, key, signatureBytes)) return true
    } catch {
      // 키 형식 불일치 → 다음 키
    }
  }
  return false
}
