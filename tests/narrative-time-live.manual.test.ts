// 이야기 생성이 서사 시점을 실제로 내놓는지 — 진짜 모델을 호출해 검증한다.
//
// 왜 수동 시험인가: 나머지 시험은 프롬프트 문자열과 스키마만 본다. "규격에 적혀 있다"와
//   "모델이 실제로 그 값을 채운다"는 다른 문제다. 2026-08-28 실측에서 저장·선택 규칙을 다
//   만들고도 프롬프트에 요구를 안 넣은 채로 통과하던 구멍이 있었다.
//
// 비용: 텍스트 모델 2콜(구조 1 + 씬 1). 이미지·영상 호출은 없다.
//
// 실행: RUN_LIVE_TESTS=1 pnpm vitest run tests/narrative-time-live.manual.test.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Characters, Genre, PipelineInput } from '@/lib/writer/types/pipeline'

const LIVE = process.env.RUN_LIVE_TESTS === '1'

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

// 회상이 반드시 들어가야 하는 시드 — 현재와 과거가 함께 있어야 세 값이 갈린다.
const STORY =
  '노년의 마리는 오래된 편지함에서 빛바랜 사진을 꺼낸다. ' +
  '사진 속에는 스무 살의 마리가 부두에서 누군가를 배웅하고 있다. ' +
  '그 시절 마리는 매일 그 부두에서 돌아오지 않는 배를 기다렸다. ' +
  '다시 현재로 돌아와, 마리는 사진을 접어 편지와 함께 우체통에 넣는다.'

const GENRE: Genre = {
  genre: 'drama',
  subGenre: 'melodrama',
  tone: ['wistful'],
  targetEmotion: ['그리움'],
  runtime_seconds: 60,
  depth_level: 'D3',
  format: 'horizontal_16:9',
}

const CAST: Characters = {
  characters: [
    {
      id: 'marie',
      name: '마리',
      role: 'protagonist',
      personality: ['조용함'],
      arc: { start_state: '그리움', end_state: '작별', arc_type: 'acceptance' },
      appearance_description: '노년의 여성',
      motivation: { want: '작별', need: '수용' },
    },
  ],
  relationships: [],
  subtext_notes: [],
}

describe.skipIf(!LIVE)('이야기 생성이 서사 시점을 채운다 — 실제 모델', () => {
  it(
    '회상이 있는 스토리에서 씬마다 present/past/future 중 하나가 나온다',
    async () => {
      loadEnv()
      const { runNarrativeStructure } = await import('@/lib/writer/pipeline/stages/s1_structure')
      const { runScenes } = await import('@/lib/writer/pipeline/stages/s3_scenes')
      const { resolveModels } = await import('@/lib/writer/pipeline')
      const { PipelineLogger } = await import('@/lib/writer/logger')

      const input: PipelineInput = {
        story: STORY,
        outputLocale: 'ko',
        runtimeSeconds: 60,
        sceneGate: false,
      }
      const logger = new PipelineLogger('narrative-time-live')
      await logger.init()
      const models = resolveModels(input)

      const structure = await runNarrativeStructure(input, GENRE, logger, models.S, null)
      const scenes = await runScenes(input, GENRE, structure, CAST, undefined, logger, models.S)

      expect(scenes.scenes.length).toBeGreaterThan(0)

      const times = scenes.scenes.map((s) => (s as { narrative_time?: string }).narrative_time)
      console.log(
        '씬별 서사 시점:',
        scenes.scenes.map((s, i) => `${i + 1}:${(s as { narrative_time?: string }).narrative_time}`).join(' '),
      )

      // 값이 전부 허용된 셋 중 하나여야 한다 — 스키마가 이걸 강제하지만 실산출로 재확인한다.
      for (const t of times) {
        expect(['present', 'past', 'future']).toContain(t)
      }

      // 회상이 명시된 시드다 — 과거가 최소 하나는 나와야 값이 장식이 아니다.
      expect(times, `과거 씬이 하나도 없다: ${times.join(', ')}`).toContain('past')
      // 현재도 있어야 한다(마지막이 현재로 돌아오는 시드)
      expect(times).toContain('present')
    },
    240_000,
  )
})
