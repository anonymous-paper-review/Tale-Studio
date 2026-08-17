// 원장(2026-08-15) 의 alive 91건을 현재 코드(HEAD fb1ad7c + 작업 트리)로 다시 판정한 결과를
// results.json 과 갱신본 원장으로 굳힌다. 원장 원본은 읽기만 한다(불변 규칙 1).
//
// 사용: node research/experiments/t0-findings-ledger-recheck/build-results.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const LEDGER = path.join(ROOT, '.claude/vault/backlog/reports/2026-08-15-새발견103-판정.json')
const OUT_DIR = path.join(ROOT, 'research/experiments/t0-findings-ledger-recheck')

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))

/** index → { after, closed_by, evidence } — after 는 closed | alive | partial | unverifiable */
const R = {
  // ── 닫힘 (8) ────────────────────────────────────────────────────────────
  0: ['closed', 'fb1ad7c', "writer/scene-gate/route.ts 가 getUser 대신 requireProjectAccess 를 import 하고 scenes·storyCheck 삭제 이전에 access.ok 를 검사한다. tests/api-project-access-guard.test.ts 에 'POST /api/writer/scene-gate — 403 (revise 의 scenes/storyCheck 삭제 전에 끊긴다)' 케이스가 신설됐다."],
  1: ['closed', 'fb1ad7c', 'editor/state/route.ts 의 GET·PUT 이 각각 requireProjectAccess 를 통과해야 supabaseAdmin 조회/upsert 에 도달한다. 같은 테스트 파일에 GET·PUT 403 케이스 2건.'],
  2: ['closed', 'fb1ad7c', 'director/generate-storyboard·writer/rough-storyboard·writer/dialogue·writer/shot-configs 네 라우트 모두 requireProjectAccess 보유. 테스트 공백도 tests/api-project-access-guard.test.ts 신설로 메워졌다(네 라우트 각각 403 케이스). 다만 원장이 이름을 댄 style-anchor 테스트 2파일 자체에는 지금도 401/403 단언이 0건이며, 대신 별도 파일이 그 역할을 맡는다.'],
  42: ['closed', 'fb1ad7c', 'editor/reorder·speed/trim 세 라우트의 shots 갱신 쿼리가 전부 .eq("project_id", access.projectId) 를 함께 건다. editor-store 의 reorderClips·setTrim·setSpeed 도 요청 본문에 projectId 를 싣는다.'],
  43: ['closed', 'fb1ad7c', 'editor 5경로(state GET·PUT, reorder, speed, trim, render-draft) 전부 requireProjectAccess 보유. 미들웨어가 api/ 를 제외하는 사정은 그대로지만 라우트가 스스로 막는다.'],
  91: ['closed', 'fb1ad7c', '유료 생성 6경로(artist generate-sheet·generate-world, writer rough-storyboard, director generate-storyboard·generate-storyboard-batch·generate-previz-video) 전부 requireProjectAccess 보유.'],
  78: ['closed', '미커밋(작업 트리)', '.claude/vault/_archive/ 가 실재하고 닫힌 날짜 기록·_FIXLOG.md·_DEFERRED.md·_TEMPLATE.md 가 그 안으로 옮겨져 있다. git status 상 add 된 상태이고 아직 커밋은 안 됐다.'],
  101: ['closed', 'fb1ad7c', '원장이 누락을 지목한 세 곳(writer/rough-storyboard, director/generate-previz-video, director/generate-storyboard-batch)에 demoWriteBlock 이 붙었다. 유료 7경로 전수에서 demoWriteBlock 참조가 확인된다.'],

  // ── 확인 불가 (3) — 주장 자체가 데이터 수치이고 이 티켓은 DB 를 안 쓴다 ──
  60: ['unverifiable', null, '주장의 실체("기록이 사흘·7개 프로젝트만 남아 있다")가 DB 수치다. 코드 쪽 구조(킬 스위치·비UUID skip·실패 흡수)는 archive-calls.ts 에서 그대로 확인되나 커버리지 자체는 이 티켓 범위(DB 미사용)에서 잴 수 없다.'],
  68: ['unverifiable', null, '주장이 "영상 클립 12건 대기·14건 고아"라는 DB 수치다. 자동 정리 코드 부재(크론은 writer/watchdog 하나)는 재확인되나 건수는 잴 수 없다.'],
  69: ['unverifiable', null, '주장이 "112명 중 1명"이라는 DB 수치다. 코드 쪽에 채움을 강제하는 새 배선은 없으나, 채움 실태는 이 티켓 범위에서 잴 수 없다.'],
}

/** 살아 있음으로 재확인된 것들 — 근거 심볼을 지금 코드에서 다시 찾아 대조한 결과 */
const ALIVE = {
  3: 'src/lib/adherence/core.ts 의 ADHERENCE_START_ENABLED·ADHERENCE_MOTION_ENABLED 가 지금도 상수 false 이고, rough-adherence 는 { checked: 0, disabled: true }, video-adherence 는 { status: "skipped", reason: "disabled" } 를 즉시 반환한다.',
  14: 'git log HEAD..e981caf 가 13건(52f0644~e981caf)을 그대로 반환한다. supabase/migrations 에 20260812060417 파일 없음.',
  15: 'persist_manifest.ts 의 DEFAULT_CAMERA(전축 0)와 camera_config: { ...DEFAULT_CAMERA } 고정 저장이 그대로다. shots.movement_preset 을 쓰는 코드는 generate-video 라우트의 스냅샷 저장과 export/director 의 읽기뿐.',
  22: 'knowledge.ts 의 KB_DIR 이 아직 databases/knowledge 를 가리키고 저장소에 databases/ 폴더가 없다(.gitignore 가 제외). DB 전환은 여전히 TODO 주석뿐.',
  31: 'pipeline_failed 안내는 rough-storyboard-view 의 !hasShots 분기와 script-view 의 대본 없음 분기 안에만 있다. chat-progress-pin 은 실패 시 running=false 로 접혀 핀이 표기 없이 사라진다.',
  32: 'director-store 의 deleteNode 가 shots·scenes 행을 실제로 delete 하고, DeleteConfirmModal 문구는 "Shot n개 + Video m개가 함께 삭제됩니다" 그대로. undo 는 로컬 스냅샷만 되돌린다.',
  33: 'types/shot.ts 의 RoughStoryboardImage 에 "무엇을 보고 그렸는지" 필드가 없고 StoryboardGridView 에 stale 참조 0건. 낡음 판정은 노드 화면과 인물 화면에만 따로 있다.',
  34: 'add-item-dialog 의 handleAdd 가 addShot/addScene 반환값을 보지 않고 onOpenChange(false) 로 무조건 닫는다. useWriterStore 의 error 를 구독해 보여주는 곳은 없다.',
  44: 'editor/render-draft 라우트는 소유권 가드만 붙었을 뿐 여전히 재생목록 메타데이터만 반환하고 FFmpeg 합성은 TODO 주석이다. EXPORT_STAGES 에 editor 없음.',
  57: 'defaultPersistPrompt 가 composition 이 비면 액션 설명을 prompt 로 그대로 복사한다. 저장 직전 가드는 완전 공란만 console.warn 하고, DB 제약도 빈 문자열만 금지한다.',
  58: 'generation-jobs.ts 의 잡 생성이 attempts: 1 고정이고 이 값을 늘리는 코드가 저장소에 없다. 같은 밤 t0-generation-retry-never-fires 가 데이터로도 attempts>=2 가 0건임을 확정했다.',
  70: 'defaultPersistPrompt 가 둘 다 비면 빈 문자열을 돌려주고, 저장 직전 가드는 warn 만 하며, 샷 전체가 한 번의 insert 다. DB 의 빈 문자열 금지 제약 위반은 stage-errors 의 /violates|constraint|23514/ 로 permanent 분류돼 자동 재시도가 없다.',
  71: '.gitignore 가 지금도 scripts/ 를 통째로 제외하고, tests/seed-test-accounts.test.ts 는 ../scripts/seed-test-accounts.mjs 를 import 한다. git ls-files scripts/ 는 0건(이 머신 로컬에만 존재).',
  90: 'fal.ts 의 falImageSubmit·falVideoSubmit 이 fal.queue.submit 을 withLlmRetry 로 감싼다. retry.ts 의 maxAttempts 기본값 4, 재시도 패턴에 timeout/aborted/fetch failed/socket hang up/ECONNRESET 포함. 접수 모호성 처리 기계는 여전히 영상 재촬영 경로에만 있다.',
  92: 'vercel.json 의 cron 은 /api/writer/watchdog 하나뿐. failGenerationJob 호출처는 fal/webhook 2곳과 fal/reconcile 1곳뿐이고 좀비를 종결하는 코드는 없다.',
  93: '제출→기록 순서 그대로: generate-sheet(falImageSubmit → createGenerationJob), world-submit, generate-previz-video 모두 동일. webhook 의 `if (!job) return ok` 유실 지점도 유지.',

  4: 'writer/start 라우트가 assessContentSafetyRisk 결과를 console.warn 으로만 남기고 응답 본문은 { projectId, runId, status } 그대로다.',
  5: 'WRITER_V2_STEPS 는 여전히 v2SemanticUnits 한 원소이고 결과는 state.v2Package 에만 남는다. persistShots 는 기존 경로에만 있다.',
  6: 'rewriteRoughStoryboardPromptViaLLM 의 정의부 외 참조가 저장소 전체에서 0건.',
  7: 'runPipeline 은 pipeline/index.ts 에만 있고 steps.ts 주석의 "별개 경로 — 그쪽 로직은 건드리지 않는다" 도 그대로. tests 에서 runPipeline 참조 0건.',
  8: '.github 디렉토리 없음. vercel.json 자동화는 watchdog cron 하나. director-video-retakes-db 통합 테스트는 환경변수 부재 시 describe.skip.',
  9: 'tests 에서 v6_images·v7_videos 를 import 하는 파일 0건.',
  10: 'tests 에서 validateSceneCinematography·buildCorrectionNote import 0건.',
  11: "vitest.config.ts 의 include 가 ['tests/**/*.test.ts'] 뿐이고 tests 안에 .tsx 파일이 없다.",
  17: 'judgeShotCount 는 v4_shots.ts 에만 정의·사용되고 다른 스테이지에는 개수 가드가 없다.',
  21: '.claude/rules/experiments.md 전문에 "산출물 판정은 사람만" 계열 문장이 없다(재확인).',
  23: 'src/app/page.tsx 에 bg-white text-black, text-6xl~9xl, font-light, backdrop-blur + rgba(229,9,20) 그림자가 그대로. specs/design.md 의 금지 조항도 존치.',
  24: 'page.tsx 에 images.unsplash.com 직접 참조 5건과 assets.mixkit.co 프리뷰 mp4 1건이 그대로.',
  25: 'producer-store↔global-chat-store 상호 import 고리와 global-chat-store→artist/director/writer-store, artist-store→writer/asset-storage, director-store→asset-storage 위반이 그대로.',
  26: '일곱 실험 폴더(anchor-density, -b, -b2, firstframe-decay-map, i2i-firstframe-resolution, t0-location-wiring, t0-motion-contract-delivery) 전부 HYPOTHESIS 파일 0건.',
  28: 'globals.css 에 animation-duration: 520ms 와 "340ms 는 인지 전에 끝났다" 주석 존치. specs/design.md 의 "금지: 500ms+ in-product" 도 존치.',
  29: 'design/page.tsx 의 CHART 배열이 chart-1="Actor 노드", chart-2="World 노드" 그대로인데 specs/design.md 는 같은 토큰을 폐기·예약으로 규정한다.',
  36: 'chat-persistence.ts 의 saveChatMessage 가 fetch 결과(res.ok)를 보지 않고 .catch 만 붙인다.',
  37: 'writer-workspace·rough-storyboard-view·script-view 세 소비처 모두 useWriterStatus 에서 error 를 구조분해하지 않는다.',
  38: 'writer-workspace 가 status.engine==="v2" 면 화면 전체를 WriterV2Preview 로 대체하고, 그 프리뷰가 WriterHeader→WriterTabs 를 그대로 렌더한다.',
  39: 'SceneEditDialog 를 import 하는 곳이 저장소 전체에서 0건. scene-tabs·shot-timeline·typing-text 도 임포터 0건.',
  40: 'shot-detail-dialog 의 Dialog 가 onOpenChange 로 즉시 닫히고 key={shot.shotId} 리마운트도 그대로. 미저장 경고 없음.',
  41: 'writer-store 의 sceneSaveTimers·shotSaveTimers 가 모듈 레벨 맵이고, project-store 의 resetChildStores 는 각 store 의 reset() 만 부른다(대기 타이머 flush 없음).',
  45: 'editor/state PUT 이 버전 칸이나 조건부 갱신 없이 문서 전체를 upsert 한다(가드만 추가됨). 충돌 감지 코드 없음.',
  46: 'editor/reorder 가 Promise.all 로 update 를 날린 뒤 각 결과의 error 를 보지 않고 성공 응답을 보낸다(가드·project_id 스코프만 추가됨).',
  47: 'upload-image 라우트는 한 변 10,000px·40M픽셀·image/gif 수용, upload/limits.ts 는 가로 8000·세로 60,000·60M픽셀에 gif 거부 — 두 벌 그대로.',
  48: 'supabase/migrations 전체에 inventory_items 생성 마이그레이션이 없고 라우트 3곳은 그 표를 조회한다.',
  49: 'lib/inventory.ts 의 assertWorkspaceAccess 가 owner_id 가 null 이면 true 를 돌려준다.',
  50: 'export/zip.ts 의 buildZipBlob 이 URL 별 arrayBuffer 를 전량 적재한 뒤 generateAsync 로 blob 을 한 번 더 만든다.',
  51: 'produce/ingest 가 media 버킷에 올리고 getPublicUrl 로 공개 URL 을 발급한다. storage .remove 호출은 inventory 라우트 3곳뿐이고 uploads/ 정리 경로 없음.',
  52: 'style-anchor 라우트가 isOwnMediaUrl 만 검사하고, 그 함수는 공개 media prefix 시작 여부와 ".." 포함만 본다(워크스페이스·프로젝트 스코프 없음).',
  53: 'extOfContentType 호출처는 테스트 2곳뿐. export/director.ts 는 "png"/"mp4", writer-board.ts 는 .png 를 자리마다 박아 넣는다.',
  54: 'writer-board.ts 가 패널 이미지를 개수 제한 없는 Promise.all 로 로드하고, 이미지 onerror·toBlob 실패를 resolve(null) 로 삼킨다.',
  55: 'export/zip.ts 와 editor-zip-export.ts 둘 다 a.click() 직후 같은 흐름에서 a.remove() + URL.revokeObjectURL 을 호출한다.',
  59: 'archive-calls.ts 의 llm_calls insert 행에 run_id 필드가 없다.',
  62: '좀비 queued 잡을 failed 로 전환하는 코드가 없다("stale queued reaped" 문구를 만드는 실패 경로 0건). 크론은 watchdog 하나.',
  63: 'writer-store 가 shots 에 직접 insert/update 하는 경로가 그대로이고 normShotType 같은 정규화는 persist_manifest 에만 있다.',
  64: 'last_writer_run_id 를 채우는 쓰기가 src/lib/writer 안에 0건(참조는 types/database.ts 의 타입 정의뿐).',
  65: 'persist_manifest 가 모든 샷에 DEFAULT_CAMERA·DEFAULT_LIGHTING 을 박고, 설계→config 파생은 shot-configs 라우트에만 있다.',
  66: '.claude/cache/db/_refresh.py 의 MIGRATIONS 가 아직 ROOT/"databases"/"migrations" 이고 그 폴더는 없다.',
  72: '.claude/vault/_archive/_FIXLOG.md 가 여전히 dev/db-backups/... 를 롤백 수단으로 지목하고, .gitignore 가 dev/db-backups/ 를 제외하며, 저장소에 그 폴더가 없다.',
  73: 'infra 규칙("stale queued reaped|superseded|좀비")은 있는데 그 문구를 만드는 실패 경로가 없고 GIVE_UP_EXEMPT_CLASSES 에 infra 가 그대로 들어 있다.',
  74: 'generation-jobs 의 JOB_ERROR_CLASS_RULES(8클래스)와 stage-errors 의 NETWORK/PERMANENT 패턴(3클래스)이 독립 구현으로 공존한다.',
  75: '코드는 fail-closed(writer/step 이 프로덕션에서 시크릿 미설정 시 500 거부)인데, deferred-api-writer-step-auth.md 는 아직 "게이트가 if (secret && 불일치)" · "다음 세션 최우선" · status: waiting 을 적고 있다.',
  76: 'v4_shots 의 "color_temp_kelvin 은 V3.lighting_arc.start_K~end_K 사이에서 진행" 지시, infer_v3 의 씬 첫·끝 색온도 역산이 그대로. (같은 밤 audit-color-temp-ramp 가 이 지시문이 원인임을 데이터로 확인했다.)',
  77: 'generate-storyboard-batch 에 "합집합으로 전달되고 프롬프트가 칸별 대응을 지시하므로 안전" 주석이 그대로 있다(줄 번호만 71 로 이동). 실제 코드는 groupRefs·columnCharacters 로 좁혀졌다.',
  79: 'storyboard-strip 의 buildRealStripPrompt 가 여전히 익명 "corresponding character(s)" 문장을 쓰고, 단일 경로 호출에 이름 배정 파라미터가 없다.',
  80: '77 과 같은 주석(가드 추가로 줄 번호만 이동). 낡은 전제 두 개가 그대로다.',
  81: 'persist_manifest 가 전 샷 단일 대량 insert 이고 공란 시 warn 만 하며 assertDbOk 가 throw 한다. 제약 위반은 stage-errors 에서 permanent 로 분류돼 자동 재시도가 없다.',
  82: 'writer/resume 이 state._attempt 만 리셋하고 _netRetry 를 건드리지 않는다. steps.ts 는 남은 _netRetry.count 에서 이어 센다.',
  83: 'writer-resume-button 이 `if (res.ok) onResumed?.()` 뿐이고 서버가 내려주는 action 값(kicked/noop/already/resumed)을 읽지 않으며 실패 분기도 없다.',
  84: 'writer-store 의 catch fail-open 주석("상태 확인 불가 — 가드 없이 진행")과 writer/chat 의 projectId 조건부 필터가 그대로.',
  85: '씬 재생성이 shots 삭제 후 source: "manual" 로 재삽입하고, persist 의 scenes 삭제는 source="pipeline" 만 대상이다.',
  86: 'JOB_ERROR_CLASS_RULES 순서가 billing → data_ref → moderation_soft → moderation 그대로이고 classifyFalFailure 는 moderation 만 moderation 으로 본다.',
  87: '세 마이그레이션 파일의 "적용: supabase db query --linked" 계열 주석이 그대로다. 파일 존재≠발효라는 상태가 유지된다.',
  88: "20260813010000 의 default 'pipeline' 이 그대로이고 소급 마킹 코드·마이그레이션은 추가되지 않았다.",
  89: '_archive/_FIXLOG.md 의 F-001~F-006 상태 표기("수리됨 ★ 육안 확정 3건 재생성 대기" 등)가 그대로다.',
  94: 'hasQueuedCharacterViewJob·hasQueuedWorldShotJob 이 select 후 JS 판정(조회-후-발주) 그대로. DB 유니크는 shot_video 한정.',
  95: 'artist/generate-world 라우트에 hasQueuedWorldShotJob 호출이 없다(그 함수 사용처는 draft-trigger 한 곳뿐).',
  96: "GIVE_UP_EXEMPT_CLASSES = ['provider','infra'] 와 provider 규칙의 결과 결함 문구, countFailedJobsForTarget 의 제외가 그대로.",
  97: 'moderation_soft 가 moderation 앞에 있고 classifyFalFailure 는 moderation 만 본다. generate-sheet 의 effectiveSafeMode = slot.moderation, 상한은 safe_mode=true 실패만 센다.',
  98: 'generation-quota.ts 의 MAX_QUEUED_JOBS_PER_USER=8 과 catch 시 { ok: true } fail-open 이 그대로. 마이그레이션에 credit/plan/usage/billing 표 없음.',
  99: 'writer/generate/videos·images 라우트에 checkUserQuota 가 없고 v6_images·v7_videos 에 createGenerationJob 호출이 없다.',
  100: 'fal/webhook 의 maxDuration=60 과 finalizeGenerationJob 동기 await, finalize.ts 의 MAX_VIDEO_BYTES=128MiB·45초 타임아웃이 그대로.',
  102: "generate-sheet·generate-world 둘 다 if (actor === 'auto') 안에서만 실패 누적 게이트가 돌고 actor 는 요청 본문에서 그대로 읽는다.",
}

for (const [k, v] of Object.entries(ALIVE)) R[k] = ['alive', null, v]

const aliveIdx = ledger.verdicts.filter((v) => v.verdict === 'alive').map((v) => v.index)
const missing = aliveIdx.filter((i) => !(i in R))
if (missing.length) throw new Error('판정 누락: ' + missing.join(','))

const highSet = new Set(ledger.meta.alive_high_indexes)
const findings = aliveIdx.map((i) => {
  const src = ledger.verdicts.find((v) => v.index === i)
  const [after, closed_by, evidence] = R[i]
  return {
    index: i,
    title: src.title,
    high: highSet.has(i),
    before: 'alive',
    after,
    closed_by,
    evidence,
    ledger_reason: src.reason,
  }
})

const count = (p) => findings.filter(p).length
const results = {
  meta: {
    ticket: '.claude/vault/backlog/t0-findings-ledger-recheck.md',
    rechecked_at: '2026-08-16',
    ledger: '.claude/vault/backlog/reports/2026-08-15-새발견103-판정.json (읽기 전용, 수정 안 함)',
    ledger_baseline: ledger.meta.baseline,
    recheck_baseline: 'HEAD fb1ad7c + 작업 트리 (제품 코드에 미커밋 변경 0건)',
    commits_since_baseline: ['ea40323 (문서만)', 'fb1ad7c (제품 코드 — 소유권 가드 14라우트)'],
    method: '발견마다 reason 안의 파일·심볼을 현재 코드에서 다시 열어 대조. 줄 번호는 안 믿고 심볼·문자열로 찾음. 모델 판정 0회, DB 조회 0회, 지출 0원.',
    rechecked: findings.length,
    rechecked_high: count((f) => f.high),
    stats: {
      closed: count((f) => f.after === 'closed'),
      alive: count((f) => f.after === 'alive'),
      partial: count((f) => f.after === 'partial'),
      unverifiable: count((f) => f.after === 'unverifiable'),
    },
    stats_high: {
      closed: count((f) => f.high && f.after === 'closed'),
      alive: count((f) => f.high && f.after === 'alive'),
      unverifiable: count((f) => f.high && f.after === 'unverifiable'),
    },
    verdict: '원장이 낡았다 — 닫힘 1건 이상 판정선 발동',
  },
  findings,
}

writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2) + '\n')

// 갱신본 원장 — 원본과 같은 구조에 after 판정을 반영한 사본(원본은 그대로 둔다)
const byIndex = new Map(findings.map((f) => [f.index, f]))
const updated = {
  meta: {
    ...ledger.meta,
    verified_at: '2026-08-16 (2026-08-15 원장의 alive 91건만 재판정)',
    superseded_note:
      '이것은 갱신본이다. 2026-08-15 원장 원본은 그날의 기록이라 고치지 않는다(불변 규칙 1). 이 사본은 alive 91건만 다시 판정해 반영했고 resolved/partial/invalid 12건은 원본 그대로다.',
    recheck_baseline: results.meta.recheck_baseline,
  },
  verdicts: ledger.verdicts.map((v) => {
    const f = byIndex.get(v.index)
    if (!f) return v
    return {
      ...v,
      verdict: f.after,
      verdict_2026_08_15: 'alive',
      closed_by: f.closed_by,
      recheck_evidence: f.evidence,
    }
  }),
}
const us = updated.verdicts.reduce((a, v) => ((a[v.verdict] = (a[v.verdict] ?? 0) + 1), a), {})
updated.meta.stats = us
updated.meta.alive_high_indexes = ledger.meta.alive_high_indexes.filter(
  (i) => byIndex.get(i)?.after === 'alive',
)
updated.meta.alive_high_count = updated.meta.alive_high_indexes.length

writeFileSync(path.join(OUT_DIR, 'ledger-updated.json'), JSON.stringify(updated, null, 2) + '\n')

console.log('재판정', results.meta.rechecked, '건 (심각', results.meta.rechecked_high, '건)')
console.log('전체', results.meta.stats)
console.log('심각만', results.meta.stats_high)
console.log('갱신본 원장 stats', us, '· 남은 심각 alive', updated.meta.alive_high_indexes)
