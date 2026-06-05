// FAL webhook 콜백을 받을 public base URL 해석.
//
//   1순위: WEBHOOK_BASE_URL (webhook 전용 오버라이드)
//   2순위: NEXT_PUBLIC_APP_URL (앱 public URL — 로컬은 ngrok/cloudflare 터널, 프로덕션은 커스텀 도메인)
//   3순위: VERCEL_URL (Vercel 자동 주입, preview/prod 배포 시)
//   없으면 undefined → submit 시 webhookUrl 생략 → poll 엔드포인트의 FAL reconcile로 동작 (느리지만 안전).
//
// FAL은 localhost로 콜백을 보낼 수 없으므로 로컬 개발에선 터널이 없으면 undefined가 정상.

const WEBHOOK_PATH = '/api/fal/webhook'

export function resolveWebhookBaseUrl(): string | undefined {
  const explicit = process.env.WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`
  return undefined
}

/** FAL submit에 넘길 절대 webhook URL. base를 못 구하면 undefined. */
export function resolveWebhookUrl(): string | undefined {
  const base = resolveWebhookBaseUrl()
  return base ? `${base}${WEBHOOK_PATH}` : undefined
}
