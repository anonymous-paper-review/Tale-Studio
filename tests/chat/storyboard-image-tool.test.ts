// Storyboard 채팅의 실사 그림 도구(오너 O7 "채팅으로") — AI 안내에 도구가 실리고, 모델이 낸 그림 요청을 어떤 모양만 받아들이는지 검사한다
import { describe, expect, it } from 'vitest'
import {
  STORYBOARD_IMAGE_TOOL_GUIDE,
  pickStoryboardImageUpdates,
  requestsPictureOnlyChange,
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

  // 왜(검토 2026-11-26 rev-director): "대사를 바꾸고 다시 그려 줘"에 그림 요청만 내고 "바꿀게요"라고 하면 대사는 그대로다 —
  //   글 고치기는 고치기 도구로 하고, 그림 요청은 글을 바꾸지 않으며, 고치기 결과 없이 글을 바꿨다고 말하지 않게 한다.
  it('Storyboard 채팅 AI 안내는 대사 · 샷 글을 바꿔 달라는 말이 섞이면 그 글은 고치기 도구로 고치고, 그림 요청만으로 글을 바꿨다고 말하지 말라고 한다', () => {
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/make that text change with the edit tools/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/generateImage only redraws the picture and never changes text/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/never say text was changed unless the edit result confirms it/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).not.toMatch(/dialogue are edited in Writer/i)
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

describe('그림만 고쳐 달라는 말인가(도구 고리의 그림 요청 예외)', () => {
  // 왜(오너 O7 · 2026-11-26 개발 서버 실측): "@샷 2 이미지를 고쳐서 다시 만들어 줘"는 고치기 말이라 도구 고리가 글 고치기를 요구했다 —
  //   그림 · 이미지 · 실사를 고쳐 달라는 말에 글 말이 없으면 그림만 부탁한 것이다(인물 · 배경 · 표정은 그림의 생김새다).
  it('그림 · 이미지 · 실사를 고쳐 달라는 말에 글을 가리키는 말이 없으면 그림만 부탁한 말로 본다', () => {
    expect(requestsPictureOnlyChange('@샷 2 이미지를 고쳐서 다시 만들어 줘: 인물이 창밖을 보며 더 슬픈 표정을 짓게, 창에 빗방울이 맺히게')).toBe(true)
    expect(requestsPictureOnlyChange('샷 3 그림 바꿔 줘: 밤 장면으로')).toBe(true)
    expect(requestsPictureOnlyChange('샷 5 실사를 수정해 줘, 배경을 더 어둡게')).toBe(true)
    expect(requestsPictureOnlyChange('샷 2 이미지에서 간판 글자를 지워 줘')).toBe(true)
    expect(requestsPictureOnlyChange("Change shot 2's image so she looks back")).toBe(true)
  })

  // 왜(검토 2026-11-26 rev-director): 대사 · 샷 글도 바꿔 달라는 부탁이면 그림 요청만으로는 다 한 것이 아니다 — 예전처럼 실행을 확인한다.
  it('대사 · 내레이션 · 샷 설명 · 이야기 · 이름 · 길이를 바꿔 달라는 말이 섞이면 그림만 부탁한 말이 아니다', () => {
    expect(requestsPictureOnlyChange("@샷 2 대사를 '잘 가'로 바꾸고 다시 그려 줘")).toBe(false)
    expect(requestsPictureOnlyChange('샷 2 설명을 고치고 이미지도 다시 만들어 줘')).toBe(false)
    expect(requestsPictureOnlyChange('샷 4 내레이션 수정하고 그림도 바꿔 줘')).toBe(false)
    expect(requestsPictureOnlyChange('인물 이름을 바꾸고 그림도 다시 그려 줘')).toBe(false)
    expect(requestsPictureOnlyChange('샷 2를 5초로 바꾸고 다시 그려 줘')).toBe(false)
    expect(requestsPictureOnlyChange("Change shot 2's dialogue to 'bye' and redraw the image")).toBe(false)
  })

  // 왜(리드 2026-11-26 "가르기가 불확실하면 안전한 쪽"): 그림을 가리키는 말이 없으면 글을 고치려는 것일 수 있다 — 예전처럼 실행을 확인한다.
  it('그림을 가리키는 말이 없으면 그림만 부탁한 말로 보지 않는다', () => {
    expect(requestsPictureOnlyChange('샷 2 고쳐 줘: 더 슬프게')).toBe(false)
    expect(requestsPictureOnlyChange('Update shot 2 to be sadder')).toBe(false)
  })

  // 왜: "대사는 그대로 두고 그림만"은 글을 고치지 말라는 말이다 — 글 고치기 부탁으로 세면 그림 고치기가 실행 확인에 걸려 버려진다.
  it('대사 · 글은 그대로 두라는 말은 글 고치기 부탁으로 세지 않는다', () => {
    expect(requestsPictureOnlyChange('샷 2 대사는 그대로 두고 그림만 바꿔 줘')).toBe(true)
    expect(requestsPictureOnlyChange("Keep the dialogue and change shot 2's image")).toBe(true)
    expect(requestsPictureOnlyChange('샷 2 대사는 그대로 두고 설명을 고치고 그림도 바꿔 줘')).toBe(false)
  })
})
