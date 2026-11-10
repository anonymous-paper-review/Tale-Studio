// 시작 화면이 그림 읽기를 "다음 버전"이라 하지 않고, 시작한 뒤 Writer 채팅에 그림을 올리라고 알리는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KO } from '@/lib/i18n/messages-ko'

/** 오너가 고른 문장(2026-11-10 결정 3, 추천안). */
const OWNER_SENTENCE = '시작한 뒤 Writer 채팅에 그림을 올려 주세요'

describe('시작 화면의 그림 안내', () => {
  // 왜: 오너 2026-11-10 결정 3 — 시작 화면은 그림을 "다음 버전"이라고만 해서, 시작한 뒤 Writer 채팅에서 그림을 쓸 수 있다는 걸 알기 어려웠다.
  //   파일 칸 아래 안내와 글자 없는 그림 창 두 곳이 같은 말을 한다(혼자 정한 것: 두 곳 모두).
  it('시작 화면은 그림 읽기를 다음 버전이라 하지 않고 시작한 뒤 Writer 채팅에 그림을 올리라고 알린다', () => {
    const screen = readFileSync('src/features/entry/entry-workspace.tsx', 'utf8')
    expect(screen).not.toMatch(/later version/)
    const keys = [...screen.matchAll(/t\((['"])((?:(?!\1).)*Writer chat after you start(?:(?!\1).)*)\1\)/g)].map((m) => m[2])
    expect(keys).toHaveLength(2)
    for (const key of keys) expect(KO[key]).toContain(OWNER_SENTENCE)
  })
})
