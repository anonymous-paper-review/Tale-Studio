// 현재 작업을 건드리지 않고 지정 메인의 실제 함수로 68칸·80칸 검사를 재현한다. 생성 요청은 보내지 않는다.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ref = process.env.CONCURRENCY_AUDIT_REF ?? '867cda835195315e6a73cb4f8d262ef736302ff9'
const output = path.resolve(process.argv[2] ?? path.join(repo, '.claude/docs/2026-09-11/concurrency-audit'))
mkdirSync(output, { recursive: true })
const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repo, encoding: 'utf8' }).trim()
const snapshot = mkdtempSync(path.join(tmpdir(), 'tale-concurrency-main-'))
const sourcePaths = ['src', 'tests', 'scripts', 'supabase', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'vitest.config.ts', 'vitest.setup.ts']
const archive = execFileSync('git', ['archive', commit, ...sourcePaths], { cwd: repo, maxBuffer: 128 * 1024 * 1024 })
execFileSync('tar', ['-xf', '-', '-C', snapshot], { input: archive })
symlinkSync(path.join(repo, 'node_modules'), path.join(snapshot, 'node_modules'), 'dir')
const scenarioFile = 'tests/manual/concurrency-capacity.manual.test.ts'
copyFileSync(path.join(repo, scenarioFile), path.join(snapshot, scenarioFile))
const environment = {
  PATH: process.env.PATH,
  TMPDIR: process.env.TMPDIR ?? tmpdir(),
  LANG: process.env.LANG ?? 'en_US.UTF-8',
  CI: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  CONCURRENCY_AUDIT_COMMIT: commit,
}

async function run(name, files, extraEnv = {}) {
  const log = createWriteStream(path.join(output, `${name}.log`))
  const args = ['node_modules/vitest/vitest.mjs', 'run', ...files, '--reporter=verbose', '--reporter=json', `--outputFile.json=${path.join(output, `${name}-vitest.json`)}`]
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: snapshot, env: { ...environment, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', chunk => { process.stdout.write(chunk); log.write(chunk) })
    child.stderr.on('data', chunk => { process.stderr.write(chunk); log.write(chunk) })
    child.once('error', reject)
    child.once('close', code => resolve(code ?? 1))
  })
  await new Promise(resolve => log.end(resolve))
  return { name, exitCode: code, files }
}

const runs = []
try {
  runs.push(await run('regression', [
    'tests/billing/generation-quota-split-pools.test.ts',
    'tests/billing/previz-record-before-submit.test.ts',
    'tests/job/fal-keys.test.ts',
    'tests/job/batch-continue-submission.test.ts',
    'tests/job/batch-recovery.test.ts',
    'tests/writer/rough-storyboard-quota-gate.test.ts',
    'tests/writer/rough-submit-reservation.test.ts',
  ]))
  runs.push(await run('capacity', [scenarioFile], { CONCURRENCY_AUDIT_OUTPUT: path.join(output, 'capacity-results.json') }))
} finally {
  writeFileSync(path.join(output, 'run-metadata.json'), JSON.stringify({ commit, snapshot, checkedAt: new Date().toISOString(), node: process.version, productionMutations: 0, generatedMediaRequests: 0, retainedSnapshot: true, runs }, null, 2) + '\n')
}
process.exitCode = runs.some(run => run.exitCode !== 0) ? 1 : 0
