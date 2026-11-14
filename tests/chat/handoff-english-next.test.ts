// 영어로 "go / move / head to (the) next stage · step"이라고 말해도 다음 단계로 넘기는 말로 읽고, Storyboard 를 대상으로 말해도 넘김 도구가 이동을 허락한다 (리드 2026-11-14 F(1), 오너 "추천대로")
import { describe, expect, it } from 'vitest'
import { matchHandoffIntent } from '@/lib/handoff-intent'
import { workflowPermission } from '@/stores/chat-workflow-bindings'

describe('영어 다음 단계 말', () => {
  // 왜: Artist 에서 "LET'S GO TO NEXT STAGE"가 넘김으로 읽히지 않아 AI 가 "채팅으로는 못 옮긴다"고 답했다(바우처 사용자 채팅 F). 대문자 · 어깨점이 원인이 아니라 go · move 를 몰라서였다.
  it.each([
    "LET'S GO TO NEXT STAGE",
    'MOVE TO NEXT STAGE',
    'go to the next stage',
    'go to next step',
    'Let’s go to the next screen',
    'head to the next stage please',
    'ok, move on to the next stage',
    'yes go to the next stage now',
    'please go on to the next step',
    'move to the next tab.',
  ])('Artist 에서 %s 는 Storyboard 로 넘기는 말이다', (said) => {
    expect(matchHandoffIntent(said, 'artist')?.to).toBe('writer')
  })

  // 왜: 되돌리기 어려운 전이라 말 전체가 넘어가자는 말일 때만 읽는다 — 물음 · 부정 · 뒤에 말이 더 이어지는 꼴은 넘기지 않는다.
  it.each([
    'Can we go to the next stage?',
    'How do I move to the next stage',
    "don't go to the next stage",
    'do not move to the next stage yet',
    'go to the next step of the recipe',
    'I will go to the next stage after lunch',
    'go to the next stage and make the sky bluer first',
    '"go to the next stage" is what the button says',
    'what happens when I go to the next stage',
    'next stage',
    'the next stage looks fun',
    'go home',
  ])('Artist 에서 %s 는 넘기는 말로 읽지 않는다', (said) => {
    expect(matchHandoffIntent(said, 'artist')).toBeNull()
  })

  it('Storyboard 를 대상으로 말한 영어 꼴도 같다', () => {
    // 왜: 다음 단계 이름을 말한 사람도 같은 대접이다. 이름은 화면 이름(Storyboard)이다.
    for (const said of ['go to storyboard', 'move to the Storyboard', 'head to Storyboard please', "let's go to the storyboard"]) {
      expect(matchHandoffIntent(said, 'artist')?.to).toBe('writer')
    }
    expect(matchHandoffIntent('go to the editor', 'artist')).toBeNull()
  })

  it('다른 단계의 넘김도 같은 꼴을 읽는다', () => {
    // 왜: 말 읽기는 단계마다 하나다 — Writer 에서는 Artist, Director 에서는 Editor 로 간다.
    expect(matchHandoffIntent('move to the next step', 'producer')?.to).toBe('artist')
    expect(matchHandoffIntent('go to artist', 'producer')?.to).toBe('artist')
    expect(matchHandoffIntent('go to the next stage', 'director')?.to).toBe('editor')
    expect(matchHandoffIntent('head to the editor', 'director')?.to).toBe('editor')
    // 넘길 곳이 없는 단계(Editor 마지막)는 읽지 않는다.
    expect(matchHandoffIntent('go to the next stage', 'editor')).toBeNull()
  })

  it('지금 읽던 말(한국어 · proceed · 단추 문장)은 그대로 읽는다', () => {
    // 왜: 정상 경로 고정 — 새 꼴을 더해도 예전 꼴이 바뀌지 않는다.
    expect(matchHandoffIntent('Please hand over to Storyboard', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('proceed to the next stage', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('다음 단계로 가자', 'artist')?.to).toBe('writer')
    expect(matchHandoffIntent('스토리보드로 넘겨줘', 'artist')?.to).toBe('writer')
  })
})

describe('넘김 도구가 허락하는 대상 낱말', () => {
  it('Storyboard · 스토리보드를 대상으로 열어 달라는 말이면 writer 대상 이동을 허락한다', () => {
    // 왜: 화면 이름은 Storyboard 인데 도구는 writer/작가만 알아, "go to storyboard"가 허락되지 않았다.
    expect(workflowPermission('go to storyboard', 'open', 'writer')).toBe(true)
    expect(workflowPermission('스토리보드로 가자', 'open', 'writer')).toBe(true)
    expect(workflowPermission('open the Storyboard please', 'open', 'writer')).toBe(true)
    // 지금까지 읽던 낱말(writer · 작가)은 그대로다.
    expect(workflowPermission('go to writer', 'open', 'writer')).toBe(true)
  })

  it('Writer · 작가 · 산문을 대상으로 말해도 산문 화면(producer 대상)을 여는 것을 허락한다', () => {
    // 왜: 화면 이름 Writer 는 도구 id producer 다. 안내대로 고른 대상이 허락에서 막히면 안 된다.
    expect(workflowPermission('go to the Writer screen', 'open', 'producer')).toBe(true)
    expect(workflowPermission('산문 화면 열어줘', 'open', 'producer')).toBe(true)
    expect(workflowPermission('작가로 이동해줘', 'open', 'producer')).toBe(true)
    expect(workflowPermission('go to producer', 'open', 'producer')).toBe(true)
  })

  it('이름만 말했거나 부정 · 질문이면 허락하지 않는다', () => {
    // 왜: 정상 경로 고정 — 도구를 잘못 고른 모델이 사용자 말 없이 화면을 옮기지 못한다.
    expect(workflowPermission('Storyboard is where scenes are', 'open', 'writer')).toBe(false)
    expect(workflowPermission("don't go to storyboard", 'open', 'writer')).toBe(false)
    expect(workflowPermission('how do I go to storyboard?', 'open', 'writer')).toBe(false)
    expect(workflowPermission('go to the next stage', 'open', 'writer')).toBe(false)
  })
})
