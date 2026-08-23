import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const runtime = resolve('.claude/vault/backlog/night-runtime.py')
const provider = resolve('.claude/vault/backlog/provider-gate.py')
const dirs: string[] = []
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const authority = (key: Buffer, state: Record<string, unknown>) => {
  const identity = {
    schema: state.schema, job: state.job, run_id: state.run_id, contract_hash: state.contract_hash,
    claim_date: state.claim_date, actor: state.actor, state_root: state.state_root,
    project_root: state.project_root,
  }
  const canonical = Object.fromEntries(Object.entries(identity).sort(([left], [right]) => left.localeCompare(right)))
  return createHmac('sha256', key).update(JSON.stringify(canonical)).digest('hex')
}
const inboxPath = (dir: string, actor = 'jh') => join(dir, '.claude', 'vault', 'inbox', `${actor}.md`)
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-runtime-owner-'))
  dirs.push(dir)
  execFileSync('mkdir', ['-p', join(dir, '.claude', 'vault', 'inbox')])
  return dir
}
const call = (args: string[]) => JSON.parse(execFileSync('python3', [runtime, ...args], { encoding: 'utf8' }))
const fail = (args: string[]) => spawnSync('python3', [runtime, ...args], { encoding: 'utf8' })
const owner = (state: string, changes: Record<string, unknown> = {}) => {
  const stateDir = join(dirname(state), 'provider-state')
  execFileSync('mkdir', ['-p', stateDir])
  const canonicalStateDir = realpathSync(stateDir)
  const canonical = join(canonicalStateDir, 'sweep-2026-08-18.json')
  const key = Buffer.alloc(32, 1)
  writeFileSync(join(canonicalStateDir, '.authority-key'), key, { mode: 0o600 })
  chmodSync(join(canonicalStateDir, '.authority-key'), 0o600)
  const value = {
    schema: 1, job: 'sweep', status: 'claimed', run_id: 'run-1', owner_token: 'owner-1',
    lease_until: Date.now() / 1000 + 60, fencing: 1, contract_hash: 'contract-1',
    claim_date: '2026-08-18', actor: 'jh', state_root: canonicalStateDir,
    project_root: realpathSync(dirname(state)), ...changes,
  }
  Object.assign(value, { authority_hmac: authority(key, value) })
  writeFileSync(canonical, JSON.stringify(value))
  return ['--provider-state', canonical, '--owner-token', 'owner-1', '--fencing', '1',
    '--run-id', 'run-1', '--contract-hash', 'contract-1']
}
const snapshot = (dir: string, proof: string[]) => call([
  'snapshot-inbox', '--actor', 'jh', '--role', 'actionable', '--path', join(dir, '.claude', 'vault', 'inbox', 'jh.md'),
  '--out-dir', join(dir, 'snapshots'), ...proof,
])
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('provider owner fencing', () => {
  it('returns the canonical actual state path from every provider JSON view', () => {
    const dir = make()
    const contract = join(dir, 'contract.md')
    const stateDir = join(dir, 'state')
    writeFileSync(contract, 'contract')
    const primary = JSON.parse(execFileSync('python3', [provider, 'primary', 'sweep', '--state-dir', stateDir,
      '--contract-path', contract, '--run-id', 'run-1', '--probe-command', '/usr/bin/true',
      '--actor', 'jh', '--project-root', dir], { encoding: 'utf8' }))
    const state = JSON.parse(execFileSync('python3', [provider, 'state', 'sweep', '--state-dir', stateDir,
      '--contract-path', contract, '--actor', 'jh', '--project-root', dir], { encoding: 'utf8' }))
    expect(primary.state_path).toBe(resolve(primary.state_path))
    expect(state.state_path).toBe(primary.state_path)

    const failed = JSON.parse(readFileSync(primary.state_path, 'utf8'))
    failed.status = 'failed'
    writeFileSync(primary.state_path, JSON.stringify(failed))
    const fallback = JSON.parse(execFileSync('python3', [provider, 'fallback', 'sweep', '--state-dir', stateDir,
      '--contract-path', contract, '--run-id', 'run-1', '--probe-command', '/usr/bin/true',
      '--actor', 'jh', '--project-root', dir], { encoding: 'utf8' }))
    expect(fallback.state_path).toBe(primary.state_path)
    const complete = JSON.parse(execFileSync('python3', [provider, 'complete', 'sweep', 'failed', '--state-dir', stateDir,
      '--contract-path', contract, '--run-id', 'run-1', `--token=${fallback.owner_token}`,
      '--fencing', String(fallback.fencing), '--actor', 'jh', '--project-root', dir], { encoding: 'utf8' }))
    expect(complete.state_path).toBe(primary.state_path)
    // primary 와 fallback 은 각각 provider-gate 의 preflight 를 돌고, 그 스크립트가
    // 도구 확인용으로 --help 를 12번 따로 띄운다. 이 시험만 그 두 명령을 다 부르므로
    // 고정 비용이 5.3초로 vitest 기본 예산 5초를 넘는다 (측정 3회: 5.75/5.55/5.84초).
    // 같은 파일의 다음 느린 시험은 3.3초라 여유가 있다.
  }, 30000)

  it('allows an active owner to snapshot, track, reconcile, and archive', () => {
    const dir = make()
    const state = join(dir, 'provider.json')
    const proof = owner(state)
    const inbox = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
    writeFileSync(inbox, 'task\n')
    const snap = snapshot(dir, proof)
    for (const status of ['claimed', 'decomposed', 'executed', 'reported']) {
      call(['snapshot-status', '--snapshot-path', snap.snapshot, '--snapshot-fingerprint', snap.snapshot_fingerprint,
        '--status', status, '--out-dir', join(dir, 'snapshots'), ...proof])
    }
    const archiveRoot = join(dir, '.claude', 'vault', '_archive', 'inbox')
    const archive = call(['archive-inbox', '--snapshot-path', snap.snapshot, '--archive-root', archiveRoot,
      '--approval-state', 'reported', ...proof])
    expect(readFileSync(archive.archive, 'utf8')).toBe('task\n')

    writeFileSync(inbox, '---\ntrack\n')
    const candidate = call(['scan-inbox', '--path', inbox, '--actor', 'jh', '--project-root', dir]).unmarked_candidates[0]
    const proposed = candidate.proposed_item_id
    const tracked = call(['track-inbox', '--path', inbox, '--actor', 'jh', '--snapshot-id', snap.snapshot_id,
      '--item-id', proposed, '--expected-hash', sha('---\ntrack\n'),
      '--start', String(candidate.byte_range.start), '--end', String(candidate.byte_range.end), '--unit', 'u', ...proof])
    const receipts = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')
    const card = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'result.json')
    mkdirSync(receipts, { recursive: true })
    writeFileSync(card, 'result')
    writeFileSync(join(receipts, 'receipt-1.json'), JSON.stringify({
      schema: 1, receipt_id: 'receipt-1', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', evidence: [{
        kind: 'result-card', path: '.claude/vault/backlog/tickets/result.json', sha256: sha('result'),
      }],
    }))
    call(['reconcile-inbox', '--actor', 'jh', '--path', inbox, '--receipt-dir', receipts, ...proof])
    expect(readFileSync(inbox, 'utf8')).toContain('<del>')
  })

  it('rejects missing keys, forged authority, and immutable identity tampering before mutation', () => {
    const dir = make()
    const state = join(dir, 'provider.json')
    const proof = owner(state)
    const canonical = join(dir, 'provider-state', 'sweep-2026-08-18.json')
    const inbox = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
    writeFileSync(inbox, 'task\n')
    const args = ['snapshot-inbox', '--actor', 'jh', '--role', 'actionable', '--path', inbox,
      '--out-dir', join(dir, 'snapshots'), ...proof]

    unlinkSync(join(dir, 'provider-state', '.authority-key'))
    expect(fail(args).status).toBe(1)

    owner(state)
    chmodSync(join(dir, 'provider-state', '.authority-key'), 0o644)
    expect(fail(args).status).toBe(1)

    owner(state)
    writeFileSync(join(dir, 'provider-state', '.authority-key'), Buffer.alloc(31, 1), { mode: 0o600 })
    chmodSync(join(dir, 'provider-state', '.authority-key'), 0o600)
    expect(fail(args).status).toBe(1)

    owner(state)
    const forged = JSON.parse(readFileSync(canonical, 'utf8'))
    forged.authority_hmac = '0'.repeat(64)
    writeFileSync(canonical, JSON.stringify(forged))
    expect(fail(args).status).toBe(1)

    owner(state)
    const tampered = JSON.parse(readFileSync(canonical, 'utf8'))
    tampered.project_root = join(dir, 'other-project')
    writeFileSync(canonical, JSON.stringify(tampered))
    expect(fail(args).status).toBe(1)

    const fakeRoot = join(dir, 'copied-state')
    execFileSync('mkdir', ['-p', fakeRoot])
    const copied = { ...tampered, state_root: realpathSync(fakeRoot) }
    writeFileSync(join(fakeRoot, 'sweep-2026-08-18.json'), JSON.stringify(copied))
    const copiedProof = ['--provider-state', join(fakeRoot, 'sweep-2026-08-18.json'),
      '--owner-token', 'owner-1', '--fencing', '1', '--run-id', 'run-1',
      '--contract-hash', 'contract-1']
    expect(fail(['snapshot-inbox', '--actor', 'jh', '--role', 'actionable', '--path', inbox,
      '--out-dir', join(dir, 'copied-snapshots'), ...copiedProof]).status).toBe(1)
  })

  it('rejects archive roots outside the canonical inbox archive, including symlink escapes', () => {
    const dir = make()
    const state = join(dir, 'provider.json')
    const proof = owner(state)
    const inbox = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
    writeFileSync(inbox, 'task\n')
    const snap = snapshot(dir, proof)
    for (const status of ['claimed', 'decomposed', 'executed', 'reported']) {
      call(['snapshot-status', '--snapshot-path', snap.snapshot, '--snapshot-fingerprint', snap.snapshot_fingerprint,
        '--status', status, '--out-dir', join(dir, 'snapshots'), ...proof])
    }
    const args = ['archive-inbox', '--snapshot-path', snap.snapshot, '--approval-state', 'reported', ...proof]
    expect(fail([...args, '--archive-root', join(dir, 'archive')]).status).toBe(1)

    const escape = join(dir, 'escape')
    execFileSync('mkdir', ['-p', escape])
    const linked = join(dir, '.claude', 'vault', '_archive', 'inbox')
    execFileSync('mkdir', ['-p', dirname(linked)])
    symlinkSync(escape, linked)
    expect(fail([...args, '--archive-root', linked]).status).toBe(1)
  })

  const staleChanges: Array<[string, Record<string, unknown>]> = [
    ['token change', { owner_token: 'new-owner' }],
    ['fencing increase', { fencing: 2 }],
    ['terminal status', { status: 'failed' }],
    ['lease expiry', { lease_until: 0 }],
  ]
  for (const [label, change] of staleChanges) {
    it(`rejects every stale mutation after ${label} without changing targets`, () => {
      const dir = make()
      const state = join(dir, 'provider.json')
      const proof = owner(state)
      const inbox = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
      writeFileSync(inbox, 'task\n')
      const snap = snapshot(dir, proof)
      const beforeSnapshot = readFileSync(snap.snapshot, 'utf8')
      const beforeInbox = readFileSync(inbox, 'utf8')
      const beforeFiles = readdirSync(join(dir, 'snapshots')).sort()
      owner(state, change)
      const commands = [
        ['snapshot-inbox', '--actor', 'jh', '--role', 'actionable', '--path', inbox, '--out-dir', join(dir, 'snapshots')],
        ['snapshot-inbox-set', '--actor', 'jh', '--actors', 'jh', '--inbox-dir', dir, '--out-dir', join(dir, 'snapshots')],
        ['snapshot-status', '--snapshot-path', snap.snapshot, '--snapshot-fingerprint', snap.snapshot_fingerprint, '--status', 'claimed', '--out-dir', join(dir, 'snapshots')],
        ['archive-inbox', '--snapshot-path', snap.snapshot, '--archive-root', join(dir, 'archive'), '--approval-state', 'reported'],
        ['track-inbox', '--path', inbox, '--actor', 'jh', '--snapshot-id', snap.snapshot_id, '--item-id', '0'.repeat(64), '--expected-hash', sha(beforeInbox), '--start', '0', '--end', '5', '--unit', 'u'],
        ['reconcile-inbox', '--actor', 'jh', '--path', inbox, '--receipt-dir', join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')],
      ]
      for (const command of commands) expect(fail([...command, ...proof]).status).toBe(1)
      expect(readFileSync(snap.snapshot, 'utf8')).toBe(beforeSnapshot)
      expect(readFileSync(inbox, 'utf8')).toBe(beforeInbox)
      expect(readdirSync(join(dir, 'snapshots')).sort()).toEqual(beforeFiles)
    })
  }
})
