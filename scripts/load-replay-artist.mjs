// 운영 서버에 11/23 수업 모양의 부하를 다시 건다 — Artist 단계까지, 가상 사용자 N명 동시(2026-11-24).
//
// 왜: 11/23 수업(20명 동시 접속)에서 DB 가 14분 멈췄다. 1층 폴링 경량화 · 싱가포르 리전 · Micro 승급을 한 뒤
//     같은 사람 수 · 같은 화면 흐름으로 다시 걸어 "이제 버티는가"를 숫자로 본다. 비용(fal 그림값)은 오너가 허락했다.
//
// 흐름(브라우저가 Artist 화면에서 하는 일을 그대로 흉내 낸다. src/app/studio/artist/page.tsx · src/stores/artist-store.ts):
//   1) 화면 진입: GET /studio/artist (미들웨어 로그인 확인) · GET /api/writer/status/<pid>?assets=1 · GET /api/artist/generation-slots
//   2) 그림 보내기: 인물 시트 POST /api/artist/generate-sheet · 배경 POST /api/artist/generate-world — 한 번에 3장(runAdaptivePool)
//   3) 틱(4초 · 끝나야 다음): 브라우저 → Supabase 직접 8쿼리(loadData) + GET /api/artist/generation-status
//   4) 잡 상태 묶음 폴링(3초): GET /api/generation-jobs?ids=… (영구 상태가 될 때까지 · 일시 오류면 3→6→12→24→30초)
//   5) 그림이 다 끝나거나 --duration 이 지나면 끝. 정원(429)이면 10초 뒤 다시 보낸다(이어 그리기와 같은 규칙).
//
// 사용(순서대로):
//   node scripts/load-replay-artist.mjs prepare --target live --run 1124a --users 20 --template <projectId>
//   node scripts/load-replay-artist.mjs run     --target live --run 1124a --base https://www.talestudio.art --duration 480 [--writer-poll] [--ramp 60]
//   node scripts/load-replay-artist.mjs reset   --target live --run 1124a            (그림 · 작업 행만 비워 다시 잰다)
//   node scripts/load-replay-artist.mjs cleanup --target live --run 1124a --base https://www.talestudio.art
//   · prepare: loadtest-<run>-NN@tale.studio 계정 N개 + 작업 공간 + 본보기 프로젝트 복제(그림 URL 은 비워서 Artist 가 새로 그리게).
//   · run:     결과 JSON 을 .claude/docs/2026-11-24/loadtest/<run>/ 에 남긴다(요청별 시간 · 30초 구간별 p95 · 오류 수 · 그림 완료 수).
//   · cleanup: 각 계정으로 POST /api/account/delete (프로젝트 · 보관함 파일 · 작업 공간 · 계정을 앱이 지우는 길 그대로).
//   비밀은 .env.local(SUPABASE_LIVE_* 또는 SUPABASE_*)에서만 읽는다. 이 파일에는 비밀이 없다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const command = argv[0]
const args = {}
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true
  else { args[a.slice(2)] = next; i++ }
}
const target = args.target
if (!['live', 'dev'].includes(target)) throw new Error('--target live 또는 --target dev 를 꼭 적는다(어느 DB 에 계정을 만들지)')
const runLabel = args.run
if (!runLabel || !/^[a-z0-9-]+$/i.test(runLabel)) throw new Error('--run <영문·숫자 라벨> 이 필요하다')

const env = Object.fromEntries(
  readFileSync(resolve(repo, '.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
const supa = target === 'live'
  ? { url: env.SUPABASE_LIVE_URL, anon: env.SUPABASE_LIVE_ANON_KEY, service: env.SUPABASE_LIVE_SERVICE_ROLE_KEY }
  : { url: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service: env.SUPABASE_SERVICE_ROLE_KEY }
for (const [k, v] of Object.entries(supa)) if (!v) throw new Error(`.env.local 에 ${target} ${k} 가 없다`)
supa.url = supa.url.replace(/\/$/, '')
const ref = new URL(supa.url).hostname.split('.')[0]
const outDir = resolve(repo, `.claude/docs/2026-11-24/loadtest/${runLabel}`)
const manifestPath = resolve(outDir, 'manifest.json')

// ── Supabase 직접 호출(service role) ─────────────────────────────────────────
async function rest(path, init = {}) {
  const r = await fetch(`${supa.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: supa.service, Authorization: `Bearer ${supa.service}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path.slice(0, 80)} → ${r.status} ${text.slice(0, 300)}`)
  return data
}
async function authAdmin(path, init = {}) {
  const r = await fetch(`${supa.url}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: supa.service, Authorization: `Bearer ${supa.service}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`auth ${path} → ${r.status} ${JSON.stringify(data).slice(0, 300)}`)
  return data
}

// 세션 발급 — scripts/admin-session-cookie.mjs 와 같은 길(magic link → verify). 비밀번호를 건드리지 않는다.
async function issueSession(email) {
  const link = await authAdmin('admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) })
  if (!link.hashed_token) throw new Error(`generate_link 실패: ${JSON.stringify(link).slice(0, 200)}`)
  const r = await fetch(`${supa.url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: supa.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  })
  const session = await r.json()
  if (!session.access_token) throw new Error(`verify 실패: ${JSON.stringify(session).slice(0, 200)}`)
  const payload = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type ?? 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })
  const encoded = 'base64-' + Buffer.from(payload, 'utf8').toString('base64url')
  const MAX = 3180
  const cookies = []
  if (encoded.length <= MAX) cookies.push(`sb-${ref}-auth-token=${encoded}`)
  else for (let i = 0; i * MAX < encoded.length; i++) cookies.push(`sb-${ref}-auth-token.${i}=${encoded.slice(i * MAX, (i + 1) * MAX)}`)
  return { cookie: cookies.join('; '), accessToken: session.access_token, expiresAt: Number(session.expires_at ?? 0) }
}

// 같은 계정의 세션은 한 번만 발급한다 — 마법 링크를 같은 사람에게 동시에 두 번 만들면 먼저 것이 무효가 된다(otp_expired).
//   발급한 세션은 /tmp 에 남겨 다음 실행이 다시 쓴다(만료 10분 전까지). 비밀이라 저장소 안에는 두지 않는다.
const sessionCachePath = `/tmp/load-replay-sessions-${target}-${runLabel}.json`
const sessionCache = existsSync(sessionCachePath) ? JSON.parse(readFileSync(sessionCachePath, 'utf8')) : {}
const sessionInFlight = new Map()
function getSession(email) {
  const cached = sessionCache[email]
  if (cached && cached.expiresAt * 1000 - Date.now() > 10 * 60_000) return Promise.resolve(cached)
  if (sessionInFlight.has(email)) return sessionInFlight.get(email)
  const p = issueSession(email).then((s) => {
    sessionCache[email] = s
    writeFileSync(sessionCachePath, JSON.stringify(sessionCache))
    return s
  }).finally(() => sessionInFlight.delete(email))
  sessionInFlight.set(email, p)
  return p
}

// ── prepare ──────────────────────────────────────────────────────────────────
const IMAGE_COLUMNS = {
  characters: ['view_main', 'view_back', 'view_side_left', 'view_side_right', 'portrait'],
  character_appearances: ['sheet_url', 'portrait_url', 'derived_from_url', 'source_hash'],
  locations: ['wide_shot', 'establishing_shot'],
  location_appearances: ['wide_shot'],
}
function stripRow(row, table, projectId) {
  const out = { ...row, id: randomUUID(), project_id: projectId }
  delete out.created_at
  delete out.updated_at
  for (const c of IMAGE_COLUMNS[table] ?? []) if (c in out) out[c] = null
  return out
}

async function prepare() {
  const users = Number(args.users ?? 20)
  const template = args.template
  if (!template) throw new Error('--template <본보기 프로젝트 id> 가 필요하다(인물 · 배경 · 작가 완료가 있는 프로젝트)')
  if (existsSync(manifestPath)) throw new Error(`${manifestPath} 가 이미 있다 — 같은 --run 으로 두 번 만들지 않는다(cleanup 먼저)`)
  mkdirSync(outDir, { recursive: true })

  const [project] = await rest(`projects?id=eq.${template}`)
  if (!project) throw new Error('본보기 프로젝트가 없다')
  const [characters, appearances, locations, locAppearances, scenes, runs] = await Promise.all([
    rest(`characters?project_id=eq.${template}`),
    rest(`character_appearances?project_id=eq.${template}`),
    rest(`locations?project_id=eq.${template}`),
    rest(`location_appearances?project_id=eq.${template}`),
    rest(`scenes?project_id=eq.${template}&order=sort_order`),
    rest(`writer_runs?project_id=eq.${template}&status=eq.completed&order=created_at.desc&limit=1`),
  ])
  if (characters.length === 0 || locations.length === 0 || runs.length === 0) throw new Error('본보기에 인물 · 배경 · 완료된 작가 실행이 다 있어야 한다')
  console.error(`본보기 ${template.slice(0, 8)} "${project.title}" — 인물 ${characters.length} · 배경 ${locations.length} · 장면 ${scenes.length}`)

  const manifest = { run: runLabel, target, ref, template, createdAt: new Date().toISOString(), users: [] }
  for (let i = 1; i <= users; i++) {
    const email = `loadtest-${runLabel.toLowerCase()}-${String(i).padStart(2, '0')}@tale.studio`
    const user = await authAdmin('admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password: randomBytes(24).toString('base64url'), email_confirm: true, user_metadata: { full_name: `부하시험 ${i}` } }),
    })
    const [workspace] = await rest('workspaces', { method: 'POST', body: JSON.stringify({ name: `부하시험 ${i}`, slug: `studio-${user.id}`, owner_id: user.id }) })
    const projectId = randomUUID()
    const projectRow = { ...project, id: projectId, workspace_id: workspace.id, title: `[부하시험 ${runLabel}] ${project.title}`, last_writer_run_id: null, reference_project_id: null, series: null }
    delete projectRow.created_at
    delete projectRow.updated_at
    await rest('projects', { method: 'POST', body: JSON.stringify(projectRow) })
    await rest('characters', { method: 'POST', body: JSON.stringify(characters.map((r) => stripRow(r, 'characters', projectId))) })
    await rest('character_appearances', { method: 'POST', body: JSON.stringify(appearances.map((r) => stripRow(r, 'character_appearances', projectId))) })
    await rest('locations', { method: 'POST', body: JSON.stringify(locations.map((r) => ({ ...stripRow(r, 'locations', projectId), scene_id: null, last_writer_run_id: null }))) })
    if (locAppearances.length) await rest('location_appearances', { method: 'POST', body: JSON.stringify(locAppearances.map((r) => stripRow(r, 'location_appearances', projectId))) })
    if (scenes.length) await rest('scenes', { method: 'POST', body: JSON.stringify(scenes.map((r) => stripRow(r, 'scenes', projectId))) })
    const [run] = await rest('writer_runs', { method: 'POST', body: JSON.stringify(stripRow(runs[0], 'writer_runs', projectId)) })
    await rest(`projects?id=eq.${projectId}`, { method: 'PATCH', body: JSON.stringify({ last_writer_run_id: run.id }) })
    manifest.users.push({
      i, email, userId: user.id, workspaceId: workspace.id, projectId,
      characters: appearances.filter((a) => a.is_default).map((a) => ({ characterId: a.character_id, appearanceKey: a.appearance_key })),
      // 화면은 글자 열쇠(locations.location_id · 예 "giant_root_shelter")로 부른다 — 행 id(uuid)가 아니다(artist-store.ts:925 · finalize.ts:913).
      locations: locations.map((l) => ({ locationId: l.location_id, prompt: l.visual_description ?? l.name })),
    })
    console.error(`  ${i}/${users} ${email} 프로젝트 ${projectId.slice(0, 8)}`)
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.error(`manifest → ${manifestPath}`)
}

// ── run ──────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const quantile = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] }

async function run() {
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} 가 없다 — prepare 먼저`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const base = String(args.base ?? '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(base)) throw new Error('--base https://… 가 필요하다')
  const durationMs = Number(args.duration ?? 480) * 1000
  const rampMs = Number(args.ramp ?? 60) * 1000
  const writerPoll = !!args['writer-poll']
  let stopCanary = false
  const canary = !!args.canary // 가벼운 길(generation-slots)을 2초마다 따로 쳐서 "서버 함수 자체가 느려졌나"를 가른다
  const userCount = Math.min(Number(args.users ?? manifest.users.length), manifest.users.length)
  const maxImages = Number(args.images ?? 99)
  const POOL = 3 // runAdaptivePool: 러프가 안 돌 때 3장씩
  const t0 = Date.now()
  const log = [] // {u, name, status, ms, t}
  const abort = { on: false, why: null }
  const note = (u, name, status, ms, extra) => log.push({ u, name, status, ms: Math.round(ms), t: Date.now() - t0, ...(extra ?? {}) })

  // 안전 중단 — 60초 창에서 p95 가 15초를 넘거나 오류가 30% 를 넘으면 모두 멈춘다(운영에서 실제 사용자를 오래 괴롭히지 않는다).
  const guard = setInterval(() => {
    const since = Date.now() - t0 - 60_000
    const win = log.filter((r) => r.t >= since)
    if (win.length < 30) return
    const p95 = quantile(win.map((r) => r.ms), 0.95)
    const errRate = win.filter((r) => r.status >= 500 || r.status === 0).length / win.length
    if (p95 > 15_000 || errRate > 0.3) { abort.on = true; abort.why = `60초 창 p95 ${(p95 / 1000).toFixed(1)}s · 오류 ${(errRate * 100).toFixed(0)}%` }
  }, 5_000)

  async function timed(u, name, doFetch, extra) {
    const start = performance.now()
    try {
      const r = await doFetch()
      const body = await r.text()
      // 4xx · 5xx 는 본문 앞부분과 Vercel 요청 id 를 남긴다 — 어느 층이 거절했는지 나중에 가린다.
      note(u, name, r.status, performance.now() - start, r.status >= 400 ? { ...(extra ?? {}), body: body.slice(0, 200), vid: r.headers.get('x-vercel-id') } : extra)
      let json = null
      try { json = JSON.parse(body) } catch { /* HTML 등 */ }
      return { status: r.status, json, body }
    } catch (e) {
      note(u, name, 0, performance.now() - start, { ...(extra ?? {}), err: String(e?.cause?.code ?? e?.name ?? e).slice(0, 60) })
      return { status: 0, json: null, body: '' }
    }
  }

  async function virtualUser(user) {
    const u = user.i
    const { cookie, accessToken } = await getSession(user.email)
    const api = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) })
    const pg = (q) => fetch(`${supa.url}/rest/v1/${q}`, { headers: { apikey: supa.anon, Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000) })
    const pid = user.projectId
    const deadline = t0 + durationMs
    const done = () => abort.on || Date.now() > deadline

    // 1) 화면 진입
    await timed(u, 'page /studio/artist', () => api(`/studio/artist?projectId=${pid}`))
    await timed(u, 'writer/status?assets=1', () => api(`/api/writer/status/${pid}?assets=1`))
    await timed(u, 'artist/generation-slots', () => api('/api/artist/generation-slots'))

    // 3) 틱: loadData 8쿼리 + generation-status, 4초, 끝나야 다음(useSequentialPoll + dedupeLoadData)
    const tick = async () => {
      const start = performance.now()
      const results = await Promise.all([
        pg(`scenes?select=*&project_id=eq.${pid}&order=sort_order`),
        pg(`characters?select=*&project_id=eq.${pid}`),
        pg(`locations?select=*&project_id=eq.${pid}`),
        pg(`character_image_candidates?select=id,character_id,appearance_key,view,url,source_hash,appearance_hash,is_selected,generated_at&project_id=eq.${pid}`),
        pg(`projects?select=design_tokens,style_anchor_key&id=eq.${pid}`),
        pg(`character_appearances?select=character_id,appearance_key,label,is_default,narrative_time,sheet_url,portrait_url,appearance,appearance_native,derived_from_url,costume&project_id=eq.${pid}&order=is_default.desc`),
        pg(`location_image_candidates?select=id,location_id,view,url,source_hash,appearance_hash,is_selected,generated_at,variant_key&project_id=eq.${pid}`),
        pg(`location_appearances?select=location_id,appearance_key,label,narrative_time,visual_description,visual_description_native,wide_shot&project_id=eq.${pid}&order=created_at`),
      ].map((p) => p.then((r) => r.text().then(() => r.status)).catch(() => 0)))
      const worst = results.some((s) => s === 0) ? 0 : Math.max(...results)
      note(u, 'loadData 8쿼리(직접)', worst, performance.now() - start)
      await timed(u, 'artist/generation-status', () => api(`/api/artist/generation-status?projectId=${pid}`))
    }
    const tickLoop = (async () => { while (!done()) { await tick(); await sleep(4_000) } })()

    // 작가 상태 폴링(11/23 에는 작가가 돌고 있어 3초마다 쳤다) — --writer-poll 일 때만
    const writerLoop = writerPoll
      ? (async () => { while (!done()) { await timed(u, 'writer/status?assets=1', () => api(`/api/writer/status/${pid}?assets=1`)); await sleep(3_000) } })()
      : Promise.resolve()

    // 2) 그림 보내기 — 인물 시트 + 배경, 3장씩. 정원(429)이면 10초 뒤 다시(이어 그리기 규칙). 영구 거절은 포기.
    const targets = [
      ...user.characters.map((c) => ({ kind: 'sheet', ...c })),
      ...user.locations.map((l) => ({ kind: 'world', ...l })),
    ].slice(0, maxImages)
    const jobs = new Map() // jobId → {kind, status}
    const submitOne = async (tg) => {
      for (let round = 0; round < 30 && !done(); round++) {
        const res = tg.kind === 'sheet'
          ? await timed(u, 'artist/generate-sheet', () => api('/api/artist/generate-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: pid, characterId: tg.characterId, appearanceKey: tg.appearanceKey, view: 'main', actor: 'auto' }) }))
          : await timed(u, 'artist/generate-world', () => api('/api/artist/generate-world', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: pid, locationId: tg.locationId, column: 'wide_shot', prompt: tg.prompt, aspectRatio: '16:9', actor: 'auto' }) }))
        if (res.status === 200 && res.json?.jobId) { jobs.set(res.json.jobId, { kind: tg.kind, status: 'queued' }); return }
        if (res.status === 200) return // deduped · skipped
        if (res.status === 429 || res.status >= 500 || res.status === 0) { await sleep(10_000); continue }
        return // 4xx 영구
      }
    }
    const queue = [...targets]
    await Promise.all(Array.from({ length: POOL }, async () => { while (queue.length && !done()) await submitOne(queue.shift()) }))

    // 4) 잡 묶음 폴링 3초 — 영구 상태가 될 때까지. 일시 오류면 3→6→12→24→30초.
    let wait = 3_000
    while (!done()) {
      const ids = [...jobs].filter(([, j]) => j.status === 'queued').map(([id]) => id)
      if (ids.length === 0) break
      const res = await timed(u, 'generation-jobs?ids=', () => api(`/api/generation-jobs?ids=${ids.join(',')}`), { n: ids.length })
      if (res.status === 200 && res.json?.data?.jobs) {
        for (const [id, j] of Object.entries(res.json.data.jobs)) if (jobs.has(id)) jobs.get(id).status = j.status
        for (const id of res.json.data.missing ?? []) if (jobs.has(id)) jobs.get(id).status = 'missing'
        wait = 3_000
      } else if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status)) {
        for (const id of ids) jobs.get(id).status = `http${res.status}`
      } else wait = Math.min(30_000, wait * 2)
      await sleep(wait)
    }
    await Promise.all([tickLoop, writerLoop])
    return { u, jobs: [...jobs].map(([id, j]) => ({ id, ...j })) }
  }

  console.error(`[${runLabel}] ${base} · 사용자 ${userCount}명 · ${durationMs / 1000}초 · 입장 간격 ${Math.round(rampMs / Math.max(1, userCount - 1))}ms · 작가 폴링 ${writerPoll ? '켬' : '끔'}${canary ? ' · 카나리 켬' : ''}`)
  const canaryLoop = canary
    ? (async () => {
        const { cookie } = await getSession(manifest.users[0].email)
        while (!abort.on && !stopCanary && Date.now() < t0 + durationMs) {
          await timed(0, 'canary generation-slots', () => fetch(`${base}/api/artist/generation-slots`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) }))
          await sleep(2_000)
        }
      })()
    : Promise.resolve()
  const progress = setInterval(() => {
    const since = Date.now() - t0 - 30_000
    const win = log.filter((r) => r.t >= since)
    const err = win.filter((r) => r.status >= 500 || r.status === 0).length
    console.error(`  ${Math.round((Date.now() - t0) / 1000)}s  최근 30초 요청 ${win.length}  중앙값 ${quantile(win.map((r) => r.ms), 0.5)}ms  p95 ${quantile(win.map((r) => r.ms), 0.95)}ms  5xx/끊김 ${err}  429 ${win.filter((r) => r.status === 429).length}${abort.on ? `  ⚠ 중단: ${abort.why}` : ''}`)
  }, 30_000)
  const results = await Promise.all(
    manifest.users.slice(0, userCount).map(async (user, idx) => {
      await sleep(userCount > 1 ? (rampMs * idx) / (userCount - 1) : 0)
      try { return await virtualUser(user) } catch (e) { return { u: user.i, error: String(e).slice(0, 200), jobs: [] } }
    }),
  )
  stopCanary = true // 사용자 루프가 다 끝났으면 카나리도 멈춘다
  await canaryLoop
  clearInterval(progress)
  clearInterval(guard)

  // 요약
  const byName = {}
  for (const r of log) (byName[r.name] ??= []).push(r)
  const summary = Object.entries(byName).map(([name, rows]) => ({
    name, n: rows.length,
    median_s: +(quantile(rows.map((r) => r.ms), 0.5) / 1000).toFixed(3),
    p95_s: +(quantile(rows.map((r) => r.ms), 0.95) / 1000).toFixed(3),
    max_s: +(Math.max(...rows.map((r) => r.ms)) / 1000).toFixed(3),
    ok: rows.filter((r) => r.status >= 200 && r.status < 300).length,
    s429: rows.filter((r) => r.status === 429).length,
    s4xx: rows.filter((r) => r.status >= 400 && r.status < 500 && r.status !== 429).length,
    s5xx: rows.filter((r) => r.status >= 500).length,
    dropped: rows.filter((r) => r.status === 0).length,
  }))
  const buckets = []
  for (let b = 0; b * 30_000 < Date.now() - t0; b++) {
    const rows = log.filter((r) => r.t >= b * 30_000 && r.t < (b + 1) * 30_000)
    buckets.push({ from_s: b * 30, n: rows.length, median_ms: quantile(rows.map((r) => r.ms), 0.5), p95_ms: quantile(rows.map((r) => r.ms), 0.95), errors: rows.filter((r) => r.status >= 500 || r.status === 0).length, s429: rows.filter((r) => r.status === 429).length })
  }
  const jobTotals = { completed: 0, failed: 0, queued: 0, other: 0 }
  for (const r of results) for (const j of r.jobs) jobTotals[j.status in jobTotals ? j.status : 'other']++
  // 그림이 실제로 들어갔는지 DB 로 한 번 더 센다(service role)
  const pids = manifest.users.slice(0, userCount).map((x) => x.projectId)
  const [sheets, wides] = await Promise.all([
    rest(`character_appearances?select=project_id&project_id=in.(${pids.join(',')})&sheet_url=not.is.null`),
    rest(`locations?select=project_id&project_id=in.(${pids.join(',')})&wide_shot=not.is.null`),
  ])
  const out = {
    run: runLabel, target, base, at: new Date(t0).toISOString(), users: userCount, duration_s: durationMs / 1000, ramp_s: rampMs / 1000, writerPoll,
    elapsed_s: Math.round((Date.now() - t0) / 1000), aborted: abort.on ? abort.why : null,
    requests: log.length, summary, buckets, jobs: jobTotals, images: { sheets: sheets.length, wides: wides.length, wanted: pids.length * (manifest.users[0].characters.length + manifest.users[0].locations.length) },
    userErrors: results.filter((r) => r.error).map((r) => ({ u: r.u, error: r.error })),
  }
  const stamp = new Date(t0).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const resultPath = resolve(outDir, `run-${stamp}-u${userCount}${writerPoll ? '-wp' : ''}.json`)
  writeFileSync(resultPath, JSON.stringify(out, null, 2))
  writeFileSync(resolve(outDir, `run-${stamp}-u${userCount}${writerPoll ? '-wp' : ''}.log.json`), JSON.stringify(log))
  console.error(`\n[${runLabel}] 요청 ${log.length}건 · ${out.elapsed_s}초 · 그림 ${sheets.length + wides.length}/${out.images.wanted}${abort.on ? ` · ⚠ 중단 ${abort.why}` : ''}`)
  for (const s of summary) console.error(`  ${s.name.padEnd(30)} n ${String(s.n).padStart(5)}  중앙값 ${s.median_s}s  p95 ${s.p95_s}s  최대 ${s.max_s}s  ok ${s.ok}  429 ${s.s429}  4xx ${s.s4xx}  5xx ${s.s5xx}  끊김 ${s.dropped}`)
  console.error(`결과 → ${resultPath}`)
  console.log(JSON.stringify(out))
}

// ── reset: 그림만 비워 같은 계정으로 다시 잰다(보관함 파일은 cleanup 때 계정 삭제가 치운다) ──
async function reset() {
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} 가 없다`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const pids = manifest.users.map((u) => u.projectId).join(',')
  const h = { Prefer: 'return=representation' }
  const [a, c, l, la, cc, lc, j] = await Promise.all([
    rest(`character_appearances?project_id=in.(${pids})`, { method: 'PATCH', headers: h, body: JSON.stringify({ sheet_url: null, portrait_url: null }) }),
    rest(`characters?project_id=in.(${pids})`, { method: 'PATCH', headers: h, body: JSON.stringify({ view_main: null, portrait: null }) }),
    rest(`locations?project_id=in.(${pids})`, { method: 'PATCH', headers: h, body: JSON.stringify({ wide_shot: null }) }),
    rest(`location_appearances?project_id=in.(${pids})`, { method: 'PATCH', headers: h, body: JSON.stringify({ wide_shot: null }) }),
    rest(`character_image_candidates?project_id=in.(${pids})`, { method: 'DELETE', headers: h }),
    rest(`location_image_candidates?project_id=in.(${pids})`, { method: 'DELETE', headers: h }),
    // 지난 실행의 작업 행은 지운다 — 실패 기록이 남으면 give-up 규칙이 자동 그리기를 건너뛴다(generate-sheet 136행).
    rest(`generation_jobs?project_id=in.(${pids})`, { method: 'DELETE', headers: h }),
  ])
  console.error(`비움 — 모습 ${a.length} · 인물 ${c.length} · 배경 ${l.length} · 배경 모습 ${la.length} · 후보 ${cc.length + lc.length} · 작업 행 ${j.length}`)
}

// ── cleanup ──────────────────────────────────────────────────────────────────
async function cleanup() {
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} 가 없다`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const base = String(args.base ?? '').replace(/\/$/, '')
  const left = []
  for (const user of manifest.users) {
    try {
      let ok = false
      if (base) {
        // 앱의 계정 삭제 길(프로젝트 · 보관함 파일 · 작업 공간 · 계정) — 실제 사용자가 지우는 것과 같은 순서
        const { cookie } = await getSession(user.email)
        const r = await fetch(`${base}/api/account/delete`, { method: 'POST', headers: { cookie } })
        ok = r.ok
        if (!ok) console.error(`  ${user.email} account/delete → ${r.status} ${(await r.text()).slice(0, 120)}`)
      }
      if (!ok) {
        // 서버 길이 막히면 DB 에서 직접 — delete_project_deep 은 DB 만 지우므로 보관함 파일이 남을 수 있다(결과에 적는다)
        await rest('rpc/delete_project_deep', { method: 'POST', body: JSON.stringify({ p_project_id: user.projectId, p_user_id: user.userId }) }).catch(async () => {
          await rest(`projects?id=eq.${user.projectId}`, { method: 'DELETE' })
        })
        await rest(`workspaces?id=eq.${user.workspaceId}`, { method: 'DELETE' })
        await authAdmin(`admin/users/${user.userId}`, { method: 'DELETE' })
      }
      console.error(`  지움 ${user.email}${ok ? '' : ' (DB 직접)'}`)
    } catch (e) {
      left.push({ email: user.email, error: String(e).slice(0, 200) })
      console.error(`  ✗ ${user.email}: ${String(e).slice(0, 200)}`)
    }
  }
  const remaining = await rest(`projects?select=id&title=like.*%5B부하시험 ${runLabel}%5D*`)
  writeFileSync(resolve(outDir, 'cleanup.json'), JSON.stringify({ at: new Date().toISOString(), left, remainingProjects: remaining.length }, null, 2))
  console.error(`남은 프로젝트 ${remaining.length} · 실패 ${left.length}`)
}

if (command === 'prepare') await prepare()
else if (command === 'run') await run()
else if (command === 'reset') await reset()
else if (command === 'cleanup') await cleanup()
else throw new Error('prepare | run | reset | cleanup 가운데 하나를 적는다')
