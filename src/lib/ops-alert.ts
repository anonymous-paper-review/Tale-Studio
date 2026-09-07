// 운영 경보 — 디스코드 웹훅 한 채널 (#payments-phase-3 P11, 오너 2026-09-07 "디스코드로 가자").
//   보내는 것: Paddle 웹훅 처리 실패 · 갱신 결제 실패 · 상품 매핑 실패 · 워크스페이스 없음 · 일일 대사 불일치.
//   원칙: 경보 전송이 제품을 막으면 안 된다 — 실패는 삼키고 console 에만 남긴다. 주소(env)가 없으면 조용히 건너뛴다.
//   메시지에 환경 이름을 붙인다(Preview·Production 이 같은 채널을 쓴다).

export type OpsAlertLevel = 'info' | 'warn' | 'error'

export interface OpsAlert {
  title: string
  body?: string
  level: OpsAlertLevel
}

const LEVEL_PREFIX: Record<OpsAlertLevel, string> = { info: 'ℹ️', warn: '⚠️', error: '🚨' }

function environmentLabel(): string {
  const vercel = process.env.VERCEL_ENV
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return `preview:${process.env.VERCEL_GIT_COMMIT_REF ?? '?'}`
  return 'local'
}

/** 디스코드 content 는 2000자 제한 — 넘치면 자른다. */
function clip(text: string, max = 1900): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export async function sendOpsAlert(alert: OpsAlert): Promise<void> {
  const url = process.env.DISCORD_ALERT_WEBHOOK_URL
  const line = `${LEVEL_PREFIX[alert.level]} [tale · ${environmentLabel()}] ${alert.title}`
  const content = clip(alert.body ? `${line}\n${alert.body}` : line)
  if (!url) {
    console.warn('[ops-alert] no DISCORD_ALERT_WEBHOOK_URL —', content)
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) console.error('[ops-alert] discord responded', res.status)
  } catch (err) {
    console.error('[ops-alert] send failed', err instanceof Error ? err.message : err)
  }
}
