// Storyboard 채팅의 실사 그림 도구(오너 O7 "채팅으로") — AI 안내에 도구가 실리고, 모델이 낸 그림 요청을 어떤 모양만 받아들이는지,
//   Storyboard 채팅은 글 고치기 부탁으로 세지 않는지(오너 2026-11-27 N3 — 실사 고치기만, 글은 콘티) 검사한다
import { describe, expect, it } from 'vitest'
import { requestsSupportedChatEdit } from '@/lib/chat-tools/receipt'
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

  // 왜(오너 2026-11-27 N3 "추천대로" — 이야기 · 샷은 콘티 · Q1 "대사 수정 기능을 채팅창에서도" · 리드 "도구 하나로"): "대사를 바꾸고 다시 그려 줘"에
  //   그림 요청만 내고 "바꿀게요"라고 하면 대사는 그대로다 — 대사는 대사 도구로 고치고, 이야기 · 샷 글은 콘티로 안내하며 바꿨다고 말하지 않게 한다.
  //   (2026-11-27 이름 바꿈 · 오너 Q1 — 옛 이름 'Storyboard 채팅 AI 안내는 대사 · 샷 글을 바꿔 달라는 말이 섞이면 그 글은 고치지 않고 Writer 콘티(대사는 대사 탭)로 안내하며, 그림 요청만으로 글을 바꿨다고 말하지 말라고 한다')
  it('Storyboard 채팅 AI 안내는 그림과 함께 대사를 바꿔 달라면 대사는 대사 도구로 고치고, 이야기 · 샷 글은 고치지 않고 Writer 콘티로 안내하며, 그림 요청만으로 글을 바꿨다고 말하지 말라고 한다', () => {
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).not.toMatch(/make that text change with the edit tools/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/generateImage only redraws the picture and never changes text/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/change it with the dialogue tool/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/never say that other text was changed/i)
    expect(STORYBOARD_IMAGE_TOOL_GUIDE).toMatch(/rough storyboard/i)
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

describe('Storyboard 채팅은 글 고치기 부탁으로 세지 않는다(콘티 채팅은 센다)', () => {
  // 왜(오너 2026-11-27 N3 · 2026-11-26 개발 서버 실측): "@샷 2 이미지를 고쳐서 다시 만들어 줘"는 고치기 말이라 도구 고리가 글 고치기를 요구했다 —
  //   Storyboard 채팅은 글을 고치지 않으니 그림 · 이미지 · 실사를 고쳐 달라는 말도 글 고치기 부탁으로 세지 않는다(그림 요청이 버려지지 않게).
  it('Storyboard 채팅에서는 그림 · 이미지 · 실사를 고쳐 달라는 말을 글 고치기 부탁으로 세지 않는다', () => {
    expect(requestsSupportedChatEdit('writer', '@샷 2 이미지를 고쳐서 다시 만들어 줘: 인물이 창밖을 보며 더 슬픈 표정을 짓게, 창에 빗방울이 맺히게')).toBe(false)
    expect(requestsSupportedChatEdit('writer', '샷 3 그림 바꿔 줘: 밤 장면으로')).toBe(false)
    expect(requestsSupportedChatEdit('writer', '샷 5 실사를 수정해 줘, 배경을 더 어둡게')).toBe(false)
    expect(requestsSupportedChatEdit('writer', "Change shot 2's image so she looks back")).toBe(false)
  })

  // 왜(오너 2026-11-27 N3): 글을 바꿔 달라는 부탁에 Storyboard 가 고치기를 다시 요구하면, 콘티로 가라는 안내 대신
  //   "요청한 변경의 실행을 확인하지 못했습니다"로 끝나고 섞인 그림 요청까지 버린다. 이야기 · 샷은 콘티에서 고친다.
  //   대사 · 내레이션은 오너 Q1 로 여기서도 대사 도구로 고치지만, 고치기 결과를 다시 요구하지는 않는다(섞인 그림 요청이 버려지지 않게 — Director 와 다른 점).
  //   (2026-11-27 이름 바꿈 · 리드 지시 "지금 사실로 이름만, 기대는 그대로" — 옛 이름 'Storyboard 채팅에서는 대사 · 내레이션 · 샷 설명 · 이름 · 길이를 바꿔 달라는 말도 글 고치기 부탁으로 세지 않는다 — 글은 콘티에서 고친다')
  it('Storyboard 채팅에서는 대사 · 내레이션 · 샷 설명 · 이름 · 길이를 바꿔 달라는 말도 고치기 결과를 다시 요구하는 부탁으로 세지 않는다 — 대사는 대사 도구로, 이야기 · 샷은 콘티에서 고친다', () => {
    expect(requestsSupportedChatEdit('writer', "@샷 2 대사를 '잘 가'로 바꾸고 다시 그려 줘")).toBe(false)
    expect(requestsSupportedChatEdit('writer', '샷 2 설명을 고치고 이미지도 다시 만들어 줘')).toBe(false)
    expect(requestsSupportedChatEdit('writer', '샷 4 내레이션 수정하고 그림도 바꿔 줘')).toBe(false)
    expect(requestsSupportedChatEdit('writer', '인물 이름을 바꾸고 그림도 다시 그려 줘')).toBe(false)
    expect(requestsSupportedChatEdit('writer', '샷 2를 5초로 바꾸고 다시 그려 줘')).toBe(false)
    expect(requestsSupportedChatEdit('writer', "Change shot 2's dialogue to 'bye' and redraw the image")).toBe(false)
  })

  // 왜(정상 경로 고정 — 오너 N3 "콘티 채팅은 지금 그대로"): 콘티는 씬 · 샷 · 대사를 고치는 곳이다 — 고쳐 달라는 말은 지금처럼 실행을 확인한다.
  it('콘티 채팅은 지금처럼 샷 · 씬 · 대사를 고쳐 달라는 말을 글 고치기 부탁으로 센다', () => {
    expect(requestsSupportedChatEdit('conti', '샷 2 고쳐 줘: 더 슬프게')).toBe(true)
    expect(requestsSupportedChatEdit('conti', "@샷 2 대사를 '잘 가'로 바꿔 줘")).toBe(true)
    expect(requestsSupportedChatEdit('conti', 'Update shot 2 to be sadder')).toBe(true)
  })

  // 왜(정상 경로 고정): "바꾸지 마"처럼 고치지 말라는 말은 콘티에서도 고치기 부탁이 아니다 — 세면 하지 말라는 고치기를 요구한다.
  it('콘티 채팅도 고치지 말라는 말은 글 고치기 부탁으로 세지 않는다', () => {
    expect(requestsSupportedChatEdit('conti', '샷 2 대사는 변경하지 마. 그림만 다시 그려 줘')).toBe(false)
    expect(requestsSupportedChatEdit('conti', "Don't change shot 2's dialogue")).toBe(false)
  })
})
