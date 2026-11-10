// 길이를 골랐으면 저장 때 늘린 샷 길이 합이 고른 길이를 넘을 때 넘는 초만 깎아 고른 길이 안에 맞춘다(오너 2026-11-10 ③ — 모든 길이 구간 안전망)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fitShotDurationsToRuntime } from '@/lib/writer/pipeline/util/duration_reallocation'

// 이 시험을 위해 지은 샷 — 저장 때 늘린 뒤의 길이(초)만 본다.
const shot = (id: string, seconds: number, extra: Record<string, unknown> = {}) => ({ shot_id: id, duration_seconds: seconds, S: { scene_id: 'scene_1' }, ...extra })
/** 한국어 18자 = 말하는 시간 4초 → 바닥 5초(4 + 0.5 올림). */
const SPEECH_4S = '가'.repeat(18)
const lines = (entries: Array<[string, string]>) =>
  new Map(entries.map(([id, text]) => [id, { shot_id: id, dialogue: [{ character_id: 'minho', line: text }], narration: null }]))
const fit = (shots: ReturnType<typeof shot>[], cap: number | null, dialogue = lines([])) =>
  fitShotDurationsToRuntime(shots as never, dialogue as never, cap)
const seconds = (result: { shots: Array<{ duration_seconds?: number }> }) => result.shots.map((s) => s.duration_seconds)
const total = (result: { shots: Array<{ duration_seconds?: number }> }) => seconds(result).reduce((a: number, b) => a + (b ?? 0), 0)

describe('고른 길이 맞춤 — 저장 단계 안전망', () => {
  // 왜: 오너 ③ — 산문 · 샷 나누기를 맞춰도 저장 때 동작 · 대사 시간으로 늘어나 넘는 몇 초는 여기서 깎는다. 60초 이상에도 같은 안전망이다.
  it('길이를 골랐고 저장 때 늘린 샷 길이 합이 고른 길이를 넘으면 넘는 초만 깎아 고른 길이에 맞춘다', () => {
    expect(total(fit([shot('a', 6), shot('b', 6), shot('c', 5), shot('d', 4)], 15))).toBe(15)
    expect(total(fit(Array.from({ length: 8 }, (_, i) => shot(`s${i}`, 8)), 60))).toBe(60)
  })

  // 왜: 정상 경로 고정 — 고른 길이 안이면 8/31 규칙이 정한 길이를 그대로 둔다.
  it('길이를 골랐어도 늘린 샷 길이 합이 고른 길이 안이면 샷 길이를 그대로 둔다', () => {
    const shots = [shot('a', 5), shot('b', 5), shot('c', 5)]
    const result = fit(shots, 15)
    expect(result.changed).toEqual([])
    expect(result.shots[0]).toBe(shots[0])
  })

  // 왜: 대본 그대로는 길이를 고르지 않는다(길이 = 원작) — 깎을 기준이 없다.
  it('길이를 고르지 않았으면(대본 그대로) 저장 때 샷 길이를 깎지 않는다', () => {
    const result = fit([shot('a', 9), shot('b', 9)], null)
    expect(seconds(result)).toEqual([9, 9])
  })

  // 왜: 8/31 보정의 바닥 — 2초보다 짧은 샷은 무엇이 보였는지 읽을 틈이 없다.
  it('깎을 때 샷마다 2초 아래로는 깎지 않는다', () => {
    const result = fit([shot('a', 9), shot('b', 2), shot('c', 2)], 6)
    expect(seconds(result)).toEqual([2, 2, 2])
  })

  // 왜: 대사가 샷보다 길면 말이 다음 샷으로 넘쳐 그림과 소리가 어긋난다 — 말할 시간은 깎지 않는다.
  it('깎을 때 대사가 있는 샷은 말할 시간 + 0.5초 아래로 깎지 않는다', () => {
    const result = fit([shot('a', 7), shot('b', 3)], 7, lines([['a', SPEECH_4S]]))
    expect(seconds(result)).toEqual([5, 2])
  })

  // 왜: 넘는 몇 초를 한 샷에 몰지 않고, 늘어난 여유가 큰 샷부터 덜어 내야 8/31 규칙을 가장 적게 어긴다.
  it('깎을 때는 여유(바닥보다 긴 초)가 가장 큰 샷부터 1초씩 깎는다', () => {
    const result = fit([shot('a', 8), shot('b', 4), shot('c', 3)], 13)
    expect(seconds(result)).toEqual([6, 4, 3])
  })

  // 왜: 롱테이크는 일부러 길게 잡은 샷이라 8/31 규칙도 줄이지 않는다 — 다른 샷으로 맞출 수 없을 때만 깎는다.
  it('깎을 때 롱테이크로 표시된 샷은 다른 샷을 바닥까지 깎은 뒤에만 깎는다', () => {
    const shots = [shot('a', 9, { pacing_intent: 'long_take' }), shot('b', 5), shot('c', 5)]
    expect(seconds(fit(shots, 13))).toEqual([9, 2, 2])
    expect(seconds(fit(shots, 10))).toEqual([6, 2, 2])
  })

  // 왜: 대사가 고른 길이보다 많은 드문 경우 — 말을 자르면 소리가 어긋나니 바닥까지만 깎고 그만큼은 넘긴다.
  it('바닥과 대사만으로도 고른 길이를 넘으면 바닥까지만 깎고 그만큼은 넘는다', () => {
    const result = fit([shot('a', 5), shot('b', 5), shot('c', 4)], 10, lines([['a', SPEECH_4S], ['b', SPEECH_4S]]))
    expect(seconds(result)).toEqual([5, 5, 2])
  })

  // 왜: 파이프라인의 저장 단계가 실제로 고른 길이를 넘기고, 저장이 늘린 뒤에 안전망을 걸어야 위 규칙이 돈다(배선).
  it('Writer 파이프라인의 저장 단계는 고른 길이를 저장에 넘기고, 저장은 샷 길이를 늘린 뒤에 안전망을 건다', () => {
    expect(readFileSync('src/lib/writer/pipeline/steps.ts', 'utf8')).toContain(
      'persistShotsToDb(projectId, s.shotSequence!, s.dialogue ?? null, { runtimeCapSeconds: runtimeFitCap(s.input) })',
    )
    expect(readFileSync('src/lib/writer/pipeline/util/persist_manifest.ts', 'utf8')).toContain(
      'fitShotDurationsToRuntime(realloc.shots, dialogueByShotId, opts?.runtimeCapSeconds ?? null)',
    )
  })
})
