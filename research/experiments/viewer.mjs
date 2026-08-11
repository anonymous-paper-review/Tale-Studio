#!/usr/bin/env node
// 실험 산출물 뷰어 — research/experiments/ 아래 영상·이미지·프롬프트를 한 페이지에서 재생/열람.
// 사용: node research/experiments/viewer.mjs && open research/experiments/_viewer.html
// (인자로 폴더명을 주면 그 실험만: node research/experiments/viewer.mjs previz-video-reference-ab)
// 파일을 복사하지 않고 상대경로로 참조하므로 즉시 갱신된다. 생성물은 gitignore 대상.

import { readdirSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const OUT = join(ROOT, '_viewer.html')
const ONLY = process.argv[2] ?? null

const VIDEO = new Set(['.mp4', '.webm', '.mov'])
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const TEXT = new Set(['.txt', '.md'])
const SKIP_DIR = new Set(['node_modules', '.git', 'assets_raw'])

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else acc.push({ path: p, size: st.size, mtime: st.mtimeMs })
  }
  return acc
}

const experiments = readdirSync(ROOT)
  .filter((n) => !n.startsWith('_') && !n.startsWith('.') && statSync(join(ROOT, n)).isDirectory())
  .filter((n) => (ONLY ? n === ONLY : true))
  .sort()

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const mb = (n) => (n / 1024 / 1024 >= 1 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`)
// 원본과 프리뷰가 둘 다 있으면 프리뷰를 먼저 보여주고 원본은 링크로
const isPreview = (p) => /_preview\.\w+$/.test(p)

const sections = []
let totalVideos = 0

for (const exp of experiments) {
  const files = walk(join(ROOT, exp))
  const vids = files.filter((f) => VIDEO.has(extname(f.path).toLowerCase())).sort((a, b) => a.path.localeCompare(b.path))
  const imgs = files.filter((f) => IMAGE.has(extname(f.path).toLowerCase())).sort((a, b) => a.path.localeCompare(b.path))
  const prompts = files.filter(
    (f) => TEXT.has(extname(f.path).toLowerCase()) && /prompt|notes|findings|result/i.test(basename(f.path)),
  )
  if (!vids.length && !imgs.length) continue

  const previews = vids.filter((f) => isPreview(f.path))
  const shown = previews.length ? previews : vids
  const originals = new Map(vids.filter((f) => !isPreview(f.path)).map((f) => [basename(f.path, extname(f.path)), f]))
  totalVideos += shown.length

  const vidHtml = shown
    .map((f) => {
      const rel = relative(ROOT, f.path)
      const stem = basename(f.path, extname(f.path)).replace(/_preview$/, '')
      const orig = originals.get(stem)
      return `<figure class="cell">
  <video src="${esc(rel)}" controls loop muted playsinline preload="metadata"></video>
  <figcaption><b>${esc(stem)}</b> <span class="dim">${mb(f.size)}${orig ? ` · <a href="${esc(relative(ROOT, orig.path))}" target="_blank">원본 ${mb(orig.size)}</a>` : ''}</span>
  <span class="dim path">${esc(relative(join(ROOT, exp), f.path))}</span></figcaption>
</figure>`
    })
    .join('\n')

  const imgHtml = imgs
    .map((f) => {
      const rel = relative(ROOT, f.path)
      return `<figure class="cell img">
  <a href="${esc(rel)}" target="_blank"><img src="${esc(rel)}" loading="lazy" alt="${esc(basename(f.path))}"></a>
  <figcaption><b>${esc(basename(f.path))}</b> <span class="dim">${mb(f.size)}</span></figcaption>
</figure>`
    })
    .join('\n')

  const promptHtml = prompts
    .map((f) => {
      let body = ''
      try {
        body = readFileSync(f.path, 'utf8')
      } catch {
        return ''
      }
      if (body.length > 20000) body = body.slice(0, 20000) + '\n… (잘림 — 원본 파일 참조)'
      return `<details><summary>${esc(relative(join(ROOT, exp), f.path))}</summary><pre>${esc(body)}</pre></details>`
    })
    .join('\n')

  sections.push(`<section id="${esc(exp)}">
  <h2>${esc(exp)} <span class="dim">영상 ${shown.length} · 이미지 ${imgs.length}</span></h2>
  ${vidHtml ? `<div class="grid">${vidHtml}</div>` : ''}
  ${imgHtml ? `<details class="imgs"><summary>이미지 ${imgs.length}장</summary><div class="grid">${imgHtml}</div></details>` : ''}
  ${promptHtml ? `<div class="texts"><div class="lbl">입력 프롬프트 · 관찰 · 판정 원문</div>${promptHtml}</div>` : ''}
</section>`)
}

const nav = experiments.map((e) => `<a href="#${esc(e)}">${esc(e)}</a>`).join('')

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>실험 산출물 뷰어 — tale-studio</title>
<style>
:root{--bg:#15171B;--surface:#1D2026;--surface-2:#23262D;--ink:#E9E7E2;--muted:#9C9EA6;--line:#2C2F36;--accent:#E0824F;
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
@media(prefers-color-scheme:light){:root{--bg:#F7F5F0;--surface:#FFF;--surface-2:#F1EEE6;--ink:#22242A;--muted:#6E7077;--line:#E3E0D8;--accent:#A64F2A}}
*{box-sizing:border-box}
body{margin:0;padding:0 20px 80px;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif;font-size:15px;line-height:1.6}
.wrap{max-width:1200px;margin:0 auto}
header{padding:32px 0 12px;border-bottom:2px solid var(--ink);margin-bottom:8px}
h1{font-size:22px;font-weight:800;margin:0 0 6px}
.dim{color:var(--muted);font-weight:400;font-size:12.5px}
.path{display:block;font-family:var(--mono);font-size:11px;margin-top:2px;word-break:break-all}
nav{position:sticky;top:0;background:var(--bg);padding:10px 0;border-bottom:1px solid var(--line);margin-bottom:20px;z-index:9;display:flex;gap:8px;flex-wrap:wrap}
nav a{font-size:12px;font-family:var(--mono);color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:4px;padding:3px 8px}
nav a:hover{border-color:var(--accent)}
section{margin:34px 0 0;scroll-margin-top:56px}
h2{font-size:17px;font-weight:750;margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line);font-family:var(--mono)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.cell{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px}
.cell video,.cell img{width:100%;height:auto;display:block;border-radius:5px;background:#000}
.cell figcaption{font-size:12.5px;margin-top:6px}
.cell.img img{max-height:220px;object-fit:contain}
details{margin-top:10px}
summary{cursor:pointer;font-size:13px;color:var(--accent);font-family:var(--mono)}
pre{background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;overflow-x:auto;font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;word-break:break-word;max-height:420px}
.texts{margin-top:14px}
.lbl{font-size:12px;font-weight:750;color:var(--accent);margin-bottom:4px}
a{color:var(--accent)}
</style></head><body><div class="wrap">
<header>
  <h1>실험 산출물 뷰어</h1>
  <p class="dim">실험 ${experiments.length}개 · 영상 ${totalVideos}편 — 상대경로 참조라 파일을 갱신하면 새로고침만 하면 된다. 재생성: <span style="font-family:var(--mono)">node research/experiments/viewer.mjs</span></p>
</header>
<nav>${nav}</nav>
${sections.join('\n')}
</div></body></html>`

writeFileSync(OUT, html)
console.log(`wrote ${relative(process.cwd(), OUT)} — 실험 ${experiments.length}, 영상 ${totalVideos}`)
if (!existsSync(join(ROOT, '..', '..', '.gitignore'))) console.log('(gitignore 확인 필요)')
