import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// 실행 방법
//   npm run dev        → 개발 서버 (http://localhost:5173)
//   npm run build      → build/web/ : 실제 배포용 (이미지 · 영상 · 스크립트가 각각 파일로 나뉨)
//   npm run build:single → ../dist/TaleStudio_메인.html : 모든 걸 한 파일에 담은 시안 (build.mjs)
const single = process.env.SINGLE === '1'
const page = process.env.PAGE || 'index'

// Lumi 3D 컴포넌트(vendor/lumi-persona.js)를 index.html의 <!--LUMI_PERSONA--> 자리에 넣어요.
// 배포용은 별도 파일로, 단일 시안은 build.mjs가 직접 인라인해요.
const lumiPersona = () => ({
  name: 'lumi-persona',
  transformIndexHtml(html, ctx) {
    if (single) return html
    const src = ctx.server ? '/vendor/lumi-persona.js' : './lumi-persona.js'
    return html.replace('<!--LUMI_PERSONA-->', `<script src="${src}"></script>`)
  },
  generateBundle() {
    if (single) return
    this.emitFile({ type: 'asset', fileName: 'lumi-persona.js', source: readFileSync('vendor/lumi-persona.js', 'utf8') })
  },
})

export default defineConfig({
  base: './',
  plugins: [lumiPersona()],
  build: single
    ? {
        outDir: `build/${page}`,
        emptyOutDir: true,
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
        modulePreload: false,
        rollupOptions: { input: `${page}.html`, output: { inlineDynamicImports: true } },
      }
    : { outDir: 'build/web', emptyOutDir: true },
})
