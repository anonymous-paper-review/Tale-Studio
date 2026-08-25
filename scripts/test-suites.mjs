#!/usr/bin/env node

import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const TEST_ROOT = path.join(ROOT, 'tests')
const TEST_FILE_RE = /\.test\.(?:ts|tsx)$/
const MANUAL_RE = /\.manual\.test\.(?:ts|tsx)$/
const EXPERIMENTAL_RE = /(?:_experiment|\.experiment)\.test\.(?:ts|tsx)$/
const VAULT_RE = /(?:^|\/)vault-/

async function collectTests(dir = TEST_ROOT) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectTests(absolute)))
    } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
      files.push(path.relative(ROOT, absolute).split(path.sep).join('/'))
    }
  }
  return files.sort()
}

const isManual = (file) => MANUAL_RE.test(file)
const isExperimental = (file) => EXPERIMENTAL_RE.test(file)
const isAutomated = (file) => !isManual(file) && !isExperimental(file)
const isProduct = (file) => isAutomated(file) && !VAULT_RE.test(file)

const DOMAIN_PATTERNS = {
  writer:
    /(?:^|\/)(?:writer-|rough-|pipeline\/|pipeline-|stage-|shot-|v2design-|motion-|storyboard-|prompt-trace|facet-render|camera-contract|adherence-core|writer-ui|writer-status|writer-v0|writer-n1|writer-chat|writer-dialogue|writer-lane|writer-persist|writer-rerun|writer-start|writer-shotcheck|writer-duration|writer-previz)/i,
  producer:
    /(?:^|\/)(?:producer-|parse-extracted|cast-slug|content-safety|output-language|handoff-|card-mention|chat-choices|chat-persistence|pending-proposal|producer-ref|reference-|produce-reference|project-reference)/i,
  artist:
    /(?:^|\/)(?:artist-|image-|turnaround|classify-image|draft-trigger|template-asset|style-anchor|fal-image-size|fal-model|fal-media|asset-)/i,
  director:
    /(?:^|\/)(?:director-|build-video|real-grid|video-|camera-|motion-contract)/i,
  editor: /(?:^|\/)(?:editor-|export-|media-|storage-|upload-)/i,
  security:
    /(?:\.red-team\.test\.|(?:^|\/)(?:api-project-access-guard|admin-gate|action-guard|demo-seam|generation-jobs-terminal)\.test\.)/i,
  reference: /(?:^|\/)(?:reference-|produce-reference|project-reference)/i,
}

const SUITES = {
  core: {
    description: '제품 코드의 빠른 자동 회귀 테스트 — 수동·실험·Vault 운영 테스트 제외',
    pick: isProduct,
  },
  all: {
    description: '수동·실험 테스트를 제외한 전체 자동 테스트',
    pick: isAutomated,
  },
  writer: {
    description: 'Writer 파이프라인·러프 previz·샷·단계 전환',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.writer.test(file),
  },
  producer: {
    description: 'Producer 입력·게이트·핸드오프·참조 가져오기',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.producer.test(file),
  },
  artist: {
    description: 'Artist 이미지·자산·출처·생성 실패 처리',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.artist.test(file),
  },
  director: {
    description: 'Director 캔버스·샷·영상 생성',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.director.test(file),
  },
  editor: {
    description: 'Editor·내보내기·미디어 저장',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.editor.test(file),
  },
  security: {
    description: '권한·입력 경계·red-team 방어 회귀',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.security.test(file),
  },
  reference: {
    description: '참조 프로젝트 가져오기 계약',
    pick: (file) => isProduct(file) && DOMAIN_PATTERNS.reference.test(file),
  },
  manual: {
    description: '실제 API·Fal·라이브 스키마가 필요한 수동 테스트',
    pick: isManual,
  },
  experimental: {
    description: '실험용 파이프라인 검증 — 기본 테스트에 포함하지 않음',
    pick: isExperimental,
  },
}

function printSuiteSummary(files) {
  for (const [name, suite] of Object.entries(SUITES)) {
    const count = files.filter(suite.pick).length
    console.log(`${name.padEnd(12)} ${String(count).padStart(3)} files  ${suite.description}`)
  }
}

const args = process.argv.slice(2)
const suiteName = args.find((arg) => !arg.startsWith('-')) ?? 'core'
const listOnly = args.includes('--list')
const files = await collectTests()

if (listOnly && !args.some((arg) => !arg.startsWith('-'))) {
  printSuiteSummary(files)
  process.exit(0)
}

const suite = SUITES[suiteName]
if (!suite) {
  console.error(`Unknown test suite: ${suiteName}`)
  printSuiteSummary(files)
  process.exit(1)
}

const selected = files.filter(suite.pick)
if (selected.length === 0) {
  console.error(`No tests matched suite: ${suiteName}`)
  process.exit(1)
}

console.log(`[test:${suiteName}] ${selected.length} files — ${suite.description}`)
if (listOnly) {
  console.log(selected.join('\n'))
  process.exit(0)
}

if (suiteName === 'manual' && process.env.RUN_LIVE_TESTS !== '1') {
  console.error('[test:manual] 실제 API/Fal 비용이 발생할 수 있습니다. RUN_LIVE_TESTS=1 을 명시하세요.')
  process.exit(2)
}

const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...selected, ...args.filter((arg) => arg.startsWith('-'))], {
  cwd: ROOT,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
