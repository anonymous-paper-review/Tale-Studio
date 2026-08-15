// 로컬 실시간 배선도 서버.
//   pnpm map:dev  →  http://localhost:4321
//
// 요청마다 코드와 런 로그를 다시 읽어 페이지를 만든다. 감시 대상이 바뀌면 SSE 로 새로고침을 쏜다.
// 외부 의존 없음 (node 기본 모듈만).
import { createServer } from 'node:http'
import { watch, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildModel, renderHtml } from './render.mjs'

const ROOT = process.cwd()
const PORT = Number(process.env.WRITER_MAP_PORT) || 4321
const RUN = process.env.WRITER_MAP_RUN || undefined

// 이 디렉토리들이 바뀌면 지도가 낡는다.
const WATCH = [
  'src/lib/writer',
  'src/lib/director',
  'src/app/api/writer',
  'research/tools/writer-map',
]

const clients = new Set()
let pending = null

function broadcast(reason) {
  for (const res of clients) {
    try {
      res.write(`event: changed\ndata: ${JSON.stringify({ reason })}\n\n`)
    } catch {
      clients.delete(res)
    }
  }
}

function onChange(file) {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    console.log(`[writer-map] 변경 감지: ${file} — 새로고침 신호`)
    broadcast(file)
  }, 160)
}

for (const dir of WATCH) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) continue
  try {
    watch(abs, { recursive: true }, (_evt, name) => {
      if (!name) return
      if (!/\.(ts|tsx|mts|mjs)$/.test(name)) return
      onChange(`${dir}/${name}`)
    })
  } catch (e) {
    console.warn(`[writer-map] 감시 실패 (${dir}):`, e.message)
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write(': connected\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('없는 경로다. / 로 가라.')
    return
  }

  const started = Date.now()
  try {
    const model = buildModel({ run: url.searchParams.get('run') || RUN })
    const html = renderHtml(model, { live: true })
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(html)
    const drift = model.drift.length
    console.log(
      `[writer-map] 렌더 ${Date.now() - started}ms · 노드 ${model.nodes.length}` +
        (model.run ? ` · 런 ${model.run.id.slice(0, 8)}` : ' · 런 로그 없음') +
        (drift ? ` · ⚠ 어긋남 ${drift}건` : ''),
    )
  } catch (e) {
    console.error('[writer-map] 렌더 실패:', e)
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`렌더 실패\n\n${e.stack ?? e.message}`)
  }
})

server.listen(PORT, () => {
  console.log(`[writer-map] http://localhost:${PORT} — 코드가 바뀌면 자동으로 다시 그린다`)
  console.log(`[writer-map] 감시: ${WATCH.join(', ')}`)
})
