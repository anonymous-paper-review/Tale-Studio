// Storyboard 채팅의 실사 그림 도구(오너 O7 "채팅으로") — AI 안내에 도구가 실리고, 모델이 낸 그림 요청을 어떤 모양만 받아들이는지 검사한다
import { describe, expect, it } from 'vitest'
import {
  STORYBOARD_IMAGE_TOOL_GUIDE,
  pickStoryboardImageUpdates,
  storyboardImageStatusSection,
  withStoryboardImageUpdates,
} from '@/lib/storyboard/chat-image-tool'

describe('Storyboard 채팅 실사 그림 도구', () => {
  // 왜(오너 O7): 고칠 글을 채팅에 보내면 채팅이 그 샷 실사를 다시 그린다 — AI 가 쓸 수 있는 도구와 바꿀 점을 쓰는 법을 알려야 한다.
  it('Storyboard 채팅 AI 안내는 샷 하나의 실사를 바꿀 점과 함께 다시 그리는 도구와 Take 를 쓰지 않는다는 것을 말한다', () => {
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toContain('{"type":"generateImage","id":"<shotId>","change":"<what to change, in English>"}')
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toContain('uses no Takes')
  })

  // 왜(오너 O7 "이야기 · 화살표 · 대사는 Writer 콘티에서"): 그림을 고쳐 달라는 말에 샷 글을 바꾸면 실사는 그대로고 콘티 글만 바뀐다.
  it('Storyboard 채팅 AI 안내는 그림을 고쳐 달라는 말에 샷 글을 고치지 말고 실사를 다시 그리라고 한다', () => {
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/do not edit the shot text/i)
  })

  // 왜(architecture §3 "모델 출력의 무검증 실행 금지"): 받을 모양만 받는다 — 샷 id · 바꿀 점은 글, 바꿀 점은 다듬어 길이를 자른다.
  it('모델이 낸 그림 요청은 샷 id 와 바꿀 점(글)만 받고 바꿀 점은 앞뒤 빈칸을 떼고 500자로 자른다', () => {
    const picked = pickStoryboardImageUpdates([
      { type: 'generateImage', id: 'sh_01_02', change: '  Make her expression sadder  ' },
      { type: 'generateImage', id: 'sh_01_03' },
      { type: 'generateImage' },
      { type: 'generateImage', id: 'sh_01_04', change: 'x'.repeat(600) },
      { type: 'generateImage', id: 42 },
      { type: 'updateShot', id: 'sh_01_02', patch: {} },
      'junk',
    ])
    expect(picked).toEqual([
      { type: 'generateImage', id: 'sh_01_02', change: 'Make her expression sadder' },
      { type: 'generateImage', id: 'sh_01_03' },
      { type: 'generateImage' },
      { type: 'generateImage', id: 'sh_01_04', change: 'x'.repeat(500) },
    ])
  })

  // 왜: 같은 답에 같은 샷을 두 번 그리라면 서버가 둘째를 거절하고 바꿀 점이 버려진다 — 샷마다 하나(뒤 것)만.
  it('같은 답 안에서 같은 샷 그림 요청은 하나만 받는다', () => {
    const picked = pickStoryboardImageUpdates([
      { type: 'generateImage', id: 'sh_01_02', change: 'sadder' },
      { type: 'generateImage', id: 'sh_01_02', change: 'darker room' },
    ])
    expect(picked).toEqual([{ type: 'generateImage', id: 'sh_01_02', change: 'darker room' }])
  })

  // 왜: 되묻기(clarify)는 응답 전체의 정지 신호다(지금 Writer 채팅 규칙) — 그림 요청이 섞여 있어도 질문만 보낸다.
  it('되묻기가 있으면 그림 요청을 섞지 않고 질문만 보낸다', () => {
    const clarify = { type: 'clarify', question: '어느 샷이요?', candidates: ['샷 2', '샷 5'] }
    expect(withStoryboardImageUpdates([clarify], [{ type: 'generateImage', id: 'sh_01_02', change: 'x' }])).toEqual([clarify])
    expect(withStoryboardImageUpdates([{ type: 'updateScene', id: 'sc_01', patch: { mood: 'x' } }], [{ type: 'generateImage', id: 'sh_01_02' }])).toEqual([
      { type: 'updateScene', id: 'sc_01', patch: { mood: 'x' } },
      { type: 'generateImage', id: 'sh_01_02' },
    ])
  })

  // 왜(오너 O7 "맥락을 보고"): AI 가 어느 샷에 실사가 있는지 · 몇 번째 판인지 알아야 "지금 그림에서 바꿀 점"을 바르게 쓴다.
  it('AI 문맥에 샷마다 실사가 있는지와 지금 판 번호를 싣는다', () => {
    const section = storyboardImageStatusSection([
      { shot_id: 'sh_01_01', storyboard_image: { url: 'u', status: 'completed', generatedAt: 1, versions: [{ id: 'j1', n: 1, url: 'u', generatedAt: 1, source: 'generated' }, { id: 'j2', n: 2, url: 'u2', generatedAt: 2, source: 'generated' }], versionId: 'j2' } },
      { shot_id: 'sh_01_02', storyboard_image: null },
    ])
    expect(section).toContain('sh_01_01: live-action image v2')
    expect(section).toContain('sh_01_02: no live-action image yet')
  })
})
