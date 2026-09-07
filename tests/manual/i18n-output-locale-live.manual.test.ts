import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// #i18n-s5 출력 언어 강제 라이브 실측 (수동 게이트 — **실제 LLM 2콜 과금**, CI 항상 skip):
//   RUN_I18N_OUTPUT_LIVE=1 pnpm vitest run tests/i18n-output-locale-live.manual.test.ts
//
// 검증 대상: 같은 **한국어 스토리** 입력에서 outputLocale 만 바꿔 실제 스테이지(s0 드라마투르그,
//   제품 함수 그대로)를 호출 — en 이면 산출 자유서술이 전부 영어, ko 면 한국어인지 실측한다.
//   풀런 E2E 대신 스테이지 단위인 이유: 강제의 실효(지시→산출 언어)는 여기서 증명되고,
//   배선(start→input→스테이지)은 유닛(output-language.test.ts)과 타입이 커버한다 — 비용 최소화.

const LIVE = process.env.RUN_I18N_OUTPUT_LIVE === '1'

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const KOREAN_STORY =
  '늦은 밤 편의점에서 일하는 수민은 매일 같은 시간에 우유 하나만 사 가는 노인이 궁금하다. ' +
  '어느 날 노인이 오지 않자 수민은 가게를 나서 골목을 헤매고, 낡은 대문 앞에서 쓰러진 노인을 발견한다. ' +
  '구급차를 기다리는 동안 노인은 수민의 손을 잡고 오래된 사진 한 장을 쥐여 준다.'

const hasKorean = (s: string) => /[가-힣]/.test(s)

describe.runIf(LIVE)('출력 언어 강제 — s0 실측 (한국어 스토리 고정, locale 만 변경)', () => {
  it(
    'outputLocale=en → 산출 자유서술 전부 영어 / ko → 한국어',
    async () => {
      loadEnv()
      const { runDramaturgy } = await import('@/lib/writer/pipeline/stages/s0_dramaturgy')
      const { PipelineLogger } = await import('@/lib/writer/logger')
      const { DEFAULT_MODELS } = await import('@/lib/writer/llm/dispatch')

      const genre = {
        genre: 'drama',
        tone: ['warm'],
        targetEmotion: ['따뜻함'],
        runtime_seconds: 30,
        depth_level: 'D1' as const,
        format: 'horizontal_16:9',
      }
      const characters = { characters: [], relationships: [], subtext_notes: [] }
      const logger = new PipelineLogger('i18n-output-live-test')
      const base = { story: KOREAN_STORY, sceneGate: false }

      const [en, ko] = await Promise.all([
        runDramaturgy({ ...base, outputLocale: 'en' }, genre, characters, logger, DEFAULT_MODELS.S),
        runDramaturgy({ ...base, outputLocale: 'ko' }, genre, characters, logger, DEFAULT_MODELS.S),
      ])

      // en: 유저 노출 자유서술(name/description/scene_potential/core_engine)에 한글 0
      expect(en.world_inventory.length).toBeGreaterThan(0)
      const enTexts = [
        en.core_engine,
        ...en.world_inventory.flatMap((c) => [c.name, c.description, ...c.scene_potential]),
      ]
      const enLeaks = enTexts.filter(hasKorean)
      expect(enLeaks, `en 산출에 한글 유출: ${enLeaks.slice(0, 3).join(' | ')}`).toEqual([])

      // ko: 같은 스토리·같은 스테이지에서 한국어 산출 유지 (회귀 확인)
      expect(ko.world_inventory.length).toBeGreaterThan(0)
      const koTexts = [
        ko.core_engine,
        ...ko.world_inventory.flatMap((c) => [c.name, c.description, ...c.scene_potential]),
      ]
      expect(koTexts.some(hasKorean), 'ko 산출에 한국어가 없음').toBe(true)

      console.log('[i18n-live] en 예시:', en.world_inventory[0]?.name, '—', en.world_inventory[0]?.description?.slice(0, 80))
      console.log('[i18n-live] ko 예시:', ko.world_inventory[0]?.name, '—', ko.world_inventory[0]?.description?.slice(0, 80))
    },
    300_000,
  )
})
