import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const runtime = resolve('.claude/vault/backlog/night-runtime.py')
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
  const dir = mkdtempSync(join(tmpdir(), 'vault-inbox-runtime-'))
  dirs.push(dir)
  execFileSync('mkdir', ['-p', join(dir, '.claude', 'vault', 'inbox')])
  return dir
}
const proof = (dir: string, overrides: Record<string, unknown> = {}) => {
  const stateDir = join(dir, 'provider-state')
  execFileSync('mkdir', ['-p', stateDir])
  const canonicalStateDir = realpathSync(stateDir)
  const state = join(canonicalStateDir, 'sweep-2026-08-18.json')
  const key = Buffer.alloc(32, 1)
  writeFileSync(join(canonicalStateDir, '.authority-key'), key, { mode: 0o600 })
  chmodSync(join(canonicalStateDir, '.authority-key'), 0o600)
  const values = {
    schema: 1, job: 'sweep', status: 'claimed', run_id: 'run-1',
    owner_token: 'owner-1', lease_until: Date.now() / 1000 + 60,
    fencing: 1, contract_hash: 'c', claim_date: '2026-08-18', actor: 'jh',
    state_root: canonicalStateDir, project_root: realpathSync(dir), ...overrides,
  }
  Object.assign(values, { authority_hmac: authority(key, values) })
  writeFileSync(state, JSON.stringify(values))
  return ['--provider-state', state, '--owner-token', String(values.owner_token),
    '--fencing', String(values.fencing), '--run-id', String(values.run_id),
    '--contract-hash', String(values.contract_hash)]
}
const call = (args: string[]) => JSON.parse(execFileSync('python3', [runtime, ...args], { encoding: 'utf8' }))
const fail = (args: string[]) => spawnSync('python3', [runtime, ...args], { encoding: 'utf8' })
const scan = (path: string, actor = 'jh') => call(['scan-inbox', '--path', path, '--actor', actor, '--project-root', dirname(dirname(dirname(dirname(path))))])
const item = (path: string, index = 0) => scan(path).unmarked_candidates[index].proposed_item_id
const candidate = (path: string, index = 0) => scan(path).unmarked_candidates[index]
const track = (dir: string, path: string, snapshot: string, start: number, end: number, unit: string, itemId = scan(path).unmarked_candidates.find((entry: { byte_range: { start: number, end: number } }) => entry.byte_range.start === start && entry.byte_range.end === end).proposed_item_id) => call([
  'track-inbox', '--path', path, '--actor', 'jh', '--snapshot-id', snapshot,
  '--item-id', itemId, '--expected-hash', sha(readFileSync(path)),
  '--start', String(start), '--end', String(end), '--unit', unit, ...proof(dir),
])
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('vault inbox lifecycle runtime', () => {
  it('snapshots both actors with one run and splits actionable/reference roles', () => {
    const dir = make()
    const inbox = join(dir, '.claude', 'vault', 'inbox')
    execFileSync('mkdir', ['-p', inbox])
    writeFileSync(join(inbox, 'jh.md'), '---\njh item\n')
    writeFileSync(join(inbox, 'hs.md'), '---\nhs item\n')
    const result = call(['snapshot-inbox-set', '--actor', 'jh', '--inbox-dir', inbox,
      '--out-dir', join(dir, 'snapshots'), ...proof(dir)])
    expect(result.snapshots.map((entry: { actor: string; role: string }) => [entry.actor, entry.role])).toEqual([['jh', 'actionable'], ['hs', 'reference']])
    expect(result.snapshots.every((entry: { snapshot_fingerprint: string }) => /^[0-9a-f]{64}$/.test(entry.snapshot_fingerprint))).toBe(true)
  })

  it('uses scan operation keys for track and rejects a mismatched key', () => {
    const dir = make()
    const path = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
    writeFileSync(path, '---\ntask\n')
    expect(fail(['scan-inbox', '--path', path, '--actor', 'hs']).status).toBe(1)
    const proposed = item(path)
    expect(fail(['track-inbox', '--path', path, '--actor', 'jh', '--snapshot-id', 'run', '--item-id', '0'.repeat(64), '--expected-hash', sha(readFileSync(path)), '--start', '0', '--end', '5', '--unit', 'u', ...proof(dir)]).status).toBe(1)
    const range = candidate(path).byte_range
    const tracked = track(dir, path, 'run', range.start, range.end, 'u', proposed)
    expect(tracked.item_id).toBe(proposed)
    expect(track(dir, path, 'run', range.start, range.end, 'u', proposed).idempotent).toBe(true)
  })

  it('ignores the template and headings while retaining attached human prose as a candidate', () => {
    const dir = make()
    const path = inboxPath(dir)
    writeFileSync(path, '# 안내\n이 문장은 템플릿입니다.\n---\n# 작업 제목\n본문 작업\n\n## 빈 제목\n')
    const result = scan(path)
    expect(result.ignored_ranges).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'template-before-human-input' }),
      expect.objectContaining({ reason: 'markdown-heading' }),
    ]))
    expect(result.unmarked_candidates.map((entry: { content: string }) => entry.content)).toEqual(['본문 작업\n'])
    const body = result.unmarked_candidates[0]
    writeFileSync(path, '# 더 길어진 안내 제목\n이 템플릿 문구도 길이가 달라졌습니다.\n---\n# 바뀐 작업 제목\n본문 작업\n')
    const rescanned = candidate(path)
    expect(rescanned.proposed_item_id).toBe(body.proposed_item_id)
    track(dir, path, 'run', rescanned.byte_range.start, rescanned.byte_range.end, 'u', rescanned.proposed_item_id)
    expect(scan(path).unmarked_candidates).toEqual([])
  })

  it('reconciles sorted verified receipts without directly editing untracked prose', () => {
    const dir = make()
    const path = inboxPath(dir)
    writeFileSync(path, '---\none\n\ntwo\n\nthree\n')
    for (const unit of ['u1', 'u2', 'u3']) {
      const next = candidate(path)
      track(dir, path, 'run', next.byte_range.start, next.byte_range.end, unit, next.proposed_item_id)
    }
    const markers = scan(path).markers
    const receipts = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')
    const cards = join(dir, '.claude', 'vault', 'backlog', 'tickets')
    const feedback = join(dir, 'feedback', 'jh')
    mkdirSync(receipts, { recursive: true })
    mkdirSync(feedback, { recursive: true })
    writeFileSync(join(cards, 'one.json'), 'one')
    writeFileSync(join(cards, 'two.json'), 'two')
    writeFileSync(join(feedback, 'decision.md'), 'accepted')
    const receipt = (receipt_id: string, marker: { item_id: string, payload: { units: string[] } }, disposition: string, evidence: Record<string, string>[]) =>
      writeFileSync(join(receipts, `${receipt_id}.json`), JSON.stringify({
        schema: 1, receipt_id, actor: 'jh', item_id: marker.item_id, units: marker.payload.units,
        disposition, evidence,
      }))
    receipt('a', markers[0], 'completed', [{ kind: 'result-card', path: '.claude/vault/backlog/tickets/one.json', sha256: sha('one') }])
    receipt('b', markers[1], 'failed', [{ kind: 'result-card', path: '.claude/vault/backlog/tickets/two.json', sha256: sha('two') }])
    receipt('c', markers[2], 'accepted', [{ kind: 'owner-decision', path: 'feedback/jh/decision.md', sha256: sha('accepted') }])
    const args = ['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)]
    expect(call(args).closed).toEqual(['a', 'b', 'c'])
    expect(call(args).already_closed).toEqual(['a', 'b', 'c'])
    expect(scan(path).markers.every((entry: { state: string }) => entry.state === 'closed')).toBe(true)
  })

  it('keeps a multi-unit marker tracked for partial receipts and closes it idempotently after the full receipt', () => {
    const dir = make()
    const path = inboxPath(dir)
    writeFileSync(path, '---\ncombined task\n')
    const next = candidate(path)
    const tracked = call([
      'track-inbox', '--path', path, '--actor', 'jh', '--snapshot-id', 'run',
      '--item-id', next.proposed_item_id, '--expected-hash', sha(readFileSync(path)),
      '--start', String(next.byte_range.start), '--end', String(next.byte_range.end),
      '--unit', 'u1', '--unit', 'u2', ...proof(dir),
    ])
    const receipts = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')
    const card = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'card.json')
    mkdirSync(receipts, { recursive: true })
    writeFileSync(card, 'card')
    const writeReceipt = (receipt_id: string, units: string[]) => writeFileSync(
      join(receipts, `${receipt_id}.json`),
      JSON.stringify({
        schema: 1, receipt_id, actor: 'jh', item_id: tracked.item_id, units,
        disposition: 'completed',
        evidence: [{ kind: 'result-card', path: '.claude/vault/backlog/tickets/card.json', sha256: sha('card') }],
      }),
    )
    const args = ['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)]
    writeReceipt('partial-a', ['u1'])
    expect(call(args).partial).toEqual([
      { receipt_id: 'partial-a', item_id: tracked.item_id, units: ['u1'] },
    ])
    expect(scan(path).markers[0].state).toBe('tracked')

    writeReceipt('partial-b', ['u1'])
    const conflict = call(args)
    expect(conflict.closed).toEqual([])
    expect(conflict.manual_review.map((entry: { receipt: string }) => entry.receipt).sort())
      .toEqual(['partial-a.json', 'partial-b.json'])
    expect(scan(path).markers[0].state).toBe('tracked')

    rmSync(join(receipts, 'partial-b.json'))
    writeReceipt('full', ['u1', 'u2'])
    expect(call(args).closed).toEqual(['full'])
    expect(scan(path).markers[0].state).toBe('closed')
    expect(call(args).already_closed).toEqual(['full'])
  })

  it('sends mismatched receipts and a non-ancestor integration receipt to manual review', () => {
    const dir = make()
    const path = inboxPath(dir)
    writeFileSync(path, '---\ntask\n')
    const next = candidate(path)
    const tracked = track(dir, path, 'run', next.byte_range.start, next.byte_range.end, 'u', next.proposed_item_id)
    const receipts = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')
    const card = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'card.json')
    mkdirSync(receipts, { recursive: true })
    writeFileSync(card, 'card')
    const evidence = { kind: 'result-card', path: '.claude/vault/backlog/tickets/card.json', sha256: sha('card') }
    writeFileSync(join(receipts, 'wrong-unit.json'), JSON.stringify({
      schema: 1, receipt_id: 'wrong-unit', actor: 'jh', item_id: tracked.item_id, units: ['other'],
      disposition: 'completed', evidence: [evidence],
    }))
    writeFileSync(join(receipts, 'wrong-hash.json'), JSON.stringify({
      schema: 1, receipt_id: 'wrong-hash', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', evidence: [{ ...evidence, sha256: '0'.repeat(64) }],
    }))
    writeFileSync(join(receipts, 'wrong-actor.json'), JSON.stringify({
      schema: 1, receipt_id: 'wrong-actor', actor: 'hs', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', evidence: [evidence],
    }))
    writeFileSync(join(receipts, 'not-main.json'), JSON.stringify({
      schema: 1, receipt_id: 'not-main', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'integrated', evidence: [{ kind: 'origin-main', path: evidence.path, sha256: evidence.sha256, commit: '0'.repeat(40) }],
    }))
    const reconciled = call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)])
    expect(reconciled.closed).toEqual([])
    expect(reconciled.skipped).toEqual(['wrong-actor'])
    expect(reconciled.manual_review.map((entry: { receipt?: string }) => entry.receipt).sort()).toEqual(['not-main.json', 'wrong-hash.json', 'wrong-unit.json'])
    expect(scan(path).markers[0].state).toBe('tracked')
  })

  it('retries a later tracked paragraph by stable item id after earlier markers shifted physical offsets', () => {
    const dir = make()
    const path = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
    writeFileSync(path, '---\nfirst\n\nsecond\n')
    const firstScan = scan(path)
    const first = firstScan.unmarked_candidates[0]
    track(dir, path, 'run', first.byte_range.start, first.byte_range.end, 'u1', first.proposed_item_id)
    const secondScan = scan(path)
    const second = secondScan.unmarked_candidates[0]
    const tracked = track(dir, path, 'run', second.byte_range.start, second.byte_range.end, 'u2', second.proposed_item_id)
    expect(track(dir, path, 'run', second.byte_range.start, second.byte_range.end, 'u2', tracked.item_id).idempotent).toBe(true)
  })

  it('keeps IDs stable across snapshot provenance and checkout roots but distinct by range', () => {
    const dir = make()
    const secondDir = make()
    const raw = '---\nsame\n\nsame\n'
    const first = inboxPath(dir)
    const second = inboxPath(secondDir)
    writeFileSync(first, raw)
    writeFileSync(second, raw)
    const firstId = item(first, 0)
    const sameId = item(second, 0)
    const secondRangeId = item(second, 1)
    expect(firstId).toBe(sameId)
    expect(firstId).not.toBe(secondRangeId)
    const firstRange = candidate(first).byte_range
    const secondRange = candidate(second).byte_range
    expect(track(dir, first, 'snapshot-a', firstRange.start, firstRange.end, 'u', firstId).item_id).toBe(firstId)
    expect(track(secondDir, second, 'snapshot-b', secondRange.start, secondRange.end, 'u', sameId).item_id).toBe(firstId)
    expect(scan(first).markers[0].state).toBe('tracked')

    const appendDir = make()
    const appended = inboxPath(appendDir)
    writeFileSync(appended, '---\nnote\n')
    const beforeAppend = item(appended)
    writeFileSync(appended, '---\nnote\n\nother\n')
    expect(item(appended)).toBe(beforeAppend)
  })

  it('rejects direct close and closes only through a verified receipt proof', () => {
    const dir = make()
    const path = join(dir, '.claude', 'vault', 'inbox', 'jh.md')
    writeFileSync(path, '---\nnew task\n\n~~human-only~~\n')
    const newTask = candidate(path)
    const tracked = track(dir, path, 'run', newTask.byte_range.start, newTask.byte_range.end, 'u')
    const current = sha(readFileSync(path))
    expect(fail(['close-inbox', '--path', path, '--item-id', tracked.item_id, '--expected-hash', current, '--unit', 'u', '--disposition', 'completed', '--receipt-id', 'r', ...proof(dir)]).status).toBe(2)
    const receipts = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')
    const card = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'card.json')
    mkdirSync(receipts, { recursive: true })
    writeFileSync(card, 'card')
    const receiptPath = join(receipts, 'r.json')
    writeFileSync(receiptPath, JSON.stringify({
      schema: 1, receipt_id: 'r', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', evidence: [{
        kind: 'result-card', path: '.claude/vault/backlog/tickets/card.json', sha256: sha('card'),
      }],
    }))
    mkdirSync(join(receipts, '.proofs'))
    writeFileSync(join(receipts, '.proofs', '.tmp-crashed-writer'), 'partial')
    expect(call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)]).closed).toEqual(['r'])
    expect(readFileSync(path, 'utf8')).toContain('<del>\nnew task\n</del>')
    const marker = scan(path).markers[0]
    expect(marker.state).toBe('closed')
    expect(marker.payload.close_proof_sha256).toBe(sha(readFileSync(receiptPath)))
    expect(marker.payload.close_proof_path).toBe(
      `.claude/vault/backlog/tickets/receipts/.proofs/${sha(readFileSync(receiptPath))}.json`,
    )
    const immutableProof = readFileSync(join(dir, marker.payload.close_proof_path))
    expect(immutableProof).toEqual(readFileSync(receiptPath))
    expect(call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)]).already_closed).toEqual(['r'])
    writeFileSync(receiptPath, JSON.stringify({
      schema: 1, receipt_id: 'r', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', note: 'different immutable receipt bytes', evidence: [{
        kind: 'result-card', path: '.claude/vault/backlog/tickets/card.json', sha256: sha('card'),
      }],
    }))
    const conflict = call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)])
    expect(conflict.manual_review.map((entry: { receipt: string }) => entry.receipt)).toContain('r.json')
    expect(scan(path).markers[0].payload.close_proof_sha256).toBe(marker.payload.close_proof_sha256)
    expect(readFileSync(join(dir, marker.payload.close_proof_path))).toEqual(immutableProof)
    expect(scan(path).unmarked_candidates.map((entry: { content: string }) => entry.content).join('')).toContain('~~human-only~~')
  })

  it('rejects symlink receipts without blocking a separate valid receipt', () => {
    const dir = make()
    const path = inboxPath(dir)
    writeFileSync(path, '---\none\n\ntwo\n')
    for (const unit of ['u1', 'u2']) {
      const next = candidate(path)
      track(dir, path, 'run', next.byte_range.start, next.byte_range.end, unit, next.proposed_item_id)
    }
    const [first, second] = scan(path).markers
    const receipts = join(dir, '.claude', 'vault', 'backlog', 'tickets', 'receipts')
    const cards = join(dir, '.claude', 'vault', 'backlog', 'tickets')
    mkdirSync(receipts, { recursive: true })
    writeFileSync(join(cards, 'card.json'), 'card')
    const valid = {
      schema: 1, receipt_id: 'valid', actor: 'jh', item_id: first.item_id, units: ['u1'],
      disposition: 'completed', evidence: [{ kind: 'result-card', path: '.claude/vault/backlog/tickets/card.json', sha256: sha('card') }],
    }
    writeFileSync(join(receipts, 'valid.json'), JSON.stringify(valid))
    const outside = join(dir, 'outside.json')
    writeFileSync(outside, JSON.stringify({ ...valid, receipt_id: 'linked', item_id: second.item_id, units: ['u2'] }))
    symlinkSync(outside, join(receipts, 'linked.json'))
    const result = call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)])
    expect(result.closed).toEqual(['valid'])
    expect(result.manual_review.map((entry: { receipt: string }) => entry.receipt)).toContain('linked.json')
    expect(scan(path).markers.map((entry: { state: string }) => entry.state)).toEqual(['closed', 'tracked'])
  })

  it('rejects symlink components in evidence and the immutable proof directory', () => {
    const dir = make()
    const path = inboxPath(dir)
    writeFileSync(path, '---\none\n')
    const next = candidate(path)
    const tracked = track(dir, path, 'run', next.byte_range.start, next.byte_range.end, 'u', next.proposed_item_id)
    const tickets = join(dir, '.claude', 'vault', 'backlog', 'tickets')
    const receipts = join(tickets, 'receipts')
    const outside = join(dir, 'outside')
    mkdirSync(receipts, { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(outside, 'card.json'), 'card')
    symlinkSync(outside, join(tickets, 'linked'))
    writeFileSync(join(receipts, 'evidence-link.json'), JSON.stringify({
      schema: 1, receipt_id: 'evidence-link', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', evidence: [{
        kind: 'result-card', path: '.claude/vault/backlog/tickets/linked/card.json', sha256: sha('card'),
      }],
    }))
    const linked = call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)])
    expect(linked.closed).toEqual([])
    expect(linked.manual_review.map((entry: { receipt: string }) => entry.receipt)).toContain('evidence-link.json')

    rmSync(join(receipts, 'evidence-link.json'))
    writeFileSync(join(tickets, 'card.json'), 'card')
    writeFileSync(join(receipts, 'proof-link.json'), JSON.stringify({
      schema: 1, receipt_id: 'proof-link', actor: 'jh', item_id: tracked.item_id, units: ['u'],
      disposition: 'completed', evidence: [{
        kind: 'result-card', path: '.claude/vault/backlog/tickets/card.json', sha256: sha('card'),
      }],
    }))
    symlinkSync(outside, join(receipts, '.proofs'))
    const proofLink = call(['reconcile-inbox', '--actor', 'jh', '--path', path, '--receipt-dir', receipts, ...proof(dir)])
    expect(proofLink.closed).toEqual([])
    expect(proofLink.manual_review.map((entry: { receipt: string }) => entry.receipt)).toContain('proof-link.json')
    expect(scan(path).markers[0].state).toBe('tracked')
  })
})
