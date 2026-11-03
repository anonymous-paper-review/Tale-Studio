---
name: tale-studio design system
version: 1.0.0
last_updated: 2026-11-03
owner: shared
canonical_implementation: src/app/globals.css
source_of_truth: 토큰 값은 globals.css. design.md는 *역할 / 사용 룰 / 스케일 정량 명세*.
design_source: Figma 「Tale Studio 리뉴얼 (복사)」 v3 (Claude 톤 · 확정 방향) — research/figma-renewal-v3/ (git 밖)
---

# tale-studio design system — v3

> **목적**: 시각·인터랙션 공통 컨벤션의 단일 명세. design.md는 *어떤 값을 쓸 것인가* (정량). *왜 그 값들을 선택했는가* (정성 reference)는 [`specs/design-references.md`](./design-references.md).
>
> 충돌 시: **globals.css가 이김**. design.md는 정량 reference + 룰 + 결정 트리. raw hex/px 복제 금지.
>
> 룰을 어기는 코드는 사용자가 명시적으로 허락하지 않는 한 reject. 위반이 반복되면 본 문서 또는 hooks를 강화.

## 0. 이번 판(v1.0.0)이 바뀐 까닭

**2026-11-03 오너 지시 — 디자이너 v3 디자인을 적용한다.** 예전 판(0.4.0, Netflix Dark · Netflix Red 단일 accent · Geist)을
v3 "Claude 톤"(따뜻한 무채색 · 크림 메인 단추 · 지금 단계 색 하나 · Pretendard + Inter)으로 갈아 끼웠다.

같은 날 오너가 정한 것(v3 와 제품 구조가 부딪치는 자리):
- 샷 번호는 보드의 전체 번호("Scene 2 · Shot 8") 그대로 — v3 의 "S1-2" 를 쓰지 않는다.
- 단계 색은 Figma 브랜드 가이드 값(아래 §2.9). Lumi 개발 가이드 채팅 CSS 의 `--stage-*` 값 대신 이 값을 쓴다. 채팅 무채색은 가이드 그대로.
- 마스터 시트는 [내보내기] 체크 창의 한 칸 — 화면 JPEG · 마스터 시트 그림 · 이 단계 ZIP · 전체 프로젝트 ZIP 중 고른 것만 창의 순서대로 받는다
  (고를 수 있는 조건은 예전 메뉴 그대로, `src/lib/export/export-choices.ts` · `src/components/export-menu.tsx`).
- Storyboard 카드는 지금의 3컷 순환 그대로.
- 채팅의 모델 고르기 · 다른 단계 고르기 · [+] 첨부는 모두에게 그대로 — 모양만 바꾼다.
- Writer 는 [화면에서 고치기 | 채팅으로 고치기] 토글을 뺐다 — [직접 작성] · [AI 다시 쓰기] · 오른쪽 채팅이 한 화면이고, 문단을 누르면 그 문단을 채팅에 붙여 고친다(`src/features/prose/prose-workspace.tsx`).
- 큰 3D Lumi 는 가이드가 말한 자리 모두: 확인 팝업(넘기기 확인 창 맨 위 `ConfirmLumi`, §13.3) · 단계 넘어가며 기다리는 화면(§13.5) · 새 프로젝트 만드는 화면 · 프로젝트 목록 첫 화면(§15.4).
- 채팅 아바타는 움직이지 않는 그림(가이드가 목록에는 그림을 권한다).

---

## 1. Overview

tale-studio는 **AI 비디오 파이프라인 (Tale)** 의 제작 도구다. 이야기 → 산문 → 인물 · 배경 → 스토리보드 → 연출 · 촬영 → 편집.

**Personality(v3)**: *Claude · Figma 처럼 담백하게.* 바탕과 글자는 따뜻한 무채색, 메인 단추는 크림 하나, 상태 색은 정말 필요한 곳(오류 · 완료 · 주의 · 링크)에만.
단계마다 그 단계 색 하나가 지금 단계의 칩 · 선택 · 배지에만 나온다. 캐릭터 Lumi 가 단계마다 그 단계 옷을 입고 채팅에서 말한다.

**Mode**: **어두운 화면 하나(dark only)**. `<html class="dark">` 고정, 밝은 테마 값은 두지 않는다(globals.css `:root` 가 곧 어두운 값).

### 5 design 원칙
1. **작업 화면 제일주의** — 사이드바 · 위 막대 · 채팅은 무채색 틀, 내용이 주인공
2. **`globals.css` 토큰 외 신규 색 금지** (`pnpm lint:design` 이 기계로 막는다)
3. **모션은 정보 전달** (장식 아님) — 큰 Lumi 의 상태 연기는 "지금 무슨 일인지"를 알린다
4. **키보드 일등 시민**
5. **한 화면 정보 위계 2단까지**

### 6 hard rules (v3)
1. **Dark only.** 밝은 테마 · 밝은 화면 금지(마케팅 홈 시안도 어두운 바탕).
2. **메인 단추는 크림 하나** (`--primary` #EDEAE0 바탕 · 어두운 글씨 `--primary-foreground`). 화면에 하나 — 나머지는 보조(카드색) · ghost.
3. **지금 단계 색은 지금 단계의 칩 · 선택 · 배지에만** (`--stage`, §2.9 · §2.11). 한 화면에 단계 색은 하나. 단계 색으로 단추를 칠하지 않는다.
4. **글꼴 = Pretendard(글자) + Inter(숫자 · 메타)**. 고정폭 글꼴은 두지 않는다(`font-mono` 도 Inter, §4.1).
5. **No glassmorphism** — 반투명 + 배경 흐림(backdrop-blur) 판 금지. 판은 단색, 효과는 아래 그림자 하나(§9).
6. **캔버스 확장 토큰** (`--canvas-*`, `--node-*`, `--edge-*`) 사용. 새 토큰 만들지 말 것.

### "We are NOT" exclusion list
1. **NOT Higgsfield** — glassmorphism, neon edge-glow, liquid-glass surface 금지. (단, 브랜드 캐릭터 Lumi 의 3D 광택은 브랜드 자산이라 예외 — 정해진 자리에만, §15.4)
2. **NOT 커뮤니티-flavored 오픈소스 도구** — 불균일 아이콘, 혼합 radius 카드, saturated 카테고리 배너 색 금지.
3. **NOT 여러 색 대시보드** — 단계 색을 한 화면에 여럿 칠하지 않는다. 지난 단계 표시는 무채색.
4. **NOT pure-black** — 바탕은 `#000` 이 아니라 따뜻한 무채색(Shell #262624).

### Non-goals
- 밝은 테마 · 테마 토글
- 단계 색 외의 두 번째 chromatic accent
- 장식 그림자 · 빛(glow) — 판 아래 그림자 하나만 허용

---

## 2. Color

### 2.1 Token reference

source-of-truth는 `src/app/globals.css`. 본 섹션은 *역할*만 enumerate — **값은 여기 복제하지 않는다**(/design 쇼케이스가 계산된 값을 보여 준다).

| 토큰 | 역할 (v3 브랜드 가이드 04 시스템 색) |
|---|---|
| `--shell` = `--background` | 작업 화면 바탕 |
| `--side` | 사이드바 · 채팅 바탕 |
| `--panel` | **큰 내용 판** — 산문 카드 · 설정 카드 · 인물 묶음 · 샷 카드. 바탕보다 한 단 어둡다(시안 #1D191A 85~88% 를 바탕 위에 합친 단색) |
| `--card` | **카드 · 입력 · 보조 단추** — 선택 카드, 입력칸, 탭 묶음 바탕 |
| `--chip` = `--accent` | 칩 · 보조 단추 눌림 · hover |
| `--foreground` | 본문 글자 (Text) |
| `--muted-foreground` | 보조 글자 (Text 2) — 설명 · 부제 |
| `--subtle-foreground` | 흐린 글자 — 메타 · 힌트 · 자리표시 · 아직 안 연 단계 (시안 #8E8B82) |
| `--primary` / `--primary-foreground` | 크림 메인 단추 / 그 위 어두운 글씨 |
| `--secondary` | 보조 단추 바탕 (= card) |
| `--muted` | subdued surface (= card) |
| `--popover` | 팝오버 · 메뉴 바탕 (= card) |
| `--destructive` | Danger — 오류 · 삭제. 늘 아이콘과 함께 |
| `--border` · `--input` | hairline 1px / 입력 테두리 |
| `--ring` | 포커스 링 = Info 파랑 (브랜드 가이드 "링크 · 포커스") |
| `--surface-primary/secondary/tertiary/elevated` | shell / card / chip / 가장 위(툴팁) |
| `--on-stage` | 단계 색 바탕 위 어두운 글씨 |

### 2.2 Chart 토큰 (노드 색)

엔티티 표시색. chart-1/2 는 같은 엔티티(인물 · 장소) 표시에만 쓴다.

| 토큰 | 사용처 |
|---|---|
| `--chart-1` (red) | **인물** 표시 — Artist 산문 재점검의 산문 속 인물 이름 · 범례 칩 |
| `--chart-2` (blue) | **장소** 표시 — Artist 산문 재점검의 산문 속 장소 이름 · 범례 칩 |
| `--chart-3` | **Scene** 노드 (Director) |
| `--chart-4` | **Shot** 노드 (Director) |
| `--chart-5` | **Video** 노드 (Director) |

### 2.3 Text color tiers

| Tier | 토큰 | 사용 |
|---|---|---|
| Primary | `--foreground` | 본문, 제목 |
| Secondary | `--muted-foreground` | 설명 · 부제 · 보조 라벨 · 끝낸 단계 |
| Subtle | `--subtle-foreground` | 메타(숫자) · 힌트 · 자리표시 · 아직 안 연 단계 · 타임스탬프 |
| Disabled | 지금 글자 + opacity-50 | disabled control |
| Inverse | `--primary-foreground` | 크림 위 글씨 |

Tailwind: `text-foreground` · `text-muted-foreground` · `text-subtle-foreground`.

### 2.4 Border tiers

v3 시안에는 테두리가 거의 없다(면 색 차이로 나눈다). 테두리는 꼭 필요할 때만.

| Tier | 토큰 | 사용 |
|---|---|---|
| Subtle | `--border-subtle` | 비-interactive separator |
| Default | `--border` | 카드 · 패널 구분 (rest) |
| Strong | `--border-strong` | hovered interactive border |
| Focus | `--ring` (Info) | focus ring |
| Selected | `--stage` 1.5px | 고른 칩 · 고른 선택 카드 (§2.11) |

### 2.5 Semantic state colors

| 상태 | 토큰 | Foreground | 사용 |
|---|---|---|---|
| Error / destructive | `--destructive` (Danger) | white | 오류 · 삭제. Writer 로즈 레드와 겹치지 않게 **늘 아이콘과 함께** |
| Success | `--success` | `--success-foreground` | 완료 · 저장됨 |
| Warning | `--warning` | `--warning-foreground` | 주의 · 크레딧 |
| Info | `--info` | `--info-foreground` | 링크 · 포커스 |
| Generating | `.tale-beam` (`--primary` 기본) | — | 생성 중 카드 테두리 빛 |

**룰**: 상태는 **색 + icon + label** 3중. 상태 색은 상태 표현에만 — 단추를 칠하지 않는다.

### 2.6 Focus ring

- 색: `--ring` (Info 파랑), `focus-visible:ring-[3px] ring-ring/50` (입력칸은 /30)
- 채팅 입력창만 예외: 포커스면 지금 단계 색 1px 테두리(Lumi 가이드 `.chat-input:focus-within`)
- focus-visible만 (mouse focus는 ring 없음)

### 2.7 Interaction state delta

| State | 적용 |
|---|---|
| Hover | `bg-accent`(chip) 또는 `bg-{token}/90` |
| Selected (칩 · 선택 카드 · pill 탭) | `border-stage` 1.5px + `bg-stage/18` + `aria-pressed`/`data-state` |
| Selected (segmented 탭) | `bg-accent` 눌린 칸 + 글자 600 |
| Disabled | `opacity-50` + `pointer-events-none` |
| Loading | `opacity-70` + spinner. disabled 와 구분 |

### 2.8 Forbidden colors
- Raw hex / RGB in `src/components` · `src/app` 의 `*.tsx`(globals.css 외) — `pnpm lint:design`
- 단계 색으로 단추 · 큰 면 칠하기 (칩 · 선택 · 배지 · 지금 단계 아이콘만)
- Glassmorphism `bg-white/N + backdrop-blur`
- 지난 단계를 그 단계 색으로 표시하기(채팅 구간 구분선 · 레일) — 무채색

### 2.9 Stage 색 (단계 6개)

**값은 Figma 브랜드 가이드 03(오너 11/3)** — 로고의 여섯 색이 곧 단계 색. 토큰 이름은 **화면 이름**이다(단계 id 와 다르다 — §2.11).

| 토큰 | 화면 | 뜻 |
|---|---|---|
| `--stage-producer` | Producer (id entry) | 오렌지 골드 · 기획 |
| `--stage-writer` | Writer (id producer) | 로즈 레드 · 글 |
| `--stage-artist` | Artist | 일렉트릭 바이올렛 · 그림 |
| `--stage-storyboard` | Storyboard (id writer) | 딥 블루 · 콘티 |
| `--stage-director` | Director | 애저 · 연출 |
| `--stage-editor` | Editor | 민트 틸 · 편집 |

같이 따라오는 것: `--stage-badge-{화면}`(위 막대 단계 칩 그라데이션, 좌→우), `--stage-gradient-{화면}`(단계 카드 그라데이션, 진한 → 연한), `--pearl-vivid`(브랜드 그라데이션 — 로고 · 홈 헤드라인 · 앱 아이콘 · 작품 완성 순간에만), `--text-gradient`(홈 헤드라인 글자).

Tailwind: `bg-stage-{화면}` · `text-stage-{화면}` (+ 알파), `bg-stage-badge` · `bg-stage-gradient` · `bg-pearl-vivid` · `text-gradient`(@utility).
단계 id → 화면 이름 매핑은 `src/lib/lumi.ts` `STAGE_PERSONA` 한 곳. 옛 색 매핑(`STAGE_BADGE_CLASS` / `STAGE_FACE_COLOR`, constants.ts)은 그대로 화면 이름 색을 가리킨다.

### 2.10 채팅 색 (Lumi 개발 가이드)

채팅창 틀은 **무채색 고정**, 지금 단계 색 하나만 아바타 바탕 12% · 단계 칩 · Lumi 이름 · 생각 중 점 · 고른 빠른 답 · 입력창 포커스에 쓴다.

| 토큰 | 역할 |
|---|---|
| `--chat-bg` | 채팅 패널 (= side) |
| `--chat-lumi-bubble` | Lumi 말풍선 |
| `--chat-my-bubble` = `--chat-user-bubble` | 내 말풍선 |
| `--chat-chip` | 빠른 답 칩 |
| `--chat-input` | 입력 알약 |
| `--chat-send` | 보내기 단추 (= primary) |

### 2.11 지금 단계 색 — `data-stage`

`[data-stage="producer|writer|artist|storyboard|director|editor"]` 를 붙인 요소 아래에서 `--stage` · `--stage-badge` · `--stage-badge-foreground` · `--stage-gradient` 가 그 단계 값이 된다(Lumi 가이드 채팅 CSS 와 같은 방식).
- 스튜디오 레이아웃이 지금 보는 단계로 셸과 `<html>` 에 붙인다(팝업 · 메뉴 포털도 같은 색).
- 레일 칸 · 단계 칩 · Lumi 아바타처럼 "자기 단계"가 정해진 요소는 자기 `data-stage` 를 단다.
- 단계 밖(프로젝트 목록 · /design)은 `--stage` = 크림.
- 쓰는 곳: `bg-stage` · `text-stage` · `border-stage` · `bg-stage/18`(고른 칩 바탕) · `bg-stage/12`(아바타 바탕).

---

## 3. Spacing

### 3.1 Base unit & scale

**Base unit**: 4px (Tailwind v4 default). Tailwind numeric scale 사용. **허용 step**: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24 (+ v3 실측의 0.5 · 1.5 · 2.5 · 3.5).

### 3.2 v3 실측 (Figma file.json)

| 자리 | 값 |
|---|---|
| 셸 | 바탕 Shell, 레일 왼쪽 위아래 8 띄움 · 폭 80 · 모서리 16, 본문 ↔ 레일 8, 채팅은 오른쪽 가장자리에 붙고 왼쪽 모서리만 16 |
| 레일 칸 | 64 × 58 · 모서리 12 · 아이콘 22 · 라벨 11.5/600 · 칸 사이 6 · 위 12 아래 16 |
| 레일 아래 단추 | 아이콘 24 + 캡션 11.5/600, 사이 3 · 프로필 32 원 |
| 위 막대 | 높이 42(+위 8) · 좌 24 우 20 · 사이 12 · 단계 칩 높이 22 좌우 10 |
| 작업 영역 | 위아래 28 · 좌우 32 (Storyboard 24/28) · 묶음 사이 16~18 |
| 화면 머리 | 제목 28/700 · 메타 Inter 12 · 사이 10~12 · 단추 높이 36 |
| 큰 내용 판 | 모서리 16~22 · 안쪽 12~16 |
| 칩 | 높이 32 · 좌우 14 · 사이 6 |
| 선택 카드 | 모서리 14 · 안쪽 14/16 · 사이 4 |
| 채팅 | 머리 56(위 16 · 좌 20 · 우 14) · 메시지 사이 12~14 · 좌우 20 · 말풍선 안쪽 12/16/14/16 · 입력 알약 높이 52 · 안쪽 8/8/8/16 · 보내기 36 원 |

### 3.3 Stack gap defaults

| 패턴 | gap |
|---|---|
| Form fields (vertical) | `gap-4` — label/input `gap-2` |
| List items | `gap-2` |
| Section blocks | `gap-6` |
| Card group | `gap-3`~`gap-4` |
| Button group (inline) | `gap-2` |
| Chip group | `gap-1.5`~`gap-2` |

### 3.4 `gap` vs `margin` vs `padding`

- flex / grid → `gap` · 컴포넌트 안 inset → `padding` · `margin`은 페이지 레이아웃 외엔 자제

---

## 4. Typography

### 4.1 Font families

로딩은 `src/app/layout.tsx`: **Pretendard Variable**(`next/font/local`, `--font-pretendard`) + **Inter**(`next/font/google`, `--font-inter`). Geist · Geist Mono 는 뺐다(2026-11-03).

| Tailwind | 스택 | 쓰는 곳 |
|---|---|---|
| `font-sans` (body 기본) | Pretendard → system | 모든 글자 |
| `font-num` | Inter → Pretendard → system | 숫자 · 메타(Figma Number/Meta · Number/Tag): "씬 2 · 샷 6 · 16초", 샷 크기 태그(CU · MS), 시간 코드, 단축키 |
| `font-mono` | `font-num` 과 같은 스택 | 예전 코드의 자리 — 새 코드는 `font-num` |

body 에 `font-sans` 를 직접 건다(글꼴 변수가 body 에 붙기 때문 — globals.css `@layer base`).

### 4.2 Type scale (v3 이름 붙은 글자 스타일)

| Token | Size / LH | 사용 |
|---|---|---|
| `text-display` | 32 / 41.6, -1% | 큰 물음(E3 "이렇게 만들어 볼까요?") |
| `text-title` | 28 / 36.4, -1% | 화면 제목(산문 · 인물 · 배경 · Storyboard) — 700 |
| `text-prose` | 16 / 29.6 | 산문 문단 (Body/Prose) |
| `text-body` | 15 / 24 | 카드 제목 · 선택 카드 제목 · 묶음 제목 (Body/Base) |
| `text-label` | 13.5 / 18.9 | 단추 · 칩 · UI 라벨 (UI/Label 500, Strong 600) |
| `text-chat` | 13.5 / 20.9 | 채팅 본문 (Body/Chat) |
| `text-caption` | 12.5 / 18.1 | 설명 · 힌트 (UI/Caption) |
| `text-meta` | 12 / 16.8 | 숫자 메타 — `font-num` 과 함께 (Number/Meta) |
| `text-micro` | 11.5 / 16.1 | 레일 라벨 · 단계 칩 · Lumi 이름 (UI/Micro 600) |
| `text-tag` | 10 / 14 | 추천 배지 |

Tailwind 기본(`text-xs`~`text-2xl`)도 쓸 수 있지만 새 화면은 위 이름을 쓴다. `cn()` 은 이 이름들을 글자 크기로 안다(`src/lib/utils.ts`, 약속 tests/ops/class-merge.test.ts).

### 4.3 Weight palette

400 · 500 · 600 · 700 (+ 로고 글자 800).

### 4.4 Per-context 할당

| 컨텍스트 | Class |
|---|---|
| 화면 제목 | `text-title font-bold` |
| 묶음 제목 · 카드 제목 | `text-body font-semibold` |
| 본문 · UI | `text-label` |
| 설명 | `text-caption text-muted-foreground` |
| 메타 숫자 | `font-num text-meta font-medium text-subtle-foreground` |
| 단추 | `text-label font-medium` (메인 600) |
| 시간 코드 · 프레임 | `font-num tabular-nums` |

### 4.5 Numeric variants

숫자가 정렬돼야 하는 곳은 **`tabular-nums` 강제** (Inter 는 tnum 을 지원).

### 4.6 Letter-case / 문구

- 영어는 sentence case. 단계 이름(Producer · Writer · Artist · Storyboard · Director · Editor)은 대문자로 시작.
- 화면 문구에 긴 대시(—) · 짧은 대시(–) 금지 (tests/ui-text/copy-rules.test.ts).
- 한국어 기본, 새 문구는 `t()` + `messages-ko`.

### 4.7 Truncation 룰

- 단일 라인: `truncate` · 2~3 라인: `line-clamp-2/3` · 노드 라벨 `truncate`

---

## 5. Breakpoints

Tailwind v4 default. 설계 기준 **1440 × 900** (v3 시안 프레임). `xl:` 1280 이상이 표준 데스크탑. 데스크탑 우선 도구.

---

## 6. Sizing & dimensions

### 6.1 Container & shell (v3)

| 영역 | 치수 (정본: `src/lib/constants.ts`) |
|---|---|
| 왼쪽 레일 | `SHELL_RAIL_WIDTH` 80, `SHELL_INSET` 8 띄움 |
| 위 막대 | 50 (위 8 + 42) — `StudioTopBar` |
| 오른쪽 채팅 | `CHAT_DEFAULT_WIDTH` 360 (280~560 리사이즈, 기억함), 가장자리에 붙음 · 접으면 44 레일 |
| 본문 | 왼쪽 8+80+8, 오른쪽 채팅폭+8 |

### 6.2 Form control height

| 컨트롤 | 높이 |
|---|---|
| Button default / Input / Select | h-9 (36) |
| Button sm · 칩 | h-8 (32) |
| segmented 탭 묶음 | 38 (칸 32) |
| 채팅 입력 알약 | 52 (보내기 36 원) |

### 6.3 Modal sizes

sm `max-w-sm` · md `max-w-md` · lg `max-w-lg`(기본) · xl `max-w-2xl` · full `max-w-[90vw]`

### 6.4 Icon sizes

| Size | 사용 |
|---|---|
| `size-4` (16) | 단추 안 · 채팅 접기 |
| `size-5` (20) | 위 막대 연필 · 탭 아이콘 |
| `size-[22px]` | 레일 단계 아이콘 |
| `size-6` (24) | 레일 아래 단추 |

### 6.5 Avatar sizes

채팅 Lumi 28(말풍선 옆 · 머리), 빠른 답 물음 20, 프로필 32.

---

## 7. Radius

source: `--radius: 0.75rem` (12px). 파생: `sm` 8 · `md` 10 · `lg` 12 · `xl` 16 · `2xl` 20 · `3xl` 24 · `full`. 브랜드 가이드: **모든 모서리 둥글게, 흰 광택 · 테두리 없음**.

### 7.1 Per-component 할당

| 컴포넌트 | Radius |
|---|---|
| Button · Input · Select | `rounded-md` (10) |
| 레일 칸 · segmented 탭 묶음 | `rounded-lg` (12), 탭 칸 9 |
| 레일 · 채팅 패널 · 큰 내용 판 · 말풍선 | `rounded-xl` (16) — 말풍선은 Lumi 왼쪽 위 6 · 내 것 오른쪽 위 6 |
| 선택 카드 | 14 |
| Dialog | `rounded-2xl` (20) |
| Popover · HoverCard | `rounded-xl`, 메뉴 · Select 목록 `rounded-lg` |
| 칩 · 배지 · 단계 칩 · 입력 알약 · ghost 알약 단추 | `rounded-full` |
| 꼬리표(이름 미정 · 인물) | 6 |

### 7.2 Nesting 룰

inner radius ≤ outer radius.

### 7.3 Pill

v3 는 칩 · 배지 · 빠른 답 · ghost 단추("← 이야기 재료") · 입력 알약 · 보내기 원에 `rounded-full` 을 쓴다. 메인 · 보조 단추는 10.

---

## 8. Border

v3 는 면 색 차이로 나눈다 — **테두리는 기본으로 그리지 않는다**. 선택 표시(1.5px 단계 색)와 입력 포커스, 꼭 필요한 구분선만.

---

## 9. Shadow / Elevation

| Token | 사용 |
|---|---|
| `shadow-none` | 기본 |
| `shadow-panel` | 큰 내용 판 · 팝오버 · 메뉴 · 다이얼로그 · 툴팁 (0 20 50, 검정 40%) |
| `shadow-node` | Director 노드 (0 8 24, 검정 35%) |

브랜드 가이드: **효과는 아래 그림자 하나만**. glow · 테두리 빛 · backdrop-blur 금지.

---

## 10. Motion

### 10.1 Duration scale

| Token | ms | 사용 |
|---|---|---|
| `duration-100` | 100 | hover, focus, 칩 선택 |
| `duration-150` | 150 | 작은 상태 |
| `duration-250` | 250 | modal / popup |
| `duration-350` | 350 | 레이아웃 전환, 채팅 접기 |

단계 넘김 세로 스트립(520ms)과 큰 Lumi 의 연기(웹 컴포넌트 안)는 예외.

### 10.2 Reduced-motion 정책

- 큰 Lumi 는 동작 줄이기면 `paused`(멈춘 모습) — `components/lumi/lumi.tsx`
- `.tale-beam` · `.tale-beam-once` · 생각 중 점 · 세로 스트립은 `prefers-reduced-motion` 에서 멈춘다(globals.css)

### 10.3 Disallow

Parallax · hover 자동 재생 · bouncy spring · enter/exit 같은 duration.

---

## 11. Z-index

### 11.1 Named layer 사다리

`globals.css`에 root variable + `@utility` 클래스(`z-canvas` … `z-toast`). 값은 globals.css 가 진실. named class만 사용.

### 11.2 Portal 전략

Radix primitive 는 body 로 portal — `<html data-stage>` 덕에 지금 단계 색을 그대로 입는다(§2.11).

---

## 12. States matrix

| State | Visual treatment |
|---|---|
| Default | base |
| Hover | `bg-accent` 또는 `/90` |
| Focus-visible | Info 링 |
| Selected | 단계 색 1.5px + 18% (칩 · 선택 카드 · pill 탭) / `bg-accent`(segmented) |
| Disabled | `opacity-50 pointer-events-none` |
| Loading | `opacity-70` + spinner |
| Error | `border-destructive text-destructive` + icon + label |
| Done (레일) | 아이콘 위 흰 원 체크 + 보조 글자 |

- **Color 단독으로 상태 전달 금지** — 고른 칩은 `aria-pressed`, 레일 지금 단계는 `aria-current`.

---

## 13. Layout primitives

### 13.1 Studio shell (v3)

```
┌──────┬──────────────────────────────────────┬──────────────┐
│ Rail │ [Writer] 자판기의 반란 ✎           ··· │ Lumi와 산문 이야기 » │  ← 위 막대 / 채팅 머리
│  80  │ 산문  씬 2 · 약 15초   [보조][보조][크림]│              │  ← 화면 머리(PageHeader)
│ 로고  │ ┌────────── 큰 내용 판 ──────────┐    │  말풍선 · 칩  │
│ 단계  │ │                                │    │              │
│ ...  │ └────────────────────────────────┘    │ (입력 알약 ↑) │
│ Take │                                      │              │
└──────┴──────────────────────────────────────┴──────────────┘
```

- **레일** `src/components/layout/sidebar.tsx`: 맨 위 Tale 로고(누르면 프로젝트 목록) · 단계 칸(v3 채움 아이콘 · 라벨 · 끝낸 단계 체크 · 지금 단계 밝은 바탕과 단계 색 아이콘) · 아래 Take · 공유 · 내보내기 · Help · 프로필. 칸 모습 판정은 `src/lib/stage-rail.ts` `railStageState`(약속 tests/project/rail-done-mark.test.ts).
- **위 막대** `src/components/layout/studio-top-bar.tsx` `StudioTopBar`: 단계 칩(`StageChip`) · 프로젝트 제목 + 연필(`ProjectTitleField`, 이름 바꾸기) · 오른쪽 자리. 스튜디오 레이아웃이 모든 단계 화면 위에 놓고(위에 붙는 sticky), Producer 시작 화면은 탭이 든 자기 막대를 같은 컴포넌트로 그린다. 화면이 오른쪽 자리에 단추를 놓을 때는 `<TopBarActions>`(포털).
- **대시보드 머리** `src/components/dashboard/dashboard-header.tsx` `DashboardHeader`: 스튜디오 밖(/projects · /projects/new · /playground · /queue · /account) 공용 — 작업 화면과 같은 바탕색 막대 · `TaleLockup` · 탭 묶음 · 오른쪽 자리(새 프로젝트 등).
- **화면 머리** `src/components/layout/page-header.tsx` `PageHeader`: `title` · `tag` · `meta` · `actions`(오른쪽, 메인은 크림). 작업 영역 맨 위.
- **채팅** `src/components/layout/global-chat.tsx`: §13.10.

### 13.2 Card anatomy

`src/components/ui/card.tsx`(shadcn Card 와 같은 API) — 기본 `panel`(큰 내용 판: `bg-panel rounded-xl p-4 shadow-panel`), `variant="raised"`(카드색 작은 상자). `CardHeader` · `CardTitle`(text-body 600) · `CardDescription` · `CardAction` · `CardContent` · `CardFooter`.

### 13.3 Dialog anatomy

shadcn `Dialog` — 바탕색 판 · `rounded-2xl` · `shadow-panel` · 막 검정 60%. 제목 `text-lg font-semibold`, 설명 `text-label text-muted-foreground`. 메인 단추(크림)는 오른쪽, 취소는 ghost.
**확인 팝업**(큰 일을 하기 전에 "~할까요?"를 묻는 창 — 단계 넘기기 · 확정) 맨 위에는 큰 Lumi `<ConfirmLumi stage={지금 단계} />`
(`src/components/handoff/confirm-lumi.tsx`: 지금 단계 옷 · `idle` · 폭 180). 지우기 확인 · 오류 안내에는 넣지 않는다. 지금 쓰는 곳: Producer 시작 확인(`features/entry/entry-form.tsx`) · Writer 로 넘기기 전 확정 창(`handoff/producer-lock-dialog.tsx`) · 산문 확정(`features/prose/prose-confirm-dialog.tsx`) · Artist 그림체 고르기 · 다시 만들기 · 완료(`features/artist-room/style-make-dialog.tsx` · `regenerate-style-dialog.tsx` · `artist-complete-dialog.tsx`) · Storyboard → Director 넘기기(`features/writer/storyboard-director-dialog.tsx`) · Director 로 넘기기 전 준비 창(`handoff/director-readiness-dialog.tsx`) · Director 다시 만들기 · 영상 만들기 확인(`features/director/regenerate-confirm-dialog.tsx`).

### 13.4 Form anatomy

label 위 · input 아래 · helper/error 더 아래. 입력칸은 카드색 · 테두리 없음 · 자리표시 흐린 글자.

### 13.5 Empty / Loading / Error 결정 트리

데이터 모양을 알면 Skeleton, 모르면 Spinner + 동사 문구. 그림 자리는 `bg-art-placeholder`.

**단계 넘어가며 기다리는 화면**은 AI 잠금 덮개에 큰 Lumi 를 준다 — `<AiBusyOverlay lumi={옷} />`(`src/components/ai-busy-overlay.tsx` `AiBusyCard`,
시안 Content/Loading Card): 큰 Lumi `loading`(폭 240, 일이 멈춰 실패 안내가 되면 `error`) · 제목 22/700 · 설명 · 진행 막대(폭 300, Lumi 옷의 단계 색 기울기 —
화이트 펄 · 완성 옷이면 놓인 화면의 색) · 단계 목록(카드색 상자). 옷 = 넘어가는 다음 단계. 쓰는 곳: Producer 글 읽기 · Writer 산문 초안(Producer 에서 넘길 때 · Writer 화면) · Artist 그림 ·
Storyboard 나누기 · 첫 러프. 덮개 없이 화면 가운데에 큰 Lumi `loading`(폭 300)만 두는 곳: 새 프로젝트 만들기(`/projects/new`, Producer 옷 · 실패면 `error`) ·
Editor 클립 준비. `lumi` 를 안 주는 잠금(그림 다시 그리기 · 샷 고치기 팝업 위 등)은 도는 원의 작은 카드 그대로(약속 tests/project/busy-overlay-lumi.test.ts).
실패 안내의 오류 모습 큰 Lumi 도 단계를 넘어가는 기다림의 실패에만 둔다 — Storyboard 보드에서 컷을 다시 그리다 난 실패는 작은 카드(약속 tests/writer/board-wait-lumi.test.ts).

### 13.8 Component patterns (shadcn primitives)

`src/components/ui/`(shadcn CLI 로 만든 파일을 **v3 로 직접 손봤다** — 다시 `shadcn add` 하면 v3 손질이 덮이니 diff 로 되살린다). 살아있는 카탈로그는 **`/design`** (`src/app/design/page.tsx`).

| 컴포넌트 | v3 |
|---|---|
| Button | `default` 크림 · `secondary` 카드색 · `outline` 테두리 · `ghost` 바탕 없음(+`rounded-full` 이면 v3 ghost 알약) · `destructive` · `link`(Info) |
| Badge | + `stage`(지금 단계 색 · 어두운 글씨, 추천) · `tag`(작은 네모 꼬리표) |
| Tabs | `default` segmented(카드색 묶음 · 눌린 칸 chip) · `pill`(칩처럼 떨어진 탭, 고른 것 단계 색) · `line` |
| Input · Textarea · Select | 카드색 · 테두리 없음 · Info 포커스 |
| Popover · HoverCard · Dropdown · Context · Select 목록 | 카드색 · `shadow-panel` |
| Tooltip | 어두운 말풍선(`surface-elevated`) · 밝은 글씨 |
| Toaster | 늘 dark |
| Card | §13.2 |

### 13.9 v3 controls (`src/components/controls/`)

| 컴포넌트 | 쓰는 곳 |
|---|---|
| `ChoiceChip` (`selected` · `recommended` · `tone="screen\|chat"`) | 장르 · 필터 · 빠른 답 — 32px 알약, `aria-pressed` |
| `OptionCard` (`title` · `description` · `selected` · `recommended`) | 길이 · 화면 비율 · 바꿈 정도 |
| `RecommendBadge` | "추천" — 지금 단계 색 |
| `StageChip` (`stage`) | 위 막대 · 단계 표시 — 배지 그라데이션 |

### 13.10 Chat panel (v3)

- 머리: Lumi 그림(지금 단계 옷, 답을 기다리면 생각하는 모습) · "Lumi와 {단계에서 하는 일} 이야기"(`STAGE_CHAT_TITLE`, 약속 tests/chat/header-title.test.ts) · 접기(»).
- 대화는 모든 단계가 이어지는 하나 — 구간 구분선(지금 구간만 단계 색).
- Lumi 말풍선: 턴 첫 메시지에 아바타 · "Lumi"(단계 색), 이어지는 메시지는 들여쓴다. 승인 카드도 말풍선 꼴(제목 + 보조 글자).
- 내 말풍선 · 빠른 답 칩(줄바꿈, 고른 칩 단계 색, 숫자 단축키 흐리게) · 입력 알약(카드색 · 포커스 단계 색 · 크림 보내기 원).
- 알약 아래 한 줄: [+] 첨부(Writer) · 단계 칩(빠른 요청 · 다음 단계) · @멘션 · 모델 고르기.
- 닫힌 채팅: 다른 단계는 오른쪽 접힌 레일(« · Lumi 얼굴), Director 는 레일 없이 툴바 끝 Lumi 알약(`features/director/lumi-chat-pill.tsx`). 알약의 Lumi 는 채팅 Lumi 와 같은 모습(생각 중 · 오류)이고, 닫힌 동안 새로 온 Lumi 말 수를 지금 단계 색 숫자로 보인다(채팅을 열면 0). 카드를 멘션하면 닫힌 채팅이 먼저 열린다(약속 tests/director/chat-closed.test.ts).

---

## 14. Iconography

### 14.1 Library

- **v3 채움 아이콘** `src/components/icons/v3-icons.tsx`(Figma Icons · 채움 16개): 단계 · 레일 아래 단추 · 위 막대 연필 · 탭(화면에서 고르기 · 채팅으로 만들기) · 채팅 접기/열기 · 직접 작성. `currentColor`.
- **Lucide** (`lucide-react`): 화면 안 작은 선 기호(+ · × · 화살표 · 시계 · 갈매기) — v3 "Icons · 선"과 같은 결.

### 14.2 Icon + label 페어링

icon-only button은 **반드시 `aria-label` + Tooltip**.

### 14.3 Custom-icon 정책

Figma 에 있는 v3 아이콘은 `v3-icons.tsx` 에 더한다(이름 `<Name>Icon`). 그 밖은 Lucide.

---

## 15. Imagery

### 15.1 Aspect ratios

1:1 인물 · 16:9 배경 · 영상 · 9:16 세로 · 2.39:1 시네마. 큰 Lumi 3:2.

### 15.2 Placeholder

| 상태 | 표현 |
|---|---|
| Empty | `bg-art-placeholder`(v3 Content/Art Placeholder) |
| Loading | Skeleton |
| Failed | `bg-muted border-destructive` + AlertCircle + retry |

### 15.3 브랜드 자산

- 로고 심볼 `public/brand/tale-symbol.svg`(어두운 바탕용) — 레일 맨 위 30px.
- 로고 묶음 `src/components/tale-lockup.tsx` `TaleLockup`(심볼 + 글자 "tale studio", v3 Logo/Tale Lockup) — 대시보드 머리 · 랜딩 머리 · 꼬리말.
- 색 · 기울기 · 겹침 색을 바꾸지 않는다, 심볼에 테두리 · 흰 광택을 넣지 않는다(브랜드 가이드 "로고 쓰는 법").

### 15.4 Lumi

- **큰 Lumi** `<Lumi persona state size />`(`src/components/lumi/lumi.tsx`): `public/lumi-persona.js`(웹 컴포넌트 `<lumi-persona>`, 약 3.1MB)를 **처음 그릴 때만** 불러온다. 다 불러오기 전 · WebGL 없음 · 불러오기 실패 → 같은 모습의 그림(`public/lumi/full/*.webp`), 동작 줄이기 → `paused`. 한 화면에 큰 Lumi 는 하나. 자리: 확인 팝업(`ConfirmLumi`, §13.3) · 단계 넘어가며 기다리는 화면(`AiBusyOverlay lumi`, §13.5) · 새 프로젝트 만드는 화면(`/projects/new`, Producer 옷 `loading`) · 프로젝트 목록 첫 화면(화이트 펄 `idle` 폭 320 — 목록 머리 왼쪽, 빈 목록이면 빈 안내 자리).
- **채팅 아바타** `<LumiAvatar persona state size />`: 그림만(`public/lumi/avatar/*.webp`, 80px). 바탕은 그 단계 색 12%.
- persona: `pearl`(시작 · 목록) · 여섯 단계 · `complete`(작품 완성). state: idle · listening · thinking · complete · error · loading. 단계 id → persona 는 `STAGE_PERSONA`.

---

## 16. Content / voice

### 16.1 Button label format

동사 우선 명령형("씬 추가", "다음: Director로"). 영어는 verb-first sentence case.

### 16.2 Empty-state / Error / Loading copy

```
{무엇이 없는지}이/가 없어요 / {왜 · 어떻게 생기는지 한 줄} / [다음 액션]
{무엇이 실패했는지}: {왜}. {어떻게 고칠지} [다시 시도]
```
generic "Loading…" 금지 — 동사로("씬 만드는 중…").

### 16.3 Date / time / number

날짜 `2026-05-28` · 시간 `HH:mm` · timecode `font-num tabular-nums` · 천단위 `1,234`.

---

## 17. Canvas conventions (Director)

**Director Canvas 가 유일한 캔버스 surface.** v3 D1: 캔버스 판 `--canvas-bg`(#1A1918, 모서리 16) 위에 노드(`--node-bg-default` = 바탕색, 모서리 14, `shadow-node`), 선 흰 20% · 고른 선 Director 색.

### 17.1 Node sizes

Node width 는 `src/features/director/canvas-nodes/` 각 컴포넌트가 진실. min-h-20.

### 17.3 Edge stroke

| State | Width | Color |
|---|---|---|
| 기본 | 1.5px | `--edge-default` |
| Selected | 1.5px | `--edge-selected` (Director 색) |
| Invalid | 1.5px dashed | `--destructive` |

카테고리는 **굵기 + 스타일**로(색 분기 금지).

### 17.4 Port size & hit area

Visual `size-3` · hit area 20×20.

### 17.5 Grid snap

**16px snap** — `snapToGrid snapGrid={[16, 16]}`.

### 17.6 Selection halo

`ring-2 ring-ring ring-offset-2 ring-offset-canvas-bg`, 진입 100ms.

### 17.7 Pan / zoom

더블클릭 zoom 비활성. 값은 `src/app/studio/director/page.tsx`.

### 17.11 캔버스 확장 토큰 namespace

| 토큰 | 값(역할) | Tailwind 예 |
|---|---|---|
| `--canvas-bg` | 캔버스 판 | `bg-canvas-bg` |
| `--canvas-dot` | 점 격자(투명도는 사용처) | `text-canvas-dot/20` |
| `--node-bg-default` | 노드 바탕(= background) | `bg-node-bg-default` |
| `--node-bg-selected` | 고른 노드(= card) | `bg-node-bg-selected` |
| `--node-border-default` | `--border` | `border-node-border-default` |
| `--node-border-selected` | `--ring` | `border-node-border-selected` |
| `--edge-default` | 흰 20% | inline `stroke: var(--edge-default)` |
| `--edge-selected` | Director 색 | inline `stroke: var(--edge-selected)` |

---

## 19. 운영

### 19.1 design.md vs 코드 충돌

코드가 이김. 실제 토큰 값은 `globals.css`.

### 19.2 새 컴포넌트 추가 시

1. shadcn primitive 있는지 확인 (`/shadcn-component` 스킬) → v3 로 손본다
2. 기존 토큰 · controls 로 표현 가능한지 확인 — 가능하면 새 토큰 만들지 말 것
3. `/design` 쇼케이스에 추가 + 본 문서 §관련 섹션 1줄 + `last_updated` 갱신

### 19.3 새 토큰 추가 시

1. 정말 필요한가? 2. globals.css `:root` 에 값, 색이면 `@theme inline` 에 `--color-{name}` 3. 글자 크기 · 그림자 이름이면 `src/lib/utils.ts` 의 합치기 설정에도 4. 본 문서 §2 표 · /design 갱신

### 19.4 drift 방지

- 본 문서 수정 시 frontmatter `last_updated` 갱신
- §2 표는 *역할만*(값은 globals.css) — 토큰 추가/삭제/역할 변경 시에만 갱신
- 화면 생김새는 테스트가 아니라 스크린샷으로 확인한다(`.claude/rules/owner-gates.md`)
