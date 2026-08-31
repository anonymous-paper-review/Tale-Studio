import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const runtime = resolve('.claude/vault/backlog/ticket-runtime.py')
const dirs: string[] = []
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
const call = (args: string[], at = '1000') => JSON.parse(execFileSync('python3', [runtime, ...args], { encoding: 'utf8', env: { ...process.env, TICKET_RUNTIME_NOW: at } }))
const fail = (args: string[], at = '1000') => spawnSync('python3', [runtime, ...args], { encoding: 'utf8', env: { ...process.env, TICKET_RUNTIME_NOW: at } })
const make = () => {
  const root = mkdtempSync(join(tmpdir(), 'ticket-runtime-')); dirs.push(root)
  mkdirSync(join(root, '.claude', 'vault', 'backlog', 'tickets'), { recursive: true })
  writeFileSync(join(root, '.claude', 'vault', 'backlog', 'tickets', 'one.md'), '# one')
  git(root, 'init'); git(root, 'config', 'user.email', 'test@example.com'); git(root, 'config', 'user.name', 'Test')
  writeFileSync(join(root, 'base.txt'), 'base\n')
  writeFileSync(join(root, '.gitignore'), [
    '.claude/vault/backlog/tickets/state/',
    '.claude/vault/backlog/tickets/checkpoints/',
    '.claude/worktrees/',
    '',
  ].join('\n'))
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base')
  const worktree = join(root, '.claude', 'worktrees', 'one'); mkdirSync(join(root, '.claude', 'worktrees'), { recursive: true })
  git(root, 'worktree', 'add', '-b', 'ticket-one', worktree)
  return { root, worktree }
}
const claim = (root: string, worktree: string, session = 'day') => call(['claim', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', session, '--owner-kind', 'day', '--worktree', worktree, '--lease-seconds', '50'])
const checkpointInput = (changed_files: string[] = []) => JSON.stringify({ objective: 'finish', completed: [], remaining: ['review'], tests: [], blockers: [], next_action: 'continue', changed_files })
const addTicket = (root: string, id: string) => writeFileSync(join(root, '.claude', 'vault', 'backlog', 'tickets', `${id}.md`), `# ${id}`)
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

// 실측 기반 시간 예산 (티켓 vault-test-timeout-cost-map-2026-08-23):
// 이 파일의 매 시험이 ticket-runtime.py 를 python3 자식 프로세스로 새로 띄운다.
// 단독 실행 기준 파일당 약 23.5초, 최악 단일 시험(rejects post-checkpoint HEAD and branch
// drift before fencing takeover) 3137ms/5000ms(63%) — 로직이 아니라 파이썬 프로세스
// 기동 대기(246회 × 191ms)가 원인이라 병렬 부하에서 수 배로 흔들린다.
describe('vault ticket handoff runtime', () => {
  it('rejects duplicate and fresh takeover claims, but heartbeats the owner', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    expect(fail(['claim', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'other', '--owner-kind', 'day', '--worktree', worktree, '--lease-seconds', '50']).status).toBe(1)
    expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50']).status).toBe(1)
    expect(fail(['release', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--status', 'paused']).status).toBe(1)
    expect(call(['heartbeat', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '70']).status).toBe('running')
  })

  it('allows paused checkpoint takeover with higher fencing and rejects stale owners', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '50', '--status', 'paused', '--input', checkpointInput()])
    expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'hs', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50']).status).toBe(1)
    const night = call(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50'])
    expect(night.fencing).toBe(first.fencing + 1)
    expect(night.session_history).toEqual(['day'])
    expect(fail(['release', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--status', 'released']).status).toBe(1)
  })

  it('requires a valid checkpoint for expired work and classifies manual review', () => {
    const { root, worktree } = make(); claim(root, worktree)
    expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50'], '1051').status).toBe(1)
    expect(call(['status', '--project', root, '--ticket-id', 'one'], '1051').classification).toBe('manual_review')
  })

  // 저장 기록은 사본 밖(checkpoints/)에 있어 사본을 지워도 계속 읽힌다. 그래서 사본이 사라진
  // 티켓이 "이어받을 수 있음"으로 계속 뜨던 거짓 초록 — 티켓 ticket-runtime-worktree-drift-2026-08-26.
  it('stops calling a ticket takeover-ready once its worktree is gone', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '1', '--status', 'running', '--input', checkpointInput()])
    expect(call(['status', '--project', root, '--ticket-id', 'one'], '1002')).toMatchObject({ classification: 'takeover_ready', worktree_present: true })
    rmSync(worktree, { recursive: true, force: true })
    expect(call(['status', '--project', root, '--ticket-id', 'one'], '1002')).toMatchObject({
      classification: 'manual_review', checkpoint_valid: true, worktree_present: false,
    })
    expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50'], '1002').status).toBe(1)
  })

  it('takes expired work over only after a dirty checkpoint and preserves untracked content in patch', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    writeFileSync(join(worktree, 'base.txt'), 'changed\n'); writeFileSync(join(worktree, 'new.txt'), 'untracked\n')
    call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '1', '--status', 'running', '--input', checkpointInput(['base.txt', 'new.txt'])])
    const night = call(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50'], '1002')
    const state = call(['status', '--project', root, '--ticket-id', 'one'], '1002')
    const checkpoint = JSON.parse(readFileSync(state.latest_checkpoint_path, 'utf8'))
    expect(night.fencing).toBe(2); expect(readFileSync(checkpoint.patch_path, 'utf8')).toContain('new.txt')
  })

  it('rejects changed-file mismatch, invalid worktrees, and symlink paths', () => {
    const { root, worktree } = make(); const first = claim(root, worktree); writeFileSync(join(worktree, 'base.txt'), 'dirty\n')
    expect(fail(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '50', '--status', 'running', '--input', checkpointInput([])]).status).toBe(1)
    symlinkSync(worktree, join(root, 'linked'))
    expect(fail(['claim', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'x', '--owner-kind', 'day', '--worktree', join(root, 'linked'), '--lease-seconds', '1']).status).toBe(1)
  })

  it('never permits reference-only main takeover and lists its distinct classification', () => {
    const { root } = make(); const main = call(['claim', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'main', '--owner-kind', 'day', '--worktree', root, '--lease-seconds', '50', '--reference-only-main'])
    expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', root, '--lease-seconds', '50']).status).toBe(1)
    expect(call(['list', '--project', root, '--actor', 'jh']).tickets[0].classification).toBe('reference_only')
    expect(main.workspace_mode).toBe('reference-only-main')
    const paused = call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'main',
      '--owner-token', main.owner_token, '--fencing', String(main.fencing), '--lease-seconds', '50',
      '--status', 'paused', '--input', checkpointInput()])
    expect(paused.status).toBe('paused')
    expect(call(['release', '--project', root, '--ticket-id', 'one', '--session-id', 'main',
      '--owner-token', main.owner_token, '--fencing', String(main.fencing), '--status', 'released']).status).toBe('released')
  })

  it('detects HMAC tampering and ignores crash-orphan temporary artifacts', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    const checkpoints = join(root, '.claude', 'vault', 'backlog', 'tickets', 'checkpoints', 'one')
    mkdirSync(checkpoints, { recursive: true }); writeFileSync(join(checkpoints, 'orphan.patch.tmp-crash'), 'orphan')
    call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '50', '--status', 'running', '--input', checkpointInput()])
    const state = join(root, '.claude', 'vault', 'backlog', 'tickets', 'state', 'one.json')
    writeFileSync(state, readFileSync(state, 'utf8').replace('"status":"running"', '"status":"released"'))
    expect(fail(['status', '--project', root, '--ticket-id', 'one']).status).toBe(1)
  })

  it('rejects non-finite, zero, and oversized leases on every lease command', () => {
    const { root, worktree } = make()
    for (const lease of ['NaN', 'Infinity', '0', '3601']) {
      expect(fail(['claim', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', lease, '--owner-kind', 'day', '--worktree', worktree, '--lease-seconds', lease]).status).toBe(1)
    }
    const first = claim(root, worktree)
    for (const command of [
      ['heartbeat', '--lease-seconds', 'Infinity'],
      ['checkpoint', '--lease-seconds', 'NaN', '--status', 'running', '--input', checkpointInput()],
    ]) {
      const [name, ...options] = command
      expect(fail([name!, '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), ...options]).status).toBe(1)
    }
  })

  it('marks a stale checkpoint manual-review without raising fencing', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '1', '--status', 'running', '--input', checkpointInput()])
    writeFileSync(join(worktree, 'after-checkpoint.txt'), 'drift\n')
    expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50'], '1002').status).toBe(1)
    const state = call(['status', '--project', root, '--ticket-id', 'one'], '1002')
    expect(state.status).toBe('manual_review'); expect(state.classification).toBe('manual_review')
    expect(state.fencing).toBe(first.fencing)
  })

  it('rejects post-checkpoint HEAD and branch drift before fencing takeover', () => {
    for (const drift of ['head', 'branch']) {
      const { root, worktree } = make(); const first = claim(root, worktree)
      call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '1', '--status', 'running', '--input', checkpointInput()])
      if (drift === 'head') git(worktree, 'commit', '--allow-empty', '-m', 'post-checkpoint')
      else git(worktree, 'checkout', '-b', 'post-checkpoint-branch')
      expect(fail(['takeover', '--project', root, '--ticket-id', 'one', '--actor', 'jh', '--session-id', 'night', '--owner-kind', 'night', '--worktree', worktree, '--lease-seconds', '50'], '1002').status).toBe(1)
      expect(call(['status', '--project', root, '--ticket-id', 'one'], '1002')).toMatchObject({
        status: 'manual_review', classification: 'manual_review',
      })
    }
  })

  it('creates replayable relative patches for nested untracked files and rejects expired release', () => {
    const { root, worktree } = make(); const first = claim(root, worktree)
    mkdirSync(join(worktree, 'nested', 'deep'), { recursive: true }); writeFileSync(join(worktree, 'nested', 'deep', 'new.txt'), 'new\n')
    call(['checkpoint', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--lease-seconds', '1', '--status', 'running', '--input', checkpointInput(['nested/deep/new.txt'])])
    const state = call(['status', '--project', root, '--ticket-id', 'one'])
    const checkpoint = JSON.parse(readFileSync(state.latest_checkpoint_path, 'utf8'))
    expect(readFileSync(checkpoint.patch_path, 'utf8')).toContain('nested/deep/new.txt')
    expect(fail(['release', '--project', root, '--ticket-id', 'one', '--session-id', 'day', '--owner-token', first.owner_token, '--fencing', String(first.fencing), '--status', 'released'], '1002').status).toBe(1)
  })

  it('serializes cross-ticket worktree reservations and limits main sharing to one actor session', () => {
    const { root, worktree } = make(); addTicket(root, 'two')
    claim(root, worktree)
    expect(fail(['claim', '--project', root, '--ticket-id', 'two', '--actor', 'jh', '--session-id', 'day', '--owner-kind', 'day', '--worktree', worktree, '--lease-seconds', '50']).status).toBe(1)
    const main = call(['claim', '--project', root, '--ticket-id', 'two', '--actor', 'jh', '--session-id', 'main', '--owner-kind', 'day', '--worktree', root, '--lease-seconds', '50', '--reference-only-main'])
    addTicket(root, 'three')
    expect(call(['claim', '--project', root, '--ticket-id', 'three', '--actor', 'jh', '--session-id', 'main', '--owner-kind', 'day', '--worktree', root, '--lease-seconds', '50', '--reference-only-main']).workspace_mode).toBe('reference-only-main')
    addTicket(root, 'four')
    expect(fail(['claim', '--project', root, '--ticket-id', 'four', '--actor', 'hs', '--session-id', 'main', '--owner-kind', 'day', '--worktree', root, '--lease-seconds', '50', '--reference-only-main']).status).toBe(1)
    expect(main.session_history).toEqual([])
  })
}, 30000)
