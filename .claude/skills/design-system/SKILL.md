---
description: tale-studio UI 작업을 위한 디자인 시스템 룰과 토큰. 컴포넌트/페이지/스크린 빌드, shadcn 컴포넌트 추가, Tailwind 스타일링, src/components/ 또는 src/app/ 하위 .tsx 작업, "design"/"style"/"component"/"page"/"layout"/"color"/"spacing"/"token" 멘션 시 사용.
when_to_use: UI 빌드, shadcn 컴포넌트 추가, 페이지 스타일링, 캔버스 노드 비주얼 생성, 토큰 수정
paths:
  - "src/**/*.{tsx,css}"
allowed-tools: Read, Grep, Glob
---

# tale-studio design system

UI 코드 작성 전 `specs/design.md` (정량 명세) + `specs/design-references.md` (정성 reference) + `src/app/globals.css` (토큰 source-of-truth) 로드.

## 6 hard rules — v3 (2026-11-03 오너 지시, 사용자 명시 지시 없이 위반 금지)
1. **Dark only** — 밝은 테마 금지.
2. **메인 단추는 크림 하나** (`--primary` 바탕 · 어두운 글씨). 나머지는 secondary(카드색) · ghost.
3. **지금 단계 색은 지금 단계의 칩 · 선택 · 배지에만** — `--stage`(`data-stage`), 한 화면에 단계 색 하나.
4. **Pretendard(글자) + Inter(숫자 · 메타, `font-num`)** — 고정폭 글꼴 없음.
5. **No glassmorphism** — 반투명 + backdrop-blur 판 금지, 효과는 아래 그림자 하나(`shadow-panel`).
6. **캔버스 확장 토큰** 사용. 새 토큰 만들지 말 것.

## "We are NOT" exclusion list
- NOT Higgsfield (glassmorphism, neon 금지 — Lumi 3D 는 브랜드 자산이라 정해진 자리에만)
- NOT 커뮤니티-flavored 오픈소스 도구 (loud 카테고리 배너 금지)
- NOT 여러 색 대시보드 (지난 단계는 무채색)
- NOT pure-black (`#000` 금지 — 바탕은 Shell `#262624` 따뜻한 무채색)

## Process
1. `specs/design.md`와 `specs/design-references.md` 안 읽었으면 읽기
2. 관련 섹션 식별 — Color §2 / Spacing §3 / Typography §4 / Sizing §6 / Radius §7 / Motion §10 / States §12 / Canvas §17
3. shadcn primitive로 생성 — 캔버스 확장 외 custom CSS 금지
4. 캔버스 노드 작업이면 §17 룰 strict 적용 (size, padding, edge stroke, port hit area, grid snap 16px, selection halo)
5. 새 토큰 필요하면 §19.3 워크플로 — 정말 필요한지 재확인 → globals.css → design.md §2 표 갱신

## 자주 참조하는 섹션
- §0 v3 로 바뀐 까닭 · 오너 11/3 결정
- §1 5 design 원칙 + 6 hard rules + "We are NOT"
- §2 Color tokens (shell · side · panel · card · chip, 글자 3단, 상태 4색)
- §2.9 Stage 색 (브랜드 가이드 값, 화면 이름 기준) · §2.10 채팅 색 · §2.11 `data-stage`
- §4 Typography (Pretendard + Inter, text-title · text-label · text-meta …)
- §13 Layout primitives (레일 · 위 막대 `StudioTopBar` · 화면 머리 `PageHeader` · Card · 채팅)
- §13.8 shadcn primitive v3 손질 · §13.9 controls(`ChoiceChip` · `OptionCard` · `RecommendBadge` · `StageChip`)
- §15.4 Lumi (`Lumi` 큰 · `LumiAvatar` 채팅)
- §17 Canvas conventions (정량 룰 11개)

## 살아있는 카탈로그
- **`/design` 쇼케이스** (`src/app/design/page.tsx`) — 전 색 토큰 swatch + primitive variant/state를 살아있는 토큰으로 렌더. 새 색·variant 추가 시 여기서 먼저 시각 확인.

## 변경 시
- design.md 수정 시 frontmatter `last_updated` 갱신 필수 (§19.4)
- globals.css 토큰 변경 시 design.md §2 표도 같이 PR
- 새 토큰/variant는 `/design` 쇼케이스에도 추가
