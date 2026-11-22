// Artist 채팅에서 콘티로 넘겨 달라는 말을 새 이름(콘티 · Writer)과 옛 이름(스토리보드) 모두로 알아듣는지 검사한다 (D1 오너 2026-11-22)
import { describe, expect, it } from 'vitest'
import { handoffFrom, matchHandoffIntent } from '@/lib/handoff-intent'
import { translate } from '@/lib/i18n/translate'
import { workflowPermission } from '@/stores/chat-workflow-bindings'

describe('콘티로 넘겨 달라는 말', () => {
  it('Artist 채팅에서 "콘티로 넘겨줘" · "conti" 라고 해도 콘티로 넘기는 말로 알아듣는다', () => {
    // 왜(혼자 정한 것 o): D1 — 화면 이름이 콘티가 됐다. 새 이름으로 말하면 못 알아듣고 AI 가 "채팅으로는 못 옮긴다"고 답한다.
    expect(matchHandoffIntent('콘티로 넘겨줘', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('이제 콘티로 이동하자', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('go to conti', 'artist')?.to).toBe('writer')
  })

  it('Artist 채팅에서 "Writer로 넘겨줘"라고 해도 콘티로 넘기는 말로 알아듣는다', () => {
    // 왜(혼자 정한 것 o): 레일에서 콘티는 Writer 칸 안에 있다 — Artist 다음은 Writer 의 콘티다.
    expect(matchHandoffIntent('Writer로 넘겨줘', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('go to writer', 'artist')?.to).toBe('writer')
  })

  it('옛 이름 "스토리보드로 넘겨줘" · "Storyboard" 도 그대로 콘티로 넘기는 말이다', () => {
    // 왜: 이미 쓰던 말버릇 · 옛 채팅 기록의 단추 문장이 갑자기 안 먹으면 안 된다(정상 경로 고정).
    expect(matchHandoffIntent('스토리보드로 넘겨줘', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('Hand over to Storyboard', 'artist')?.to).toBe('writer')
  })

  it('한국어 화면의 넘김 단추 문장("콘티로 넘겨주세요")을 그대로 보내도 콘티로 넘긴다', () => {
    // 왜: 단추 = 그 문장을 타이핑한 것(#handoff-to-chat) — 단추 말이 콘티로 바뀌어도 같은 넘김으로 읽어야 한다.
    const spec = handoffFrom('artist')!
    expect(translate('ko', spec.utterance)).toBe('콘티로 넘겨주세요')
    expect(matchHandoffIntent(translate('ko', spec.utterance), 'artist')).toEqual(spec)
  })

  it('넘김 도구도 콘티 · conti 를 콘티 화면(writer 대상)을 여는 말로 허락한다', () => {
    // 왜(혼자 정한 것 o): AI 가 화면을 여는 도구를 고를 때 사용자 말에 콘티가 있으면 허락돼야 한다 — 이름 바꾼 뒤 막히지 않게.
    expect(workflowPermission('콘티로 가자', 'open', 'writer')).toBe(true)
    expect(workflowPermission('open the conti please', 'open', 'writer')).toBe(true)
    expect(workflowPermission('콘티는 어디서 봐?', 'open', 'writer')).toBe(false)
  })

  it('다른 단계에서는 콘티 · Writer 를 말해도 바로 옆 단계가 아니면 넘기지 않는다', () => {
    // 왜: 정상 경로 고정 — Director 에서 "콘티로 넘겨줘"는 뒤로 가는 말이라 넘김이 아니다(바로 다음 단계만 넘긴다).
    expect(matchHandoffIntent('콘티로 넘겨줘', 'director')).toBeNull()
    expect(matchHandoffIntent('writer로 넘겨줘', 'director')).toBeNull()
  })
})
