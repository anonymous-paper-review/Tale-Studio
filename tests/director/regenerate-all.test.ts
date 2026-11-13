// 전체 재생성을 누르면 이미 만든 그림도 다시 만들고, 비용이 드는 작업임을 먼저 알린다 (#c3 2026-08-27 오너)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { KO as ko } from '@/lib/i18n/messages-ko'
import { imageWorkBlock } from '@/lib/director/toolbar-work'

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
    expect(route).not.toMatch(/^\s*if \(hasStoryboardImage\(s\.storyboard_image\)\) continue/m)
    // 2026-11-14 오너 7번 · 리드 검토 a 1: 이미 만든 그림인지는 칸이 있는지가 아니라 지금 그림으로 본다(멈춘 그림만 있는 샷은 빈칸).
    expect(route).toContain('if (!force && hasStoryboardImage(s.storyboard_image)) continue')
  })

  it('전체 재생성 요청이 실제 작업까지 전달된다', () => {
    expect(client).toContain('force?: boolean')
    expect(client).toContain("opts?.force ? { projectId, force: true } : { projectId }")
  })

  // 왜: 1110 확정 시안 D2 · R — [이미지 만들기]는 이미지 없는 샷만 센다. 8/27 오너의 "전체 재생성" 길은 고르기로 남는다:
  //   전체 체크 → 고른 샷이 모두 이미지가 있으면 [이미지 다시 만들기 · N] → 확인 → 고른 샷만 다시(오너 2026-11-14 "나머지는 추천대로").
  it('이미지가 있는 샷을 고르고 [이미지 다시 만들기]를 누르면 확인한 뒤 고른 샷만 다시 만든다', () => {
    expect(page).toContain('setConfirmRemake(true)')
    expect(page).toContain('runRealBatch(pid, { force: true, shotIds: batch })')
  })

  // 왜: 다시 만들기 전에 몇 장인지 · Take 를 쓰지 않는다는 것 · 지금 이미지가 어떻게 되는지를 먼저 알린다.
  //   2026-11-14 문장 바꿈(오너 답 5번 "히스토리 관리" — 다시 만들어도 지금 이미지는 버전으로 남는다):
  //   예전 "…지금 이미지가 바뀐다는 것을 알린다"(기대 글 'Replaces the current images in the picked shots.').
  it('다시 만들기 확인 창은 몇 장을 다시 만드는지, Take 를 쓰지 않는다는 것, 지금 이미지는 버전으로 남는다는 것을 알린다', () => {
    expect(page).toContain('RegenerateConfirmDialog')
    expect(page).toContain('Make {count} images again?')
    expect(page).toContain('No Takes are used.')
    expect(page).toContain("'The new images become the current ones. The current images stay in the versions.'")
    expect(page).not.toContain('Replaces the current images in the picked shots.')
  })
})

describe('C3 — 막힐 때 이유를 말한다', () => {
  // 왜: 출시 문장 그대로(#c3 2026-08-27 ② "생성 중이면 disabled 인데 왜 막혔는지 말해주지 않았다"). 1110 확정 화면에서는
  //   일괄이 도는 동안 [이미지 만들기]가 꺼지고 단추 아래 한 줄로 까닭을 보인다(결정 페이지 "꺼진 단추 아래 이유 한 줄", 리드 검토 a 보통 1).
  it('생성 중에는 다시 누를 수 없는 이유를 알려준다', () => {
    const work = readFileSync('src/lib/director/toolbar-work.ts', 'utf8')
    expect(work).toContain("'Making images now. You can press again when it finishes.'")
    // 이미지 일괄이 도는 동안(realBatchBusy) 이미지 단추의 까닭은 '만드는 중'이고, 그 까닭이 단추 아래 한 줄로 보인다.
    expect(imageWorkBlock(new Map([['a', 'image_needed']]), new Set(), true)).toBe('busy')
    expect(page).toMatch(/imageWorkBlock\([^)]*realBatchBusy/)
    expect(page).toContain('{blockLine}')
  })

  // 왜: 한국어 화면에서 다시 만들기 확인 창 · 꺼진 단추 아래 까닭이 영어 원문 그대로 보이지 않게(새 문구는 두 말, 약속 A).
  it('다시 만들기 · 꺼진 단추 안내 문구를 한국어로 보여준다', () => {
    for (const key of [
      'Make {count} images again?',
      'Make images again',
      'Every shot here already has an image.',
      'Videos need an image first.',
      'Making images now. You can press again when it finishes.',
      'Making videos now. You can press again when it finishes.',
      'Making images and videos now. You can press again when they finish.',
      'No shots yet.',
      'The rest are being made now.',
      'Every shot here already has a video.',
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
