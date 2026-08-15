// 배선도 정적 스냅샷 — 아티팩트로 올릴 한 장을 만든다.
//   pnpm map:build [출력경로]
// 서버판과 같은 생성기를 쓰므로 로컬에서 보던 것과 내용이 갈리지 않는다.
import { writeFileSync } from 'node:fs'
import { buildModel, renderHtml } from './render.mjs'

const out = process.argv[2] ?? 'writer-visual-shot-map.html'
const model = buildModel({ run: process.env.WRITER_MAP_RUN || undefined })
const html = renderHtml(model, { live: false })
writeFileSync(out, html, 'utf8')

console.log(`[writer-map] ${out} (${(html.length / 1024).toFixed(0)}KB)`)
console.log(
  `[writer-map] 노드 ${model.nodes.length} · 엣지 ${model.nodes.reduce((n, x) => n + (x.inputs?.length ?? 0), 0)}` +
    (model.run ? ` · 런 ${model.run.id.slice(0, 8)}` : ' · 런 로그 없음'),
)
if (model.drift.length) {
  console.log(`[writer-map] ⚠ 문서와 코드가 어긋난 자리 ${model.drift.length}건:`)
  for (const d of model.drift) console.log(`  - ${d.node} / ${d.label}: ${d.detail}`)
}
