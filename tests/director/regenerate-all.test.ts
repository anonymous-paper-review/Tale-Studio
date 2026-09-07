// 전체 재생성을 누르면 이미 만든 그림도 다시 만들고, 비용이 드는 작업임을 먼저 알린다 (#c3 2026-08-27 오너)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { KO as ko } from '@/lib/i18n/messages-ko'

// #c3 (2026-08-27 오너) — "하나씩 하는 거 짜쳐서 전체 재생성 누르려는데 X표로 막힘".
//
// 두 갈래였다:
//   ① 전부 생성된 상태에서 버튼이 안내 토스트만 띄우고 끝 — 전체 재생성 경로가 아예 없었다
//   ② 생성 중이면 disabled 인데 왜 막혔는지 말해주지 않았다(커서만 바뀜)
// 서버는 "빈칸만" 채우게 못 박혀 있어서, force 를 서버→클라→UI 로 관통시켜야 했다.

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
const client = readFileSync('src/lib/director/real-batch-client.ts', 'utf8')
const route = readFileSync('src/app/api/director/generate-storyboard-batch/route.ts', 'utf8')

describe('C3 — 전체 재생성을 요청할 수 있다', () => {
  it('전체 재생성을 요청하면 이미 만든 장면 그림도 다시 만든다', () => {
    expect(route).toContain('force?: boolean')
    // 되돌아간 형태: if (s.storyboard_image) continue  ← force 무시
    expect(route).not.toMatch(/^\s*if \(s\.storyboard_image\) continue/m)
    expect(route).toContain('if (!force && s.storyboard_image) continue')
  })

  it('전체 재생성 요청이 실제 작업까지 전달된다', () => {
    expect(client).toContain('force?: boolean')
    expect(client).toContain("opts?.force ? { projectId, force: true } : { projectId }")
  })

  it('모든 그림이 있어도 전체 재생성 전에 확인을 요청한다', () => {
    // 예전: toast.info('All storyboards have already been generated.') 후 return
    expect(page).toContain('setConfirmRegenAll(true)')
    expect(page).toContain('runRealBatch(pid, { force: true })')
  })

  it('비용이 드는 전체 재생성은 확인한 뒤 시작한다', () => {
    expect(page).toContain('RegenerateConfirmDialog')
    expect(page).toContain('Regenerate every storyboard image?')
    // 영향 고지에 과금·교체가 둘 다 있어야 한다
    expect(page).toContain('Costs money for every shot')
    expect(page).toContain('Replaces the existing shooting images')
  })
})

describe('C3 — 막힐 때 이유를 말한다', () => {
  it('생성 중에는 다시 누를 수 없는 이유를 알려준다', () => {
    expect(page).toContain('Generation in progress. You can start again when it finishes.')
  })

  it('전체 재생성 안내 문구를 한국어로 보여준다', () => {
    for (const key of [
      'Regenerate every storyboard image?',
      'Regenerate all',
      'Generation in progress. You can start again when it finishes.',
    ]) {
      expect(ko[key], `missing ko: ${key}`).toBeTruthy()
    }
  })
})

describe('Director 장면 그림의 인물 모습 약속', () => {
  it('각 장면에 저장한 인물 모습의 기준 그림만 사용하고 예전 그림은 쓰지 않는다', () => {
    expect(route).toContain('character_appearance_keys')
    expect(route).toContain("from('character_appearances')")
    expect(route).toContain("select('character_id, appearance_key, sheet_url')")
    // #ref-gate(2026-09-02): 시트 없는 인물은 전체 409 대신 그 샷만 skipped(이유·이름)로 보고하고 준비된 샷은 진행한다.
    expect(route).toContain("reason: 'missing_character_sheets'")
    expect(route).not.toContain('has no required sheet_url')
    expect(route).toContain('a.characterId.localeCompare(b.characterId) || a.appearanceKey.localeCompare(b.appearanceKey)')
    expect(route).not.toContain('view_main')
    expect(route).not.toContain('portrait')
  })
})
