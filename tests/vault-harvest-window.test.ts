import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const harvest = resolve('.claude/vault/backlog/harvest.py')
const workspaces: string[] = []
const digest = (text: string) => createHash('sha256').update(text).digest('hex')

function workspace() {
  const project = mkdtempSync(join(tmpdir(), 'vault-harvest-'))
  mkdirSync(join(project, '.claude', 'vault', 'backlog'), { recursive: true })
  writeFileSync(join(project, '.claude', 'vault', 'backlog', '_NIGHT.md'), 'contract\n')
  installTicketRuntime(project)
  workspaces.push(project)
  return project
}

function run(project: string, args: string[]) {
  return spawnSync('python3', [harvest, '--project', project, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: project },
  })
}

function installTicketRuntime(project: string, tickets: unknown[] = [], failure?: string) {
  const runtime = join(project, '.claude', 'vault', 'backlog', 'ticket-runtime.py')
  mkdirSync(join(project, '.claude', 'vault', 'backlog'), { recursive: true })
  const source = failure ?? [
    'import json,sys',
    `tickets=${JSON.stringify(tickets)}`,
    'actor=sys.argv[sys.argv.index("--actor")+1]',
    'print(json.dumps({"actor":actor,"tickets":tickets}))',
  ].join('\n')
  writeFileSync(runtime, source)
  chmodSync(runtime, 0o755)
}

function writeClaudeSession(project: string, sessionId: string, modifiedAt: string) {
  const canonical = realpathSync(project)
  const dir = join(project, '.claude', 'projects', canonical.replaceAll('/', '-'))
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sessionId}.jsonl`)
  writeFileSync(path, `${JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'text', text: '작업을 이어 간다' }] },
  })}\n`)
  const when = new Date(modifiedAt)
  utimesSync(path, when, when)
  return path
}

function writeGjcSession(project: string, sessionId: string, modifiedAt: string) {
  const dir = join(project, '.gjc', 'agent', 'sessions', 'store')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `2026-08-18T00-00-00-000Z_${sessionId}.jsonl`)
  writeFileSync(path, [
    JSON.stringify({ type: 'session', id: sessionId, cwd: realpathSync(project) }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: '작업을 이어 간다' } }),
  ].join('\n') + '\n')
  const when = new Date(modifiedAt)
  utimesSync(path, when, when)
  return path
}

afterEach(() => {
  for (const path of workspaces.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('harvest completion and recovery window', () => {
  it('공개 --commit-success와 provider authority 옵션을 제공하지 않는다', () => {
    const project = workspace()
    const result = run(project, ['--commit-success', '--run-id', 'run-1', '--actor', 'jh'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--commit-success')
    expect(run(project, ['--provider-state', 'fake']).status).toBe(2)
  })

  it('explicit --out은 canonical harvest 디렉터리에 생성·검증만 한다', () => {
    const project = workspace()
    const runId = 'run-1'
    const actor = 'jh'
    const out = join(project, 'runs', actor, runId, 'harvest')
    const generated = run(project, [
      '--out', out, '--run-id', runId, '--actor', actor, '--now', '2026-08-18T00:00:00Z',
    ])
    expect(generated.status).toBe(0)
    expect(existsSync(join(out, 'index.json'))).toBe(true)
    expect(existsSync(join(out, '.run-complete.json'))).toBe(true)
    expect(existsSync(join(out, 'runs', actor, runId, '.run-complete.json'))).toBe(false)

    const validated = run(project, [
      '--validate-complete', '--out', out, '--run-id', runId, '--actor', actor,
      '--now', '2026-08-18T00:00:00Z',
    ])
    expect(validated.status).toBe(0)
    expect(validated.stdout).toContain(out)

    expect(existsSync(join(project, '.claude/vault/backlog/sweep/.last-success'))).toBe(false)
  })

  it('actor별 existing index의 최초 기준 시각을 재사용한다', () => {
    const project = workspace()
    const runId = 'run-1'
    const jhOut = join(project, 'runs', 'jh', runId, 'harvest')
    const hsOut = join(project, 'runs', 'hs', runId, 'harvest')
    expect(run(project, [
      '--out', jhOut, '--run-id', runId, '--actor', 'jh', '--now', '2026-08-01T00:00:00Z',
    ]).status).toBe(0)
    expect(run(project, [
      '--out', hsOut, '--run-id', runId, '--actor', 'hs', '--now', '2026-08-02T00:00:00Z',
    ]).status).toBe(0)

    const jhResume = run(project, ['--out', jhOut, '--run-id', runId, '--actor', 'jh'])
    const hsResume = run(project, ['--out', hsOut, '--run-id', runId, '--actor', 'hs'])
    expect(jhResume.status).toBe(0)
    expect(jhResume.stdout).toContain('기준시각 2026-08-01T00:00Z')
    expect(hsResume.status).toBe(0)
    expect(hsResume.stdout).toContain('기준시각 2026-08-02T00:00Z')
  })

  it('explicit --out의 actor/run 불일치와 project 밖 경로를 거부한다', () => {
    const project = workspace()
    const mismatch = run(project, [
      '--out', join(project, 'runs', 'hs', 'run-1', 'harvest'),
      '--run-id', 'run-1', '--actor', 'jh',
    ])
    expect(mismatch.status).toBe(2)
    expect(mismatch.stdout).toContain('출력 경로')

    const escaped = run(project, [
      '--out', join(project, '..', 'escaped-harvest'),
      '--run-id', 'run-1', '--actor', 'jh',
    ])
    expect(escaped.status).toBe(2)
    expect(escaped.stdout).toContain('출력 경로')
  })

  it('full session ID만 ticket handoff로 연결하고 recent active는 표시만 한다', () => {
    const project = workspace()
    const targetSession = 'claude-full-session-id-0001'
    const recentSession = 'claude-full-session-id-0002'
    writeClaudeSession(project, targetSession, '2026-08-18T00:20:00Z')
    writeClaudeSession(project, recentSession, '2026-08-18T01:40:00Z')
    installTicketRuntime(project, [
      {
        ticket_id: 'takeover-ticket',
        owner_session_id: targetSession,
        session_history: [targetSession, 'previous-day-full-session-id'],
        classification: 'takeover_ready',
        latest_checkpoint_path: '/checkpoint/takeover.json',
        latest_checkpoint_hash: 'checkpoint-hash',
        worktree: '/worktree/takeover',
        fencing: 7,
        owner_token: 'must-never-be-harvested',
      },
      {
        ticket_id: 'recent-active-ticket',
        owner_session_id: recentSession,
        classification: 'active',
        latest_checkpoint_path: '/checkpoint/active.json',
        latest_checkpoint_hash: 'active-hash',
        worktree: '/worktree/active',
        fencing: 8,
      },
      {
        ticket_id: 'prefix-only-ticket',
        owner_session_id: targetSession.slice(0, -1),
        classification: 'manual_review',
        fencing: 9,
      },
    ])

    const dry = run(project, ['--dry-run', '--actor', 'jh', '--now', '2026-08-18T02:00:00Z'])
    expect(dry.status).toBe(0)
    expect(dry.stdout).toContain('recent-active-ticket:active')
    expect(dry.stdout).toContain('skip:작업중')
    expect(dry.stdout).not.toContain('prefix-only-ticket:manual_review')

    const out = join(project, 'runs', 'jh', 'run-1', 'harvest')
    const actual = run(project, [
      '--out', out, '--run-id', 'run-1', '--actor', 'jh', '--now', '2026-08-18T02:00:00Z',
    ])
    expect(actual.status).toBe(0)
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    expect(index.ticket_handoffs.queried_at).toBe('2026-08-18T02:00:00+00:00')
    expect(index.ticket_handoffs.tickets).toHaveLength(3)
    expect(JSON.stringify(index)).not.toContain('must-never-be-harvested')
    expect(index.sessions).toHaveLength(1)
    expect(index.sessions[0].ticket_ids).toEqual(['takeover-ticket'])
    expect(index.sessions[0].ticket_handoffs[0]).toMatchObject({
      ticket_id: 'takeover-ticket',
      classification: 'takeover_ready',
      latest_checkpoint_path: '/checkpoint/takeover.json',
      latest_checkpoint_hash: 'checkpoint-hash',
      worktree: '/worktree/takeover',
      fencing: 7,
    })
    const digest = readFileSync(join(out, index.sessions[0].digest), 'utf8')
    expect(digest).toContain('"ticket_ids":["takeover-ticket"]')
    expect(digest).not.toContain('must-never-be-harvested')
  })

  it('GJC timestamp filename 대신 session record의 exact id로 ticket을 연결한다', () => {
    const project = workspace()
    const sessionId = '01a013a0-fc1f-7000-a3cc-8a1e2051c965'
    writeGjcSession(project, sessionId, '2026-08-18T00:20:00Z')
    installTicketRuntime(project, [{
      ticket_id: 'gjc-ticket', owner_session_id: sessionId, session_history: [],
      classification: 'reference_only', fencing: 1,
    }])
    const dry = run(project, ['--dry-run', '--actor', 'jh', '--now', '2026-08-18T02:00:00Z'])
    expect(dry.status).toBe(0)
    expect(dry.stdout).toContain('gjc-ticket:reference_only')
    expect(dry.stdout).toContain('01a013a0')
  })

  it('previous day full session history를 정확히 연결하고 중복 ticket link를 만들지 않는다', () => {
    const project = workspace()
    const previous = 'previous-day-full-session-id'
    writeClaudeSession(project, previous, '2026-08-17T12:00:00Z')
    installTicketRuntime(project, [{
      ticket_id: 'handoff-ticket', owner_session_id: 'current-full-session-id',
      session_history: [previous, previous], classification: 'takeover_ready',
      owner_token: 'must-never-be-harvested',
    }])
    const out = join(project, 'runs', 'jh', 'run-1', 'harvest')
    expect(run(project, ['--out', out, '--run-id', 'run-1', '--actor', 'jh',
      '--now', '2026-08-18T02:00:00Z', '--since-hours', '24']).status).toBe(0)
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    expect(index.sessions[0].ticket_ids).toEqual(['handoff-ticket'])
    expect(JSON.stringify(index)).not.toContain('must-never-be-harvested')
  })

  it('ticket runtime failure는 dry-run에서도 fail-closed 한다', () => {
    const project = workspace()
    installTicketRuntime(project, [], 'import sys\nprint("state authority hmac mismatch", file=sys.stderr)\nraise SystemExit(1)')
    const result = run(project, ['--dry-run', '--actor', 'jh', '--now', '2026-08-18T02:00:00Z'])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('ticket-runtime.py list 실패')
    expect(result.stdout).toContain('hmac mismatch')
  })
})
