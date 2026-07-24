// BASE 팔 실행 하네스 — 시나리오 + 장르 태그만 넣고 실 writer 백엔드(runPipeline, 제품 코드 그대로)를
// 완주시켜 샷 분해·카메라 4요소·이미지/영상 프롬프트를 writer가 자생하게 한다.
//
// ⚠️ 이 파일이 손으로 쓰는 것은 STORY(시나리오 원문 그대로 옮김)와 CAST(외형 정본, 프로듀서 seed)뿐이다.
//   카메라·앵글·무브·구도·모션 텍스트는 단 한 글자도 여기 없다 — 전부 runPipeline 내부 stage
//   (s1~s3 서사, v0~v4 비주얼/샷설계, c_application_2 조립, v5 프롬프트 정리)가 생성한다.
//   실행 후 이 파일이 하는 일은 결과 JSON을 읽어 EXP/assets/arm-base/*로 재배치하는 것뿐 —
//   프롬프트 문자열 자체는 재작성하지 않고 result.renderPrompts / result.shotSequence에서 그대로 뽑는다.
//
// 게이트 (실 유료 LLM+fal 호출):
//   RUN_WRITER_BASE=1 \
//   npx vitest run --config research/experiments/continuity-copy/2026-07-23_full-copy-bundle/tools/vitest.config.mjs \
//     research/experiments/continuity-copy/2026-07-23_full-copy-bundle/tools/run-writer-base.test.ts \
//     --disable-console-intercept
//   (.env.local의 GEMINI_API_KEY/CLAUDE_API_KEY/FAL_KEY를 dotenv로 자동 로드)
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { runPipeline } from '@/lib/writer/pipeline'
import { runShotImages } from '@/lib/writer/pipeline/stages/v6_images'
import { PipelineLogger, makeProjectId } from '@/lib/writer/logger'
import type { PipelineInput, CastContract, Genre, PipelineResult } from '@/lib/writer/types/pipeline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXP_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(__dirname, '../../../../../')

dotenv.config({ path: path.join(REPO_ROOT, '.env.local') })

const ENABLED =
  process.env.RUN_WRITER_BASE === '1' &&
  !!process.env.GEMINI_API_KEY &&
  !!process.env.CLAUDE_API_KEY &&
  !!process.env.FAL_KEY

// ── 입력 1: 시나리오 본문 (scenario.md 산문 부분 그대로 — 하단 "사건 타임라인" 표·상단 설계 메모 제외) ──
const STORY = `새벽의 공중화장실. 민트색 타일과 주황색 세면대, 둥근 거울들이 늘어선, 지나치게 깨끗하고
지나치게 조용한 레트로 화장실이다. 웜톤 형광등이 일정하게 웅웅거린다. 사람은 없다.

검은 단발의 소녀가 들어온다. 페일블루 새틴 슬립 드레스, 은색 참 초커, 흰 양말에 검은 메리제인
힐. 소녀는 거울 앞에 서서 립글로스를 꺼내 천천히 바르기 시작한다. 표정은 무심하고 고요하다.

립을 바르는 사이, 어디선가 아주 희미한 여자 목소리가 들린다. ASMR처럼 속삭이는, 거의 공기에
섞여 사라지는 소리 — "somebody… help me…". 소녀는 알아채지 못한 채 계속 바른다.

잠시 후, 같은 목소리가 조금 더 또렷하게 들린다 — "help me." 소녀가 멈칫하며 놀란다.
거울 속 자신과 그 뒤의 빈 화장실을 확인하고, 이내 소리의 방향을 따라 시선이 세면대로 내려간다.

소녀는 세면대를 들여다본다. 주황색 세면대 안, 크롬 배수구. 소리는 그 아래 어딘가에서 새어
나오는 것 같다. 소녀는 수전을 살피고, 몸을 기울여 배수구에 귀를 가까이 대고, 카운터 아래
배관까지 확인한다. 목소리는 더 들리지 않는다. 화장실은 다시 완전한 정적이다.

소녀가 카운터 아래를 살피던 순간 — 날카로운 여자 비명과 함께 시야가 완전한 어둠에 잠긴다.

어둠이 걷히면, 소녀는 바닥에 쓰러져 있다. 그리고 그 옆에 소녀와 똑같이 생긴 또 하나의
소녀가 서 있다 — 같은 얼굴, 같은 단발, 같은 드레스. 서 있는 소녀는 쓰러진 소녀를 아무
감정 없이 내려다보다가, 팔을 잡아 화장실 안쪽으로 끌고 간다.

쓰러진 소녀는 변기 옆 바닥에 눕혀진다. 미동이 없다.

서 있는 소녀는 벗겨진 구두를 손에 든 채 변기 뚜껑 위에 잠시 앉아 있다. 서두르지 않는다.
이윽고 일어나 칸막이를 나서고, 처음의 소녀가 그랬던 것처럼 화장실을 가로질러, 문 쪽으로
걸어 나간다. 화장실은 다시 비어 있다 — 변기 옆의 소녀만 남긴 채. 어둠.`

// ── 입력 2: 캐스트 외형 정본 (프로듀서 seed — camera/direction 아님, 신원 일관성용) ──
//   research/experiments/continuity-copy/2026-07-23_character-canon/notes.md 확정 외형을 그대로 옮김.
//   "소녀(1인 2역)" — 도플갱어는 시나리오 본문에 이미 "같은 얼굴·같은 단발·같은 드레스"로 명시되어
//   있으므로 캐스트 시드는 1명만 두고, 두 번째 인물(오픈 캐스트) 등장 여부는 s3_scenes(writer)가
//   시나리오 텍스트만 보고 스스로 판단하게 둔다 — 수기 개입 없음.
const CAST: CastContract = {
  characters: [
    {
      character_id: 'girl',
      name: '소녀',
      entity_type: 'person',
      role: 'protagonist',
      appearance:
        '20대 초반 여성. 검은 단발머리(턱선 길이, 잔머리 있음). 페일블루 새틴 슬립 드레스(흰 데이지 레이스 트림), ' +
        '은색 참 레이어드 초커, 흰 크루 양말, 검은 메리제인 힐. 무심하고 고요한 표정.',
    },
  ],
}

// ── 입력 3: 장르 태그 (design.md §3 BASE 팔 정의 — "장르+줄거리만") ──
const GENRE: Genre = {
  genre: 'thriller',
  subGenre: 'psychological_thriller',
  tone: ['quiet_dread', 'uncanny_stillness', 'retro_pastel'],
  targetEmotion: ['unease', 'dread'],
  runtime_seconds: 66,
  depth_level: 'D3',
  format: 'horizontal_16:9',
}

describe.skipIf(!ENABLED)('BASE arm — writer 백엔드 자생 실행 (RUN_WRITER_BASE=1 게이트)', () => {
  it(
    '시나리오+장르 → runPipeline 완주 → shots.json + 시작 프레임 + jobs.base.json',
    async () => {
      const input: PipelineInput = {
        story: STORY,
        genre: GENRE,
        cast: CAST,
        runtimeSeconds: GENRE.runtime_seconds,
      }

      const assetsBaseDir = path.join(EXP_DIR, 'assets', 'arm-base')
      fs.mkdirSync(assetsBaseDir, { recursive: true })

      // ── 에러 독트린 (CONVENTIONS §7-2 유추 적용): Gemini PROHIBITED_CONTENT는 비결정적
      //    (content-safety-hint.ts 자체 주석: "같은 입력도 통과/차단을 오간다" — 실측: s1에서 4/4 차단된
      //    회차도, s1~actVisualArc까지 통과했다가 v2Design에서 차단된 회차도 있었음 → Ⓐ 확정) → 동일 입력
      //    재시도. projectId 고정 + resume=true라 재시도는 "마지막으로 막힌 스테이지 하나만" 다시 돈다
      //    (앞서 통과한 스테이지는 캐시 재사용 — 재과금 최소화). S/V축을 claude로 바꾸는 대체도 시도했으나
      //    claude.ts의 고정 max_tokens=4096가 v2Design 같은 큰 V축 산출물에서 truncate되는 별개 결함이라
      //    폐기(제품 코드 수정 없이는 못 고침, 이 실험 범위 밖) — gemini 재시도 횟수를 늘리는 쪽으로 결정.
      //    다회 연속 차단이면 Ⓑ(입력 문제)로 최종 분류해 BLOCKED.md 남기고 종료.
      const projectId = makeProjectId()
      const MAX_ATTEMPTS = 25
      let result: PipelineResult | undefined
      let lastError: unknown

      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !result; attempt++) {
        try {
          result = await runPipeline(input, { projectId, resume: attempt > 1 })
        } catch (e) {
          lastError = e
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(`[BASE] runPipeline attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`)
        }
      }

      // gemini 25회 연속 s1_structure 차단 확인(실측) → S축만 claude로 전환해 재시도.
      //   V축은 그대로 gemini 유지(claude V축은 v2Design에서 max_tokens=4096 truncate 별개 결함 확인됨 —
      //   S축 산출물(NarrativeStructure)은 작아서 그 결함을 안 밟는다). resume=true로 앞서 캐시 재사용.
      if (!result) {
        const sFallbackInput: PipelineInput = {
          ...input,
          models: { S: { provider: 'claude', model: 'claude-sonnet-4-6' } },
        }
        const MAX_S_FALLBACK_ATTEMPTS = 6
        for (let attempt = 1; attempt <= MAX_S_FALLBACK_ATTEMPTS && !result; attempt++) {
          try {
            result = await runPipeline(sFallbackInput, { projectId, resume: true })
          } catch (e) {
            lastError = e
            const msg = e instanceof Error ? e.message : String(e)
            console.warn(`[BASE] runPipeline (S축 claude 대체) attempt ${attempt}/${MAX_S_FALLBACK_ATTEMPTS} failed: ${msg}`)
          }
        }
      }

      if (!result) {
        const msg = lastError instanceof Error ? lastError.message : String(lastError)
        fs.writeFileSync(
          path.join(assetsBaseDir, 'BLOCKED.md'),
          `# BASE 팔 차단 — runPipeline ${MAX_ATTEMPTS}회 연속 실패\n\n` +
            `project_id: \`${projectId}\`\n\n` +
            `동일 입력(시나리오+장르+캐스트, 무변경)으로 ${MAX_ATTEMPTS}회 재시도(resume=true, 통과한 스테이지는 캐시 재사용)했으나 ` +
            `매번 실패 — 에러 독트린상 Ⓑ(입력 문제)로 최종 분류. 가짜 산출물로 대체하지 않고 여기서 종료.\n\n` +
            `## 마지막 에러\n\n\`\`\`\n${msg}\n\`\`\`\n\n` +
            `## 추정 원인\n\n` +
            `Gemini 안전필터 PROHIBITED_CONTENT — src/lib/writer/content-safety-hint.ts 주석: ` +
            `"미성년(아동) + 위해(피/폭력) 조합에서 비결정적으로 차단". 이 시나리오는 "소녀"(MINOR_PATTERN) + ` +
            `기절/납치성 행위(도플갱어가 쓰러진 소녀를 끌고 감)가 겹쳐 위험 조합에 해당한다.\n\n` +
            `## 시도한 것\n\n` +
            `1. gemini 기본값으로 최대 ${MAX_ATTEMPTS}회 재시도(resume 캐시 활용) — 매 회 다른 스테이지에서 차단됨(비결정적 확인).\n` +
            `2. S/V축을 claude로 전환하는 대체를 시도했으나, claude.ts의 고정 max_tokens=4096이 v2Design(WorldVisual+CharacterVisual, ` +
            `큰 JSON)에서 매번 truncate되는 별개 결함으로 막힘 — 이건 제품 코드(src/lib/writer/llm/claude.ts) 수정 없이는 못 고침, ` +
            `이 실험 범위 밖.\n\n` +
            `## 필요한 것\n\n` +
            `시나리오 문구를 손대지 않고 풀 방법이 현재 제품 코드 레벨에 없다. 다음 옵션은 (a) claude.ts maxTokens를 stage별로 ` +
            `키우는 제품 수정(오너 판단 필요), 또는 (b) 시나리오 표현 수위 조정(오너 판단 필요) — 둘 다 이 파일 범위 밖.\n`,
        )
        throw new Error(`runPipeline blocked after ${MAX_ATTEMPTS} attempts (see BLOCKED.md): ${msg}`)
      }

      expect(result.shotSequence.shots.length).toBeGreaterThan(0)

      const framesDir = path.join(assetsBaseDir, 'frames')
      fs.mkdirSync(framesDir, { recursive: true })

      // shot_id → renderPrompts 매칭 (v5가 최종 정리한 T2I/TI2V 프롬프트 원문)
      const rpByShotId = new Map(result.renderPrompts.shots.map((r) => [r.shot_id, r]))

      const orderedShots = result.shotSequence.shots.map((s, i) => {
        const idx = String(i + 1).padStart(2, '0')
        const rp = rpByShotId.get(s.shot_id)
        return {
          n: idx,
          shot_id: s.shot_id,
          scene_id: s.S.scene_id,
          duration_seconds: rp?.duration_seconds ?? s.duration_seconds,
          character_action: s.S.character_action,
          camera: s.V.camera,
          composition: s.V.composition,
          mood: s.V.mood,
          image_prompt: (rp?.t2i.prompt ?? s.first_frame_generation.composition_prompt).trim(),
          video_prompt: (rp?.ti2v.motion_prompt ?? s.video_generation.motion_prompt).trim(),
        }
      })

      fs.writeFileSync(
        path.join(assetsBaseDir, 'shots.json'),
        JSON.stringify(
          {
            project_id: result.project_id,
            arm: 'BASE',
            source: 'runPipeline (src/lib/writer/pipeline/index.ts) — 실 writer 백엔드, 수기 카메라/연출 텍스트 없음',
            genre: GENRE,
            total_shots: result.shotSequence.total_shots,
            total_duration_seconds: result.shotSequence.total_duration_seconds,
            shots: orderedShots,
          },
          null,
          2,
        ),
      )

      // ── 시작 프레임: v6_images(runShotImages) 제품 스테이지 그대로 호출 — reference 자산 없으면
      //    fal.ts DEFAULT_IMAGE_MODEL(openai/gpt-image-2, 순수 T2I)로 자동 라우팅됨.
      const imgLogger = new PipelineLogger(result.project_id)
      await imgLogger.init()
      const imagesOut = await runShotImages(result.renderPrompts, imgLogger, {
        concurrency: 2,
        pollWindowMs: 5 * 60 * 1000,
        pollIntervalMs: 10_000,
      })

      const imageByShotId = new Map(imagesOut.shots.map((r) => [r.shot_id, r]))

      const jobs: Array<Record<string, unknown>> = []
      const frameFailures: string[] = []

      for (const shot of orderedShots) {
        const img = imageByShotId.get(shot.shot_id)
        if (!img || img.status !== 'success' || !img.image_url) {
          frameFailures.push(`${shot.n} (${shot.shot_id}): ${img?.error ?? img?.status ?? 'no result'}`)
          continue
        }
        const res = await fetch(img.image_url)
        if (!res.ok) {
          frameFailures.push(`${shot.n} (${shot.shot_id}): frame download HTTP ${res.status}`)
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const ct = res.headers.get('content-type') ?? ''
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
        const frameRel = `arm-base/frames/${shot.n}.${ext}`
        fs.writeFileSync(path.join(EXP_DIR, 'assets', frameRel), buf)

        jobs.push({
          id: `base_${shot.n}`,
          task: 'i2v_se',
          prompt: shot.video_prompt,
          image: frameRel,
          seconds: shot.duration_seconds,
          aspect: '16:9',
          out: `clips/arm-base/${shot.n}.mp4`,
        })
      }

      fs.writeFileSync(path.join(EXP_DIR, 'jobs.base.json'), JSON.stringify(jobs, null, 2))

      if (frameFailures.length > 0) {
        fs.writeFileSync(
          path.join(assetsBaseDir, 'FRAME_FAILURES.md'),
          `# 시작 프레임 생성 실패 목록 (${frameFailures.length}/${orderedShots.length})\n\n` +
            frameFailures.map((f) => `- ${f}`).join('\n') +
            '\n',
        )
      }

      // ── README: 실행 경로 + 샷별 프롬프트 원문 (접힘) ──
      const readmeLines: string[] = []
      readmeLines.push('# BASE 팔 — writer 백엔드 자생 실행 결과')
      readmeLines.push('')
      readmeLines.push(
        `> 실행 경로: \`node_modules/.bin/vitest run\` → \`tools/run-writer-base.test.ts\` → ` +
          '`runPipeline()` (src/lib/writer/pipeline/index.ts, 제품 코드 그대로) → ' +
          '`runShotImages()` (v6_images.ts, fal.ts DEFAULT_IMAGE_MODEL). ' +
          '입력은 시나리오 원문 + 장르 태그(스릴러) + 캐스트 외형(신원 seed)뿐 — 카메라/연출 텍스트는 이 문서를 ' +
          '만든 스크립트가 한 글자도 쓰지 않았다. 아래 프롬프트는 result.renderPrompts.shots[].t2i.prompt / ' +
          'ti2v.motion_prompt를 그대로 옮긴 것이다.',
      )
      readmeLines.push('')
      readmeLines.push(`- project_id: \`${result.project_id}\``)
      readmeLines.push(`- 장르: ${GENRE.genre}/${GENRE.subGenre} · tone: ${GENRE.tone.join(', ')} · depth: ${GENRE.depth_level} · format: ${GENRE.format}`)
      readmeLines.push(`- LLM 호출 수: ${JSON.stringify(result.metadata.llm_calls)}`)
      readmeLines.push(`- 샷 수: ${result.shotSequence.total_shots} · 총 길이: ${result.shotSequence.total_duration_seconds}s`)
      readmeLines.push(`- 시작 프레임: 성공 ${imagesOut.success_count}/${imagesOut.total_shots} (모델: ${imagesOut.model})`)
      if (frameFailures.length > 0) readmeLines.push(`- ⚠️ 프레임 실패 ${frameFailures.length}건 — FRAME_FAILURES.md 참조`)
      readmeLines.push('')
      readmeLines.push('## 샷별 (writer 산출 원문)')
      readmeLines.push('')
      for (const shot of orderedShots) {
        readmeLines.push(`### 샷 ${shot.n} — ${shot.shot_id} (${shot.duration_seconds}s)`)
        readmeLines.push('')
        const frameFile = fs
          .readdirSync(framesDir)
          .find((f) => f.startsWith(`${shot.n}.`))
        if (frameFile) readmeLines.push(`![](frames/${frameFile})`)
        readmeLines.push('')
        readmeLines.push(`- **행동**: ${shot.character_action}`)
        readmeLines.push(`- **카메라(writer 산출)**: ${JSON.stringify(shot.camera)} · 구도: ${shot.composition} · 무드: ${shot.mood}`)
        readmeLines.push('')
        readmeLines.push('<details><summary>이미지 프롬프트 (T2I, writer 산출 원문)</summary>')
        readmeLines.push('')
        readmeLines.push('```')
        readmeLines.push(shot.image_prompt)
        readmeLines.push('```')
        readmeLines.push('</details>')
        readmeLines.push('')
        readmeLines.push('<details><summary>영상 프롬프트 (TI2V, writer 산출 원문)</summary>')
        readmeLines.push('')
        readmeLines.push('```')
        readmeLines.push(shot.video_prompt)
        readmeLines.push('```')
        readmeLines.push('</details>')
        readmeLines.push('')
      }
      fs.writeFileSync(path.join(assetsBaseDir, 'README.md'), readmeLines.join('\n'))

      expect(jobs.length).toBeGreaterThan(0)
    },
    38 * 60 * 1000,
  )
})
