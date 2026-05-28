---
name: tale-studio design references
version: 0.1.0
last_updated: 2026-05-28
owner: Dev A / Dev B
companion_to: specs/design.md
---

# tale-studio design references

> *왜 그 값들을 선택했는가* (정성 reference). 정량 명세는 [`specs/design.md`](./design.md).
>
> 본 문서는 reference 분석 + tale-studio 채택/거부 매핑. 신규 디자인 결정 시 본 문서의 "We are NOT" 리스트를 먼저 확인.

---

## 1. tale-studio personality

**Quiet, info-dense, dark-first B2B craft tool for video professionals.**

- **Quiet**: chrome이 콘텐츠와 경쟁하지 않음. 캔버스 / 비디오 썸네일이 주인공.
- **Info-dense**: B2B agency 도구. 50+ 노드 캔버스, shot list, render queue — 한 화면에 많이.
- **Dark-first**: 비디오 콘텐츠 viewing이 주 사용 시나리오. light parity는 클라이언트 데모용으로 보존.
- **Craft tool**: 프로덕션 스튜디오 *내부* 도구 — 마케팅 hero, playful 일러스트, consumer creator app 미감 거부.
- **Video professionals**: 시네마토그래퍼 / 디렉터 / 프로듀서가 사용자. Geist Mono로 camera-axis, render ID, frame timecode 표시 — "professional tooling" 신호.

---

## 2. Reference matrix

5개 reference 선정. info-dense B2B chrome (Linear) · 직접 경쟁 카테고리 (Higgsfield) · 시네마틱 media-rich (Runway) · monochrome 정밀 (Vercel/Geist) · working node-graph editor (n8n).

**거부한 후보**: Figma (consumer-creative), Frame.io (review), Tldraw (whiteboard), Loom/CapCut (consumer), Cursor/Notion AI (no canvas dominance), Retool (admin-panel), Pitch (off-domain).

---

### 2.1 Linear

**Identity**: 소프트웨어 팀 이슈 트래커. dark background, Inter Variable + 매우 tight letter-spacing, indigo+lime accent, shadow 없음, hairline 1px border, Cmd-K muscle memory.

| 차용 | 거부 |
|---|---|
| ✓ Typography 시스템: tight letter-spacing (-0.005~-0.025em), 정보 밀도 (Linear ~-0.22px display, -0.11px body) | ✗ Cool-blue legacy palette — 비디오 제품엔 너무 SaaS-trackery |
| ✓ "Structure should be felt, not seen" — 2026 refresh의 부드러운 구분선 / 모서리. 우리 캔버스가 main이라 chrome이 사라져야 그래프 readable | ✗ Indigo + lime 두 번째 accent — 단일 accent 룰 위반 |
| ✓ Keyboard-first command surfaces — Cmd-K palette, property picker | ✗ 매우 text-heavy issue-row 밀도 — 우리는 canvas-first |

**shadcn 토큰 시프트**: `--background` warm near-black 방향 (현재는 pure grayscale — Netflix Dark 결정 우선), `--border` 단일 low-alpha hairline, `--primary`는 CTA 전용 단일 accent.

**출처**: [linear.app/brand](https://linear.app/brand), [linear.app/now/behind-the-latest-design-refresh](https://linear.app/now/behind-the-latest-design-refresh)

---

### 2.2 Higgsfield

**Identity**: 직접 경쟁 — node-based AI video pipeline ("AI Canvas"). glassmorphic, cool dark `#0A0A0F`, neon-edged 3D 반투명 아이콘. AI-filmmaker creator 대상.

| 차용 | 거부 |
|---|---|
| ✓ Node-graph 패러다임 친숙성 — AI video tooling에 node graph 존재 재교육 불필요. **명시적 inversion**: 그들의 node = 모델, 우리 node = 엔티티 | ✗ **Glassmorphism / neon glow / liquid-glass 3D icons** — prosumer-AI-creator 미감. B2B agency엔 "quiet info-dense"가 신뢰 |
| ✓ Generation-as-credit 시각 피드백 — finance owner 가시성 | ✗ In-product marketing-tier hero canvas — 매일 쓰기엔 시끄러움 |
|  | ✗ Glass blur는 50+ 노드에서 스캔 어려움 (성능 + 인지 부담) |

**왜 차용 안 하는가**: glassmorphism은 *contributor drift* 위험. .claude/rules/design.md에 명시적 금지 ("NOT Higgsfield") — Layer A hard rule 5번.

**출처**: [higgsfield.ai/canvas-intro](https://higgsfield.ai/canvas-intro)

---

### 2.3 Runway

**Identity**: Gen-4/4.5 AI 비디오 플랫폼. "시네마틱 dark UI, media-rich layout". 큰 미디어 타일, asset library, LCH-tuned dark surface로 비디오 썸네일이 정확하게 보임.

| 차용 | 거부 |
|---|---|
| ✓ Media-first surface treatment — asset 카드는 생성된 프레임이 숨쉬게. 최소 chrome, no clip-card decoration, flat dark slate | ✗ 무거운 마케팅 카피 / hero gradient in-product |
| ✓ Perceptual-uniformity 튜닝된 dark surface — UI shadow가 perceived frame color를 오염시키지 않게 | ✗ Featured-content 캐러셀 — 내부 도구엔 distraction |
| ✓ Theme toggle (light + dark + system) — B2B agency 클라이언트 데모용 | |
| ✓ "tools row above projects row" 패턴 — Producer 랜딩에 적합 | |

**shadcn 토큰 시프트**: `--background` neutral warm-dark (~OKLCH L=0.12, low chroma) — 현재 우리는 pure grayscale `oklch(0.156 0 0)`. **decisions #30이 Netflix Dark 결정** 이라 그대로.

**출처**: [help.runwayml.com](https://help.runwayml.com/hc/en-us/articles/24298206897043)

---

### 2.4 Vercel / Geist

**Identity**: 개발자 플랫폼. "aggressive reduction" — pure black/white, Geist Sans + Geist Mono, status/links/errors 외 거의 무색, 일러스트 대신 스크린샷·기하 도형.

| 차용 | 거부 |
|---|---|
| ✓ **"Color only when it carries meaning"** — status pill, error state, generation-in-progress = 색. 나머지 = grayscale | ✗ Pure `#000`/`#FFF` 극단 — 비디오 썸네일 옆 absolute black은 banding artifact |
| ✓ **Geist Mono for technical readout** — CameraConfig -10~+10 6축, 토큰 ID, 렌더 큐 ID. "professional tooling" 신호 | ✗ "no illustrations, ever" 룰 — 비-엔지니어 agency 사용자 onboarding엔 일부 다이어그램 필요 |
| ✓ Aggressive monochrome dashboard — settings, billing, project-list = pure grayscale. 색 예산을 canvas node + generation status에 보존 | |
| ✓ Light mode parity 보존 (현재 unused, 보존 결정) | |

**우리는 Netflix Dark grayscale `#121212`** — pure black 아닌 warm-feel near-black (Linear 방향과 일치).

**출처**: [vercel.com/geist/introduction](https://vercel.com/geist/introduction)

---

### 2.5 n8n

**Identity**: 오픈소스 워크플로 자동화. working-class 노드 에디터 — 3-패널 (palette 좌, canvas 중앙, properties 우), dotted gray grid, 카테고리별 컬러 노드, properties 패널의 progressive disclosure.

| 차용 | 거부 |
|---|---|
| ✓ **3-패널 캔버스 레이아웃** — palette 좌 / canvas 중 / inspector 우. Artist (L0) + Director **정확한 스켈레톤** | ✗ 커뮤니티-flavored 시각 거침 (불균일 아이콘, 혼합 radius, chaotic 팔레트). 우리는 paid-B2B |
| ✓ **Dotted grid 배경** — "이건 편집 가능 캔버스"로 즉시 readable. dot 색 `--muted-foreground` at opacity-20 | ✗ 밝은 pink/orange 노드 accent — 너무 playful |
| ✓ **Progressive disclosure** — 노드 클릭 → inspector slide-in. modal hell 회피 | ✗ Loud 카테고리 팔레트 — chart-1/2/3/4/5 채도 낮춰 사용 |
| ✓ Categorical color coding 컨셉 — Asset / Scene / Shot / Video. n8n보다 saturation 훨씬 낮춤 ("tinted outline"이지 "filled banner" 아님) | |

**shadcn 토큰 시프트**: 표준 set 밖 *canvas-specific* extension — `--canvas-bg`, `--canvas-dot`, `--node-border`, `--node-border-selected`, `--edge-default`, `--edge-active`. design.md §17.11 첫 클래스.

**출처**: [docs.n8n.io/courses/level-one/chapter-1/](https://docs.n8n.io/courses/level-one/chapter-1/)

---

## 3. "We are NOT" 리스트

contributor drift 방지용 명시적 negative space. AI 에이전트가 *없어야 할 것* 발명 방지.

1. **NOT Higgsfield** — glassmorphism, neon edge-glow, volumetric 3D icon, liquid-glass surface, creator-prosumer flourish 금지.
2. **NOT 커뮤니티-flavored 오픈소스 도구** — 불균일 아이콘, 혼합 radius 카드, saturated 카테고리 배너 색 금지 (n8n).
3. **NOT consumer creative app** — light-mode-first 금지, playful 일러스트 금지, in-product marketing-hero gradient 금지.
4. **NOT marketing-tier 대시보드** — featured 캐러셀, large hero 모듈 in-studios 금지 (Producer 랜딩에만 max).
5. **NOT pure-black Vercel-extreme** — pure `#000` 옆 skin-tone 비디오 프레임은 banding. 우리는 Netflix Dark grayscale (`#121212` warm-feel without warm chroma).

---

## 4. Direction summary (token table 아님 — 방향성)

| Axis | tale-studio direction |
|---|---|
| Mode | dark-first, full light parity 보존. Theme switch day 1 (현재 unused) |
| Color | monochrome warm-neutral foundation + **단일 primary accent** (Netflix Red `#E50914`, decisions #30 — CTA + active state만) + status colors |
| Typography | Geist Sans + Geist Mono (강제 mono for camera-axis, render ID, frame number, timecode). Tight letter-spacing on body (~-0.005em). Base 14px |
| Density | chrome info-dense (Linear), media tile 주변 generous (Runway). 캔버스 표면 자체가 콘텐츠 — 주변 chrome 최소 |
| Surfaces | flat. Hairline 1px border. **캔버스 노드 shadow 금지**. Overlay/popover/dialog에만 subtle shadow |
| Canvas tokens | shadcn 표준 외 extension namespace (`--canvas-*`, `--node-*`, `--edge-*`). 5 studio 중 2개에 load-bearing |
| Iconography | Lucide stroke 1.5, 16/20px, no fill, 단일 weight, 단일 radius. Phosphor / Hero mix 금지 |
| Motion | sub-200ms easing; no spring bounce; canvas pan/zoom React Flow default; "generating" state는 subtle pulse, loud spinner 금지 |

---

## 5. Per-page reference targets

| 페이지 | 주요 reference | 비고 |
|---|---|---|
| Landing (`/`) | Linear marketing + Vercel-extreme reduction | hero 1개, color 절제 |
| Producer (`/studio/producer`) | Runway "tools row above projects row" | chat-driven, 단일 flow |
| Writer (`/studio/writer`) | Linear issue editor + Frame.io comment 패턴 (rejected reference but pattern useful) | scene card grid + detail editor |
| Artist (`/studio/artist`) — L0 Canvas | **n8n 3-패널 + Higgsfield 인버전 + Runway media-tile** | 주 캔버스 |
| Director (`/studio/director`) — Director Canvas | **n8n 3-패널 + Linear inspector typography** | 주 캔버스 + NodePopup |
| Editor (`/studio/editor`) | Runway timeline + Vercel monochrome | media-first |

---

## 6. Reference vocabulary

design.md에서 자주 사용하는 용어 정리 — Claude 에이전트와 사람 모두에게.

- **Hairline border**: 1px `--border`. depth 표현 (border ≠ separator는 §8.2)
- **Halo**: 노드 selection 강조. `ring-2 ring-ring ring-offset-2` (§17.6). box-shadow 대체
- **Progressive disclosure**: 노드 클릭 → inspector / NodePopup slide-in. modal hell 회피
- **Quiet chrome**: 패널 배경 / 구분선이 콘텐츠와 경쟁 안 함. flat + monochrome
- **Tinted outline (vs filled banner)**: 카테고리 색을 outline 1.5~2px로만, fill 안 함. n8n loud banner 거부 룰

---

## 7. Out-of-scope references (참고만)

- **Material 3 / Adobe Spectrum / IBM Carbon / Atlassian / Polaris / Primer / Radix**: 토큰 시스템 *철학*만 참고 (design.md §2 token tier 모델). 시각 미감은 차용 안 함
- **Figma**: consumer-creative. tale-studio 미감과 거리 큼
- **Tldraw / Whiteboard 도구**: 자유 형식. 우리는 노드=엔티티 패러다임
- **Frame.io V4**: review-focused. 우리는 generation-focused

각 시스템 출처는 `docs/research/design-system-data-requirements.md` 부록 C.
