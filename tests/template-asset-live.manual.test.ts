import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// #template-latest-only 라이브 검증 (수동 게이트 — 프로덕션 storage 에 씁니다, CI 항상 skip):
//   RUN_TEMPLATE_ASSET_LIVE=1 pnpm vitest run tests/template-asset-live.manual.test.ts
//
// 가짜 구판 해시 객체를 심은 뒤 실제 승격 경로(templateAssetUrl)를 호출해
//   ① 현재 해시 객체가 살아 있고(HEAD 200) ② 구판이 자동 삭제됐는지 실측한다.
//   fal 호출 없음 — storage 왕복만.

const LIVE = process.env.RUN_TEMPLATE_ASSET_LIVE === '1'

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

describe.runIf(LIVE)('template-asset 최신본 자동 관리 — 실 storage', () => {
  it('가짜 구판을 심으면 승격 호출이 지우고, 현재본과 타 자산은 남는다', async () => {
    loadEnv()
    const { supabaseAdmin } = await import('@/lib/supabase/admin')
    const { templateAssetUrl } = await import('@/lib/storage/template-asset')

    const FAKE = 'rough-storyboard-grid-cinema-000000000000.png'
    const { error: upErr } = await supabaseAdmin.storage
      .from('media')
      .upload(`templates/${FAKE}`, Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        contentType: 'image/png',
        upsert: true,
      })
    expect(upErr).toBeNull()

    const url = await templateAssetUrl('rough-storyboard-grid-cinema.png')
    expect(url).toBeTruthy()
    expect((await fetch(url!, { method: 'HEAD' })).ok).toBe(true)

    const { data: listing } = await supabaseAdmin.storage
      .from('media')
      .list('templates', { limit: 100 })
    const names = (listing ?? []).map((o) => o.name)
    expect(names, '가짜 구판 삭제됨').not.toContain(FAKE)
    expect(names.some((n) => /^rough-storyboard-grid-cinema-[0-9a-f]{12}\.png$/.test(n)), '현재본 존속').toBe(true)
    expect(names.some((n) => n.startsWith('character-template-')), '타 자산 무접촉').toBe(true)
  }, 60_000)
})
