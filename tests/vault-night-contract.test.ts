import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const launcher = resolve('.claude/vault/backlog/night-launchd.sh')
const preflight = resolve('.claude/vault/backlog/preflight.sh')
const runtime = resolve('.claude/vault/backlog/night-runtime.py')
const ticketRuntime = resolve('.claude/vault/backlog/ticket-runtime.py')
const gate = resolve('.claude/vault/backlog/provider-gate.py')
const contract = resolve('.claude/vault/backlog/_NIGHT.md')

function commandHelp(file: string, args: string[]) {
  return spawnSync('python3', [file, ...args], { encoding: 'utf8' })
}

describe('night launcher/runtime contract', () => {
  it('recovers committing state before preflight and reconciles current actor receipts after claim before snapshot, bind, and Claude', () => {
    expect(spawnSync('sh', ['-n', launcher], { encoding: 'utf8' }).status).toBe(0)
    const source = readFileSync(launcher, 'utf8')
    const run = source.slice(source.indexOf('run)'), source.indexOf('\ndry-run)'))
    expect(run).toMatch(/read_existing_sweep_state[\s\S]*recover_committing_sweep[\s\S]*exit 0[\s\S]*preflight\.sh[\s\S]*require_inboxes[\s\S]*night_start_phase[\s\S]*sync_inbox push[\s\S]*primary sweep/)
    expect(run).toMatch(/recovery_status" = "committing"[\s\S]*if recover_committing_sweep[\s\S]*exit 0/)
    // recover 실패(proof 불완전) + lease 하루+ 만료면 죽은 밤으로 보고 state를 치우고 새로 시작한다(무한 블록 방지)
    expect(run).toMatch(/if recover_committing_sweep[\s\S]*stale_lease[\s\S]*86400[\s\S]*새로 시작한다/)
    expect(source).toMatch(/recover_committing_sweep\(\)[\s\S]*complete sweep success[\s\S]*--run-id "\$recovery_run_id"[\s\S]*--run-manifest "\$recovery_manifest"[\s\S]*--snapshot-path "\$recovery_snapshot_path"/)
    expect(source).toContain('committing recovery finalized')
    expect(run).toMatch(/require_inboxes[\s\S]*primary sweep[\s\S]*reconcile-inbox[\s\S]*snapshot-inbox-set/)
    expect(run).toMatch(/primary sweep --contract-path "\$CONTRACT" --actor "\$ACTOR" \\\s*\n\s*--project-root "\$PROJECT_ROOT"/)
    expect(run).toContain('state_actor="$(printf \'%s\' "$claim" | jget actor)"')
    expect(run).toContain('[ "$state_actor" != "$ACTOR" ]')
    expect(run).toMatch(/--provider-state "\$provider_state" --owner-token="\$token" --fencing "\$fencing"\s*\\\s*--run-id "\$run_id" --contract-hash "\$contract_hash" --provider-job sweep\s*\\\s*--actor "\$ACTOR" --actors jh,hs/)
    expect(run).toMatch(/reconcile-inbox[\s\S]*snapshot-inbox-set[\s\S]*bind-snapshot sweep[\s\S]*start_claude_watchdog/)
    expect(run).toMatch(/reconcile-inbox\s*\\\s*--provider-state "\$provider_state" --provider-job sweep --owner-token="\$token"\s*\\\s*--fencing "\$fencing" --run-id "\$run_id" --contract-hash "\$contract_hash"\s*\\\s*--actor "\$ACTOR" --path "\$MY_INBOX" --receipt-dir "\$RECEIPT_DIR"/)
    expect(run).toMatch(/reconcile-inbox[\s\S]{0,500}complete_terminal_or_verify failed[\s\S]{0,100}exit 1/)
    expect(run).toMatch(/bind-snapshot sweep --contract-path "\$CONTRACT" \\\s*\n\s*--actor "\$ACTOR" --project-root "\$PROJECT_ROOT" --run-id "\$run_id" --token="\$token" \\\s*\n\s*--fencing "\$fencing" --snapshot-set "\$snapshot_manifest_relative"/)
    expect(run).toContain('snapshot_directory="$PROJECT_ROOT/.claude/vault/backlog/night-runtime/snapshots"')
    expect(run).toContain('snapshot_set_path"] == os.environ["SNAPSHOT_SET"]')
    expect(run).toContain('snapshot_set_id"] == os.environ["SNAPSHOT_SET_ID"]')
    expect(run).toContain('actionable_snapshot_fingerprint"] == os.environ["SNAPSHOT_FINGERPRINT"]')
    expect(run).toContain('provider bind 결과가 launcher actionable snapshot identity와 다르다')
    expect(run).toMatch(/provider bind 결과가 launcher actionable snapshot identity와 다르다[\s\S]*complete_terminal_or_verify failed[\s\S]*exit 1/)
    expect(run).toContain('NIGHT_PROVIDER_STATE="$provider_state"')
    expect(run).toContain('NIGHT_OWNER_TOKEN="$token"')
    expect(run).toContain('NIGHT_FENCING="$fencing"')
    expect(run).toContain('NIGHT_ACTIONABLE_SNAPSHOT_ID')
    expect(run).toContain('NIGHT_REFERENCE_SNAPSHOT_ID')
    expect(run).toContain('--run-manifest $run_dir/manifest.json')
    expect(run).toContain('day_run_override=$day_run_override')
    expect(run).toContain('provider-bound actionable snapshot set')
    expect(run).toContain('canonical harvest-out=$PROJECT_ROOT/runs/$ACTOR/$run_id/harvest')
    expect(run).toContain('default stamp=$PROJECT_ROOT/.claude/vault/backlog/sweep/.last-success')
    expect(run).toMatch(/claude_exit[\s\S]*final_status[\s\S]*success/)
  })

  it('uses validated fixed ticket lease values in the environment and Claude prompt', () => {
    const source = readFileSync(launcher, 'utf8')
    expect(source).toContain('TICKET_LEASE_SECONDS=1800')
    expect(source).toContain('TICKET_HEARTBEAT_SECONDS=300')
    expect(source).toContain('math.isfinite(lease)')
    expect(source).toContain('60 <= lease <= 86400')
    expect(source).toContain('1 <= heartbeat < lease')
    expect(source).toContain('NIGHT_TICKET_LEASE_SECONDS="$TICKET_LEASE_SECONDS"')
    expect(source).toContain('NIGHT_TICKET_HEARTBEAT_SECONDS="$TICKET_HEARTBEAT_SECONDS"')
    expect(source).toContain('ticket_lease_seconds=$TICKET_LEASE_SECONDS')
    expect(source).toContain('ticket_heartbeat_seconds=$TICKET_HEARTBEAT_SECONDS')
  })

  it('dry-run does not sync git or reconcile actual inboxes and uses one temporary provider state root', () => {
    const source = readFileSync(launcher, 'utf8')
    const dryRun = source.slice(source.indexOf('dry-run)'), source.indexOf('\nopen-report)'))
    expect(dryRun).not.toContain('sync_inbox')
    expect(dryRun).not.toContain('reconcile-inbox')
    expect(dryRun).toContain('receipt reconciliation skipped')
    expect(dryRun).toContain('PROVIDER_STATE_ROOT="$TMP/gate"')
    expect(dryRun).toContain('export ORCA_PROVIDER_GATE_STATE_DIR="$PROVIDER_STATE_ROOT"')
    expect(dryRun).toContain('--state-dir "$PROVIDER_STATE_ROOT"')
    expect(dryRun).toContain('snapshot-inbox-set')
    expect(dryRun).not.toContain('bind-snapshot')
    expect(dryRun).toContain('--out-dir "$PROVIDER_STATE_ROOT/snapshots"')
    expect(dryRun).toMatch(/--provider-state "\$provider_state" --owner-token="\$token" --fencing "\$fencing"\s*\\\s*--run-id "\$run_id" --contract-hash "\$contract_hash" --provider-job sweep/)
    expect(dryRun).toContain('mine[0]["role"] == "actionable"')
    expect(dryRun).toContain('peer[0]["role"] == "reference"')
    expect(dryRun).toContain('temporary inbox snapshot set runtime role/hash/generation validation OK')
    expect(dryRun).toContain('provider bind 생략, success proof 아님')
    expect(dryRun).toMatch(/harvest\.py" --dry-run --project "\$PROJECT_ROOT"\s*\\\s*--actor "\$ACTOR"/)
    expect(dryRun).toContain('"$TICKET_RUNTIME" list --project "$PROJECT_ROOT" --actor "$ACTOR"')
    expect(dryRun).toContain('read-only ticket inventory OK')
    expect(dryRun).toContain('no run artifact')
    expect(dryRun).not.toContain('write_ticket_inventory')
  })

  it('guards KST daytime starts unless the explicit override is recorded for the report', () => {
    const source = readFileSync(launcher, 'utf8')
    expect(source).toContain('night_start_phase()')
    expect(source).toContain('print("day" if 8 <= hour < 20 else "night")')
    expect(source).toContain('[ "${NIGHT_ALLOW_DAY_RUN:-}" != "1" ]')
    expect(source).toContain('NIGHT_ALLOW_DAY_RUN=1 낮 실행 예외를 기록한다.')
    expect(source).toContain('보고서에 NIGHT_ALLOW_DAY_RUN=1 낮 실행 예외를 남겨라')
    expect(source).toContain('deadline = min(lease_until, morning.timestamp())')
  })

  it('runs the morning smoke in the foreground with a tool PATH so launchd cannot reap it', () => {
    const source = readFileSync(launcher, 'utf8')
    const morning = source.slice(source.indexOf('\nmorning)'), source.indexOf('\npush-inbox)'))
    // launchd 는 스크립트가 끝나면 프로세스 그룹째 거둔다. 배경(&)으로 띄우면 스모크가
    // 시작하자마자 죽어 브라우저 회귀 최소안(계약 §6a·§9)이 한 번도 돌지 않는다.
    expect(morning).toContain('pnpm smoke --auth >> "$HOME/Library/Logs/tale-studio-night/morning-smoke.log" 2>&1 )\n')
    expect(morning).not.toMatch(/pnpm smoke --auth[^\n]*\)\s*&/)
    // PATH 보강이 스모크 호출보다 앞에 있어야 pnpm 을 찾는다.
    expect(morning).toMatch(/PATH="\$HOME\/\.local\/bin[\s\S]*pnpm smoke --auth/)
    expect(morning).toContain('export PATH')
  })

  it('owns a background watchdog and preserves committing rather than overwriting it', () => {
    const source = readFileSync(launcher, 'utf8')
    expect(source).toContain("python3 - <<'PY' &")
    expect(source).toContain('WATCHDOG_PID=$!')
    expect(source).toContain('kill -TERM "$WATCHDOG_PID"')
    expect(source).toContain('wait "$WATCHDOG_PID"')
    expect(source).toContain('os.killpg(child.pid, signal.SIGTERM)')
    expect(source).toContain('child.wait(timeout=10)')
    expect(source).toContain('os.killpg(child.pid, signal.SIGKILL)')
    expect(source).toContain('complete_terminal_or_verify timeout || exit 1')
    expect(source).toContain('provider complete $outcome 실패 후 terminal state가 아니다')
    expect(source).toMatch(/committing\)[\s\S]*same owner success resume[\s\S]*run_id=\$run_id/)
  })

  it('binds every launcher gate operation to the claimed actor and fencing proof', () => {
    const source = readFileSync(launcher, 'utf8')
    for (const operation of ['primary sweep', 'complete sweep', 'state sweep']) {
      const calls = source.match(new RegExp(`\\$GATE" ${operation}`, 'g')) ?? []
      expect(calls.length).toBeGreaterThan(0)
    }
    expect(source).toMatch(/complete sweep "\$outcome"[\s\S]{0,240}--fencing "\$fencing"[\s\S]{0,120}--actor "\$ACTOR"/)
    expect(source).toMatch(/complete sweep failed[\s\S]{0,240}--fencing "\$fencing"[\s\S]{0,120}--actor "\$ACTOR"/)
    expect(source).toMatch(/state sweep --contract-path "\$CONTRACT" --actor "\$ACTOR" \\\s*\n\s*--project-root "\$PROJECT_ROOT"/)
  })

  it('preflight and contract distinguish the provider-owned write boundary from read-only scans', () => {
    expect(spawnSync('sh', ['-n', preflight], { encoding: 'utf8' }).status).toBe(0)
    const preflightSource = readFileSync(preflight, 'utf8')
    expect(preflightSource).toContain('jh.md')
    expect(preflightSource).toContain('hs.md')
    expect(preflightSource).toContain('snapshot-inbox-set --help')
    expect(preflightSource).toContain('reconcile-inbox --help')
    expect(preflightSource).toContain('tickets/receipts')
    expect(preflightSource).toContain("grep -q '^---$' \"$inbox\"")
    const doc = readFileSync(contract, 'utf8')
    expect(doc).toContain('proposed_item_id')
    expect(doc).toContain('operation_key')
    expect(doc).toContain('--run-manifest "runs/$actor_id/$run_id/manifest.json"')
    expect(doc).toContain('reference 항목은 immutable read-only')
    expect(doc).toMatch(/snapshot-inbox-set --provider-state "\$provider_state" --owner-token="\$provider_token"\s*--fencing "\$fencing" --run-id "\$run_id" --contract-hash "\$contract_hash"/)
    for (const command of ['snapshot-status', 'archive-inbox', 'track-inbox', 'reconcile-inbox']) {
      expect(doc).toMatch(new RegExp(`night-runtime\\.py"? ${command}[\\s\\S]{0,500}--provider-state "\\$provider_state"[\\s\\S]{0,500}--owner-token="\\$provider_token"[\\s\\S]{0,500}--fencing "\\$fencing"[\\s\\S]{0,500}--run-id "\\$run_id"[\\s\\S]{0,500}--contract-hash "\\$contract_hash"`))
    }
    expect(doc).toMatch(/scan-inbox \\\s*--actor "\$actor_id" --path "\$MY_INBOX" --project-root "\$PROJECT_ROOT"/)
    expect(doc).toContain('읽기 전용이므로 proof를 붙이지 않는다')
    expect(doc).toContain('late-owner')
    expect(doc).toContain('claim-conflict')
    expect(doc).toContain('`fallback`, terminal 또는 `expired`')
    expect(doc).toContain('사람 원문 바이트는 불변')
    expect(doc).toContain('모델과 일반 agent의 자유 편집·직접 파일 쓰기는 금지')
    expect(doc).toContain('CAS(기대 hash·byte range 비교), file lock, provider owner proof')
  })

  it('documents receipt reconciliation lifecycle and terminal evidence without reopening tracked work', () => {
    const doc = readFileSync(contract, 'utf8')
    const lifecycle = doc.slice(doc.indexOf('### 3.2'), doc.indexOf('## 4. 해석과 분해'))
    expect(lifecycle).toContain('.claude/vault/backlog/tickets/receipts/<receipt_id>.json')
    expect(lifecycle).toContain('티켓을 만들고 저장을 확인한 즉시 source item은 `tracked`')
    expect(lifecycle).toMatch(/같은 unit\/ticket은 밤과 낮\s+session이 이어서 처리/)
    expect(lifecycle).toContain('다음 **실제**')
    expect(lifecycle).toContain('snapshot보다 먼저 `reconcile-inbox`')
    expect(lifecycle).toContain('`tracked`는 새 티켓 후보에서 제외')
    expect(lifecycle).toContain('`closed`는 기본 입력에서 제외')
    expect(lifecycle).toContain('linked unit 모두가 terminal receipt proof를 가진 경우에만')
    expect(lifecycle).toContain('continuation이면 새 source item도 같은 ticket에 `tracked`')
    for (const field of ['"schema": 1', '"receipt_id"', '"actor"', '"item_id"', '"units"', '"disposition"', '"evidence"']) {
      expect(lifecycle).toContain(field)
    }
    expect(lifecycle).toContain('canonical project-relative 실제 파일이고 SHA-256이 일치')
    expect(lifecycle).toContain('`kind: "origin-main"`')
    expect(lifecycle).toContain('`kind: "owner-decision"`')
    expect(lifecycle).toContain('`kind: "result-card"`')
    expect(lifecycle).toContain('manual review 또는 skipped')
    expect(doc).toContain('공개 direct close 명령은 없다')
    expect(doc).toContain('`close_proof_sha256`')
    expect(doc).toContain('content-addressed `close_proof_path`')
    expect(doc).toContain('receipts/.proofs/<sha256>.json')
    expect(doc).toContain('hard-link로 `<sha256>.json` 이름을 create-only 원자 게시')
    expect(doc).toContain('중단돼 남은 임시 파일은 다음 정산을 막지 않는다')
    expect(doc).toContain('directory fd를 고정한 openat 방식')
    expect(doc).toContain('inbox 교체 직전에 stat과 hash를 다시 검증')
  })

  it('documents actor-bound canonical harvest and success commands rather than loose artifact names', () => {
    const doc = readFileSync(contract, 'utf8')
    const startup = doc.slice(doc.indexOf('실행 시작 전에 launcher'), doc.indexOf('### 단일 실행 가정'))
    expect(startup).toMatch(/primary sweep --contract-path "\$CONTRACT" --actor "\$actor_id"\s*--project-root "\$PROJECT_ROOT"/)
    expect(startup).toMatch(/state sweep \\\s*\n\s*--contract-path "\$PROJECT_ROOT\/\.claude\/vault\/backlog\/_NIGHT\.md" --actor "\$actor_id" \\\s*\n\s*--project-root "\$PROJECT_ROOT"/)
    expect(startup).toMatch(/actionable의 actor\/role\/id\/fingerprint가 prompt 값과 일치하고[\s\S]{0,80}status가 reported/)
    expect(startup).toContain('provider `bind-snapshot`')
    expect(startup).toContain('`.authority-key`')
    expect(startup).toContain('`authority_hmac`')
    const harvest = doc.slice(doc.indexOf('### 4.1'), doc.indexOf('### 4.2'))
    expect(harvest).toMatch(/--dry-run \\\s*\n\s*--project "\$PROJECT_ROOT" --actor "\$actor_id"/)
    expect(harvest).toMatch(/--run-id "\$run_id" \\\s*\n\s*--project "\$PROJECT_ROOT" --actor "\$actor_id" \\\s*\n\s*--out "\$PROJECT_ROOT\/runs\/\$actor_id\/\$run_id\/harvest"/)
    expect(harvest).toMatch(/--validate-complete --run-id "\$run_id" \\\s*\n\s*--project "\$PROJECT_ROOT" --actor "\$actor_id" \\\s*\n\s*--out "\$PROJECT_ROOT\/runs\/\$actor_id\/\$run_id\/harvest"/)
    const completion = doc.slice(doc.indexOf('자동화 provider 상태도 결과와 함께 닫는다'), doc.indexOf('실행을 끝내는 일반적인 경계'))
    expect(completion).toMatch(/complete sweep success[\s\S]*--fencing "\$fencing" --actor "\$actor_id" --harvest-project "\$PROJECT_ROOT" \\\s*\n\s*--project-root "\$PROJECT_ROOT"[\s\S]*--harvest-out "\$PROJECT_ROOT\/runs\/\$actor_id\/\$run_id\/harvest"[\s\S]*--run-manifest "runs\/\$actor_id\/\$run_id\/manifest\.json"/)
    expect(completion).toMatch(/complete sweep failed \\\s*\n\s*--run-id "\$provider_run_id" --token="\$provider_token" \\\s*\n\s*--fencing "\$fencing" --contract-hash "\$contract_hash" --actor "\$actor_id" \\\s*\n\s*--project-root "\$PROJECT_ROOT"/)
    expect(completion).toContain('runs/<actor>/<run>/report.html')
    expect(completion).toContain('runs/<actor>/<run>/harvest/.run-complete.json')
    expect(completion).toContain('.claude/vault/backlog/tickets/')
    expect(completion).toContain('harvest에는 공개 성공 도장 명령이 없다')
    expect(completion).toContain('stamp candidate/run-complete hash')
    expect(completion).toContain('provider에 bind된 set member')
    expect(completion).toContain('`.claude/vault/backlog/sweep/.last-success`')
  })

  it('documents fallback as fresh JSON proof extraction and committing as idempotent success recovery', () => {
    const doc = readFileSync(contract, 'utf8')
    const fallback = doc.slice(doc.indexOf('# fallback은 같은 state_path'), doc.indexOf('상태 전이는 현재 provider claim'))
    expect(fallback).toMatch(/fallback sweep \\\s*\n\s*--run-id "\$provider_run_id" --contract-hash "\$contract_hash" --actor "\$actor_id" \\\s*\n\s*--project-root "\$PROJECT_ROOT"/)
    expect(fallback).toMatch(/provider_state=.*\["state_path"\]/)
    for (const key of ['run_id', 'owner_token', 'fencing', 'actor', 'contract_hash', 'state_root', 'project_root']) {
      expect(fallback).toContain(`["${key}"]`)
    }
    expect(fallback).toContain('[ "$provider_state" = "$previous_provider_state" ]')
    expect(fallback).toContain('[ "$fencing" -gt "$previous_fencing" ]')
    expect(fallback).toContain('이전 token/fencing으로는 runtime을 재시도하지 않는다')
    const committing = doc.slice(doc.indexOf('provider 상태가 `committing`'), doc.indexOf('## 3. 메모 원문'))
    expect(committing).toMatch(/같은\s*owner proof와 동일한 actionable snapshot 및 run manifest로 `complete success`를 멱등/)
  })

  it('runtime requires owner proof for writes and keeps scan-inbox read-only', () => {
    for (const command of ['reconcile-inbox', 'snapshot-inbox', 'snapshot-inbox-set', 'snapshot-status', 'archive-inbox', 'scan-inbox', 'track-inbox', 'append-units']) {
      const help = commandHelp(runtime, [command, '--help'])
      expect(help.status).toBe(0)
      if (command === 'scan-inbox') {
        expect(help.stdout).not.toContain('--provider-state')
      } else {
        for (const option of ['--provider-state', '--provider-job', '--owner-token', '--fencing', '--run-id', '--contract-hash']) {
          expect(help.stdout).toContain(option)
        }
      }
    }
    expect(commandHelp(runtime, ['close-inbox', '--help']).status).toBe(2)
  })

  it('preflight verifies every ticket runtime command with read-only help', () => {
    const source = readFileSync(preflight, 'utf8')
    expect(source).toContain('ticket-runtime.py')
    for (const command of ['claim', 'heartbeat', 'checkpoint', 'takeover', 'release', 'status', 'list']) {
      expect(source).toContain(`ticket_command in claim heartbeat checkpoint takeover release status list`)
      expect(commandHelp(ticketRuntime, [command, '--help']).status).toBe(0)
    }
  })

  it('lists ticket handoffs after provider bind and before Claude, failing terminally on inventory errors', () => {
    const source = readFileSync(launcher, 'utf8')
    const run = source.slice(source.indexOf('run)'), source.indexOf('\ndry-run)'))
    expect(run).toMatch(/bind-snapshot sweep[\s\S]*"\$TICKET_RUNTIME" list --project "\$PROJECT_ROOT" --actor "\$ACTOR"[\s\S]*write_ticket_inventory[\s\S]*start_claude_watchdog/)
    expect(run).toContain('ticket-handoffs.json')
    expect(source).toContain('os.fsync(handle.fileno())')
    expect(source).toContain('os.replace(temporary, path)')
    expect(run).toContain('ticket inventory를 읽지 못해 Claude를 시작하지 않는다')
    expect(run).toMatch(/ticket inventory를 읽지 못해 Claude를 시작하지 않는다[\s\S]*complete_terminal_or_verify failed[\s\S]*exit 1/)
    expect(run).toContain('NIGHT_TICKET_RUNTIME="$TICKET_RUNTIME"')
    expect(run).toContain('NIGHT_TICKET_INVENTORY="$ticket_inventory_path"')
    expect(run).toContain('NIGHT_TICKET_SESSION_ID="night-$run_id"')
    expect(run).toContain('night_session_id=night-$run_id')
  })

  it('documents deterministic ticket handoff boundaries', () => {
    const doc = readFileSync(contract, 'utf8')
    expect(doc).toContain('active`: fresh day claim은 건드리거나 중복 실행하지 않는다')
    expect(doc).toContain('live `list`를 다시 읽는다')
    expect(doc).toContain('takeover_ready')
    expect(doc).toContain('takeover --owner-kind night')
    expect(doc).toContain('fencing을 증가')
    expect(doc).toContain('reference_only`, `manual_review`: 수정·claim·takeover를 금지')
    expect(doc).toContain('checkpoint 없는 stale claim과 checkpoint/worktree drift는 인수하지 않는다')
    expect(doc).toContain('checkpoint --status paused')
    expect(doc).toContain('release --status paused')
    expect(doc).toContain('ticket 상태와 checkpoint 없이 subagent에 실행을 위임하지 않는다')
    expect(doc).toContain('`--reference-only-main`으로만 claim')
    expect(doc).toContain('세션 원문은 보조 증거이고 재개 정본은 checkpoint')
    expect(doc).toContain('provider lease는 밤 실행 자체의')
    expect(doc).toContain('각 unit 직전과 다른 unit 종료 뒤 loop마다 initial inventory가 아닌 live state를 다시 읽는다')
    expect(doc).toContain('paused/expired ticket도 이 live list에서 takeover_ready로')
    expect(doc).toContain('takeover_json=')
    for (const field of ['ticket_owner_token', 'ticket_fencing', 'ticket_session_id', 'ticket_worktree']) {
      expect(doc).toContain(field)
    }
    expect(doc).toContain('runtime state가 없는 tracked ticket은 등록된 격리 ticket worktree를 먼저 만든다')
    expect(doc).toContain('ticket_worktree="$PROJECT_ROOT/.claude/worktrees/$ticket_id"')
    expect(doc).toContain('["owner_session_id"]')
    expect(doc).toContain('claim JSON의 owner_token/fencing/owner_session_id/worktree proof가 모두 검증되기 전에는 subagent를 실행하지 않는다')
    expect(doc).toMatch(/mutation 뒤에는 최대\s*`heartbeat_seconds` 이내에 heartbeat/)
    expect(doc).toContain('멱등 `release --status paused`')
    expect(doc).toMatch(/release는\s*inbox를 닫지 않으며/)
    expect(doc).toMatch(/terminal canonical receipt를 다음 실제 run의\s*`reconcile-inbox`/)
    expect(doc).toMatch(/`session_history`는\s*harvest linkage의 일부/)
  })

  it('provider claim exposes its canonical state_path for the runtime proof', () => {
    const providerHelp = commandHelp(gate, ['--help'])
    expect(providerHelp.status).toBe(0)
    expect(providerHelp.stdout).toContain('--run-manifest')
    const stateDir = mkdtempSync(resolve(tmpdir(), 'vault-provider-gate-'))
    try {
      const claim = commandHelp(gate, [
        'primary', 'sweep', '--state-dir', stateDir, '--probe-command', 'true',
        '--preflight', 'true', '--lease-seconds', '60', '--actor', 'jh', '--project-root', stateDir,
      ])
      expect(claim.status).toBe(0)
      const value = JSON.parse(claim.stdout)
      expect(value.state_path).toBe(realpathSync(value.state_path))
      expect(value.state_path.startsWith(`${realpathSync(stateDir)}/`)).toBe(true)
      expect(value.owner_token).toMatch(/^owner_/)
      expect(value.fencing).toBe(1)
      expect(value.actor).toBe('jh')
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it('pushes only the current actor inbox even beside other unpushed commits', () => {
    const source = readFileSync(launcher, 'utf8')
    // 비-inbox 커밋이 섞이면 동기화 전체를 건너뛰던 게이트(inbox_only_ahead)는 제거됐다.
    expect(source).not.toContain('inbox_only_ahead()')
    expect(source).not.toContain('recover_inbox_only_ahead()')
    const sync = source.slice(source.indexOf('sync_inbox()'), source.indexOf('\nstart_claude_watchdog()'))
    // 내 메모 파일 하나만 커밋해 내보낸다.
    expect(sync).toContain('commit -q --only "$MY_INBOX" -m "inbox($ACTOR): 밤 메모"')
    // 옆에 다른 미푸시 커밋이 있어도 건너뛰지 않는다.
    expect(sync).not.toContain('inbox_only_ahead')
    expect(sync).not.toContain('동기화를 건너뛴다')
    // 상대 메모를 강제로 당겨오는 ff 단계는 없다.
    expect(sync).not.toContain('상대 메모 수신 OK')
    expect(sync).not.toContain('merge --ff-only origin/main')
    // 전체 스테이징 금지.
    expect(sync).not.toContain('git -C "$PROJECT_ROOT" add -A')
    // 경합/뒤처짐은 rebase 재시도로 흡수한다.
    expect(sync).toContain('pull --rebase origin main')
  })
})
