// alias-hook.mjs — `@/...` 를 `src/...` 로 풀어주는 Node 모듈 해석 훅.
//
// 왜 필요한가: 픽스처 빌더가 제품 코드(예: evaluateProducerGate)를 **실제로 호출**해야
//   픽스처가 낡았을 때 그 자리에서 실패한다. 그런데 제품 코드는 tsconfig 의 `@/` 별칭을 쓰고
//   Node 는 그 별칭을 모른다. 번들러 없이 그 간극만 메운다.
//   (tsx 같은 러너를 새로 넣지 않는 이유: 의존성 하나를 아끼려는 게 아니라, 이 훅이 20줄이라서다.)
//
// 사용: node --import ./tests/fixtures/alias-hook.mjs <script.ts>
import { existsSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve as pathResolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SRC = pathResolve(process.cwd(), 'src')

/** 확장자 없는 경로를 실제 파일로 넓혀본다. tsconfig 의 moduleResolution 을 흉내내는 최소 구현. */
function widen(base) {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

function resolve(specifier, context, next) {
  if (!specifier.startsWith('@/')) return next(specifier, context)
  const hit = widen(pathResolve(SRC, specifier.slice(2)))
  if (!hit) return next(specifier, context) // 못 찾으면 원래 에러가 나게 둔다
  return { url: pathToFileURL(hit).href, shortCircuit: true }
}

// registerHooks(동기·같은 스레드) — 구 module.register() 는 Node 26 에서 폐지 경고가 뜬다.
registerHooks({ resolve })
