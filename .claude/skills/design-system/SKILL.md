---
description: tale-studio UI 작업을 위한 디자인 시스템 룰과 토큰. 컴포넌트/페이지/스크린 빌드, shadcn 컴포넌트 추가, Tailwind 스타일링, src/components/ 또는 src/app/ 하위 .tsx 작업, "design"/"style"/"component"/"page"/"layout"/"color"/"spacing"/"token" 멘션 시 사용.
when_to_use: UI 빌드, shadcn 컴포넌트 추가, 페이지 스타일링, 캔버스 노드 비주얼 생성, 토큰 수정
paths:
  - "src/**/*.{tsx,css}"
allowed-tools: Read, Grep, Glob
---

# tale-studio design system

UI 코드 작성 전 `specs/design.md` (정량 명세) + `specs/design-references.md` (정성 reference) + `src/app/globals.css` (토큰 source-of-truth) 로드.

## 4 hard rules (사용자 명시 지시 없이 위반 금지)
1. **Dark-first with light parity**. light-only 금지.
2. **One accent** (Netflix Red `#E50914`, decisions #30) — CTA + active state만.
3. **Geist Mono** — camera-axis values, render IDs, frame numbers.
4. **캔버스 확장 토큰** 사용. 새 토큰 만들지 말 것.

## "We are NOT" exclusion list
- NOT Higgsfield (glassmorphism, neon 금지)
- NOT 커뮤니티-flavored 오픈소스 도구 (n8n loud 카테고리 배너 금지)
- NOT consumer-creator (light-first, marketing gradient 금지)
- NOT marketing-tier 대시보드 (featured 캐러셀, hero 모듈 in-studios 금지)
- NOT pure-black Vercel-extreme (pure `#000` 금지 — Netflix Dark `#121212`)

## Process
1. `specs/design.md`와 `specs/design-references.md` 안 읽었으면 읽기
2. 관련 섹션 식별 — Color §2 / Spacing §3 / Typography §4 / Sizing §6 / Radius §7 / Motion §10 / States §12 / Canvas §17
3. shadcn primitive로 생성 — 캔버스 확장 외 custom CSS 금지
4. 캔버스 노드 작업이면 §17 룰 strict 적용 (size, padding, edge stroke, port hit area, grid snap 16px, selection halo)
5. 새 토큰 필요하면 §19.3 워크플로 — 정말 필요한지 재확인 → globals.css → design.md §2 표 갱신

## 자주 참조하는 섹션
- §1 5 design 원칙 + 4 hard rules + "We are NOT"
- §2 Color tokens (chart-1~5 = Actor/World/Scene/Shot/Video 매핑)
- §2.9 Stage 색 (`--stage-producer~editor`, P1~P5 badge/face. director=rose, NOT accent)
- §4 Typography per-context 할당 + Geist Mono 강제 영역
- §13 Layout primitives (shell, dialog, form, empty/loading/error)
- §13.8 Component patterns (shadcn primitive 인벤토리 + 표준 조합 스니펫)
- §17 Canvas conventions (정량 룰 11개)
- §18 Worked example — Actor node 풀 코드

## 살아있는 카탈로그
- **`/design` 쇼케이스** (`src/app/design/page.tsx`) — 전 색 토큰 swatch + primitive variant/state를 살아있는 토큰으로 렌더. 새 색·variant 추가 시 여기서 먼저 시각 확인.

## 변경 시
- design.md 수정 시 frontmatter `last_updated` 갱신 필수 (§19.4)
- globals.css 토큰 변경 시 design.md §2 표도 같이 PR
- 새 토큰/variant는 `/design` 쇼케이스에도 추가
