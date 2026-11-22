// 원작 그대로(대본 보존) 프로젝트의 콘티 채팅은 사용자가 짚은 줄 · 새로 준 글만 고치고 대사를 통째로 새로 쓰지 않도록 지시받는지 검사한다 (D15 오너 2026-11-22 · 리드 나누기)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { preservedScriptChatDirective } from '@/lib/writer/preserved-run'

describe('원작 그대로 프로젝트의 콘티 채팅', () => {
  it('원작 그대로면 콘티 채팅은 사용자가 짚은 줄 · 새로 준 글만 고치고 대사를 통째로 새로 쓰지 않는다', () => {
    // 왜: D15 — [대사 다시 생성]을 막아도 채팅에 "대사 다시 써줘"라고 하면 AI 가 대사를 통째로 새로 쓸 수 있다. 원작 대사를 지킨다.
    const directive = preservedScriptChatDirective(true)
    expect(directive).toContain('사용자가 짚은 줄 · 새로 준 글만 고친다')
    expect(directive).toContain('대사를 통째로 새로 쓰지 않는다')
    // 콘티 채팅 지시문에 실린다 — 판별은 [대사 다시 생성] 막기와 같은 함수(lib/writer/preserved-run).
    const route = readFileSync('src/app/api/writer/chat/route.ts', 'utf8')
    expect(route).toMatch(/preservedScriptChatDirective\(isPreservedScriptRun\(/)
  })

  it('원작 그대로가 아니면 콘티 채팅 지시문에 그 지시가 없다', () => {
    // 왜: 정상 경로 고정 — 원작 그대로가 아닌 작품은 지금처럼 채팅으로 대사를 새로 쓸 수 있다.
    expect(preservedScriptChatDirective(false)).toBe('')
  })
})
