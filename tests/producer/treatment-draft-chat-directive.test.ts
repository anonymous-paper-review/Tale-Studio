// 넘기기 전 트리트먼트 초안이 있으면 Producer 채팅은 씬 고치기를 다시 쓰기로 안내한다 (2026-10-02 오너 · 시안 v04, 검토 지적)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { treatmentDraftDirective } from '@/app/api/produce/chat/preserve-context'

describe('트리트먼트 초안과 Producer 채팅', () => {
  it('트리트먼트 초안이 있으면 채팅이 씬 · 사건 · 문장 고치기를 다시 쓰기와 직접 고치기로 안내하고 이야기 글을 바꾸지 않게 한다', () => {
    // 왜: 넘기기 전에는 채팅이 Producer 상담으로 남는다 — 트리트먼트를 고쳐 달라는 말을 모델이 이야기 글 수정으로 처리하면 트리트먼트와 어긋난다.
    const directive = treatmentDraftDirective(true)!
    expect(directive).toContain('Rewrite')
    expect(directive).toContain('Edit manually')
    expect(directive).toMatch(/story text/i)
  })

  it('트리트먼트 초안이 없으면 아무 안내도 붙이지 않는다', () => {
    expect(treatmentDraftDirective(false)).toBeNull()
    expect(treatmentDraftDirective(undefined)).toBeNull()
  })

  it('Producer 채팅 요청에 트리트먼트 초안 안내가 실린다', () => {
    const route = readFileSync('src/app/api/produce/chat/route.ts', 'utf8')
    expect(route).toMatch(/treatmentDraftDirective\(treatmentDraft\)/)
  })
})
