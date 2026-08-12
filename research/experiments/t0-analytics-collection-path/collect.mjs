// t0-analytics-collection-path — 방문자 계측 수집 경로가 로그인 문턱에 튕기는가.
//   쿠키 없이 GET 1회씩. 상태 코드와 Location 헤더만 기록(본문 미기록). POST·쓰기 없음.
// 실행: node research/experiments/t0-analytics-collection-path/collect.mjs
import { writeFileSync } from 'node:fs'

const HOST = 'https://talestudio.art'
const TARGETS = [
  { key: 'analytics', path: '/_vercel/insights/view', why: '통계 수집 경로 — 미들웨어 제외 대상' },
  { key: 'protected', path: '/studio', why: '대조군 — 보호된 페이지(정상이면 로그인으로 튕겨야 함)' },
  { key: 'public', path: '/', why: '대조군 — 공개 랜딩' },
  { key: 'beacon_script', path: '/_vercel/insights/script.js', why: '계측 스크립트 자산 — 배포·미들웨어 통과 여부의 방증' },
]

const rows = []
for (const t of TARGETS) {
  const url = HOST + t.path
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'tale-studio-night-runner/1.0 (read-only probe)' } })
    const loc = res.headers.get('location')
    rows.push({
      ...t,
      url,
      status: res.status,
      location: loc,
      redirects_to_login: !!loc && /\/login/.test(loc),
      content_type: res.headers.get('content-type'),
    })
  } catch (e) {
    rows.push({ ...t, url, error: String(e).slice(0, 160) })
  }
}

// 배포 방증(본문 미기록) — 랜딩 HTML 이 계측 스크립트를 참조하는지 여부만 boolean 으로 남긴다.
let landingReferencesBeacon = null
try {
  const res = await fetch(HOST + '/', { headers: { 'user-agent': 'tale-studio-night-runner/1.0 (read-only probe)' } })
  const body = await res.text()
  landingReferencesBeacon = /_vercel\/insights/.test(body)   // 본문은 버리고 판정만 보존
} catch { landingReferencesBeacon = null }

const analytics = rows.find((r) => r.key === 'analytics')
const verdict = !analytics ? '측정 실패'
  : analytics.error ? '측정 불가(네트워크 오류)'
    : analytics.redirects_to_login ? '가설 기각 — 로그인으로 리다이렉트됨'
      : analytics.status === 404 ? 'NA — 404(배포 미반영 또는 경로 상이). 기각으로 세지 않음'
        : '가설 유지 — 로그인 리다이렉트 없음'

const out = {
  ticket: 't0-analytics-collection-path',
  date: '2026-08-12',
  method: '쿠키 없는 GET 1회씩, redirect: manual. 상태 코드·Location 만 기록(본문 미기록). 쓰기 없음.',
  host: HOST,
  probes: rows,
  landing_references_beacon: landingReferencesBeacon,
  no_login_redirect_on_analytics: analytics ? !analytics.redirects_to_login : null,
  verdict,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
for (const r of rows) console.log(`${r.key.padEnd(10)} ${r.path.padEnd(24)} → ${r.error ?? `${r.status}${r.location ? ' → ' + r.location : ''}`}`)
console.log('랜딩이 계측 스크립트를 참조하는가:', landingReferencesBeacon)
console.log('판정:', verdict)
