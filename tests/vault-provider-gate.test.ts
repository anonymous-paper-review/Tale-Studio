import { createHash, createHmac } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const gate = resolve('.claude/vault/backlog/provider-gate.py')
const workspaces: string[] = []
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value as object).sort().map(key =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value)

function run(project: string, args: string[]) {
  return spawnSync('python3', [gate, ...args], { cwd: project, encoding: 'utf8' })
}

function setup() {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'vault-provider-gate-')))
  workspaces.push(project)
  const state = join(project, 'state')
  const contract = join(project, 'contract.md')
  const harvest = join(project, 'harvest.py')
  writeFileSync(contract, 'contract\n')
  writeFileSync(harvest, '#!/usr/bin/env python3\nimport sys\nsys.exit(0)\n')
  chmodSync(harvest, 0o755)
  const claimed = run(project, ['primary', 'sweep', '--state-dir', state, '--contract-path', contract,
    '--project-root', project, '--run-id', 'run-1', '--actor', 'jh', '--probe-command', 'false', '--preflight', 'false'])
  expect(claimed.status).toBe(0)
  return { project, state, contract, harvest, claim: JSON.parse(claimed.stdout) as { token: string, fencing: number, state_path: string } }
}

function bind(ctx: ReturnType<typeof setup>) {
  const root = join(ctx.project, '.claude/vault/backlog/night-runtime/snapshots')
  const inbox = join(ctx.project, '.claude/vault/inbox')
  mkdirSync(join(root, 'content'), { recursive: true }); mkdirSync(inbox, { recursive: true })
  const contractHash = hash(readFileSync(ctx.contract))
  const members = ['jh', 'hs'].map(actor => {
    const content = Buffer.from(`${actor}\n`); const contentHash = hash(content); const path = join(inbox, `${actor}.md`)
    writeFileSync(path, content); writeFileSync(join(root, 'content', `${contentHash}.bin`), content)
    const fingerprint = hash(canonical({ path, start: 0, end: content.length, content_sha256: contentHash }))
    const id = hash(`${fingerprint}\nrun-1\n${contractHash}`)
    const binding = hash(canonical({ snapshot_fingerprint: fingerprint, run_id: 'run-1', contract_hash: contractHash }))
    const snapshot = join(root, `snapshot-${actor}.json`)
    writeFileSync(snapshot, JSON.stringify({ schema: 1, actor, role: actor === 'jh' ? 'actionable' : 'reference',
      run_id: 'run-1', contract_hash: contractHash, path, byte_range: { start: 0, end: content.length },
      start: 0, end: content.length, content_sha256: contentHash, snapshot_fingerprint: fingerprint, snapshot_id: id,
      content_artifact: `content/${contentHash}.bin`, binding_fingerprint: binding }))
    return { actor, role: actor === 'jh' ? 'actionable' : 'reference', snapshot, snapshot_id: id,
      snapshot_fingerprint: fingerprint, content_sha256: contentHash, byte_range: { start: 0, end: content.length }, size: content.length, path }
  })
  const setId = hash(canonical({ run_id: 'run-1', contract_hash: contractHash, actor: 'jh', actors: members }))
  const set = join(root, `snapshot-set-${setId}.json`)
  writeFileSync(set, JSON.stringify({ schema: 1, kind: 'inbox-snapshot-set', set_id: setId, run_id: 'run-1', contract_hash: contractHash, actor: 'jh', snapshots: members }))
  expect(run(ctx.project, ['bind-snapshot', 'sweep', '--state-dir', ctx.state, '--contract-path', ctx.contract,
    '--project-root', ctx.project, '--run-id', 'run-1', '--actor', 'jh', '--fencing', String(ctx.claim.fencing),
    `--token=${ctx.claim.token}`, '--snapshot-set', `.claude/vault/backlog/night-runtime/snapshots/snapshot-set-${setId}.json`]).status).toBe(0)
  return members[0]
}

function artifacts(ctx: ReturnType<typeof setup>, snapshot: ReturnType<typeof bind>, epoch = 100) {
  const out = join(ctx.project, 'runs/jh/run-1/harvest'); mkdirSync(out, { recursive: true })
  const contractHash = hash(readFileSync(ctx.contract))
  const identity = { snapshot_id: snapshot.snapshot_id, snapshot_fingerprint: snapshot.snapshot_fingerprint,
    path: snapshot.path, start: 0, end: snapshot.size, content_sha256: snapshot.content_sha256,
    content_artifact: `content/${snapshot.content_sha256}.bin`, run_id: 'run-1', contract_hash: contractHash,
    binding_path: snapshot.snapshot }
  const candidate = `${epoch}\n# harvest-metadata: ${JSON.stringify({
    actor: 'jh', source: ctx.project, status: 'ready', candidate_epoch: epoch,
    inbox_snapshot: identity, ...identity,
  })}\n`
  writeFileSync(join(out, 'rejections.md'), ''); writeFileSync(join(out, 'index.json'), JSON.stringify({
    run_id: 'run-1', source: ctx.project, contract_hash: contractHash, inbox_snapshot: identity, sessions: [] }))
  writeFileSync(join(out, '.stamp-candidate'), candidate)
  const hashes = Object.fromEntries(['index.json', 'rejections.md', '.stamp-candidate'].map(name => [name, hash(readFileSync(join(out, name)))]))
  writeFileSync(join(out, '.run-complete.json'), JSON.stringify({ run_id: 'run-1', source: ctx.project,
    contract_hash: contractHash, inbox_snapshot: identity, sessions: [], committable: true, artifacts: hashes, hashes }))
  const report = join(ctx.project, 'runs/jh/run-1/report.html'); const card = join(ctx.project, '.claude/vault/backlog/tickets/card.json')
  mkdirSync(join(ctx.project, '.claude/vault/backlog/tickets'), { recursive: true }); writeFileSync(report, 'report'); writeFileSync(card, 'card')
  writeFileSync(join(ctx.project, 'runs/jh/run-1/manifest.json'), JSON.stringify({ schema: 1, run_id: 'run-1', actor: 'jh',
    contract_hash: contractHash, status: 'reported', artifacts: [{ kind: 'report', path: 'runs/jh/run-1/report.html', sha256: hash('report') },
      { kind: 'harvest-complete', path: 'runs/jh/run-1/harvest/.run-complete.json', sha256: hash(readFileSync(join(out, '.run-complete.json'))) }],
    units: [{ id: 'u', status: 'reported', result_card: { path: '.claude/vault/backlog/tickets/card.json', sha256: hash('card') } }] }))
}

function completeArgs(ctx: ReturnType<typeof setup>, snapshot: ReturnType<typeof bind>) {
  return ['complete', 'sweep', 'success', '--state-dir', ctx.state, '--contract-path', ctx.contract, '--run-id', 'run-1',
    '--actor', 'jh', '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`, '--harvest', ctx.harvest,
    '--run-manifest', 'runs/jh/run-1/manifest.json', '--snapshot-path', snapshot.snapshot,
    '--snapshot-id', snapshot.snapshot_id, '--snapshot-fingerprint', snapshot.snapshot_fingerprint]
}

afterEach(() => workspaces.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

describe('provider-gate vault boundaries', () => {
  it('valid provider success alone writes the canonical stamp', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(0)
    expect(readFileSync(join(ctx.project, '.claude/vault/backlog/sweep/.last-success'), 'utf8')).toBe('100.0\n')
  })

  it('self-signed fake provider state cannot write a stamp', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const fake = { ...JSON.parse(readFileSync(ctx.claim.state_path, 'utf8')), status: 'committing', authority_hmac: '0'.repeat(64) }
    writeFileSync(ctx.claim.state_path, JSON.stringify(fake))
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
    expect(existsSync(join(ctx.project, '.claude/vault/backlog/sweep/.last-success'))).toBe(false)
  })

  it('candidate or run-complete changes after the committing journal are rejected', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const calls = join(ctx.project, 'calls')
    // First validation commits recovery; the second fails, leaving a real committing journal.
    writeFileSync(ctx.harvest, `#!/usr/bin/env python3
import pathlib, sys
p = pathlib.Path(${JSON.stringify(calls)})
n = int(p.read_text()) + 1 if p.exists() else 1
p.write_text(str(n))
sys.exit(1 if n > 1 else 0)
`)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
    writeFileSync(ctx.harvest, '#!/usr/bin/env python3\nimport sys\nsys.exit(0)\n')
    writeFileSync(join(ctx.project, 'runs/jh/run-1/harvest/.stamp-candidate'), '101\n')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('older candidate never moves an existing stamp backward', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot, 100)
    const stamp = join(ctx.project, '.claude/vault/backlog/sweep/.last-success'); mkdirSync(join(ctx.project, '.claude/vault/backlog/sweep'), { recursive: true }); writeFileSync(stamp, '200\n')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(0)
    expect(readFileSync(stamp, 'utf8')).toBe('200\n')
  })

  it('committing retry finalizes idempotently when a crash follows the stamp', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    writeFileSync(ctx.harvest, '#!/usr/bin/env python3\nimport sys\nsys.exit(1)\n')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
    writeFileSync(ctx.harvest, '#!/usr/bin/env python3\nimport sys\nsys.exit(0)\n')
    const stamp = join(ctx.project, '.claude/vault/backlog/sweep/.last-success'); mkdirSync(join(ctx.project, '.claude/vault/backlog/sweep'), { recursive: true }); writeFileSync(stamp, '100\n')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(0)
    expect(JSON.parse(readFileSync(ctx.claim.state_path, 'utf8'))).toMatchObject({ status: 'success' })
  })

  it('run-complete changes after the committing journal are rejected', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const calls = join(ctx.project, 'calls')
    writeFileSync(ctx.harvest, `#!/usr/bin/env python3
import pathlib, sys
p = pathlib.Path(${JSON.stringify(calls)})
n = int(p.read_text()) + 1 if p.exists() else 1
p.write_text(str(n))
sys.exit(1 if n > 1 else 0)
`)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
    writeFileSync(ctx.harvest, '#!/usr/bin/env python3\nimport sys\nsys.exit(0)\n')
    writeFileSync(join(ctx.project, 'runs/jh/run-1/harvest/.run-complete.json'), '{}')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('같은 KST 날짜의 두 번째 primary를 거부한다', () => {
    const ctx = setup()
    const result = run(ctx.project, ['primary', 'sweep', '--state-dir', ctx.state, '--contract-path', ctx.contract,
      '--project-root', ctx.project, '--run-id', 'run-2', '--actor', 'jh'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('같은 KST 날짜')
  })

  it('자동 발급 run_id의 날짜가 claim_date와 같은 KST 기준이다', () => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), 'vault-provider-gate-')))
    workspaces.push(project)
    const state = join(project, 'state')
    const contract = join(project, 'contract.md')
    writeFileSync(contract, 'contract\n')
    const claimed = run(project, ['primary', 'sweep', '--state-dir', state, '--contract-path', contract,
      '--project-root', project, '--actor', 'jh', '--probe-command', 'false', '--preflight', 'false'])
    expect(claimed.status).toBe(0)
    const claim = JSON.parse(claimed.stdout) as { run_id: string, state_path: string }
    const saved = JSON.parse(readFileSync(claim.state_path, 'utf8')) as { claim_date: string }
    // run_id는 `night-<날짜>-<uuid>` 이고, 그 날짜는 claim_date 와 같은 KST 하루여야 한다.
    // 예전 코드는 run_id 만 UTC 로 찍어 KST 00:00~09:00 실행에서 결과 디렉터리가 하루 밀렸다.
    expect(claim.run_id.slice(0, 'night-YYYY-MM-DD'.length)).toBe(`night-${saved.claim_date}`)
    expect(saved.claim_date).toBe(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10))
  })

  it('날짜 도장에 UTC 시계를 쓰지 않는다', () => {
    // 위 테스트는 KST 00:00~09:00 에만 UTC 회귀를 재현한다. 이 검사가 시각과 무관하게 막는다.
    const source = readFileSync(gate, 'utf8')
    expect(source).not.toMatch(/now\(UTC\)[^\n]*%Y-%m-%d/)
    expect(source).not.toMatch(/utcnow\(\)[^\n]*%Y-%m-%d/)
    // KST 날짜는 current_claim_date() 한 곳에서만 만든다 (중복 리터럴 금지).
    expect(source.match(/timedelta\(hours=9\)/g) ?? []).toHaveLength(1)
  })

  it('failed primary만 fallback으로 넘긴다', () => {
    const ctx = setup()
    const failed = run(ctx.project, ['complete', 'sweep', 'failed', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`])
    expect(failed.status).toBe(0)
    expect(run(ctx.project, ['fallback', 'sweep', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--actor', 'jh']).status).toBe(0)
  })

  it('canonical state_root와 project_root를 state에 기록한다', () => {
    const ctx = setup()
    expect(JSON.parse(readFileSync(ctx.claim.state_path, 'utf8'))).toMatchObject({
      state_root: realpathSync(ctx.state), project_root: ctx.project,
    })
  })

  it('다른 project-root의 complete를 거부한다', () => {
    const ctx = setup(); const other = realpathSync(mkdtempSync(join(tmpdir(), 'vault-provider-other-')))
    workspaces.push(other)
    const result = run(ctx.project, ['complete', 'sweep', 'failed', '--state-dir', ctx.state,
      '--project-root', other, '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('project-root')
  })

  it('authority HMAC 변조를 거부한다', () => {
    const ctx = setup(); const state = JSON.parse(readFileSync(ctx.claim.state_path, 'utf8'))
    state.authority_hmac = '0'.repeat(64); writeFileSync(ctx.claim.state_path, JSON.stringify(state))
    expect(run(ctx.project, ['state', 'sweep', '--state-dir', ctx.state, '--contract-path', ctx.contract,
      '--actor', 'jh']).status).toBe(1)
  })

  it('report 없는 success manifest를 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const manifest = join(ctx.project, 'runs/jh/run-1/manifest.json')
    const value = JSON.parse(readFileSync(manifest, 'utf8'))
    value.artifacts = value.artifacts.slice(1); writeFileSync(manifest, JSON.stringify(value))
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('report hash 불일치를 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    writeFileSync(join(ctx.project, 'runs/jh/run-1/report.html'), 'changed')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('result-card hash 불일치를 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    writeFileSync(join(ctx.project, '.claude/vault/backlog/tickets/card.json'), 'changed')
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('unlocked harvest validate 뒤 report 변경을 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    writeFileSync(ctx.harvest, `#!/usr/bin/env python3
import pathlib, sys
pathlib.Path(${JSON.stringify(join(ctx.project, 'runs/jh/run-1/report.html'))}).write_text('changed')
`)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('reference snapshot은 success complete에 쓸 수 없다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const state = JSON.parse(readFileSync(ctx.claim.state_path, 'utf8'))
    const args = completeArgs(ctx, snapshot)
    args[args.indexOf('--snapshot-path') + 1] = state.reference_snapshot_path
    args[args.indexOf('--snapshot-id') + 1] = state.reference_snapshot_id
    args[args.indexOf('--snapshot-fingerprint') + 1] = state.reference_snapshot_fingerprint
    expect(run(ctx.project, args).status).toBe(1)
  })

  it('committing journal은 fallback으로 덮을 수 없다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    writeFileSync(ctx.harvest, `#!/usr/bin/env python3
import pathlib,sys
p=pathlib.Path(${JSON.stringify(join(ctx.project, 'harvest-count'))})
n=int(p.read_text()) if p.exists() else 0
p.write_text(str(n+1))
sys.exit(0 if n == 0 else 1)
`)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
    expect(run(ctx.project, ['fallback', 'sweep', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--actor', 'jh']).status).toBe(1)
  })

  it('committing journal은 failed terminal로 덮을 수 없다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    writeFileSync(ctx.harvest, `#!/usr/bin/env python3
import pathlib,sys
p=pathlib.Path(${JSON.stringify(join(ctx.project, 'harvest-count'))})
n=int(p.read_text()) if p.exists() else 0
p.write_text(str(n+1))
sys.exit(0 if n == 0 else 1)
`)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
    expect(run(ctx.project, ['complete', 'sweep', 'failed', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`]).status).toBe(1)
  })

  it('이전 날짜 committing journal은 새 primary를 막는다', () => {
    const ctx = setup(); const old = JSON.parse(readFileSync(ctx.claim.state_path, 'utf8'))
    old.claim_date = '2000-01-01'
    const key = readFileSync(join(ctx.state, '.authority-key'))
    old.authority_hmac = createHmac('sha256', key).update(canonical({
      schema: old.schema, job: old.job, run_id: old.run_id, contract_hash: old.contract_hash,
      claim_date: old.claim_date, actor: old.actor, state_root: old.state_root, project_root: old.project_root,
    })).digest('hex')
    writeFileSync(join(ctx.state, 'sweep-2000-01-01.json'), JSON.stringify(old))
    rmSync(ctx.claim.state_path)
    expect(run(ctx.project, ['primary', 'sweep', '--state-dir', ctx.state, '--contract-path', ctx.contract,
      '--project-root', ctx.project, '--run-id', 'run-2', '--actor', 'jh']).status).toBe(1)
  })

  it('success 완료에는 snapshot binding 전체가 필요하다', () => {
    const ctx = setup()
    expect(run(ctx.project, ['complete', 'sweep', 'success', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`]).status).toBe(1)
  })

  it('success 완료에는 canonical manifest가 필요하다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const args = completeArgs(ctx, snapshot)
    args[args.indexOf('--run-manifest') + 1] = 'manifest.json'
    expect(run(ctx.project, args).status).toBe(1)
  })

  it('timeout은 lease grace 안에서 terminal 기록한다', () => {
    const ctx = setup(); const state = JSON.parse(readFileSync(ctx.claim.state_path, 'utf8'))
    state.lease_until = Date.now() / 1000 - 1; writeFileSync(ctx.claim.state_path, JSON.stringify(state))
    expect(run(ctx.project, ['complete', 'sweep', 'timeout', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`]).status).toBe(0)
  })

  it('success view는 completion proof를 노출하지 않는다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(0)
    const view = run(ctx.project, ['state', 'sweep', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--actor', 'jh'])
    expect(JSON.parse(view.stdout)).not.toHaveProperty('completion_proof')
  })

  it('fallback actor 불일치를 거부한다', () => {
    const ctx = setup()
    expect(run(ctx.project, ['complete', 'sweep', 'failed', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), `--token=${ctx.claim.token}`]).status).toBe(0)
    expect(run(ctx.project, ['fallback', 'sweep', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--actor', 'hs']).status).toBe(1)
  })

  it('duplicate manifest artifact kind를 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const path = join(ctx.project, 'runs/jh/run-1/manifest.json'); const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.artifacts.push(manifest.artifacts[0]); writeFileSync(path, JSON.stringify(manifest))
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('duplicate manifest unit id를 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const path = join(ctx.project, 'runs/jh/run-1/manifest.json'); const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.units.push(manifest.units[0]); writeFileSync(path, JSON.stringify(manifest))
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('project 밖 report 경로를 거부한다', () => {
    const ctx = setup(); const snapshot = bind(ctx); artifacts(ctx, snapshot)
    const path = join(ctx.project, 'runs/jh/run-1/manifest.json'); const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.artifacts[0].path = '../report.html'; writeFileSync(path, JSON.stringify(manifest))
    expect(run(ctx.project, completeArgs(ctx, snapshot)).status).toBe(1)
  })

  it('late owner token을 거부한다', () => {
    const ctx = setup()
    expect(run(ctx.project, ['complete', 'sweep', 'failed', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing), '--token=wrong']).status).toBe(1)
  })

  it('late fencing counter를 거부한다', () => {
    const ctx = setup()
    expect(run(ctx.project, ['complete', 'sweep', 'failed', '--state-dir', ctx.state,
      '--contract-path', ctx.contract, '--run-id', 'run-1', '--actor', 'jh',
      '--fencing', String(ctx.claim.fencing + 1), `--token=${ctx.claim.token}`]).status).toBe(1)
  })
})
