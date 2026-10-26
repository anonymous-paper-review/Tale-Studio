// 리뉴얼 1차: Writer 채팅은 산문만 다룬다 — "다시 써줘"는 다시 쓰기 조건을, 넘김 말은 산문 확정 창을, 나머지는 수정 요청으로 읽는다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { writerChatIntent } from '@/lib/prose/writer-chat'

describe('Writer 채팅 말 읽기', () => {
  // 왜: 프로토타입 — "다시 써줘"라고만 하면 어떤 조건으로 다시 쓸지 먼저 묻는다(1안 조건 패널 · 2안 조건 카드).
  it.each(['다시 써줘', '다시 써 주세요', '다시써', 'Rewrite it', 'rewrite'])('"%s"라고만 하면 다시 쓰기 조건을 연다', (text) => {
    expect(writerChatIntent(text)).toBe('rewrite')
  })

  // 왜: 고칠 점을 함께 말하면 조건을 다시 묻지 않고 그 말대로 고친다.
  it('고칠 점을 함께 말하면 그 말대로 산문 수정안을 만든다', () => {
    expect(writerChatIntent('팀장을 더 얄밉게 다시 써줘')).toBe('revise')
    expect(writerChatIntent('더 짧게')).toBe('revise')
  })

  // 왜: Writer 의 다음 단계는 산문 확정(브레이크다운)이다 — 넘김 말은 확정 창을 열고, 바로 넘기지 않는다.
  it.each(['Artist로 넘겨줘', '브레이크다운 해줘', '다음 단계로 넘어가자', 'Please hand over to Artist'])('"%s"라고 하면 산문 확정 창을 연다', (text) => {
    expect(writerChatIntent(text)).toBe('breakdown')
  })

  // 왜: 넘기지 말라는 말은 넘김이 아니다.
  it('넘기지 말라는 말은 산문 확정 창을 열지 않는다', () => {
    expect(writerChatIntent('아직 Artist로 넘기지 마')).not.toBe('breakdown')
  })

  it.each(['다음 챕터로 이동해줘', '다음 챕터로 넘어가자', '좋아요, 다음 단계로', '다음 단계로', 'Artist로 가줘', 'Go to the next step', 'Move on to the next chapter'])('"%s"라고 하면 산문 수정안을 만들지 않고 산문 확정 창을 연다', (text) => {
    // 왜: "다음 챕터로 이동해줘"가 산문 수정 요청으로 읽혀 1분 잠금 뒤 요청 문장을 제목으로 한 씬 3개 수정안이 생겼다(디자이너 QA 1차 #01). "좋아요, 다음 단계로"는 채팅 단추 이름을 그대로 친 말이다.
    expect(writerChatIntent(text)).toBe('breakdown')
  })

  it('다음이라는 말이 있어도 고칠 점을 말하면 산문 수정안을 만든다', () => {
    // 왜: 넘김 말을 넓게 읽다가 "다음 장면"·"다음 챕터에서"를 고쳐 달라는 말까지 넘김으로 오인하면 고칠 말이 사라진다(디자이너 QA 1차 #01).
    expect(writerChatIntent('다음 장면을 더 길게 해줘')).toBe('revise')
    expect(writerChatIntent('다음 챕터에서 순자가 웃게 해줘')).toBe('revise')
  })

  it('넘어가기 전에 고칠 점을 말하면 산문 확정 창이 아니라 산문 수정안을 만든다', () => {
    // 왜: "다음 단계로 넘어가기 전에 결말을 바꿔줘"는 고쳐 달라는 말이다 — 확정 창이 뜨면 고칠 말이 사라진다(디자이너 QA 1차 #01 검토).
    expect(writerChatIntent('다음 단계로 넘어가기 전에 결말을 바꿔줘')).toBe('revise')
    expect(writerChatIntent('Artist로 넘기기 전에 순자 대사를 줄여줘')).toBe('revise')
    expect(writerChatIntent('Before we move on to the next step, make the ending warmer')).toBe('revise')
  })

  it('다음 단계로 넘어가지 말라는 말은 산문 확정 창을 열지 않는다', () => {
    // 왜: 새로 알아듣는 "다음 챕터" 넘김 말도 부정이면 넘김이 아니다(디자이너 QA 1차 #01).
    expect(writerChatIntent('아직 다음 챕터로 넘어가지 마')).not.toBe('breakdown')
  })

  it('고칠 점과 넘어가자는 말이 함께 있으면 고칠 점부터 수정안으로 만든다', () => {
    // 왜: "결말을 더 밝게 바꾸고 다음 챕터로 이동해줘"가 확정 창만 열어 고칠 점이 버려지고, 그대로 확정하면 고치지 않은 산문이 잠겼다(검토 지적 6).
    for (const text of ['결말을 더 밝게 바꾸고 다음 챕터로 이동해줘', '결말 고치고 Artist로 가줘', '결말 고치고 Artist로 넘겨줘', '순자 대사를 줄이고 넘어가자', 'Make the ending happier, then go to the next step']) {
      expect(writerChatIntent(text), text).toBe('revise')
    }
  })

  it.each(['다음으로 넘어가자', '넘어가줘', '산문 확정해줘', 'Move on', 'Looks good, proceed'])('"%s"라고 해도 산문 확정 창을 연다', (text) => {
    // 왜: 흔한 넘김 말이 산문 수정 요청으로 가서 1분 잠금 뒤 "바꿀 곳을 찾지 못했어요"만 남았다(검토 지적 7).
    expect(writerChatIntent(text)).toBe('breakdown')
  })

  it('고칠 점을 말한 뒤 넘어가자고 하면 어떻게 이어 붙여도 고칠 점부터 수정안으로 만든다', () => {
    // 왜: "결말 수정하고 다음 단계로 넘어가자"처럼 이어 붙인 말이 확정 창만 열어 고칠 말이 버려졌다(검증 지적 4).
    for (const text of ['결말 수정하고 다음 단계로 넘어가자', '결말을 바꿔서 Artist로 넘겨줘', '결말 고쳐서 다음 단계로 넘어가자', '결말을 고친 뒤 다음 단계로 넘어가자', '결말을 밝게 해주고 다음 단계로 가자', '결말을 바꿔줘. 그리고 다음 단계로 넘어가자', 'Improve the ending and proceed to the next step', 'Polish the ending and proceed to the next step']) {
      expect(writerChatIntent(text), text).toBe('revise')
    }
  })

  it('고칠 게 없다며 넘어가자고 하면 산문 확정 창을 연다', () => {
    // 왜: "고칠" 낱말이 들어 있어도 고칠 게 없다는 말이다(검증 지적 5).
    for (const text of ['고치고 싶은 건 없어, 넘어가자', 'Nothing to fix, move on']) {
      expect(writerChatIntent(text), text).toBe('breakdown')
    }
  })

  it('산문 초안이 없는 예전 프로젝트에서는 "진행해줘" · "Proceed"를 확정 창으로 받지 않는다', () => {
    // 왜: 예전 프로젝트는 "진행해줘"로 승인 카드를 승인하는데, 새 넘김 말이 그보다 먼저 확정 창을 열었다(검증 지적 6).
    for (const text of ['진행해줘', 'Proceed', 'Go ahead']) {
      expect(writerChatIntent(text, { proseDraft: false }), text).not.toBe('breakdown')
    }
    expect(writerChatIntent('Artist로 넘겨줘', { proseDraft: false })).toBe('breakdown')
  })
})
