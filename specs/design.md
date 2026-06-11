---
name: tale-studio design system
version: 0.4.0
last_updated: 2026-06-10
owner: shared
canonical_implementation: src/app/globals.css
source_of_truth: 토큰 값은 globals.css. design.md는 *역할 / 사용 룰 / 스케일 정량 명세*.
---

# tale-studio design system

> **목적**: 시각·인터랙션 공통 컨벤션의 단일 명세. design.md는 *어떤 값을 쓸 것인가* (정량). *왜 그 값들을 선택했는가* (정성 reference)는 [`specs/design-references.md`](./design-references.md).
>
> 충돌 시: **globals.css가 이김**. design.md는 정량 reference + 룰 + 결정 트리. raw hex/px 복제 금지.
>
> 룰을 어기는 코드는 사용자가 명시적으로 허락하지 않는 한 reject. 위반이 반복되면 본 문서 또는 hooks를 강화.

---

## 1. Overview

tale-studio는 **B2B AI 비디오 파이프라인 (Tale)** 의 내부 도구다. 텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성. 차별화는 Knowledge DB 기반 cinematography RAG.

**Personality**: *Quiet, info-dense, dark-first B2B craft tool for video professionals.* Linear typographic + Vercel/Geist monochrome + Runway media-respectful + n8n 3-패널 canvas skeleton + Higgsfield 노드-그래프 친숙성 (단, **inversion**: 노드 = 엔티티, 모델 아님).

**Mode**: dark-first, light parity 보존 (현재 unused, 클라이언트 데모용 토글 가능). 새 컴포넌트는 dark + light 둘 다 동작해야 함.

### 5 design 원칙 (decisions #30)
1. **캔버스 제일주의** (패널 보조)
2. **`globals.css` 토큰 외 신규 색 금지**
3. **모션은 정보 전달** (장식 아님)
4. **키보드 일등 시민**
5. **한 화면 정보 위계 2단까지**

### 4 hard rules
1. **Dark-first with light parity**. light-only 금지.
2. **One accent** (Netflix Red `#E50914`, decisions #30) — CTA + active state만. 카테고리 색 분기 금지.
3. **Geist Mono** — camera-axis values, render IDs, frame numbers.
4. **캔버스 확장 토큰** (`--canvas-*`, `--node-*`, `--edge-*`) 사용. 새 토큰 만들지 말 것.

### "We are NOT" exclusion list
1. **NOT Higgsfield** — glassmorphism, neon edge-glow, volumetric 3D icon, liquid-glass surface, creator-prosumer flourish 금지.
2. **NOT 커뮤니티-flavored 오픈소스 도구** — 불균일 아이콘, 혼합 radius 카드, saturated 카테고리 배너 색 금지 (n8n).
3. **NOT consumer creative app** — light-mode-first 금지, playful 일러스트 금지, in-product marketing-hero gradient 금지.
4. **NOT marketing-tier 대시보드** — featured 캐러셀, large hero 모듈 in-studios 금지 (Producer 랜딩에만 max).
5. **NOT pure-black Vercel-extreme** — pure `#000` 옆 skin-tone 비디오 프레임은 banding 생산. 우리는 *warm* near-black이 아닌 **Netflix Dark grayscale** (chroma 0).

### Non-goals
- consumer / creator-prosumer app
- 마케팅 헤더, 카루셀, hero gradient (스튜디오 내부에선)
- 두 번째 chromatic accent (Linear lime, Higgsfield cyan 등)
- decoration shadow / glow (state 표현만 허용)

---

## 2. Color

### 2.1 Token reference

source-of-truth는 `src/app/globals.css`. 본 섹션은 *역할*만 enumerate — **값(oklch)은 여기 복제하지 않는다** (2026-06-10 값 컬럼 제거 — 양쪽 동기화 의무 폐지).

| 토큰 | 역할 |
|---|---|
| `--background` | 앱 캔버스 배경 (Radix step 1, Netflix Dark `#121212`) |
| `--foreground` | 기본 텍스트 (Radix step 12) |
| `--card` | elevated surface (Radix step 2) |
| `--popover` | floating overlay |
| `--primary` | 브랜드 accent (Netflix Red — 유일한 chromatic accent) |
| `--primary-foreground` | primary 위 텍스트 |
| `--secondary` | 보조 액션 surface |
| `--muted` | subdued surface |
| `--muted-foreground` | low-contrast text (Radix step 11) |
| `--accent` | hover/active for ghost (Radix step 4) |
| `--destructive` | 위험 색 |
| `--border` | hairline 1px (Radix 6/7/8 collapsed) |
| `--input` | form border |
| `--ring` | focus ring (= `--primary`) |
| `--surface-primary` | base canvas (= `--background`) |
| `--surface-secondary` | depth 1 surface (= `--card`) |
| `--surface-tertiary` | depth 2 surface (= `--popover`) |
| `--surface-elevated` | depth 3 surface (top) |

### 2.2 Chart 토큰 (노드 색)

엔티티 노드 식별색. 현재 노드 surface는 **Director Canvas만** (L0 artist 노드 그래프는 2026-06-04 폐기 — chart-1/2는 예약 상태).

| 토큰 | 사용처 |
|---|---|
| `--chart-1` (red) | 예약 — 옛 Actor 노드(L0, 폐기). 신규 용도 배정 시 본 표 갱신 |
| `--chart-2` (blue) | 예약 — 옛 World 노드(L0, 폐기) |
| `--chart-3` | **Scene** 노드 (Director) |
| `--chart-4` | **Shot** 노드 (Director) |
| `--chart-5` | **Video** 노드 (Director) |

### 2.3 Text color tiers

| Tier | 토큰 | 사용 |
|---|---|---|
| Primary | `--foreground` | 본문, 제목 (Radix step 12) |
| Secondary | `--muted-foreground` | 보조 라벨, 캡션, placeholder (Radix step 11) |
| Subtle | `--muted-foreground` + opacity-70 | 타임스탬프, render ID hash |
| Disabled | `--muted-foreground` + opacity-50 | disabled control 텍스트 |
| Inverse | `--primary-foreground` | accent surface 위 텍스트 |

### 2.4 Border tiers (shadcn collapse 보강)

shadcn `--border`가 Radix step 6/7/8을 하나로 collapse. tale-studio는 3-tier로 확장:

| Tier | 토큰 | 사용 |
|---|---|---|
| Subtle | `--border-subtle` | 비-interactive separator (테이블 행 구분, 노드 안 sub-frame) |
| Default | `--border` | 카드, 입력, 패널 구분 (rest 상태) |
| Strong | `--border-strong` | hovered interactive border, 강조된 panel 경계 |
| Focus | `--ring` (= `--primary`, Netflix Red) | focus ring |

Tailwind 클래스: `border-border-subtle`, `border-border` (default), `border-border-strong`, `ring-ring`.

### 2.5 Semantic state colors

| 상태 | 토큰 | Foreground | 사용 |
|---|---|---|---|
| Error / destructive | `--destructive` | `--primary-foreground` | shadcn 기본. 필드 invalid, 위험 액션 |
| Success | `--success` (green) | `--success-foreground` | 저장 완료 토스트, 등록 완료 badge |
| Warning | `--warning` (amber) | `--warning-foreground` | quota 임박, stale 노드 경고 banner |
| Info | `--info` (blue) | `--info-foreground` | 도움말 banner, render 가이드 |
| Generating | `--primary` + pulse (animated) | — | `generatingNodeIds` state, BaseNode spinner |

Tailwind 클래스: `bg-success`, `text-success-foreground`, `border-success` (warning/info도 동일 패턴). Generating은 token 아님 — `bg-primary animate-pulse` 조합.

**룰**: 상태는 **색 + icon + label** 3중. 색만으로 상태 전달 금지 (color-blind 안전). semantic accent (success/warning/info)는 *상태 표현*에만 — CTA로 사용 금지 (Netflix Red 단일 accent 원칙).

### 2.6 Focus ring

- 색: `--ring` (= `--primary`)
- 너비: shadcn 기본 follow — `focus-visible:ring-[3px]` (`src/components/ui/button.tsx` 및 shadcn primitive 기준)
- ring color alpha: `ring-ring/50`
- 스타일: solid (dashed/dotted 금지)
- 모든 `*`에 `@layer base`에서 `outline-ring/50` 자동 적용 (alpha 50%)
- focus-visible만 (mouse focus는 ring 없음)

### 2.7 Interaction state delta

| State | 적용 |
|---|---|
| Hover | `--accent` (배경) 또는 `bg-{token}/80` (opacity) |
| Active / pressed | `--accent` + `--primary` ring or scale-95 (subtle) |
| Selected | `--accent` 지속 적용 + 노드의 경우 selection halo (§17.6) |
| Disabled | `opacity-50` + `pointer-events-none` + `cursor-not-allowed` |
| Loading | `opacity-70` + spinner. **opacity-50 (disabled)와 구분** |

### 2.8 Forbidden colors
- 두 번째 chromatic accent (Linear lime, cyan, magenta 등 추가 금지)
- Raw hex / RGB in `*.tsx` (globals.css 외)
- Saturated 카테고리 배너 (n8n-style)
- Glassmorphism `bg-white/N + backdrop-blur` (decoration용)

### 2.9 Stage 색 (파이프라인 P1~P5)

GlobalChat badge + AgentFace 등 **단계 식별**용. chart 토큰(엔티티 노드, §2.2)과 의미축이 다르므로 별도 토큰.

| 토큰 | Stage | 사용처 |
|---|---|---|
| `--stage-producer` (violet) | P1 Producer | badge, agent face |
| `--stage-writer` (blue) | P2 Writer | badge, agent face |
| `--stage-artist` (amber) | P3 Artist | badge, agent face |
| `--stage-director` (rose) | P4 Director | badge, agent face |
| `--stage-editor` (emerald) | P5 Editor | badge, agent face |

Tailwind 클래스: `bg-stage-{id}`, `text-stage-{id}`, `border-stage-{id}` (+ 알파 `/15` `/30`). SVG fill/stroke는 `var(--stage-{id})` 또는 `currentColor`.

**룰**:
- **director는 rose** — `--primary`(Netflix Red)와 분리해 one-accent 룰 보존. 단계 색은 *식별*용일 뿐 CTA 아님.
- face와 badge는 **같은 stage 색** 사용 (불일치 금지).
- 단계 색 정의/조회는 `src/lib/constants.ts` 단일 source (`STAGE_BADGE_CLASS` / `STAGE_FACE_COLOR`).

---

## 3. Spacing

### 3.1 Base unit & scale

**Base unit**: 4px (Tailwind v4 default `--spacing: 0.25rem`).

Tailwind numeric scale 사용 (1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px, 12=48px). T-shirt scale (sm/md/lg) 컴포넌트별 prop으로만, spacing에는 사용 금지 (혼용 안티패턴).

**허용 step**: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24. 그 외 (예: 7, 9, 14)는 사용 자제. AI가 임의 step 발명 방지.

### 3.2 Per-component inner padding

Button padding 값은 `src/components/ui/button.tsx` CVA의 `size` variant가 진실 (여기 복제 금지).

| 컴포넌트 | Padding (X / Y) |
|---|---|
| Input / Select | `px-3 py-2` (12/8) — h-9 |
| Card | `p-6` (24) 본문, header/footer는 `p-4` (16) |
| Dialog | `p-6` (24) 본문, header `pb-4`, footer `pt-4 gap-2` |
| Sheet (inspector) | `p-6` (24) 본문, sticky header `px-6 py-4` |
| Popover | `p-4` (16) |
| Tooltip | `px-2 py-1` (8/4) |
| Badge | `px-2 py-0.5` (8/2) |
| Toast | `p-4 gap-3` (16/12) |

### 3.3 Stack gap defaults

| 패턴 | gap |
|---|---|
| Form fields (vertical) | `gap-4` (16) — label과 input은 `gap-2` (8) |
| List items | `gap-2` (8) |
| Section blocks | `gap-6` (24) |
| Card group | `gap-4` (16) |
| Page header → content | `gap-6` (24) |
| Button group (inline) | `gap-2` (8) |
| Toolbar icon button | `gap-1` (4) |

### 3.4 Inset 룰

| 표면 | Inset |
|---|---|
| Page edge (studio shell) | `px-6` (24) horizontal — content max-width와 별개 |
| Dialog edge | `p-6` (24) |
| Sheet edge | `p-6` (24) — sticky 영역만 `px-6 py-4` |
| Popover edge | `p-4` (16) |
| Canvas viewport | edge inset 없음 (캔버스가 full viewport) |

### 3.5 `gap` vs `margin` vs `padding`

- **flex / grid 컨테이너 → `gap`** (margin collapse 회피)
- **컴포넌트 안 inset → `padding`**
- **`margin`은 페이지 레이아웃 외엔 자제** — collapse + compose 어려움. `space-y-*` 도처 사용 금지

### 3.6 Section spacing (responsive)

- Desktop: `gap-6` between sections
- Tablet (`md:`): 동일
- Mobile (`sm:` 미만): `gap-4` (다음 컨테이너로 자연스럽게 밀착)

---

## 4. Typography

### 4.1 Font families

3종 font variable (`--font-geist-sans`, `--font-geist-mono`, `--font-pretendard`) — 로딩 구현은 `src/app/layout.tsx` (decisions #35). Pretendard는 `next/font/local` (한국어 fallback).

**Fallback stack** (`--font-sans`): `Geist Sans → Pretendard → ui-sans-serif → system-ui → sans-serif` (globals.css `@theme inline` 기준). Latin 글리프는 Geist 우선, 한글 글리프는 자동으로 Pretendard로 fallback (브라우저 글자별 매칭).
`--font-mono`: `Geist Mono` (globals.css `@theme inline` 기준 — 별도 fallback chain 없음).

**Display tier**: 별도 없음. 큰 헤딩도 Geist Sans + tight tracking.

**한국어/CJK**: Pretendard Variable (weight 45~920 가변) 적용. 시스템 폰트 fallback은 마지막 안전망.

### 4.2 Type scale

base 14px (Tailwind `text-sm`). UI 도구 정보 밀도 우선.

| Token | Size | Line-height | Tracking | Weight | 사용 |
|---|---|---|---|---|---|
| `text-xs` | 12px / 0.75rem | 16px (1.33) | 0 | 500 | 캡션, micro label, render ID (mono) |
| `text-sm` | 14px / 0.875rem | 20px (1.43) | -0.005em | 400 | **본문 기본**, 입력 |
| `text-base` | 16px / 1rem | 24px (1.5) | -0.01em | 400 | 카드 본문, dialog content |
| `text-lg` | 18px / 1.125rem | 28px (1.55) | -0.01em | 500 | 섹션 헤더 |
| `text-xl` | 20px / 1.25rem | 28px (1.4) | -0.015em | 600 | 페이지 헤더 H2 |
| `text-2xl` | 24px / 1.5rem | 32px (1.33) | -0.02em | 600 | 페이지 H1 (studio shell) |
| `text-3xl` | 30px / 1.875rem | 36px (1.2) | -0.025em | 700 | landing / producer hero (max) |

**미사용**: `text-4xl`+ 금지 (consumer/marketing 미감).

### 4.3 Weight palette

실제 사용 weight만: **400 (regular), 500 (medium), 600 (semibold), 700 (bold)**. 그 외 (100, 200, 300, 800, 900) 사용 금지.

### 4.4 Per-context 할당

| 컨텍스트 | Class | Family |
|---|---|---|
| Page H1 | `text-2xl font-semibold` | sans |
| Page H2 | `text-xl font-semibold` | sans |
| Section header | `text-lg font-medium` | sans |
| Body | `text-sm` | sans |
| Card title | `text-base font-medium` | sans |
| Card body | `text-sm` | sans |
| Label (form) | `text-sm font-medium` | sans |
| Helper text | `text-xs text-muted-foreground` | sans |
| Caption | `text-xs text-muted-foreground` | sans |
| Button | `text-sm font-medium` | sans |
| Badge | `text-xs font-medium` | sans |
| **Camera axis value** | `text-xs font-mono tabular-nums` | mono |
| **Render ID / Hash** | `text-xs font-mono` | mono |
| **Frame number / Timecode** | `text-xs font-mono tabular-nums` | mono |
| **Token name in inspector** | `text-xs font-mono` | mono |
| Table cell (numeric) | `text-sm font-mono tabular-nums` | mono |

### 4.5 Numeric variants

테이블·shot list·CameraConfig (-10~+10) 등 숫자가 정렬되어야 하는 곳은 **`tabular-nums` 강제**. 본 룰 위반은 jitter 안티패턴 (B.2 #8).

### 4.6 Letter-case 룰

- **Sentence case 일관 사용** ("Create scene", "Save changes"). Title Case 금지.
- ALL CAPS는 `text-xs uppercase tracking-wider` (`+0.05em`) 한정 — micro section header 1~2곳만.
- 한국어는 sentence case 개념 N/A — 종결어미 사용("씬 추가", "저장").

### 4.7 Truncation 룰

- 단일 라인: `truncate` (overflow-hidden + text-ellipsis + whitespace-nowrap)
- 2~3 라인: `line-clamp-2` / `line-clamp-3`
- 노드 라벨: `truncate` 강제 (캔버스 줌-아웃 시 폭이 가변)
- ellipsis 후 "Show more" 토글은 카드 본문 / dialog description에만

### 4.8 Min/max font-size at responsive 극단

mobile-first 전환 시 base 14px → 13px로 stepdown 금지 (가독성 손실). 대신 padding/gap이 줄어들고 type은 고정.

### 4.9 언어 정책

- **UI 기본 언어는 한국어** (decisions log 2026-05-17 cleanup 결정 — 영문 string 한국어로 변환됨)
- 코드 식별자 (변수, 함수, 타입)는 영문
- 채팅 응답은 한국어 (Producer/Writer/Artist/Director agent)
- 콘솔 로그·에러 메시지는 영문 (개발자용)

---

## 5. Breakpoints

Tailwind v4 default 그대로:

| Token | px | 사용 |
|---|---|---|
| `sm:` | 640 | 작은 태블릿 |
| `md:` | 768 | 태블릿 |
| `lg:` | 1024 | 작은 데스크탑 |
| `xl:` | 1280 | **표준 데스크탑** — design target |
| `2xl:` | 1536 | 큰 데스크탑 |

**Mobile-first** 선언. tale-studio는 *데스크탑 우선* 도구 (캔버스 작업이 모바일에 부적합). 그러나 `md:` 미만에서 *읽기 모드*는 동작해야 함 (페이지 미리보기, 사용자 listing).

**Container behavior**: studio shell은 full-width (캔버스 + 좌우 패널). landing / producer는 `max-w-7xl mx-auto px-6`.

**`@container` queries**: 캔버스 inspector / node popup이 폭에 따라 단축 모드로 전환할 때 사용. 페이지 레벨엔 breakpoint 우선.

---

## 6. Sizing & dimensions

### 6.1 Container & shell

| 영역 | 치수 |
|---|---|
| Studio shell header | h-14 (56px) |
| Studio sidebar (expanded) | w-60 (240px) |
| Studio sidebar (collapsed) | w-14 (56px) — icon-only |
| Footer (해당 시) | h-12 (48px) |
| Right inspector (Sheet) | w-96 (384px) default, w-[480px] max |
| Left panel (Meeting Room) | w-80 (320px) |
| Page content max-width (landing/producer) | max-w-7xl (1280px) |

### 6.2 Form control height (정렬 필수)

모든 form control은 **같은 행에서 baseline 정렬**. Button height/size variant 값은 `src/components/ui/button.tsx` CVA가 진실 (여기 복제 금지).

**Footer 정렬 예외**: 패널 하단 footer(`p-4 border-t`)에서 입력행을 CTA(`Button lg` = h-10)와 같은 선 높이로 맞출 때는 Input/icon-button을 **h-10 / `size="icon-lg"`** 로 override. footer 총높이 = `p-4(16)+h-10(40)+p-4(16)` = 72px. 예: GlobalChat 입력부 ↔ HandoffButton.

### 6.3 Modal sizes

| Size | max-w |
|---|---|
| sm | max-w-sm (384px) — confirm |
| md (default) | max-w-md (448px) — form |
| lg | max-w-lg (512px) — NodePopup |
| xl | max-w-2xl (672px) — multi-section editor |
| full | max-w-[90vw] — preset gallery |

### 6.4 Icon sizes

| Size | px | 사용 |
|---|---|---|
| `size-3` | 12 | inline 강조 micro icon (rare) |
| `size-4` | 16 | **표준 인라인 icon** (button, input adornment, list) |
| `size-5` | 20 | button-icon hover, slightly larger button |
| `size-6` | 24 | toolbar, sidebar primary |
| `size-8` | 32 | empty-state header, profile avatar |

### 6.5 Avatar sizes

xs `size-6` / sm `size-8` / md `size-10` / lg `size-12` / xl `size-16`. Most actor/world thumbnails 사용하므로 별도 정의: `size-10` (40px) default, `size-16` (64px) hover preview.

### 6.6 Min tap target

- Desktop pointer: 24×24 minimum (Apple HIG)
- Mobile touch: 44×44 minimum
- 캔버스 노드 port handle: 12×12 visual + 20×20 interactive hit area (React Flow `Handle`의 size prop 또는 wrapper)

---

## 7. Radius

source: `--radius: 0.5rem` (8px). Tailwind v4 `@theme inline` 자동 파생 — calc 값은 `src/app/globals.css` `@theme inline` 블록이 진실 (여기 복제 금지).

### 7.1 Per-component 할당

| 컴포넌트 | Radius |
|---|---|
| Button | `rounded-md` (6) |
| Input / Select | `rounded-md` (6) |
| Card (shadcn default) | `rounded-xl` (12) |
| Dialog | `rounded-lg` (8) |
| Sheet | `rounded-none` (edge에 붙음) |
| Popover | `rounded-md` (6) |
| Tooltip | `rounded-sm` (4) |
| Badge | `rounded-full` (pill) |
| Avatar | `rounded-full` |
| Canvas node | `rounded-lg` (8) — header/body radius 일치 |
| Asset thumbnail | `rounded-md` (6) |
| Video clip card | `rounded-lg` (8) |

### 7.2 Nesting 룰

inner radius ≤ outer radius. 예: 카드(`rounded-xl 12`) 안의 button (`rounded-md 6`) OK. 반대는 금지.

### 7.3 Pill threshold

`rounded-full`은 **badge / chip / avatar** 한정. **CTA / button group 절대 금지** (소비자 앱 미감).

---

## 8. Border

### 8.1 Width scale

`0`, `1` (default), `2` (thick), `4` (hero — 사용 안 함). 1px 이외엔 정당화 필요.

### 8.2 Border vs background vs shadow 정책

- **구분이 필요한가?** → 1px border (`--border`).
- **계층이 필요한가?** → `--surface-secondary` / `--surface-tertiary`로 elevation.
- **떠 있는 느낌?** → border만. **shadow는 popover/dialog/toast 한정**.

### 8.3 Hairline color

`--border` 단일 톤. shadcn collapse 그대로. `--border-strong` / `--border-subtle` 는 이미 `src/app/globals.css` (`:root` + `.dark` 양쪽)에 존재 — §2.4 Border tiers 참조. 값은 globals.css가 진실 (여기 복제 금지).

### 8.4 Canvas edge

캔버스 노드 border = `--border` 1px. selected = `--ring` 2px (§17.6).

---

## 9. Shadow / Elevation

### 9.1 Shadow scale

Tailwind 표준 shadow 토큰 사용 (값은 Tailwind 기본 — 여기 복제 금지):

| Token | 사용 |
|---|---|
| `shadow-none` | **default** — flat 우선 |
| `shadow-sm` | 카드 (shadcn default, dark에선 무시) |
| `shadow-md` | popover / dropdown |
| `shadow-lg` | dialog / sheet |
| `shadow-xl` | toast / floating CTA |

### 9.2 Per-component elevation map

| 컴포넌트 | Shadow |
|---|---|
| Card (page level) | `shadow-none` (dark) / `shadow-sm` (light) |
| Popover | `shadow-md` |
| Dropdown menu | `shadow-md` |
| Dialog | `shadow-lg` |
| Sheet | `shadow-none` (edge fixed, shadow unnecessary) |
| Toast | `shadow-xl` |
| **Canvas node** | `shadow-none` default — 강조는 selection halo 권장 (§17.6). shadow 사용 자유 |
| Tooltip | `shadow-sm` |

### 9.3 Dark mode 전략

dark에서 box-shadow는 거의 invisible. **border + surface-tertiary 조합으로 elevation 표현**. shadow가 *진짜로* 필요한 popover/dialog/toast는 alpha 충분 (`0.2~0.3`).

### 9.4 Inset shadow

pressed input / button 표현에 미사용. opacity-90 + border-strong로 대체.

---

## 10. Motion

### 10.1 Duration scale

decisions #30 4-tier:

| Token | ms | 사용 |
|---|---|---|
| `duration-100` | 100 | micro-interaction (hover, focus, ring fade) |
| `duration-150` | 150 | small state (icon toggle, button press) |
| `duration-250` | 250 | modal / popup open/close, sheet slide |
| `duration-350` | 350 | layout transition, sidebar expand/collapse |

**금지**: 500ms+ in-product (canvas pan/zoom은 React Flow default 별도).

### 10.2 Easing curves

Tailwind 표준 easing 토큰 사용 (cubic-bezier 값은 Tailwind 기본 — 여기 복제 금지):

| Token | 사용 |
|---|---|
| `ease-out` | **default for enter** (감속 끝) |
| `ease-in` | exit (가속 시작) |
| `ease-in-out` | continuous (slider drag) |
| `linear` | progress bar / spinner |

### 10.3 Per-interaction recipe

| Interaction | Duration | Easing | Property |
|---|---|---|---|
| Button hover | 100 | ease-out | bg-color |
| Button press | 100 | ease-out | scale-95 |
| Focus ring | 100 | ease-out | opacity |
| Input bg on focus | 150 | ease-out | bg-color, border |
| Dialog open | 250 | ease-out | opacity + scale-95→100 |
| Dialog close | 200 | ease-in | opacity + scale-100→95 |
| Sheet slide-in | 250 | ease-out | translate-x |
| Sheet slide-out | 200 | ease-in | translate-x |
| Popover open | 150 | ease-out | opacity + translate-y |
| Toast in | 250 | ease-out | translate-y + opacity |
| Toast out | 200 | ease-in | opacity |
| Skeleton pulse | 1500 (linear) | linear | opacity 0.4↔0.7 infinite |
| Generating spinner | 1000 | linear | rotate infinite |
| Node selection halo | 100 | ease-out | ring-width 0→2 |
| Canvas pan/zoom | React Flow default | — | — |

### 10.4 Reduced-motion 정책

**의도 (전체 정책)**:
- duration을 50ms로 강제 클램프
- spinner는 정적 dot icon으로 교체 (`motion-reduce:animate-none`)
- skeleton pulse는 정적 opacity 0.5

**현재 구현**: `src/app/globals.css`에는 `.tale-beam` 컴포넌트의 `prefers-reduced-motion` 분기만 존재 (animation 정지 + 정적 accent ring). 전역 50ms 클램프 CSS 블록은 **미구현** — 향후 추가 예정.

### 10.5 Disallow

- Parallax / scroll-jacking 금지
- Auto-play video on hover 금지 (썸네일은 정적, 클릭 시 재생)
- Bouncy spring 금지 (B2B 도구가 장난감 인식)
- Enter / exit 같은 duration 금지 — exit는 enter의 70~80%

---

## 11. Z-index

### 11.1 Named layer 사다리

`globals.css`에 root variable + Tailwind v4 `@utility` 클래스로 정의됨 — 값은 `src/app/globals.css` `:root` 블록이 진실 (여기 복제 금지). **named class만 사용** (`z-canvas`, `z-toolbar`, `z-modal`, `z-toast` 등). shadcn primitive의 literal `z-50`은 `z-modal` alias와 동일 — 신규 코드는 named class 우선. shadcn 컴포넌트 마이그레이션은 후속 작업.

### 11.2 Portal 전략

Radix UI primitive (Dialog / Popover / Tooltip / Toast / DropdownMenu)는 body root로 portal escape. 캔버스 안 inspector도 Radix Portal 위 — 캔버스 변형/스크롤 영향 안 받음.

### 11.3 룰

- Literal `z-{number}` 새 코드에 도입 자제. shadcn primitive의 default 사용
- 캔버스 노드/엣지의 z는 React Flow가 자체 관리 (선택 시 자동 상위)

---

## 12. States matrix

각 interactive 컴포넌트의 12 state. AI slop 80% 발생 지점.

| State | Visual treatment | 예외 |
|---|---|---|
| **Default** | base | — |
| **Hover** | `bg-{token}/80` 또는 `bg-accent` | touch device 무시 |
| **Active / pressed** | `scale-95` 또는 `bg-{token}/70` | 잠시 (~100ms) |
| **Focus** | (보통 skip) | mouse focus — outline 없음 |
| **Focus-visible** | `outline-ring/50 outline-2 outline-offset-2` | 키보드 only |
| **Selected** | `bg-accent` 지속 + 노드는 selection halo | tabs, nav, list |
| **Disabled** | `opacity-50 pointer-events-none cursor-not-allowed` | aria-disabled="true" |
| **Loading** | `opacity-70` + spinner (size-4) | aria-busy="true" |
| **Error** | `border-destructive text-destructive` + icon + label | aria-invalid="true" |
| **Success** | green text + Check icon + 토스트 | one-shot, no persistent state |
| **Empty** | empty-state pattern (§13.5) | — |
| **Read-only** | `bg-muted/50 cursor-default` | aria-readonly="true", disabled와 분리 |

### 12.1 룰

- **Loading ≠ Disabled** — opacity 다르게, spinner 유무.
- **Color 단독으로 상태 전달 금지** — icon + label + aria 페어 필수.
- **focus-visible만 ring 표시** — mouse focus는 ring 없음 (브라우저 default).

---

## 13. Layout primitives

### 13.1 Studio shell

```
┌─────────────────────────────────────────────┐
│ Header (h-14)                                │  ← sticky top
├─────┬────────────────────────────┬──────────┤
│ Sb  │ Content                    │ Inspector│
│ w-60│ (canvas viewport)          │ w-96     │
│     │                            │ (Sheet)  │
└─────┴────────────────────────────┴──────────┘
```

- Header: `bg-background border-b border-border h-14 px-6`
- Sidebar: `bg-sidebar w-60 border-r border-border` (collapsed: `w-14`)
- Content: `flex-1 overflow-auto`
- Right Inspector: `w-96` default. 캔버스(Director)에서는 NodePopup이 흡수 (Director 결정 #12) — Radix Sheet 미사용.

### 13.2 Card anatomy

```
┌───────────────────────────────────┐
│ Header (p-4 border-b)              │
├───────────────────────────────────┤
│ Body (p-6)                         │
├───────────────────────────────────┤
│ Footer (p-4 border-t gap-2)        │
└───────────────────────────────────┘
```

- **shadcn Card 미도입** (`ui/card.tsx` 없음) — 현재는 plain `div` 기반 카드. 도입 시 이 anatomy 적용: `Card` / `CardHeader` / `CardContent` / `CardFooter`
- 모든 카드 `rounded-xl border bg-card`
- Header 내부 `flex justify-between` — 제목 좌, action 우

### 13.3 Dialog anatomy

```
┌─────────────────────────────────┐
│ Title         (font-semibold)    │
│ Description   (text-muted)       │
├─────────────────────────────────┤
│ Body                             │
│ (scrollable)                     │
├─────────────────────────────────┤
│           [Cancel] [Confirm]     │  ← LTR primary 우측
└─────────────────────────────────┘
```

- shadcn `Dialog` / `DialogHeader` / `DialogTitle` / `DialogFooter`
- **Primary CTA는 우측** (LTR)
- Cancel = `variant="ghost"` 또는 `outline`
- Body가 long-form이면 `max-h-[60vh] overflow-y-auto`
- header `pb-4`, footer `pt-4 gap-2 justify-end`

### 13.4 Form anatomy

```
Label (text-sm font-medium)
[Input          ]
Helper text (text-xs text-muted)
또는
Error message (text-xs text-destructive)  ← invalid 시
```

- label 위, input 아래, helper / error 더 아래 (3단 vertical)
- helper와 error는 같은 자리. error 시 helper hide
- required indicator: label 뒤 `*` (text-destructive)
- form field 간 `gap-4`
- form action: 우측 정렬 (Dialog와 동일)

### 13.5 Empty / Loading / Error 결정 트리

```
페이지가 데이터를 기다린다 →
  데이터 모양이 알려져 있는가?
    YES → Skeleton (list/card shape mimic) — shadcn Skeleton 미도입(`ui/skeleton.tsx` 없음), 직접 구현
    NO  → Spinner (`size-6 text-muted`) + label "Loading…" (verb-specific 우선)

데이터가 없다 (empty result) →
  Empty-state pattern:
    - Icon size-12 (text-muted-foreground)
    - 제목 text-base font-medium ("아직 생성된 영상이 없어요")
    - 설명 text-sm text-muted ("스토리를 작성하고 씬을 생성해보세요")
    - Primary CTA (optional)

데이터 fetch 실패 →
  Inline error (필드별):  text-xs text-destructive + AlertCircle icon
  Banner (폼 상단):        Alert variant="destructive"
  Transient action 실패:   Toast variant="destructive" + retry CTA
```

### 13.6 List / Table density

| Density | Row height | 사용 |
|---|---|---|
| Compact | h-8 (32) | dense data table (shot list, render log) |
| Default | h-10 (40) | 일반 리스트 |
| Comfortable | h-12 (48) | nav, primary action list |

### 13.7 Sticky / sticky toolbar

- Studio header `sticky top-0 z-30`
- Dialog header `sticky top-0 bg-popover`
- Long form section header `sticky top-14 (header offset)`
- 캔버스 toolbar: `absolute top-2 right-2` (sticky 아님, viewport 변형 안 됨)

### 13.8 Component patterns (shadcn primitives)

shadcn CLI(`npx shadcn@latest add <name>`)로 생성, `src/components/ui/`에 위치. 모든 variant×size×state를 **살아있는 토큰으로 렌더하는 카탈로그는 `/design` 쇼케이스 페이지** (`src/app/design/page.tsx`). 새 색·variant 추가 시 거기서 먼저 시각 확인.

현재 도입된 primitive 목록은 `ls src/components/ui/` 가 진실 — 값/variant 인벤토리는 각 CVA + globals.css 참조 (여기 복제 금지).

**표준 조합 스니펫**:

```tsx
// 패널 하단 footer (CTA) — §6.2 Footer 정렬 (72px)
<div className="border-t border-border p-4">
  <Button size="lg" className="w-full">{label}<ArrowRight className="ml-2 h-4 w-4" /></Button>
</div>

// 입력 footer (CTA와 같은 선 높이) — §6.2 예외
<div className="border-t border-border p-4">
  <div className="flex gap-2">
    <Input className="h-10" placeholder={...} />
    <Button size="icon-lg"><Send className="size-4" /></Button>
  </div>
</div>

// stage badge — §2.9 토큰 (face와 동일 색)
<span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium
  bg-stage-writer/15 text-stage-writer border-stage-writer/30">P2 · Writer</span>
```

**룰**: `src/components/ui/*`는 CLI 관리 — 직접 편집 시 다음 `add`가 덮어쓸 수 있음. 커스텀은 `src/components/<feature>/`. raw hex/px 금지, 토큰만.

---

## 14. Iconography

### 14.1 Library

**Lucide** (`lucide-react`). 단일 소스. Phosphor / Heroicons mix 금지.

### 14.2 Sizes & stroke

- 인라인: `size-4` (16px)
- 버튼 안: `size-4` 또는 `size-5`
- Toolbar / sidebar: `size-5` (20px)
- Section header: `size-6` (24px)
- Empty state: `size-12` (48px)
- Stroke width: Lucide default 1.5 (변경 시 *모든* 아이콘 동일하게)

### 14.3 Icon + label 페어링

- 텍스트가 명확하면 icon은 보조 (decoration)
- icon-only button은 **반드시 `aria-label` + Tooltip** 페어
- 캔버스 노드 헤더 4 icon (Edit / Branch / Copy / Delete)은 Tooltip 강제

### 14.4 Custom-icon 정책

- Lucide에 없을 때만 직접 SVG 작성
- 단일 stroke 1.5 / 같은 viewBox 24×24 / 같은 corner radius
- `src/components/icons/`에 배치, 명명 `<Name>Icon` (suffix `Icon`)

---

## 15. Imagery

### 15.1 Aspect ratios

| Ratio | 사용 |
|---|---|
| 1:1 (square) | 캐릭터 카드/시트 thumbnail, avatar |
| 4:3 | (사용 안 함) |
| 16:9 | 월드 카드 thumbnail, Video clip, scene preview |
| 9:16 | mobile preview, 세로 비디오 (post-MVP) |
| 21:9 | cinematic preview (rare) |

이미지 생성 API 호출 시 에셋 종류에 맞춰 자동 (월드→16:9, 캐릭터→1:1).

### 15.2 Placeholder 전략

| 상태 | 표현 |
|---|---|
| Empty (생성 전) | `bg-muted border-dashed border` + Lucide `ImageOff` icon size-8 |
| Loading (생성 중) | Skeleton with shimmer (motion-safe) |
| Failed | `bg-muted border-destructive` + AlertCircle + retry CTA |
| Loaded | 이미지 + lazy-load |

### 15.3 Compression / 포맷

- 사용자 업로드: WebP 우선, PNG (alpha 필요) 허용, JPEG fallback
- 생성된 이미지: fal 경유 이미지 모델 default 포맷 (실제 모델/포맷은 루트 CLAUDE.md §기술 스택 참조)
- 압축: Next.js Image automatic optimization

---

## 16. Content / voice

### 16.1 Button label format

- **동사 우선 명령형** ("씬 추가", "저장", "영상 생성")
- 명사형 금지 ("Scene Creation" ✗)
- 영문은 verb-first imperative ("Create scene", not "Scene creation")

### 16.2 Case

- 한국어: 동사 종결어미 ("씬 추가", "저장", "삭제")
- 영문: sentence case 일관 ("Create scene", "Save changes")
- ALL CAPS는 micro section header 한정

### 16.3 Empty-state copy template

```
{무엇이 없는지}이/가 없어요
{왜 / 어떻게 생기는지 한 줄}
[다음 액션 CTA optional]
```

### 16.4 Error message format

```
{무엇이 실패했는지}: {왜}.
{어떻게 수정}
[Retry / Detail]
```

bad: "Something went wrong" — 0 정보.
good: "이미지 생성 실패: 이미지 생성 서버 응답 시간 초과. 잠시 후 다시 시도해 주세요." + Retry

### 16.5 Loading copy

- generic "Loading…" 금지
- verb-specific: "씬 생성 중…", "영상 분석 중…", "프리셋 저장 중…"

### 16.6 Date / time / number

- 날짜: ISO 8601 `2026-05-28` (UI table), 한국어 narrative `2026년 5월 28일` (description)
- 시간: 24h `HH:mm` (UI), `오후 5:23` (narrative)
- timecode: `HH:MM:SS.ms` mono
- 숫자 천단위: `1,234` (locale="ko-KR")

### 16.7 Truncation indicator

- ellipsis (`…`) for visual truncation
- "더 보기" / "Show more" toggle for description / long text

---

## 17. Canvas conventions (tale-studio React Flow)

**Director Canvas가 유일한 캔버스 surface** (L0 Concept Canvas는 2026-06-04 폐기 — artist는 카드형 패널, §13 layout 적용). 정량 룰 필수.

### 17.1 Node sizes

Node width 값은 `src/features/director/canvas-nodes/` 각 컴포넌트의 `width` prop이 진실 (여기 고정하면 코드와 drift — 복제 금지). Height: content-driven (auto). min-h-20 (80px) 최소.

### 17.2 Node padding

- Header: `px-3 py-2` (12/8) with `border-b border-border`
- Body: `p-3` (12)
- Port-zone: 노드 가장자리에 absolute positioning, 내부 padding은 영향 없음

### 17.3 Edge stroke

| State / Category | Width | Style | Color |
|---|---|---|---|
| `parent` (Scene→Shot→Video 계층) | 2px | solid | `--border` (gray) |
| `relates-to` | 1.5px | solid | `--border` |
| Selected | 2px | solid | `--ring` (= primary) |
| Hovered | 2px | solid | `--muted-foreground` |
| Invalid (생성 직전 미리보기) | 1.5px | dashed | `--destructive` |

카테고리 정의는 `DirectorEdgeCategory` 타입 + `canvas-edges/CategoryEdge.tsx`가 진실 (옛 L0 카테고리 in-world/references는 폐기).

**색 분기 금지** (decisions #30). 카테고리는 **굵기 + 스타일**로.

### 17.4 Port size & hit area

- Visual: `size-3` (12px) 원형 dot, `--border` color, hover `--ring`
- Interactive hit area: 20×20 (visual 주변 padding)
- React Flow `Handle` 위 wrapper 또는 `style` prop으로 hit area 확장

### 17.5 Grid snap

- **16px snap** (decisions Director 내부 #18 + Artist 통일)
- React Flow `snapToGrid={true} snapGrid={[16, 16]}`
- 자유 좌표 금지

### 17.6 Selection halo

- `ring-2 ring-ring ring-offset-2 ring-offset-canvas-bg`
- 진입 100ms ease-out
- 강조는 selection halo 권장 (box-shadow 사용 자유)

### 17.7 Pan / zoom defaults

- 더블클릭 zoom 비활성 (`zoomOnDoubleClick={false}`) — 더블클릭은 NodePopup open (decisions #33) 또는 빈 공간 CreatorModal
- minZoom / maxZoom / fitView padding 값은 `src/app/studio/director/page.tsx` 코드가 진실 (미구현 forward — 여기 고정 금지)

### 17.8 Background pattern

- React Flow `<Background>` dots, gap/size/opacity 값은 `src/app/studio/director/page.tsx`가 진실 (복제 금지)
- color: `--muted-foreground` 기반 + opacity (사용처 책임)
- `bg-background` (= `--surface-primary`) under

### 17.9 Empty canvas state

- 중앙: 큰 icon size-12 (text-muted-foreground)
- 제목: "캔버스를 더블클릭해서 첫 Scene을 만들어 보세요"
- subtitle 옵션: 단축키 안내

### 17.10 Minimap

- 우측 하단 `<MiniMap />`
- `pannable zoomable` (구현됨)
- 노드 색 / maskColor 커스텀: 미구현 — 코드는 `src/app/studio/director/page.tsx` MiniMap 참조

### 17.11 캔버스 확장 토큰 namespace

shadcn 표준 외 확장. **globals.css에 명시 정의됨** (`:root` alias + `@theme inline` 매핑).

| 토큰 | Alias | Tailwind 클래스 예 |
|---|---|---|
| `--canvas-bg` | `var(--background)` | `bg-canvas-bg` |
| `--canvas-dot` | `var(--muted-foreground)` (opacity-20 적용은 사용처 책임) | `text-canvas-dot/20` |
| `--node-bg-default` | `var(--card)` | `bg-node-bg-default` |
| `--node-bg-selected` | `var(--accent)` | `bg-node-bg-selected` |
| `--node-border-default` | `var(--border)` | `border-node-border-default`, `ring-node-border-default` |
| `--node-border-selected` | `var(--ring)` | `border-node-border-selected`, `ring-node-border-selected` |
| `--edge-default` | `var(--border)` | inline `stroke: var(--edge-default)` |
| `--edge-selected` | `var(--ring)` | inline `stroke: var(--edge-selected)` |

**룰**: 노드 외곽 표면/엣지 stroke는 위 토큰만 사용. 노드 내부 sub-element (썸네일 frame, separator) 는 기본 `--border` / `--muted-foreground` OK. theme palette (`--chart-1`~`--chart-5`)와 충돌 시 palette가 우선 (노드 정체성 색).

### 17.12 노드 헤더 액션 (decisions #33)

- 4 icon: Edit / Branch / Copy / Delete
- `size-4` (16px), stroke 1.5
- gap-1 (4px)
- 우측 정렬
- 호버 시 `--accent` 배경 표시 (각 icon마다)
- Director Video 노드 헤더 ★ (Final 토글) 추가 — `--primary` 색일 때 active (decisions Director 내부 #11)

---

## 18. Worked example

(2026-06-10 제거 — 옛 L0 ActorNode 예시 코드는 아키텍처 폐기로 삭제. 본 문서 룰이 적용된 **살아있는 예시는 실코드**: `src/features/director/canvas-nodes/BaseNode.tsx` / `ShotNode.tsx` — §17 정량 룰, selection halo, 4 action icons, tabular-nums 적용 확인 가능.)

---

## 19. 운영

### 19.1 design.md vs 코드 충돌

코드가 이김. design.md는 정량 reference. 실제 토큰 값은 `globals.css`가 source-of-truth.

### 19.2 새 컴포넌트 추가 시 워크플로

1. shadcn primitive 있는지 확인 (`/shadcn-component` 스킬)
2. 기존 토큰으로 표현 가능한지 확인 — 가능하면 새 토큰 만들지 말 것
3. 새 패턴이면 본 문서 §관련 섹션에 1줄 추가 + `last_updated` 갱신
4. 새 강제가 필요한 룰만 본 문서에 inline

### 19.3 새 토큰 추가 시

1. **정말 필요한가?** 기존 alias로 표현 가능한지 재확인 (37 anti-patterns #1: collapse drift)
2. globals.css에 추가 (light + dark 둘 다)
3. `@theme inline`의 색상이면 `--color-{name}` 추가
4. 본 문서 §2 표 갱신
5. owner는 docs 메타데이터에서 확인

### 19.4 design.md drift 방지

- **last_updated 매 PR**: 본 문서 수정 시 frontmatter 날짜 갱신
- **owner 검증**: 공유 영역 변경은 PR 리뷰
- **design.md가 enforcement 기준**: 작업 중 적용되는 hard rules는 본 문서와 일관 유지
- **drift 감지**: §2 표는 *역할만* 기술 (값 컬럼 없음, 2026-06-10) — globals.css 값 변경은 본 문서 갱신 불필요. **토큰 추가/삭제/역할 변경 시에만** §2 표 갱신

### 19.5 다음에 채울 영역 (TBD)

(2026-05-28: 직전 TBD 5개 모두 globals.css에 반영됨 — border tier, semantic state, 캔버스 토큰, z-index named, Pretendard)

현재 비어 있음. 새로 발견되는 미명세 영역은 본 섹션에 1줄 추가 후 후속 작업.
