// 대본 그대로 쓰기(그대로 영상화)에서는 영상 길이를 정하지 않아도 넘기고, Writer 는 대본 길이대로 만든다 (2026-10-09 오너 "영상 길이 제한을 없애줘")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateProducerGate } from '@/lib/producer-gate'
import { preserveRuntime } from '@/app/api/writer/start/preserve-flag'
import { preservedRuntimeSeconds } from '@/lib/writer/script/preserve'
import { depthLevelFromRuntime } from '@/lib/depth'
import { staleDraftFields } from '@/lib/writer/treatment-draft'
import { runtimeSettingLabel, writerRuntimeSeconds } from '@/lib/producer/runtime'
import type { ProjectSettings } from '@/types'

// 이 시험을 위해 새로 지은 대본 — 실제 작품의 글이 아니다.
const scene = (n: number) => `S#${n}. 골목 ${n} - 밤\n남자가 걸어간다.\n남자: ${n}번째 골목이다.\n\n소녀가 뒤따른다.\n소녀: 기다려.`
const SHORT = [scene(1), scene(2)].join('\n\n')
const LONG = Array.from({ length: 40 }, (_, i) => scene(i + 1)).join('\n\n')

const settings = (over: Partial<ProjectSettings> = {}): ProjectSettings =>
  ({ playtime: 0, genre: 'drama', subGenre: '', format: 'horizontal_16:9', tone: [], targetEmotion: [], dialogueLanguage: 'ko', ...over }) as ProjectSettings
const gateOf = (preserveScript: boolean | null, playtime = 0) =>
  evaluateProducerGate({ settings: settings({ playtime }), storyReady: true, cast: [], backgrounds: [], styleAnchorKey: 'custom_x', preserveScript, locale: 'ko' })

describe('대본 그대로 쓰기의 영상 길이', () => {
  it('대본 그대로 쓰기에서는 영상 길이를 정하지 않아도 Writer로 넘길 수 있다', () => {
    // 왜: 그대로 영상화는 원작 길이가 곧 영상 길이다 — 5분 같은 설정이 넘김을 막을 이유가 없다.
    expect(gateOf(true).hardMissing.map((i) => i.field)).not.toContain('playtime')
    // 각색하는 이야기는 종전대로 길이가 있어야 넘긴다.
    expect(gateOf(null).hardMissing.map((i) => i.field)).toContain('playtime')
    expect(gateOf(false).hardMissing.map((i) => i.field)).toContain('playtime')
  })

  it('대본 그대로 쓰기에서는 Writer가 설정한 영상 길이가 아니라 대본 길이대로 만든다', () => {
    // 왜: 칸 · 대사를 빠짐없이 옮기려면 길이 예산이 설정값(예: 5분)에 묶이면 안 된다.
    const estimate = preservedRuntimeSeconds(LONG)
    expect(estimate).toBeGreaterThan(300)
    const out = preserveRuntime({
      preserveScript: true,
      story: LONG,
      runtimeSeconds: 300,
      genre: { genre: 'drama', runtime_seconds: 300, depth_level: 'D3' } as never,
    })
    expect(out.runtimeSeconds).toBeUndefined()
    expect(out.genre).toMatchObject({ runtime_seconds: estimate, depth_level: depthLevelFromRuntime(estimate!) })
  })

  it('각색하는 이야기는 종전대로 설정한 영상 길이를 쓴다', () => {
    const genre = { genre: 'drama', runtime_seconds: 300, depth_level: 'D3' } as never
    expect(preserveRuntime({ preserveScript: false, story: SHORT, runtimeSeconds: 300, genre })).toEqual({ runtimeSeconds: 300, genre })
  })

  it('대본 그대로 쓰기에서는 영상 길이 설정을 바꿔도 트리트먼트 초안이 낡았다고 하지 않는다', () => {
    // 왜: 대본 그대로 쓰기는 영상 길이를 쓰지 않는다 — 길이 칸을 만졌다고 다시 쓰게 하면 헛걸음이다.
    const basis = { storyHash: 'x', runtimeSeconds: null, preserveScript: true }
    expect(staleDraftFields(basis, { storyText: 'y', playtime: 300, preserveScript: true })).not.toContain('runtime')
    expect(staleDraftFields({ ...basis, runtimeSeconds: 300, preserveScript: false }, { storyText: 'y', playtime: 600, preserveScript: false })).toContain('runtime')
  })

  it('Writer로 넘길 때 대본 그대로 쓰기면 영상 길이를 보내지 않는다', () => {
    expect(writerRuntimeSeconds(300, true)).toBeUndefined()
    expect(writerRuntimeSeconds(300, false)).toBe(300)
    expect(writerRuntimeSeconds(0, false)).toBeUndefined()
    const store = readFileSync('src/stores/producer-store.ts', 'utf8')
    expect(store.match(/writerRuntimeSeconds\(/g)?.length).toBe(2)
  })

  it('대본 그대로 쓰기에서는 영상 길이 칸에 원작 길이대로라고 보인다', () => {
    expect(runtimeSettingLabel('ko', 300, true)).toBe('원작 길이대로')
    expect(runtimeSettingLabel('ko', 300, false)).toBe('300초')
    expect(runtimeSettingLabel('ko', 0, false)).toBeNull()
    expect(readFileSync('src/features/producer/quest-journal.tsx', 'utf8')).toMatch(/runtimeSettingLabel\(/)
  })
})
