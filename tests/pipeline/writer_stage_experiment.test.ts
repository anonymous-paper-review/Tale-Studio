// writer 단계 실험 하네스 — 실 stage 함수를 gemini-3-flash로 직접 호출(#length-experiment 2026-07-21).
//
// 목적: 길이 양극화(숏폼 vs 장편) 입력이 writer 산출물을 어떻게 바꾸는지 실측.
//   실 runNarrativeStructure/runScenes를 그대로 부르므로 **시스템 프롬프트는 코드와 100% 동일**하다
//   (프롬프트가 함수 안에서 조립됨 — 재구현 없음). generateJson→gemini 실 호출.
//   프롬프트·결과·latency는 raw_collector(gemini.ts가 기록)에서 회수해 logs/writer-stage-exp/에 저장.
//
// ⚠️ 실 유료 호출. 게이트:
//   RUN_WRITER_STAGE=1 GEMINI_API_KEY=… \
//   WRITER_INPUT=shorts|ad|feature  WRITER_STAGES=narrativeStructure,scenes \
//   [WRITER_MODEL=gemini-3-flash-preview] [WRITER_PROVIDER=gemini] \
//   npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure'
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import { getPendingRawCalls, resetRawSeq } from '@/lib/writer/llm/raw_collector'
import type { PipelineLogger } from '@/lib/writer/logger'
import type { Genre, Characters, BackgroundContract, PipelineInput } from '@/lib/writer/types/pipeline'

const ENABLED = process.env.RUN_WRITER_STAGE === '1' && !!process.env.GEMINI_API_KEY
const MODEL = { provider: process.env.WRITER_PROVIDER ?? 'gemini', model: process.env.WRITER_MODEL ?? 'gemini-3-flash-preview' }
const INPUT_KEY = process.env.WRITER_INPUT ?? 'shorts'
const STAGES = (process.env.WRITER_STAGES ?? 'narrativeStructure,scenes').split(',').map((s) => s.trim()).filter(Boolean)
const OUT_DIR = path.join(process.cwd(), 'logs', 'writer-stage-exp')

const logger = {
  markStage: async () => {}, saveStage: async () => {}, saveLlmCall: async () => {},
  flushRawLlm: async () => {}, loadStage: async () => null,
} as unknown as PipelineLogger

// ── 캐릭터/월드 헬퍼 (Characters/BackgroundContract 최소 유효 형태) ──
const ch = (id: string, name: string, role: string, appearance: string) => ({ id, name, role, appearance_description: appearance })
const cast = (...characters: ReturnType<typeof ch>[]): Characters => ({ characters, relationships: [], subtext_notes: [] } as unknown as Characters)
const loc = (id: string, name: string, description: string) => ({ id, name, description })
const world = (setting: string, ...locations: ReturnType<typeof loc>[]): BackgroundContract => ({ locations, setting } as BackgroundContract)

type Preset = { label: string; input: PipelineInput; characters: Characters; world: BackgroundContract }

// ── 길이 양극화 프리셋 (실 DB 입력 포맷·톤 모방) ──
const PRESETS: Record<string, Preset> = {
  // 극단적 짧음 — 숏폼/훅. runtime 15s, D1(구조 없음, 한 비트), 세로.
  shorts: {
    label: '숏폼 훅 (15s · D1 · 9:16)',
    input: {
      story: '지하철에서 꾸벅꾸벅 조는 직장인. 이어폰에서 흘러나온 광고 한 줄에 눈이 번쩍 뜨인다. 화면 가득 파랗게 빛나는 에너지드링크 캔이 번쩍이고, 그는 자리를 박차고 일어나 닫히는 문틈으로 뛰어나간다.',
      genre: { genre: 'advertisement', subGenre: 'product_hook', tone: ['energetic', 'punchy'], targetEmotion: [], runtime_seconds: 15, depth_level: 'D1', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(ch('char', '직장인', 'protagonist', '20대 후반, 정장에 넥타이가 살짝 풀린 피곤한 얼굴')),
    world: world('출근길 지하철', loc('location', '지하철 객실', '아침 러시아워, 사람들로 붐비는 지하철 객실. 창밖으로 터널 불빛이 스친다')),
  },
  // 짧은 광고 — 브랜드 필름. runtime 30s, D2(미니 구조), 세로.
  ad: {
    label: '브랜드 광고 (30s · D2 · 9:16)',
    input: {
      story: '새 러닝화를 신은 러너가 아직 어두운 새벽 도시를 가른다. 숨이 턱까지 차오르는 순간, 신발 밑창이 은은히 빛나며 그를 한 발 더 멀리 밀어준다. 골목을 빠져나오자 강변 끝에서 해가 떠오르고, 그는 결승선 대신 그 빛을 향해 달린다.',
      genre: { genre: 'advertisement', subGenre: 'brand_film', tone: ['inspiring', 'cinematic'], targetEmotion: [], runtime_seconds: 30, depth_level: 'D2', format: 'vertical_9:16' } as Genre,
    },
    characters: cast(ch('char', '러너', 'protagonist', '30대, 땀에 젖은 운동복 차림의 단단한 인상')),
    world: world('새벽 도시', loc('location', '새벽 도심 골목', '가로등만 켜진 어둑한 새벽 도시 골목, 물기 젖은 아스팔트'), loc('location_2', '강변 산책로', '해 뜨기 직전의 강변, 지평선이 붉게 물들기 시작한다')),
  },
  // 극단적 긺 — 장편영화. runtime 6000s(100분), D7(다층+서브플롯 다수), 시네마.
  feature: {
    label: '장편 서사극 (6000s=100분 · D7 · 2.39:1)',
    input: {
      story: '몰락한 항구 도시. 삼대에 걸친 어부 가문이 바다와 자본, 그리고 서로를 상대로 싸운다. 노쇠한 선장 할아버지는 사라진 큰아들의 배를 아직도 기다리고, 둘째 아들은 도시를 삼키려는 개발업자와 손잡는다. 손녀는 가문의 비밀 장부에서 삼십 년 전 형제를 갈라놓은 살인의 흔적을 발견한다. 폭풍이 오는 밤, 셋은 낡은 등대에서 마주치고, 각자가 숨겨온 진실이 파도처럼 밀려든다. 개발업자의 부하들이 부두를 봉쇄하고, 도시의 마지막 목선이 불타오른다.',
      genre: { genre: 'drama', subGenre: 'epic_family_saga', tone: ['melancholic', 'tense', 'elegiac'], targetEmotion: [], runtime_seconds: 6000, depth_level: 'D7', format: 'cinema_2.39:1' } as Genre,
    },
    characters: cast(
      ch('grandfather', '선장 할아버지', 'protagonist', '70대, 소금기에 갈라진 얼굴과 형형한 눈빛의 노선장'),
      ch('second_son', '둘째 아들', 'antagonist', '50대, 값비싼 코트를 걸쳤지만 손은 여전히 어부의 손'),
      ch('granddaughter', '손녀', 'protagonist', '20대, 도시를 떠났다 돌아온 냉철한 인상의 여성'),
      ch('developer', '개발업자', 'antagonist', '60대, 늘 웃지만 눈은 웃지 않는 정장의 남자'),
      ch('lost_son', '사라진 큰아들', 'supporting', '실종 당시 30대, 사진 속에만 남은 형형한 눈빛'),
      ch('harbor_master', '항만 관리인', 'supporting', '40대, 가문과 개발업자 사이에서 저울질하는 중년'),
    ),
    world: world('몰락한 항구 도시',
      loc('harbor', '낡은 부두', '녹슨 크레인과 부서진 목선이 늘어선 몰락한 항구, 안개가 자주 낀다'),
      loc('lighthouse', '오래된 등대', '도시가 내려다보이는 절벽 위 낡은 등대, 삼대의 비밀이 얽힌 장소'),
      loc('mansion', '가문의 저택', '한때 화려했으나 이제 빛바랜 어부 가문의 저택'),
      loc('developer_office', '개발업자 사무실', '항구가 내려다보이는 고층 유리 사무실'),
      loc('old_market', '수산 시장', '새벽마다 경매가 열리던, 이제는 반쯤 비어버린 어시장'),
    ),
  },
  // 구조유형 프로브 — 명백히 기승전결(갈등 없음, 대비/전환) 콘텐츠. depth는 평범한 D3.
  kishoten: {
    label: '기승전결 프로브 (D3 · 갈등 없음)',
    input: {
      story: '할머니가 매일 아침 골목의 낡은 화분들에 물을 준다. 어느 날, 화분 하나에 처음 보는 작은 새가 앉아 있다. 할머니는 물뿌리개를 조용히 내려놓고 가만히 새를 바라본다. 한참 뒤 새가 포르르 날아가고, 할머니는 다시 천천히 물을 준다. 그날따라 골목이 조금 더 환해 보인다. 갈등도, 악당도, 해결할 문제도 없다.',
      genre: { genre: 'drama', subGenre: 'slice_of_life', tone: ['calm', 'gentle'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(ch('char', '할머니', 'protagonist', '70대, 낡은 카디건에 물뿌리개를 든 온화한 인상')),
    world: world('오래된 골목', loc('location', '오래된 주택가 골목', '화분이 늘어선 좁고 낡은 골목, 아침 햇살이 비스듬히 든다')),
  },
  // 구조유형 프로브 — 명백히 순환(타임루프). depth는 평범한 D3.
  loop: {
    label: '순환구조 프로브 (D3 · 타임루프)',
    input: {
      story: '남자는 같은 월요일 아침을 끝없이 반복해서 산다. 알람, 식은 커피, 놓친 지하철 — 매 회차가 완전히 똑같다. 그러다 어느 회차, 창밖 간판의 글자 하나가 지난번과 미묘하게 달라진 걸 알아챈다. 다시 눈을 뜬 그는 이번엔 지하철 대신 그 간판을 향해 걷기 시작하고, 아침은 또다시 처음으로 되감긴다.',
      genre: { genre: 'sci-fi', subGenre: 'time_loop', tone: ['eerie', 'contemplative'], targetEmotion: [], runtime_seconds: 90, depth_level: 'D3', format: 'horizontal_16:9' } as Genre,
    },
    characters: cast(ch('char', '남자', 'protagonist', '30대, 늘 같은 회색 셔츠를 입은 무표정한 남자')),
    world: world('반복되는 월요일', loc('location', '원룸', '알람 시계와 식은 커피가 놓인 좁은 원룸'), loc('location_2', '지하철역 앞', '출근길 인파로 붐비는 지하철역 입구, 건너편에 큰 간판이 보인다')),
  },
}

// ── stage 레지스트리 (실 함수 호출 — 시스템 프롬프트는 코드 그대로) ──
type State = { genre: Genre; narrativeStructure?: unknown; scenes?: unknown }
const STAGE_FNS: Record<string, (st: State, p: Preset) => Promise<unknown>> = {
  narrativeStructure: (st, p) => runNarrativeStructure(p.input, st.genre, logger, MODEL as never),
  scenes: (st, p) => runScenes(p.input, st.genre, st.narrativeStructure as never, p.characters, p.world, logger, MODEL as never),
  // 확장: sceneCinematography/decoupage/shotDesign 은 visualIdentity·worldVisual·characterVisual(v0/v2) 선행 필요.
}

describe('writer 단계 실험 (길이 양극화)', () => {
  it.skipIf(!ENABLED)(
    `[${INPUT_KEY}] ${STAGES.join(' → ')} 를 ${MODEL.model} 로 실행`,
    async () => {
      const preset = PRESETS[INPUT_KEY]
      expect(preset, `unknown WRITER_INPUT=${INPUT_KEY} (shorts|ad|feature)`).toBeTruthy()
      fs.mkdirSync(OUT_DIR, { recursive: true })

      const state: State = { genre: preset.input.genre! }
      console.log(`\n━━━ writer 실험 · ${preset.label} · model=${MODEL.model} ━━━`)
      console.log(`runtime=${state.genre.runtime_seconds}s depth=${state.genre.depth_level} format=${state.genre.format}\n`)

      for (const stage of STAGES) {
        const fn = STAGE_FNS[stage]
        if (!fn) { console.log(`[skip] ${stage} — 미지원(레지스트리에 없음)`); continue }
        resetRawSeq()
        const t0 = Date.now()
        let result: unknown
        let err: string | undefined
        try {
          result = await fn(state, preset)
          ;(state as Record<string, unknown>)[stage] = result
        } catch (e) {
          err = e instanceof Error ? e.message : String(e)
        }
        const ms = Date.now() - t0
        const calls = getPendingRawCalls()
        const outPath = path.join(OUT_DIR, `${INPUT_KEY}__${stage}.json`)
        fs.writeFileSync(outPath, JSON.stringify({
          input: INPUT_KEY, label: preset.label, stage, model: MODEL.model,
          duration_ms: ms, error: err ?? null,
          llm_calls: calls.map((c) => ({ systemInstruction: c.systemInstruction, prompt: c.prompt, response: c.response, duration_ms: c.duration_ms })),
          result,
        }, null, 2), 'utf8')

        // 요약 지표
        let summary = ''
        if (stage === 'narrativeStructure' && result) {
          const r = result as { structure_type?: string; acts?: { proportion: number }[] }
          summary = `structure=${r.structure_type} acts=${r.acts?.length} props=[${r.acts?.map((a) => a.proportion).join('/')}]`
        } else if (stage === 'scenes' && result) {
          const r = result as { scenes?: unknown[]; total_estimated_seconds?: number }
          summary = `scenes=${r.scenes?.length} total=${r.total_estimated_seconds}s`
        }
        console.log(`[${stage}] ${(ms / 1000).toFixed(1)}s  ${err ? 'ERR=' + err.slice(0, 80) : summary}  → ${path.relative(process.cwd(), outPath)}`)
      }
      console.log('')
    },
    600_000,
  )
})
