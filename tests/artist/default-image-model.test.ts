// 유저가 그림 모델을 따로 고르지 않으면 gpt-image-2로 그린다 (2026-10-09 오너 결정 — nano-banana-2 의 실사 인물 시트가 절반 넘게 칠그림으로 나왔다)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_ORDER, normalizeImageModelKey, resolveImageEndpoint } from '@/lib/image-models'

const read = (path: string) => readFileSync(path, 'utf8')

describe('기본 그림 모델', () => {
  it('유저가 그림 모델을 고르지 않으면 인물 시트를 gpt-image-2로 그린다', () => {
    // 왜: 실사 스타일 인물 시트가 nano-banana-2 로는 18장 중 7장만 실사, gpt-image-2 로는 8장 모두 실사였다(10/9 시험).
    const key = normalizeImageModelKey(undefined)
    expect(key).toBe('gpt-image-2')
    expect(resolveImageEndpoint(key, true).endpoint).toBe('openai/gpt-image-2/edit')
  })

  it('캐릭터 초안을 자동으로 만들 때도 같은 기본 모델(gpt-image-2)로 그린다', () => {
    // 왜: 초안은 유저가 모델을 고를 틈 없이 서버가 만든다 — 인물 시트와 같은 기본값을 따라야 그림체가 갈리지 않는다.
    expect(read('src/lib/artist/draft-trigger.ts')).toMatch(/resolveImageEndpoint\(DEFAULT_IMAGE_MODEL, true\)/)
    expect(DEFAULT_IMAGE_MODEL).toBe('gpt-image-2')
  })

  it('모델 선택 창은 gpt-image-2를 처음부터 골라 두고 목록 맨 앞에 둔다', () => {
    // 왜: 선택 창을 연 유저가 손대지 않고 만들면 기본 모델로 만들어진다 — 처음 선택과 기본값이 같아야 한다.
    expect(read('src/features/artist/character-view-dialog.tsx')).toMatch(/useState<ImageModelKey>\(DEFAULT_IMAGE_MODEL\)/)
    expect(IMAGE_MODEL_ORDER[0]).toBe('gpt-image-2')
  })

  it('Artist 채팅은 유저가 모델을 말하지 않으면 gpt-image-2로 그린다고 안내한다', () => {
    // 왜: 채팅 에이전트가 옛 기본값(nano-banana-2)을 기본이라고 말하면 유저가 받는 그림과 설명이 어긋난다.
    const route = read('src/app/api/artist/chat/route.ts')
    expect(route).toContain('(생략 = 기본 gpt-image-2)')
    expect(route).toContain('(생략 시 기본 gpt-image-2)')
    expect(route).toMatch(/- gpt-image-2 — [^\n]*기본값/)
    expect(route).not.toMatch(/- nano-banana-2 — [^\n]*기본값/)
    expect(route).not.toContain('기본 nano-banana-2')
  })
})
