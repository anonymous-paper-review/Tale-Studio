// Paddle 서버 API 호출 — 얇은 fetch 래퍼 (#payments-phase-3). 샌드박스·라이브 주소는 NEXT_PUBLIC_PADDLE_ENV 로 가른다.
//   키가 환경과 안 맞으면(샌드박스인데 라이브 키 등) 부르기 전에 던진다 — CLAUDE.md "샌드박스 키와 라이브 키가 같은 스코프에 공존하면 사고".

export function paddleBaseUrl(): string {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'
}

function apiKey(): string {
  const key = process.env.PADDLE_API_KEY
  if (!key) throw new Error('PADDLE_API_KEY missing')
  const sandbox = process.env.NEXT_PUBLIC_PADDLE_ENV !== 'production'
  if (sandbox && !key.includes('_sdbx')) throw new Error('sandbox env but PADDLE_API_KEY is not a sandbox key')
  if (!sandbox && key.includes('_sdbx')) throw new Error('production env but PADDLE_API_KEY is a sandbox key')
  return key
}

export class PaddleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

export async function paddleRequest<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${paddleBaseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } }
  if (!res.ok || json.error) {
    throw new PaddleApiError(`Paddle ${method} ${path} → ${res.status} ${json.error?.code ?? ''} ${json.error?.detail ?? ''}`.trim(), res.status, json.error?.code)
  }
  return json.data as T
}
