// t0-serverless-path-parity — 로컬 러너와 서버리스 라우트가 같은 함수·같은 튜닝을 타는가.
//   코드 추적만(실행 0, LLM 0). 두 진입점의 import 집합과 튜닝 노브 선언 위치를 코드로 대조한다.
// 실행: node research/experiments/t0-serverless-path-parity/collect.mjs
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

const LOCAL_ENTRY = 'research/experiments/writer-full-run/run.mts'   // 로컬 러너
const SERVERLESS_ENTRY = 'src/app/api/writer/step/route.ts'          // 서버리스 진입점
const ORCH_LOCAL = 'src/lib/writer/pipeline/index.ts'                // runPipeline
const ORCH_STEPS = 'src/lib/writer/pipeline/steps.ts'                // runWriterSteps

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const stageImports = (src) =>
  [...src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@\/lib\/writer\/pipeline\/stages\/([^']+)'/g)]
    .map((m) => ({ module: m[2], names: m[1].split(',').map((s) => s.trim().replace(/^type\s+/, '')).filter(Boolean) }))

const localOrch = read(ORCH_LOCAL)
const stepsOrch = read(ORCH_STEPS)
const localStages = stageImports(localOrch)
const stepsStages = stageImports(stepsOrch)
const localSet = new Set(localStages.map((s) => s.module))
const stepsSet = new Set(stepsStages.map((s) => s.module))

// 진입점 → 오케스트레이터
const localEntrySrc = read(LOCAL_ENTRY)
const serverlessEntrySrc = read(SERVERLESS_ENTRY)
const entryPaths = {
  local: {
    file: LOCAL_ENTRY,
    calls: [...localEntrySrc.matchAll(/\b(runPipeline|runWriterSteps)\b/g)].map((m) => m[1]),
    orchestrator: /runPipeline/.test(localEntrySrc) ? ORCH_LOCAL : null,
  },
  serverless: {
    file: SERVERLESS_ENTRY,
    calls: [...serverlessEntrySrc.matchAll(/\b(runPipeline|runWriterSteps)\b/g)].map((m) => m[1]),
    orchestrator: /runWriterSteps/.test(serverlessEntrySrc) ? ORCH_STEPS : null,
  },
}

// 튜닝 노브 — 선언 위치와 그 파일이 어느 경로에 속하는지
const KNOBS = ['WRITER_SCENE_CONCURRENCY', 'SHOTDESIGN_CONCURRENCY', 'WRITER_DIALOGUE_CONCURRENCY', 'WRITER_LANES', 'WRITER_MERGE_S1S3']
const KNOB_FILES = [
  ORCH_LOCAL, ORCH_STEPS,
  'src/lib/writer/pipeline/stages/decoupage.ts',
  'src/lib/writer/pipeline/stages/v4_shots.ts',
  'src/lib/writer/pipeline/stages/dialogue.ts',
  'src/instrumentation.ts',
  LOCAL_ENTRY,
]
const knobTable = {}
for (const k of KNOBS) {
  knobTable[k] = KNOB_FILES.filter((f) => read(f).includes(k)).map((f) => ({
    file: f,
    lines: read(f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(k)).map(([n]) => n),
  }))
}

// 전송 계층 튜닝(#fetch-pool)
const dispatcherSites = []
for (const f of ['src/instrumentation.ts', LOCAL_ENTRY, ORCH_LOCAL, ORCH_STEPS]) {
  const src = read(f)
  if (src.includes('setGlobalDispatcher')) {
    const line = src.split('\n').findIndex((l) => l.includes('setGlobalDispatcher')) + 1
    const conn = /connections:\s*(\d+)/.exec(src)?.[1] ?? null
    const guard = /NEXT_RUNTIME\s*!==\s*'nodejs'/.test(src) ? "NEXT_RUNTIME==='nodejs' 일 때만" : '조건 없음'
    dispatcherSites.push({ file: f, line, connections: conn, guard })
  }
}
const routeRuntime = /export const runtime\s*=\s*'(\w+)'/.exec(serverlessEntrySrc)?.[1] ?? null

const onlyInSteps = [...stepsSet].filter((m) => !localSet.has(m))
const onlyInLocal = [...localSet].filter((m) => !stepsSet.has(m))

const out = {
  ticket: 't0-serverless-path-parity',
  date: '2026-08-12',
  method: '코드 추적만 — 프로덕션 런 미실행(티켓 금지 준수)',
  entry_paths: entryPaths,
  orchestrators_diverge: entryPaths.local.orchestrator !== entryPaths.serverless.orchestrator,
  stage_modules: {
    local_orchestrator: [...localSet].sort(),
    serverless_orchestrator: [...stepsSet].sort(),
    shared: [...localSet].filter((m) => stepsSet.has(m)).sort(),
    only_in_serverless: onlyInSteps,
    only_in_local: onlyInLocal,
  },
  tuning_knobs: knobTable,
  transport_tuning: { sites: dispatcherSites, serverless_route_runtime: routeRuntime },
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))

console.log('진입점 → 오케스트레이터')
console.log('  로컬 러너   :', entryPaths.local.file, '→', entryPaths.local.orchestrator, `(호출: ${[...new Set(entryPaths.local.calls)]})`)
console.log('  서버리스    :', entryPaths.serverless.file, '→', entryPaths.serverless.orchestrator, `(호출: ${[...new Set(entryPaths.serverless.calls)]})`)
console.log('오케스트레이터 갈라짐:', out.orchestrators_diverge)
console.log('공유 스테이지 모듈:', out.stage_modules.shared.length, '| 서버리스 전용:', onlyInSteps, '| 로컬 전용:', onlyInLocal)
console.log('튜닝 노브 선언 위치:')
for (const [k, v] of Object.entries(knobTable)) console.log(`  ${k}: ${v.map((x) => `${x.file}:${x.lines.join('/')}`).join('  ')}`)
console.log('전송 튜닝:', JSON.stringify(dispatcherSites), '| 서버리스 라우트 runtime =', routeRuntime)
