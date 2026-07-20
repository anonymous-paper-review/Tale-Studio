# design.md가 작동하기 위한 데이터 요구사항

> 4갈래 병렬 리서치 종합 (2026-05-27): shadcn/Tailwind v4 토큰 해부 · 시멘틱 토큰 이론 (10개 디자인 시스템 비교) · 데이터 마스터 체크리스트 · Reference 후보 분석 + harness 결합 메커니즘. tale-studio 컨텍스트 (Next.js 16 + Tailwind v4 + shadcn/ui + React Flow + Three.js, B2B AI 비디오 파이프라인) 기준으로 정렬.

> 이 문서는 **가이드**다. 실제 `docs/design.md` 초안은 별도 작업.

---

## 목차

1. [문제 정의 — 왜 design.md 한 장으론 안 되는가](#1-문제-정의)
2. [3-tier 토큰 시스템 (L1 원시 / L2 시멘틱 / L3 사용 룰)](#2-3-tier-토큰-시스템)
3. [shadcn + Tailwind v4 — 채우는 자리 vs 비워둔 자리](#3-shadcn--tailwind-v4)
4. [design.md 마스터 데이터 체크리스트](#4-마스터-체크리스트)
5. [실행 계획 — 어떤 순서로 채울 것인가](#5-실행-계획)
6. [Harness 결합 — Claude가 design.md를 참조하도록 강제](#6-harness-결합)
- 부록 A: [tale-studio용 reference 후보 5개 분석](#부록-a-reference-분석)
- 부록 B: [37가지 anti-pattern (AI slop 발생 지점)](#부록-b-anti-patterns)
- 부록 C: [출처](#부록-c-출처)

---

## 1. 문제 정의

### 1.1 흔한 실패 패턴

design.md를 추상적으로 쓰면 — 예를 들어 *"미니멀하고 모던한 느낌"*, *"적당한 여백"*, *"부드러운 인터랙션"* 같은 형용사 위주로 — AI 에이전트는 매번 다르게 해석합니다. 동일한 컴포넌트가 한 페이지는 `p-3 gap-2`, 다른 페이지는 `p-4 gap-3`로 나오고, hover는 `opacity-80`이었다가 `bg-accent`였다가 합니다. 이는 모델의 한계가 아니라 **명세의 한계**입니다.

### 1.2 원인 — "스타일이 꽂힐 자리(slot)가 없음"

원본 트윗(dddesign.io, 2026-05-18)이 정확히 짚은 핵심:

> 같은 `#FFFFFF`라도 카드 표면이면 `surface.card`, 페이지 배경이면 `background.default`. 모노톤 컨셉이라 값이 같은 거지, 애초에 둘은 다른 역할이다.

즉 design.md가 작동하려면 그 **위에 세 개 층이 모두 있어야** 한다:

| 층 | 무엇이 적혀 있어야 하는가 | 빠지면 일어나는 일 |
|---|---|---|
| **L1. 원시 토큰 (primitives)** | 실제 색·폰트·spacing·radius·shadow **값**. `gray-50: oklch(0.985 0 0)`, `space-4: 16px` | "padding 적당히" → AI가 임의값 생성 |
| **L2. 시멘틱 토큰 (slots)** | 역할 기반 별칭. `surface.card`, `text.muted`, `border.subtle` | "흰색" → AI가 `#FFF`와 `surface.card`의 차이를 인지 못함 |
| **L3. 사용 룰 (when-to-use)** | "modal 안의 카드는 `surface.elevated`, 페이지 위 카드는 `surface.card`" 같은 결정 트리 | 같은 컴포넌트가 매번 다른 토큰을 씀 |

**shadcn은 L1+L2를 CSS 변수(`--background`, `--card`, `--muted` 등)로 제공하지만 L3는 비어 있습니다.** 그래서 tale-studio가 design.md에서 자체적으로 채워야 할 부분은 **L3 + 일부 L2 확장**입니다.

### 1.3 design.md가 책임지지 않는 것

이 문서가 다루는 design.md는 **시각적 결정 데이터** (토큰, 룰, 스케일)에 집중합니다. 그것이 *왜 그렇게 생겼는가*에 대한 사유 — 톤·페르소나·시장 포지셔닝 — 는 `docs/design-references.md` 같은 동반 문서나 design.md 상단의 짧은 "Overview" 섹션에 압축됩니다. 두 문서는 분리되어야 합니다:

- `design.md` — *어떤 값을 쓸 것인가* (정량 명세)
- `design-references.md` — *왜 그 값들을 선택했는가* (정성 reference)

---

## 2. 3-tier 토큰 시스템

### 2.1 동일 모델, 다른 이름

10개 메이저 디자인 시스템이 같은 3-tier 모델을 다른 이름으로 부릅니다:

| 시스템 | L1 (원시) | L2 (시멘틱/별칭) | L3 (컴포넌트) |
|---|---|---|---|
| Material 3 | `md.ref.*` (Reference) | `md.sys.*` (System) | `md.comp.*` (Component) |
| Adobe Spectrum | Global | Alias | Component-specific |
| Salesforce LDS | Global / primitive | Semantic | Component |
| GitHub Primer | Base (`base.color.scale.*`) | Functional (`fgColor-*`, `bgColor-*`) | Pattern (`focus-outlineColor`) |
| Atlassian | Foundation | (modifiers stack: role × emphasis × state) | Component-specific |
| IBM Carbon | Core (palette) | Theme tokens (`$background`, `$layer-0X`) | Contextual |
| Shopify Polaris | (private palette) | `--p-color-bg-*`, `--p-color-text-*` | Component overrides |
| Radix Colors | 12-step scale per hue | 12 step **roles** (App bg, Subtle bg, …) | (consumer-defined) |
| Brad Frost | Tier 1 / option | Tier 2 / decision | Tier 3 / component |
| DTCG (W3C) | Token with `$value` | Aliased token | Deeper alias / `$extends` |

### 2.2 각 tier의 *왜*

**L1 — Primitives (option tokens)**
- 목적: 합법적 원시값의 인벤토리.
- **왜 직접 쓰면 안 되는가**: 컨텍스트가 없어 의도가 우연히 보존된다. Material: "reference 토큰은 hex/픽셀/폰트명 같은 구체 값을 갖는다." Primer: "base 토큰은 raw 값에 직접 매핑되며, **참조용일 뿐 직접 사용하지 않는다.**"
- 대표 안티패턴: 버튼에 `color.interactive.primary` 대신 `blue.500`. 다크모드 도입 시 모든 버튼을 다시 칠해야 함.

**L2 — Semantic / Alias (decision tokens)**
- 목적: 값이 *어느 slot*에 들어가는지 선언. "이건 앱 배경", "이건 emphasis surface 위의 텍스트".
- **왜 원시 위에 한 층이 더 필요한가**:
  1. **테마 스왑**: light → dark에서 `surface`의 *값*은 뒤집히지만 *역할*은 같다. `gray-100`을 컴포넌트가 직접 참조하면 light에 고정됨.
  2. **브랜드 스왑**: 다른 테넌트가 `color.background.accent`를 다른 hue로 재바인딩하는 데 컴포넌트 코드는 0줄 변경.
  3. **검색-치환 면역**: 팔레트가 (`gray-100 → gray-50`) 시프트할 때 L2→L1 매핑 한 줄만 바꾸면 끝.
  4. **AI 에이전트 가독성**: 에이전트가 `bg-surface-subtle`을 보면 *의도*를 즉시 안다. `bg-gray-100`은 수치 근사로 의도를 추론해야 함.

**L3 — Component tokens**
- 목적: "*이* 컴포넌트의 *이* slot은 *이* alias에 바인딩."
- **언제 가치 있는가**:
  - 컴포넌트가 다른 어디에도 없는 *고유한* 역할을 가질 때 (예: `overlay-backdrop-bgColor`, `skeleton-element`)
  - slot이 global alias에서 *벗어나야* 할 때 (버튼 그림자 ≠ 카드 그림자)
- **언제 가치 없는가**: `card-background`가 항상 `color.background.subtle`와 같다면, `card-background`를 만들지 마라. Spectrum과 Atlassian 모두 명시적으로 경고: alias와 같은 component token은 미래에 drift를 보장한다.

### 2.3 네이밍 컨벤션 — 10개 시스템 교차 비교

| 시스템 | 구분자 | 어순 | 상태 인코딩 | emphasis 인코딩 | polarity 인코딩 |
|---|---|---|---|---|---|
| Material 3 | dot (`md.sys.color.primary-container`) | tier→category→role→variant | 컴포넌트 layer에서 implied | `-container`, `-variant`, `-low/high` | `error`, `error-container`, `on-error` |
| Spectrum | dash (`--spectrum-button-bg-color-default`) | tier→component→property→role→state | `-default`, `-hover`, `-down`, `-key-focus`, `-disabled` | `-emphasized`, `-quiet`, `-default` | `negative`, `positive`, `notice`, `informative` |
| Salesforce LDS | dash, `--lwc-` / `--slds-` prefix | category→role→modifier | `-hover`, `-active`, `-focus` | `-alt`, `-alt-2`, `-inverse` | `-success`, `-warning`, `-error`, `-destructive` |
| Shopify Polaris | dash (`--p-color-bg-fill-success-hover`) | category→property→role→state | `-hover`, `-active`, `-selected`, `-disabled` | `-secondary`, `-subdued`, `-strong`, `-emphasis` | `info`, `success`, `caution`, `warning`, `critical`, `magic` |
| IBM Carbon | dash, `$` prefix | role→layer-number | `-hover`, `-active`, `-selected`, `-disabled` | `-01`, `-02`, `-03` (depth) | `support-error/warning/success/info` |
| GitHub Primer | camelCase + dash (`fgColor-onEmphasis`) | property→role→emphasis | `-rest`, `-hover`, `-active`, `-selected`, `-disabled` | `-emphasis`, `-muted`, `-subtle`, `-onEmphasis` | `success/attention/severe/danger/open/closed/done` |
| Atlassian | dot (`color.background.accent.blue.subtler`) | foundation→property→role→modifier | `.hovered`, `.pressed`, `.disabled` | `.subtle/subtler/subtlest/bold/boldest` (5 steps) | `success/warning/danger/information/discovery/accent` |
| Radix Colors | dot (`gray.3`, `blueA.5`) | hue→step | **step 번호가 인코딩** (4=hover, 5=active) | **step 번호가 인코딩** (1=app bg, 11/12=text) | hue 자체가 polarity (`red`=danger, `green`=success) |

**패턴 결정**:
- dot-separated role-first: 신규 시스템(Material, Atlassian, DTCG) 다수
- dash-separated context-first: 구 시스템(Spectrum, LDS, Polaris, Carbon)
- state는 거의 항상 **suffix**: `-hover`, `-pressed`, `-disabled`
- emphasis 어휘는 수렴 중: `subtle / default / strong` (또는 `muted / default / emphasis`)
- polarity 어휘도 수렴: `success / warning / danger / info`
- foreground 페어링 2 진영: "On-X" pair (Material, Primer, shadcn `primary-foreground`) vs. "Foreground role" (Atlassian `color.text.subtle`)

### 2.4 Radix의 12-step 스케일 — 왜 AI 친화적인가

Radix의 12-step은 각 step이 **행동(behavior)으로 명명**되어 있어서 LLM이 추론하기 쉽습니다.

| Step | 역할 (Radix 정의) | 어디서 reach |
|---|---|---|
| 1 | App background | 페이지 최외곽 |
| 2 | Subtle background | 줄무늬 테이블 행, 코드 블록, step-1 페이지 위의 카드 |
| 3 | UI element background | 버튼·input rest |
| 4 | Hovered UI element bg | step-3의 hover |
| 5 | Active/Selected UI element bg | step-3 pressed, 선택된 nav |
| 6 | Subtle borders, separators | 비-interactive 구분선 |
| 7 | UI element border, focus rings | 버튼·input border at rest |
| 8 | Hovered UI element border | step-7의 hover |
| 9 | Solid backgrounds | 브랜드 컬러 버튼 — *유일한* solid step |
| 10 | Hovered solid backgrounds | step-9 hover |
| 11 | Low-contrast text | 보조 라벨, 캡션, placeholder (APCA Lc 60) |
| 12 | High-contrast text | 헤딩, 본문 (APCA Lc 90) |

**왜 `primary/secondary`보다 강한가**:
1. **폐쇄 어휘** — 12 slot, 모두 행동 기반. 에이전트가 hover state를 만들려면 step 4 (또는 solid면 10)으로 reach.
2. **상태가 스케일에 인코딩** — `step 4 = hover`는 별도 `-hover` token이 필요 없다. 스케일 자체가 상태다.
3. **border가 first-class** — step 6/7/8이 "비-interactive 구분선 / interactive border / hovered interactive border"를 구분. **shadcn은 이걸 `--border` 하나로 collapse.**
4. **텍스트 대비 보장** — step 11/12가 step 2에 대해 APCA Lc 60/90 보장. shadcn `--muted-foreground`는 *그냥 읽기 가능한 회색일 뿐*, 대비 보장 없음.
5. **light/dark symmetric** — step N의 *역할*은 모드 무관, 값만 뒤집힘.

### 2.5 "Borrow / Reject" 프레임 — 어디서 왔는가

10개 메이저 시스템 중 어느 곳도 *공식적으로* "X에서 차용 / Y는 거부" 프레임을 문서화하지 않았습니다. 가장 가까운 것은 Spectrum 공개 RFC 로그, Brad Frost의 비교 글 정도. **이 프레임은 AI 에이전트 디자인 실무자 커뮤니티에서 emerge한 패턴**이며, LLM이 명시적 negative space ("Y하지 마라")로부터 이득을 보기 때문에 작동합니다. tale-studio 문서에서는 이 프레임을 *house pattern*으로 채택하되, 차용한 컨벤션이 아니라 명시적 선택임을 알아두면 됩니다.

---

## 3. shadcn + Tailwind v4

### 3.1 채워둔 자리 (L1 + L2)

shadcn은 `globals.css`에 다음을 자동으로 셋업합니다 (`npx shadcn init` 기준):

**Surface + Text 토큰 (18개)**

| 변수 | Light | Dark | 역할 |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | 앱 캔버스 배경 (= Radix step 1) |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | 기본 텍스트 (= Radix step 12) |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | elevated surface (= Radix step 2) |
| `--card-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | 카드 위 텍스트 |
| `--popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | floating overlay |
| `--popover-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | popover 텍스트 |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` | 브랜드 surface (= Radix step 9) |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | primary 위 텍스트 |
| `--secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | 보조 액션 surface |
| `--secondary-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | secondary 텍스트 |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | subdued surface — **overloaded** |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | low-contrast text (= Radix step 11) |
| `--accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | hover/active for ghost interactions (= Radix step 4) — **only one step exposed** |
| `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | accent 텍스트 |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | 위험 색 — **`-subtle/-emphasis` 없음** |
| `--destructive-foreground` | (init에서 누락되기도) | — | destructive 위 텍스트 |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | **3개 Radix 역할 (6/7/8)을 하나로 collapse** |
| `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` | form border |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | focus ring |

**Radius 스케일** — `--radius: 0.625rem` 단일 스칼라 + `@theme inline`이 7개 step 자동 파생:
```css
--radius-sm: calc(var(--radius) * 0.6);   /* 6px */
--radius-md: calc(var(--radius) * 0.8);   /* 8px */
--radius-lg: var(--radius);                /* 10px */
--radius-xl: calc(var(--radius) * 1.4);   /* 14px */
--radius-2xl: calc(var(--radius) * 1.8);  /* 18px */
--radius-3xl: calc(var(--radius) * 2.2);  /* 22px */
--radius-4xl: calc(var(--radius) * 2.6);  /* 26px */
```

**Chart 토큰 (5개)** — `--chart-1..5`, 데이터 시각화용 + 사이드바 토큰 (8개) — `--sidebar*` (= 진짜 L3의 유일한 예시).

**컴포넌트 결정 baked-in**:
- Button variants (`default | secondary | destructive | outline | ghost | link`) + sizes (`default | sm | lg | icon`)
- Card: `bg-card text-card-foreground rounded-xl border shadow-sm`
- Focus-visible: `outline-ring/50` 모든 `*`에 `@layer base` 적용
- React 19+ `data-slot` attribute 시스템

### 3.2 비워둔 자리 (L3 — design.md 책임)

| 영역 | shadcn 입장 | design.md가 추가해야 |
|---|---|---|
| 앱 콘텐츠용 타입 스케일 | Tailwind `text-xs`..`text-9xl` 그대로 inherit, 시멘틱 매핑 없음 | 어느 size가 "패널 제목", "노드 라벨", "캡션"인지 |
| Font weight | 100~900 모두 가용 | 실제 사용하는 weight (보통 B2B 도구는 400/500/600 정도) |
| 컴포넌트 선택 룰 (Card vs Sheet vs Dialog vs Popover) | 컴포넌트 존재, 결정 트리 없음 | 캔버스 inspector는 Sheet? Popover? — tale-studio L0/Director canvas에 결정적 |
| 컴포넌트 간 spacing | "헤더와 본문 사이 gap-6" 같은 룰 없음 | 수직 리듬, 패널 padding, 그리드 gap, 폼 필드 spacing |
| Motion 토큰 | `tw-animate-css`가 애니메이션 제공, canonical `--duration-*` 없음 | 자체 `--duration-fast/base/slow`, `--ease-out` 정의 |
| Z-index 스케일 | 컴포넌트 hard-code (`z-50` for Dialog, `z-40` for Sheet) | 캔버스 프로젝트는 반드시 필요: `--z-canvas/popup/toolbar/modal` 사다리 |
| Shadow 시멘틱 | Tailwind `shadow-xs..2xl` inherit, "elevation 1/2/3" 의미 없음 | shadow를 surface에 매핑 (node card vs floating popover vs dialog) |
| Icon size 스케일 | 없음 | `size-4` (16px) 인라인, `size-5` (20px) 버튼, `size-6` (24px) toolbar — 픽스 |
| Empty / loading 패턴 | `Skeleton` primitive만 존재, 룰 없음 | 언제 skeleton vs spinner vs blank |
| Success / Warning / Info | **없음** (destructive만 ships) | `--success/-warning/-info` 토큰 추가 |
| 시각적 personality | 순수 컴포넌트 라이브러리, "borrow/reject" 프레임 없음 | 전적으로 자체 책임 |
| Density 모드 | 단일 density | B2B 캔버스 도구는 compact 모드 자주 필요 |

### 3.3 shadcn이 collapse한 곳 (L2 보강 필요)

1. **L1 layer가 아예 없음** — shadcn은 바로 L2부터 시작. `--primary`는 OKLCH 값이지 palette의 alias가 아님. 결과: "gray family" tweak이 모든 L2 변수 개별 편집 필요.
2. **`--border`가 3개 Radix 역할을 1개로 collapse** — step 6 (subtle separator), step 7 (interactive border), step 8 (hovered interactive border) 모두 `--border`. 실제 codebase에서 `border-border` 77번 사용 — divider/input/card 무차별.
3. **`--accent`는 hover/active 스케일의 한 step만 노출** — Radix step 4 (hover) + step 5 (active/selected)이 distinct 역할인데 shadcn은 collapse. codebase `bg-accent` 58번이 hover/selected/"좀 다른 회색 패널"을 다 cover.
4. **Surface depth가 ~4단계에서 끝남** — `--background / --card / --popover / --muted`, 게다가 depth 순서가 아닌 컴포넌트 태깅. Carbon `$background → $layer-01/02/03` (명시 ordinal depth)나 Material 3 `surface-container-lowest/low/normal/high/highest` (5단계 명시 depth)와 대조.
5. **role × emphasis 축 없음** — `--primary-subtle`, `--destructive-emphasis` 없음. Primer는 모든 polarity에 `-fg / -emphasis / -muted / -subtle` 그리드.
6. **focus ring 외 state token 없음** — `--primary-hover`, `--primary-active` 없음. Tailwind `hover:` variant + 같은 토큰의 opacity/brightness delta로 해결하는 컨벤션. hue shift엔 실패.

### 3.4 tale-studio용 L2 추가 권장 (예시)

shadcn 기본 ~22 색상 변수에서 ~50개로 확장 (Atlassian-class 폭, Carbon ~120/Material ~30×4 보다 적음):

```css
/* A. Surface 계층 (Radix 1-5 + ordinal depth) */
--surface-app           /* = --background */
--surface-subtle        /* = --card */
--surface-default       /* UI element bg at rest */
--surface-hover         /* step-3 hover */
--surface-active        /* step-3 pressed/selected */
--surface-elevated      /* = --popover */
--surface-overlay       /* modal backdrop alpha */

/* B. Border 계층 (Radix 6-8) */
--border-subtle         /* 비-interactive 구분선, 테이블 행 */
--border-default        /* 현 --border, input/card border */
--border-strong         /* hovered interactive border */
--border-focus          /* = --ring, 명시적 alias */

/* C. Text 계층 (Radix 11-12) */
--text-default          /* = --foreground */
--text-muted            /* = --muted-foreground */
--text-subtle           /* step 11 + 낮은 alpha — 타임스탬프, 캡션 */
--text-on-emphasis      /* = --primary-foreground, role-named */
--text-disabled         /* 명시적 disabled */

/* D. Emphasis/brand에 state suffix */
--primary-subtle / --primary-default / --primary-emphasis / --primary-on-emphasis
--destructive-subtle / --destructive-default / --destructive-emphasis / --destructive-foreground

/* E. Polarity vocabulary */
--success-subtle / --success-default / --success-emphasis / --success-foreground
--warning-subtle / --warning-default / --warning-emphasis / --warning-foreground
--info-subtle    / --info-default    / --info-emphasis    / --info-foreground

/* F. L3 — 진짜 deviation 있는 곳만 */
--node-bg-default / --node-bg-selected / --node-bg-hover
--node-border-default / --node-border-selected
--edge-stroke-default / --edge-stroke-selected
--canvas-bg            /* React Flow viewport */
--canvas-grid          /* dot/grid 색 */
```

### 3.5 Tailwind v4 알아야 할 quirk

1. **CSS-first config**: `tailwind.config.ts`가 거의 사라짐. 모든 토큰은 CSS의 `@import "tailwindcss"` + `@theme` / `@theme inline`.
2. **`@theme inline`** — CSS 변수를 다시 dereference. light/dark runtime swap에 필수. shadcn은 항상 inline 씀.
3. **토큰 → 유틸리티 자동 매핑** — `--color-{name}` → `bg-{name}` `text-{name}` `border-{name}` 자동 생성. `--radius-{size}` → `rounded-{size}`. 네이밍 규칙이 엄격함.
4. **dark mode 1줄**: `@custom-variant dark (&:is(.dark *));` 가 v3의 `darkMode: "class"`를 대체.
5. **OKLCH 기본** — v4는 빌트인 팔레트를 OKLCH로 출력. shadcn도 v4 migration에서 HSL→OKLCH 전환. 옛 글의 `hsl(var(--background))`는 **invalid CSS**가 됨 (조용히 transparent).
6. **`bg-card/50` opacity modifier** — 모든 색상 유틸리티에 작동, 커스텀 토큰 포함. `color-mix(in oklab, ...)` 사용.
7. **footgun**: `tw-animate-css` (← `tailwindcss-animate` deprecated), `data-slot` (← `forwardRef`), `@tailwindcss/postcss` (← old combo), `@custom-variant dark`는 `dark:` 사용 전에 와야 함.

---

## 4. 마스터 체크리스트

> 실제 `docs/design.md`를 작성할 때 tick-box처럼 사용. 각 항목은 "정량적 값이 명시되어야 한다"는 의미.

### 4.1 문서 메타데이터
- [ ] `name`, `version`, `last_updated` (ISO date), `owner`
- [ ] 1단락 **Overview / Brand & Style** (look, feel, 대상 유저, 정서적 톤)
- [ ] 명시적 **non-goals** ("우리는 consumer app이 아니다, B2B 내부 도구다")
- [ ] **canonical implementation file** 포인터 (`src/app/globals.css`)
- [ ] design.md vs 코드가 충돌할 때 **single source of truth** (보통 코드가 이김)

### 4.2 Typography
- [ ] Font families: **UI sans, UI mono, display** (구분되면), 전체 `font-family` fallback stack
- [ ] Font loading 전략 (`next/font`, `font-display: swap`, preload 리스트)
- [ ] **Type scale** — 각 step: size (rem 권장), line-height (unitless), letter-spacing (em or px), 기본 weight, 기본 case
- [ ] **Weight palette** — 실제 사용 weight (예: 400/500/600/700)
- [ ] **Letter-case 룰** (sentence / title / ALL CAPS+tracking)
- [ ] **Per-context assignment 표** — h1/h2/body/label/caption/code/button/table cell 각각 어느 step
- [ ] **Numeric variants** — 테이블 `tabular-nums` 강제 (tale-studio shot list에 중요)
- [ ] **Truncation 룰** — 언제 line-clamp, 언제 wrap
- [ ] **Min/max font-size** at responsive 극단
- [ ] **한국어/CJK fallback** (tale-studio bilingual)

### 4.3 Spacing
- [ ] **Base unit** (4px 표준)
- [ ] **Spacing scale** — 각 named step + px (T-shirt or numeric; 둘 다 쓰지 말 것)
- [ ] **Inner padding per component** — button (sm/default/lg), input, select, card, dialog, sheet, popover, tooltip, badge
- [ ] **Stack gap defaults** — 폼 필드, 리스트 아이템, 섹션, 카드, 페이지 헤더
- [ ] **Inset 룰** — 페이지 edge, 카드 edge, 모달 edge, popover edge
- [ ] **`gap` vs `margin` vs `padding` 정책**
- [ ] **Section spacing** at each breakpoint (모바일은 데스크탑의 절반인 경우 多)

### 4.4 Sizing & dimensions
- [ ] **Container max-width** per breakpoint (또는 single max + responsive padding)
- [ ] **Page shell** — header 높이, sidebar (expanded + collapsed), footer
- [ ] **Modal sizes** — sm/md/lg/xl/full (px or rem)
- [ ] **Form control 높이** — input/select/button — **반드시 같은 행에서 정렬**
- [ ] **Min tap target** — 44×44 mobile (HIG), 24×24 desktop pointer
- [ ] **Avatar sizes** — xs/sm/md/lg/xl
- [ ] **Icon sizes** — 12/16/20/24/32 px
- [ ] **Logo/brand-mark** 사이즈 per placement

### 4.5 Color (토큰은 별도 정의, design.md는 *역할*을 enumerate)
- [ ] **Brand primary** (단일 hex/oklch + token alias)
- [ ] **Semantic state colors** — success / warning / error / info / neutral
- [ ] **Surface ladder** — base canvas + N elevation 레벨
- [ ] **Text color tiers** — primary / secondary / tertiary / disabled / inverse
- [ ] **Border tiers** — default / subtle / strong / focus
- [ ] **Focus ring** — color, width (px), offset (px), style
- [ ] **Interaction-state delta** — hover, active/pressed, selected, focused (shade step delta or opacity)
- [ ] **Disabled treatment** — dedicated token vs opacity (하나 commit)
- [ ] **Dark mode 대응** 모든 token
- [ ] **Color-blind 안전 룰** — 색만으로 상태 전달 금지 (icon + label 페어 강제)
- [ ] **Forbidden colors** — 명시적 do-not-introduce 리스트 (Linear: "second chromatic accent 금지")

### 4.6 Radius
- [ ] **Radius scale** — none/sm/md/lg/xl/full + px
- [ ] **Per-component assignment** — button md, card lg, input md, badge full
- [ ] **Nesting 룰** — inner radius ≤ outer
- [ ] **Pill threshold** — 언제 full-rounded 허용 (badge/chip, CTA는 절대 불가)

### 4.7 Shadow / Elevation
- [ ] **Shadow scale** — none/sm/md/lg/xl + 전체 `box-shadow` CSS 값 (multi-layer)
- [ ] **Per-component elevation map** — card sm, popover md, dialog lg, toast md
- [ ] **Dark mode shadow 전략** — 보통 border로 교체 (어두운 배경에서 shadow 안 보임)
- [ ] **Inset shadow** — input, pressed state

### 4.8 Border
- [ ] **Width scale** — 0/1/2/4 px
- [ ] **Border vs background vs shadow** 분리 정책
- [ ] **Hairline color** (1px subtle) — 별도 토큰 권장

### 4.9 Motion
- [ ] **Duration scale** — 50/100/150/200/300/500ms (또는 M3 short1..long4)
- [ ] **Easing curves** — standard, emphasized, decelerate, accelerate (cubic-bezier 모두)
- [ ] **Per-interaction recipe 표** — button press, dialog open/close, toast in/out, popover open, page transition, skeleton pulse, accordion expand
- [ ] **Reduced-motion 정책** — `prefers-reduced-motion`: opacity-only, 절반 duration, 또는 disable
- [ ] **Disallow 리스트** — parallax 금지, auto-play 금지, bouncy spring은 캔버스 drop에만

### 4.10 Z-index
- [ ] **Named layer 사다리** with 숫자 값
- [ ] **룰**: literal `z-50` 절대 금지, 항상 named token 참조
- [ ] **Portal 전략** — Radix가 dialog/popover/tooltip/toast를 portal로 body root에 escape

### 4.11 Breakpoints
- [ ] **Named breakpoints** + px (Tailwind v4 default: 640/768/1024/1280/1536)
- [ ] **Mobile-first vs desktop-first** 선언
- [ ] **Container behavior** per breakpoint
- [ ] **`@container` queries** 사용 룰

### 4.12 States 매트릭스 (AI slop의 80% 발생 지점)

각 interactive 컴포넌트에 대해 enumerate:

- [ ] **Default** — 휴식 baseline
- [ ] **Hover** — pointer over (desktop only — touch에 hover 금지)
- [ ] **Active / pressed** — pointerdown, 잠시 visible
- [ ] **Focus** — focus, 키보드 아닌 경우 (rare; 보통 skip)
- [ ] **Focus-visible** — 키보드 focus (ring 필요)
- [ ] **Selected** — 지속 선택 상태
- [ ] **Disabled** — 비-interactive
- [ ] **Loading** — async 진행
- [ ] **Error** — invalid input 또는 실패 액션
- [ ] **Success** — 완료 액션
- [ ] **Empty** — 콘텐츠 없음
- [ ] **Read-only** — disabled와 distinct

### 4.13 Layout primitives
- [ ] **Page shell** — header + sidebar + content + footer 치수
- [ ] **Card anatomy** — header / body / footer / actions padding
- [ ] **Modal anatomy** — header / scroll body / footer (LTR primary 오른쪽)
- [ ] **Form anatomy** — label position, helper position, error position, required indicator
- [ ] **List/table density** — compact / default / comfortable 행 높이
- [ ] **Empty-state pattern** — icon size, gap, 메시지 max-width, CTA optional
- [ ] **Loading pattern** — skeleton vs spinner vs progress 결정 룰
- [ ] **Error pattern** — inline (필드별) vs banner (폼 상단) vs toast (transient)

### 4.14 Iconography
- [ ] **Icon library** — Lucide (shadcn default) — 단일 소스 선언
- [ ] **Icon sizes** — 16/20/24 px with `size-*` 유틸리티
- [ ] **Stroke width** — Lucide default 2; size별 변경 여부
- [ ] **Icon + label 페어링** — icon-only 허용 조건 (반드시 aria-label + tooltip)
- [ ] **Custom-icon 정책** — 언제 새로 그릴 vs Lucide에서 찾을지

### 4.15 Imagery
- [ ] **Aspect ratios** — 1:1 (avatar), 4:3, 16:9 (video preview), 9:16 (mobile video), 21:9 (cinematic) — 표면별 선언
- [ ] **Placeholder 전략** — skeleton / blurhash / solid color / gradient
- [ ] **Background image vs content image** 구분
- [ ] **압축 / 포맷** — AVIF > WebP fallback, PNG for transparency

### 4.16 Content / voice
- [ ] **Button label format** — verb-first imperative ("Create scene", not "Scene creation")
- [ ] **Sentence case vs Title Case** — 하나 commit
- [ ] **Empty-state copy template** — 뭐가 없는지 + 왜 + 다음 액션
- [ ] **Error-message format** — 뭐 실패 + 왜 + 어떻게 수정
- [ ] **Loading copy** — generic "Loading…" vs verb-specific ("Generating shot list…")
- [ ] **Date / time / number format** — locale defaults, abbreviation 룰
- [ ] **Truncation indicator** — ellipsis vs "Show more"

### 4.17 Canvas-specific (tale-studio React Flow)

L0 Concept Canvas와 Director Canvas가 주 surface인 만큼 React Flow 정량 룰 필수:

- [ ] **Node sizes** — min/default/max width per node type
- [ ] **Node padding** — header / body / port-zone
- [ ] **Edge stroke width** — default + selected + invalid
- [ ] **Edge color tokens** — default / selected / hover / invalid
- [ ] **Port size & hit area** — visual size vs interactive zone
- [ ] **Grid snap** — px (8 표준)
- [ ] **Selection halo** — ring width + color + offset
- [ ] **Pan/zoom defaults** — min/max zoom, fit-padding, scroll behavior
- [ ] **Background pattern** — dots vs grid vs lines, size, color
- [ ] **Empty canvas state** — 노드 없을 때
- [ ] **Minimap dimensions & node colors**

---

## 5. 실행 계획

### 5.1 의존성과 채우는 순서

토큰은 의존성이 있다. 잘못된 순서로 채우면 재작업 발생. 권장 순서 4 phase:

#### Phase 0 — Foundations (모든 것을 unblock)
1. **문서 메타데이터** — name, owner, source-of-truth pointer
2. **Color tokens** (기존 `globals.css` 작업) — design.md에서는 *cross-reference*만, 복제 금지
3. **Spacing base unit + scale** — 다른 모든 dimension이 이걸 참조
4. **Typography family + weight palette** — load 결정은 미룰 수 없음 (FOUC/CLS)
5. **Breakpoints** — 반응형 로직 lock

#### Phase 1 — Visual primitives (컴포넌트를 unblock)
6. **Type scale** (family 의존)
7. **Radius scale** (의존 없음)
8. **Border widths** (의존 없음)
9. **Shadow scale** (color 의존)
10. **Sizing: control-heights** (spacing 의존 — button/input/select 정렬 필수)

#### Phase 2 — Behavior (인터랙션을 unblock)
11. **Motion: durations + easings** (의존 없음)
12. **Z-index 사다리** (의존 없음)
13. **States 매트릭스** (color, motion, focus-ring 의존)

#### Phase 3 — Composition (스크린을 unblock)
14. **Layout primitives** — page shell, card/dialog/form anatomy (spacing, type, sizing 의존)
15. **List/table density** (spacing 의존)
16. **Empty/loading/error 패턴** (type, color, motion 의존)

#### Phase 4 — Polish
17. **Iconography** (Lucide 이미 de facto, 그냥 문서화)
18. **Imagery 룰**
19. **Content / voice**
20. **Canvas 컨벤션** (color, motion, radius, shadow 모두 의존 — 마지막에)

### 5.2 미룰 수 있는 것 / 미루면 재작업 나는 것

**미룰 수 있는 것**:
- Imagery 포맷 — 실제 이미지 ship할 때 결정
- Content voice 디테일 — "sentence case + verb-first"로 부트스트랩 후 refine
- Korean/CJK fallback — bilingual 출시 직전까지 미룰 수 있음

**미루면 재작업**:
- Spacing base unit — 모든 컴포넌트가 여기서 padding 추출
- Control-height alignment 룰 — 나중에 고치려면 모든 폼 다시 봐야 함
- Focus ring spec — 접근성, 매우 visible
- States 매트릭스 — AI slop 주 생성기
- Z-index 사다리 — 프로젝트 중간에 portal 겹침 고치는 거 고통스러움

### 5.3 산출물 — 단계별 결과물

| Phase | 산출물 |
|---|---|
| Phase 0 | `docs/design.md` 1.x 섹션 (Overview, Color reference, Spacing scale, Typography foundation, Breakpoints) |
| Phase 1 | `docs/design.md` 2.x 섹션 (Type scale, Radius, Border, Shadow, Sizing) |
| Phase 2 | `docs/design.md` 3.x 섹션 (Motion, Z-index, States matrix) |
| Phase 3 | `docs/design.md` 4.x 섹션 (Page shell, Card/Dialog/Form anatomy, Empty/Loading/Error patterns) |
| Phase 4 | `docs/design.md` 5.x 섹션 (Iconography, Imagery, Voice, Canvas conventions) + `docs/design-references.md` (정성 reference) |

---

## 6. Harness 결합

design.md가 잘 작성되어 있어도 **Claude가 작업 중 실제로 참조하지 않으면** 의미 없습니다. 8개 메커니즘 비교 후 3-layer combo 권장.

### 6.1 8개 메커니즘 비교

| # | 메커니즘 | 강제 reliability | 세션당 context 비용 | 셋업 복잡도 | 주 failure mode |
|---|---|---|---|---|---|
| 1 | Per-dir `CLAUDE.md` + `@import design.md` | ~70% | 높음 (UI subtree 읽을 때마다) | 낮음 (2 file) | `/compact` 후 사라짐, write에 트리거 안 됨 |
| 2 | `.claude/rules/design.md` + `paths:` | ~75% | 중간 (glob match에만 로드) | 낮음 (1 file) | 여전히 guidance, enforcement 아님 |
| 3 | Skill: `design-system` | ~80% auto, 100% manual | 낮음 (lazy-load) | 낮음 (1 dir) | indirect prompt에서 auto-invocation 놓침 |
| 4 | Hook `UserPromptSubmit` 키워드 injector | UI prompt에 ~90% | 매우 낮음 (10 line 추가) | 중간 (hook + script + 키워드 튜닝) | 키워드 miss; injection 무시 |
| 5 | Hook `PreToolUse(Write\|Edit)` enforcer | **~100%** | 낮음 | 중간-높음 (hook + 세션 marker + 버그 검증) | 비-visual `.tsx`에서 friction; 버그 위험 |
| 6 | Subagent `frontend-designer` | auto-delegate ~85%, manual 100% | 매우 낮음 (isolated) | 중간 (1 agent + CLAUDE.md delegation) | main thread가 delegation 스킵 |
| 7 | shadcn CLI wrapper / PostToolUse | n/a for consultation; design.md *currency* ~95% | 무시 가능 | 낮음-중간 | read-on-edit 강제 못함 |
| 8 | MCP Figma server | n/a current team | 가변 | 높음 | tale-studio엔 Figma 캐논 소스 없음 |

### 6.2 추천 3-layer combo

#### Layer A — `.claude/rules/design.md` with `paths:` (cheap passive)
**왜 먼저인가**: hook 복잡도 0, glob scope, git share. **load-bearing 10줄** (5 hard rules + "we are NOT" 리스트)을 design.md를 *가리키는 게 아니라 rule body에 직접 inline*. 그래서 Claude가 design.md를 안 열어도 핵심 제약은 컨텍스트에 있음.

```yaml
---
paths:
  - "src/**/*.{ts,tsx}"
  - "src/app/**/*.{tsx,css}"
  - "src/components/**/*"
---

# Design rules for UI work in tale-studio

UI 작업 전 반드시 `docs/design.md`와 `docs/design-references.md`를 읽으세요
(아직 이번 세션에 읽지 않았다면).

특히:
- 토큰은 `src/app/globals.css` (shadcn CSS variables).
- 캔버스 확장 토큰 (`--canvas-*`, `--node-*`, `--edge-*`)은 design.md §canvas;
  새로 만들지 마세요.
- "We are NOT Higgsfield" — glassmorphism 금지, neon glow 금지, 캔버스 노드에 shadow 금지.
- Geist Mono는 camera-axis 값과 render ID에 필수.
- Dark-first with light parity. light-only로 만들지 마세요.
```

#### Layer B — Hook `UserPromptSubmit` keyword injector (deterministic prompt-time)
**왜 두 번째인가**: Layer A는 file-read 시점에 fire. 그 전에 prompt가 UI 작업을 시사하면 미리 inject. 결정적 (~5ms grep), 정밀.

```bash
#!/usr/bin/env bash
PROMPT=$(jq -r '.prompt // ""' < /dev/stdin)
KEYWORDS='component|page|screen|button|form|modal|sheet|popover|dialog|card|shadcn|tailwind|tsx|style|theme|token|color|spacing|layout|design|canvas|node'

if echo "$PROMPT" | grep -iEq "$KEYWORDS"; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "UI work detected. docs/design.md를 반드시 consult하세요. Key constraints: dark-first with light parity; ONE accent (warm cinema-orange) for CTAs only; Geist Mono for camera-axis values; no shadows on canvas nodes; use canvas extension tokens (--canvas-*, --node-*, --edge-*); Higgsfield-style glassmorphism 금지. design.md를 이번 세션에 안 읽었다면 지금 읽으세요."
  }
}
EOF
fi
exit 0
```

#### Layer C — Skill `design-system` with `paths:` (manual fallback + long process)
**왜 세 번째인가**: 사용자 수동 `/design-system` 레버, auto-paths가 fire 안 한 경우의 safety net. 긴 design.md reference + process는 skill 본문에 (Layer A는 짧은 hard constraints만).

```yaml
---
description: tale-studio UI 작업을 위한 디자인 시스템 룰과 토큰. 컴포넌트/페이지/스크린 빌드, shadcn 컴포넌트 추가, Tailwind 스타일링, src/components/ 또는 src/app/ 하위 .tsx 작업, "design"/"style"/"component"/"page"/"layout"/"color"/"spacing"/"token" 멘션 시 사용.
when_to_use: UI 빌드, shadcn 컴포넌트 추가, 페이지 스타일링, 캔버스 노드 비주얼 생성, 토큰 수정
paths:
  - "src/**/*.{tsx,css}"
allowed-tools: Read Grep Glob
---

# tale-studio design system

UI 코드 작성 전 `@docs/design.md`와 `@docs/design-references.md` 로드.

## 5 hard rules (사용자 명시 지시 없이 위반 금지)
1. Dark-first with light parity. light-only 금지.
2. One accent (warm cinema-orange) — CTA + active state만.
3. Geist Mono — camera-axis values, render IDs, frame numbers.
4. 캔버스 노드 shadow 금지. Hairline 1px border만.
5. 캔버스 확장 토큰 사용. 새 토큰 만들지 말 것.

## "We are NOT" exclusion list
- NOT Higgsfield (glassmorphism, neon 금지)
- NOT community/open-source 미감 (n8n 카테고리 배너 금지)
- NOT consumer-creator (light-first, marketing gradient 금지)
- NOT Vercel-extreme (pure #000 금지 — warm near-black)

## Process
1. design.md 안 읽었으면 읽기
2. 관련 토큰 세트 식별 (form / surface / canvas)
3. shadcn primitive로 생성 — 캔버스 확장 외엔 custom CSS 금지
```

### 6.3 명시적으로 거부한 메커니즘

- **Mechanism 5 (`PreToolUse` enforcer)** — daily UI iteration에 friction 큼, exit-code-2 버그 ([issue #24327](https://github.com/anthropics/claude-code/issues/24327)) 위험. **Layer A+B+C consultation rate가 90% 미만으로 떨어지면 재고.**
- **Mechanism 6 (subagent)** — 유용하지만 delegation friction. design.md 안정화 후 도입.
- **Mechanism 1 (per-dir CLAUDE.md)** — Mechanism 2 (paths-scoped rule)이 우월. 같은 효과, 더 tight scope.
- **Mechanism 7** — design.md *currency 유지*용으로만 (consultation 강제 아님). 별도 시스템.
- **Mechanism 8** — Figma source 생기면 재검토.

### 6.4 마이그레이션 경로

1. **D-0 (오늘)**: `.claude/rules/design.md` 추가 — paths + inline 10줄 핵심 제약 (Layer A).
2. **D-0**: `.claude/hooks/inject-design.sh` 추가 + `.claude/settings.json`에 `UserPromptSubmit` 후크 wiring (Layer B).
3. **D-0**: `.claude/skills/design-system/SKILL.md` 추가, `@docs/design.md` reference (Layer C).
4. **1주일 운영**: miss observed 시 **Layer B 키워드 리스트부터 튜닝** (heavy `PreToolUse` enforcer로 가지 말 것).

### 6.5 컨텍스트 비용 예측

- **non-UI 세션**: ~0 tokens (paths가 fire 안 함, skill 안 로드, hook이 nothing inject)
- **UI 세션**: rule ~50줄 + skill ~200줄 = ~250줄, CLAUDE.md 200줄 가이드라인 내

---

## 부록 A. Reference 분석

5개 reference 선정 — info-dense B2B chrome (Linear), 직접 경쟁 카테고리 (Higgsfield), 시네마틱 media-rich (Runway), monochrome 정밀 (Vercel/Geist), working node-graph editor (n8n). 명시적으로 거부한 후보: Figma (consumer-creative), Frame.io (review), Tldraw (whiteboard), Loom/CapCut (consumer), Cursor/Notion AI (no canvas dominance), Retool (admin-panel), Pitch (off-domain).

### A.1 Linear

- **Identity**: 소프트웨어 팀 이슈 트래커. 시각적으로 dark background, Inter Variable + 매우 tight letter-spacing, indigo+lime accent, shadow 없음, hairline 1px border, Cmd-K muscle memory.
- **완 차용**:
  1. **Typography 시스템** — Inter Variable + negative letter-spacing (-0.22px display, -0.11px body). 5-studio info-dense 제품에 dense-but-not-cramped feel.
  2. **"Structure should be felt, not seen"** — 2026 refresh가 구분선/모서리 부드럽게. 두 캔버스가 main인 우리에겐 chrome이 사라져야 그래프가 읽힘.
  3. **Keyboard-first command surfaces** — Cmd-K palette + property picker. "Create scene", "Add character asset" flow에 직결.
- **좀 차용**: indigo+lime accent. 하지만 우리는 video-domain accent (warm cinema-orange).
- **거부**:
  - cool-blue legacy palette — 비디오 제품엔 너무 SaaS-trackerey.
  - 매우 text-heavy issue-row density — 우리는 canvas-first.
- **shadcn 토큰 시프트**: `--background`를 warm near-black (Woodsmoke 계열), `--muted` chroma ~3% saturation, `--border` 단일 low-alpha hairline (~10% white on dark), `--primary`는 CTA 전용 단일 hot accent, `--ring` = `--primary` at 50% alpha.
- **출처**: [Linear brand](https://linear.app/brand), [behind the refresh](https://linear.app/now/behind-the-latest-design-refresh)

### A.2 Higgsfield

- **Identity**: 직접 경쟁 — node-based AI video pipeline ("AI Canvas"). glassmorphic, cool dark `#0A0A0F`, neon-edged 3D 반투명 아이콘. AI-filmmaker creator 대상.
- **완 차용**:
  1. **Node-as-model 패러다임이 사용자에게 친숙** — node graph가 AI video tooling에 존재한다는 재교육 필요 없음. **Concept 채용, 명시적으로 inversion** — 그들의 node = model, 우리 node = entity (Character/World/Scene). 친숙함은 온보딩에 도움, inversion이 우리 차별화 메시지.
  2. **Generation-as-credit 시각 피드백** — 그들의 UI는 어느 노드가 크레딧 쓰는지 명확. B2B에 finance owner 있으면 동일하게 visible.
- **좀 차용**: `#0A0A0F` 다크 배경. 우리는 약간 *덜* cool, 좀 더 warm.
- **거부**:
  - **Glassmorphism / neon glow / liquid-glass 3D icons** — prosumer-AI-creator 미감. B2B agencies엔 "quiet info-dense"가 신뢰감. Glass blur는 50+ 노드에서 스캔 어려움.
  - In-product marketing-tier hero canvas — 매일 쓰기엔 시끄러움.
- **shadcn 토큰 시프트**: `--card`를 `bg-white/5` + `backdrop-blur`, luminous `--ring` (high-chroma neon). **우리는 의도적으로 거부**하지만, contributor drift를 인지하기 위해 알아둘 가치.
- **출처**: [Higgsfield Canvas](https://higgsfield.ai/canvas-intro)

### A.3 Runway

- **Identity**: Gen-4/4.5 AI 비디오 플랫폼. "시네마틱 dark UI, media-rich layout". 큰 미디어 타일, asset library, LCH 튜닝된 dark surface로 비디오 썸네일이 정확하게 보임.
- **완 차용**:
  1. **Media-first surface treatment** — asset 카드는 생성된 프레임이 숨쉬게. 최소 chrome, no clip-card decoration, flat dark slate. Artist (character/world 썸네일)과 Editor (video clip)에 critical.
  2. **Perceptual uniformity 튜닝된 dark surface** — Frame.io V4의 LCH 작업, Runway 대시보드 모두: 비디오가 콘텐츠일 때 *UI shadow나 saturated panel이 perceived frame color를 오염시키지 않게*. 배경은 neutral-warm dark.
  3. **Theme toggle is real** — light + dark + system. B2B agency 도구는 양쪽 다 — 클라이언트가 어느 모드로 데모 녹화할지 모름.
- **좀 차용**: "creative suite home" 대시보드 배치 (tools + community + saved) — community는 안 필요, "tools row above projects row" 패턴은 Producer 랜딩에 적합.
- **거부**:
  - 무거운 마케팅 카피 / hero gradient 인-프로덕트.
  - Featured-content 캐러셀 — 내부 도구엔 distraction.
- **shadcn 토큰 시프트**: `--background`를 neutral warm-dark (~OKLCH L=0.12, low chroma); `--card`가 essentially `--background`와 같고 1px `--border`만 분리 (no elevation); `--muted-foreground`가 약간 warm gray로 skin-tone 썸네일 옆에서 green으로 안 읽힘.

### A.4 Vercel (Geist)

- **Identity**: 개발자 플랫폼. "aggressive reduction" — pure black/white, Geist Sans + Geist Mono, status/links/errors 외 거의 무색, 일러스트 대신 스크린샷·기하 도형.
- **완 차용**:
  1. **"Color only when it carries meaning"** — status pill, error state, generation-in-progress = 색. 나머지 = grayscale. 캔버스 제품에 perfect — chrome이 콘텐츠와 경쟁하지 않음.
  2. **Geist Mono for technical readout** — 우리 `CameraConfig`는 -10..+10 6축. 토큰 ID, 패널 스크럽 값, 렌더 큐 ID — 모두 mono. "professional tooling" 신호.
  3. **Aggressive monochrome dashboard** — settings, billing, project-list, asset library = pure grayscale. 색 예산을 canvas node와 generation status에 보존.
- **좀 차용**: *light* mode treatment. 우리는 dark-first지만 Zoom 데모용 parity.
- **거부**:
  - Pure `#000`/`#FFF` 극단 — 비디오 썸네일 옆 absolute black은 banding artifact. Linear의 warmer near-black 사용.
  - "no illustrations, ever" 룰 — 비-엔지니어 agency 사용자 onboarding엔 일부 다이어그램 일러스트 필요.
- **shadcn 토큰 시프트**: `--primary` 사용 폭 대폭 좁힘 (CTA + active만); `--foreground`를 약간 warm `oklch(0.96 0.005 80)` (pure white 대신); `--accent`를 status-color slot (info/blue)에 매핑; `--mono` font token을 `--font-sans` 옆에.

### A.5 n8n

- **Identity**: 오픈소스 워크플로 자동화. working-class 노드 에디터 — 3-패널 (palette 좌, canvas 중앙, properties 우), dotted gray grid, 카테고리별 컬러 노드, properties 패널의 progressive disclosure. 안 예쁘지만 50+ 노드에서 매우 *조작 가능*.
- **완 차용**:
  1. **3-패널 캔버스 레이아웃** — palette 좌 (Character Asset/Scene/Shot drag), canvas 중앙, properties 우. Artist (L0 Concept Canvas)와 Director (Director Canvas) **정확한 스켈레톤**. 재발명 금지.
  2. **Dotted grid 배경** — 저비용, "이건 편집 가능 캔버스"로 즉시 readable, 노드 콘텐츠와 경쟁 안 함. React Flow 표준 패턴; dot 색은 `bg + 4% lightness`로 zoom-out 레벨에서 barely visible.
  3. **노드 config의 progressive disclosure** — 노드 클릭 → 우측 properties slide-in. modal hell 회피. n8n 최근 실험은 "leave canvas 없이 노드 편집" — 우리도 (double-click 인라인 편집).
- **좀 차용**: 노드 타입의 categorical color coding — Asset vs Scene vs Shot에 유용하지만 n8n의 loud 카테고리 팔레트보다 saturation 훨씬 낮춤. "tinted outline"이지 "filled banner"가 아님.
- **거부**:
  - 커뮤니티-flavored 시각적 거침 (불균일 아이콘 weight, 혼합 border radius, 약간 chaotic 팔레트). n8n은 오픈소스로 보임. 우리는 paid-B2B로 보여야.
  - n8n의 밝은 pink/orange 노드 accent — 너무 playful.
- **shadcn 토큰 시프트**: shadcn 표준 set 밖에 *canvas-specific* 토큰 도입 — `--canvas-bg`, `--canvas-dot`, `--node-border`, `--node-border-selected`, `--edge-default`, `--edge-active`. design.md에 documented extension으로.

### A.6 종합 — tale-studio personality

> tale-studio는 **quiet, info-dense, dark-first B2B craft tool** for video professionals. Linear의 typographic 정밀함과 keyboard-first muscle memory; Vercel/Geist의 aggressive monochrome 절제 (색은 의미 carry할 때만); Runway의 media-respectful neutral-warm dark surface (생성 프레임이 정확하게 읽힘); n8n의 pragmatic 3-패널 canvas 스켈레톤 + progressive-disclosure properties 패널; AI-video-native 사용자 온보딩을 위한 Higgsfield 노드-그래프 친숙성 — 하지만 그들의 패러다임 inversion (노드 = 엔티티, 모델 아님) + glassmorphic neon prosumer 미감 거부. 제품은 *프로덕션 스튜디오의 내부 도구*처럼 느껴져야지, consumer creator app이 아님.

**"We are NOT" 리스트**:
1. **NOT Higgsfield** — glassmorphism, neon edge-glow, volumetric 3D icon, liquid-glass surface, creator-prosumer flourish 금지.
2. **NOT 커뮤니티-flavored 오픈소스 도구** — 불균일 아이콘, 혼합 radius 카드, saturated 카테고리 배너 색 금지 (n8n).
3. **NOT consumer creative app** — light-mode-first 금지, 모든 empty state에 playful 일러스트 금지, in-product marketing-hero gradient 금지.
4. **NOT marketing-tier 대시보드** — featured 캐러셀, large hero 모듈 in-studios 금지 (Producer 랜딩에만 max).
5. **NOT pure-black Vercel-extreme** — pure `#000` 옆 skin-tone 비디오 프레임은 banding 생산. 우리는 *warm* near-black.

**Directional brief** (token table 아님 — 방향성):
- **Mode**: dark-first, full light parity. Theme switch day 1.
- **Color**: monochrome warm-neutral foundation (Linear/Vercel-style). **단일** primary accent — credit-spending / generation-triggering CTA만 (warm cinema-orange 방향, Linear lime 아님, Higgsfield cyan 아님 — domain-fit). 상태 색 (success/warn/error/info)은 status pill, edge-active state, toast feedback에만. **색은 의미 carry, 장식 안 함.**
- **Typography**: Geist Sans 또는 Inter Variable UI; **Geist Mono 강제** for camera-axis, render ID, token name, frame number, timecode. Tight letter-spacing on body (Linear-style ~-0.01em). Base 14px, 13/12 보조, 11px mono micro-readout 예약.
- **Density**: chrome은 info-dense (Linear), media tile 주변은 generous (Runway). 캔버스 표면 자체가 *콘텐츠* — 주변 chrome 최소.
- **Surfaces**: flat. Hairline 1px border. **캔버스 노드 shadow 금지.** Overlay/popover에만 single subtle shadow.
- **Canvas tokens**: shadcn 표준 7-변수 외 extension namespace (`--canvas-*`, `--node-*`, `--edge-*`). 5 studio 중 2개에 load-bearing이므로 design.md에 first-class 문서화.
- **Iconography**: stroke 1.5, 16/20px, no fill, 단일 weight, 단일 radius (lucide; phosphor/hero와 mix 금지).
- **Motion**: sub-200ms easing; no spring bounce; canvas pan/zoom React Flow default; "generating" state는 subtle pulse, loud spinner 금지.

---

## 부록 B. Anti-patterns (37가지 AI slop 발생 지점)

### B.1 토큰/스케일 (1-5)
1. **컴포넌트 코드에 raw hex** — design.md에 "no raw hex" 안 적으면 토큰 명이 불명할 때 `#fafafa` 붙임
2. **다중 네이밍 컨벤션** — 같은 스케일에 T-shirt (`sm/md/lg`) *and* numeric (`100/200/300`). 하나만 commit
3. **Fallback stack 누락** — `font-family: Inter` no fallback → Linux dev에서 Arial
4. **Spacing scale에 gap** — `4, 8, 16, 32` (12, 24 skip) → 에이전트가 20px 발명
5. **Token alias 매핑 없음** — `--primary` 존재한다고만 하고 light/dark hex 안 적음 → Claude가 contrast verify 못함

### B.2 Typography (6-10)
6. **Line-height per step 누락** — `text-4xl`에 Tailwind default `leading-7` → 헤딩이 본문처럼
7. **Display tier letter-spacing 없음** — 48px headline at 0 tracking, 안 다듬어 보임
8. **Numeric variant 룰 없음** — digit 폭 변화로 테이블 jitter
9. **Case 룰 없음** — 같은 페이지에 "Create Scene"/"create scene"/"CREATE SCENE"
10. **Per-context 할당 없음** — 에이전트가 버튼 라벨에 `text-2xl` ("느낌상 중요해서")

### B.3 Spacing (11-14)
11. **`space-y-*` 도처에** — Tailwind `space-y`는 sibling margin, `gap`과 compose 안 됨. flex/grid엔 `gap` 선택
12. **Padding 축 혼합** — 버튼 `px-4 py-3` vs 인풋 `px-3 py-4` → 시각 misalignment
13. **Section spacing 없음** — 페이지 수직 collapse, between-sections gap spec 부재
14. **Negative margin "fix"** — 항상 코드 스멜. design.md에서 특정 레시피 외 금지

### B.4 Color & State (15-19)
15. **Disabled spec 없음** — `opacity-50` 사용 + loading에도 opacity 사용 → 구분 불가
16. **`hover:opacity-80` 만능 hover** — 싸 보임, 이미 faded text에서 실패
17. **Focus ring offset 없음** — ring이 element에 닿음 → 밀집 표면에서 contrast 실패
18. **상태를 색만으로 전달** — error에 빨간 텍스트만, icon 없음 → color-blind 실패
19. **Dark mode shadow 전략 없음** — shadow가 dark에서 invisible, flat 안 보일 곳이 flat

### B.5 Motion (20-23)
20. **`transition-all duration-300`** — `height`/`width`/`color`/`transform` 동시 애니메이션 → janky
21. **Reduced-motion fallback 없음** — WCAG 2.3.3 위반, vestibular disorder 사용자 어지러움
22. **B2B에 bouncy spring** — 사용자가 장난감처럼 인식
23. **Enter/exit 같은 duration** — exit는 enter의 ~50%여야 (안 그러면 sluggish)

### B.6 Layout / 구성 (24-28)
24. **Empty-state 패턴 없음** — 리스트 비었을 때 `null` 렌더 → "white screen of nothing"
25. **Error-state spec 없음** — alert()로 ship 또는 silently 삼킴
26. **Loading 결정 룰 없음** — 버튼에 skeleton, 리스트에 spinner, tooltip에 progress — 모두 틀림
27. **Modal scrolling 미명세** — small screen에서 header/footer가 viewport 밖
28. **Form action 왼쪽에** — LTR에서 primary CTA는 오른쪽

### B.7 Content (29-32)
29. **"Click here" / "Submit" 버튼** — 비-descriptive, screen reader 실패
30. **문장 중간 Title Case** — "Save Changes To Project" + "Save changes" 혼합 → 두 제품처럼 보임
31. **Generic "Loading…"** — verb-specific copy ("Generating shots…")가 perceived wait를 절반
32. **수정 방법 없는 에러** — "Something went wrong" → 사용자에게 0 정보

### B.8 Process (33-37)
33. **design.md가 코드의 token 값 복제** — 즉시 stale. design.md는 *name 참조* + 스케일 + 룰 pin; raw hex/px는 코드에
34. **Owner 필드 없음** — 누구나 편집, 누구도 검증 안 함, 엔트로피 증가
35. **"Non-goals" 리스트 없음** — 에이전트가 시스템에 없어야 할 것 발명 (Notion "장식 gradient", Linear "두 번째 accent")
36. **"Last updated" 날짜 없음** — old design.md + 새 코드 → 에이전트가 문서 신뢰하고 stale 결정 출하
37. **Worked example 없음** — 채워진 worked example 없으면 에이전트가 룰을 ground 못함. **항상 1개 full screen recipe 포함.**

---

## 부록 C. 출처

### 공식 디자인 시스템
- [Material Design 3 — Design tokens](https://m3.material.io/foundations/design-tokens/overview)
- [Material 3 — Typography type-scale tokens](https://m3.material.io/styles/typography/type-scale-tokens)
- [Material 3 — Motion easing & duration](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
- [Adobe Spectrum — Design tokens](https://spectrum.adobe.com/page/design-tokens/)
- [Salesforce Lightning Design System — Design tokens v1](https://v1.lightningdesignsystem.com/design-tokens/)
- [Shopify Polaris — Color tokens](https://polaris-react.shopify.com/tokens/colors)
- [IBM Carbon — Color tokens](https://carbondesignsystem.com/elements/color/tokens/)
- [IBM Carbon — Motion overview](https://carbondesignsystem.com/elements/motion/overview/)
- [GitHub Primer — Primitives](https://primer.style/foundations/primitives/)
- [Atlassian Design System — Design tokens](https://atlassian.design/foundations/tokens/design-tokens)
- [Radix Colors — Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- [Brad Frost — The Many Faces of Themeable Design Systems](https://bradfrost.com/blog/post/the-many-faces-of-themeable-design-systems/)
- [DTCG / W3C — Design Tokens Format Module](https://www.designtokens.org/TR/drafts/format/)

### shadcn + Tailwind v4
- [shadcn/ui — Theming](https://ui.shadcn.com/docs/theming)
- [shadcn/ui — Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)
- [shadcn/ui — Dark Mode (Next.js)](https://ui.shadcn.com/docs/dark-mode/next)
- [shadcn-ui/ui — apps/v4/app/globals.css (canonical reference)](https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/globals.css)
- [Tailwind CSS v4.0 release notes](https://tailwindcss.com/blog/tailwindcss-v4)

### Reference 분석
- [Linear brand](https://linear.app/brand)
- [Linear — Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- [Higgsfield AI Canvas](https://higgsfield.ai/canvas-intro)
- [Runway dashboard](https://help.runwayml.com/hc/en-us/articles/24298206897043)
- [Vercel Geist introduction](https://vercel.com/geist/introduction)
- [n8n editor UI](https://docs.n8n.io/courses/level-one/chapter-1/)

### Harness 결합 (Anthropic + 커뮤니티)
- [Claude Code — Memory & CLAUDE.md](https://code.claude.com/docs/en/memory)
- [Claude Code — Skills](https://code.claude.com/docs/en/skills)
- [Claude Code — Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code — Sub-agents](https://code.claude.com/docs/en/sub-agents)
- [Issue #24327 — PreToolUse hook exit code 2 stops Claude](https://github.com/anthropics/claude-code/issues/24327)
- [Skill triggering behavior (bswen)](https://docs.bswen.com/blog/2026-03-24-skill-triggering/)

### Master checklist 보조 출처
- [Google Labs — design.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
- [VoltAgent — awesome-design-md](https://github.com/voltagent/awesome-design-md)
- [Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Bootstrap 5.3 — Z-index layout](https://getbootstrap.com/docs/5.3/layout/z-index/)
- [Design System Checklist](https://www.designsystemchecklist.com/category/design-tokens)

---

*문서 작성: 2026-05-27. 4갈래 병렬 리서치 종합 (100+ 소스 교차검증). 다음 단계는 본 가이드에 따라 `docs/design.md` 초안을 phase 0부터 채우는 것.*
