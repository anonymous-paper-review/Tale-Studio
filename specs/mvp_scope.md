# MVP Scope — V3.4

> 최종 수정: 2026-06-12
> 상태: P1~P5 전체 포함. **P2 writer = 스토리보드 UI 스테이지로 부활(#38 부분 번복)**. P3는 카드형 UI (Tabs: Characters/World/Inventory)
> 이전: V3 → V3.1 (P3 노드 그래프 전환) → V3.2 (디자인 헌법 위치 정정) → V3.3 (spec diet) → V3.4 (writer UI/스토리보드 부활)

---

## 1. MVP 범위

### 포함

| Stage | V2 이름 | 핵심 역할 | Pipeline |
|-------|---------|----------|----------|
| **P1** | The Meeting Room | Producer Agent 대화로 스토리/설정 수집. **스토리 게이트** 통과 시 P2·P3 개방 (`specs/changes/producer-story-gate/`, 미구현) | - |
| **P2** | The Script Room → **writer** | **UI 스테이지로 부활**(#38 부분 번복). 씬/샷 분할 엔진 + **스토리보드(목각인형 + 6축 연출 annotation, artist 디테일 없음)**. producer 게이트 통과 후 artist와 **함께 열려 상호 편집**. 기능 명세는 미작성(forward) | L1+L2 |
| **P3** | The Visual Studio | 카드형 캐릭터/월드 컨셉 정의 (L0 Concept Canvas). **첫 생성은 producer 기반**, 이후 writer와 오감 | L0 |
| **P4** | The Set | Director Canvas — artist 디테일 기반 **storyboard 샷 이미지** → +영상 프롬프트 → **영상 storyboard**. UI 미명세 | L2+L3 |
| **P5 Lite** | Post-Production Suite | 프리뷰 + 타임라인 + Crop + **오디오 트랙** + Draft 렌더링 | - |

### 제외 (Post-MVP)

| 항목 | 이유 |
|------|------|
| P5 AI 편집 도구 | In-Painting/In-Pointing |
| **AI 음악 생성** | 배경음악 *생성*(text→music) 후순위. ※ 오디오 트랙(업로드·배치·트림·볼륨·믹스·waveform·멀티트랙)은 editor에 **이미 구현 → MVP 포함** |
| 코인/과금 시스템 | PMF 이후 |
| 인증/인가 | MVP 단계 불필요 |
| Inspiration Recipes | P1 커뮤니티 레시피. 사용자 데이터 필요 |

### P5 Lite 범위

| 포함 (MVP) | 제외 (Post-MVP) |
|------------|-----------------|
| 중앙 비디오 프리뷰어 | In-Painting (영역 교체 브러시) |
| 하단 타임라인 (씬별 탭 + 샷 썸네일) | In-Pointing (시간적 가이드 바) |
| 영상 클립 Crop (앞뒤 트리밍) | AI 품질 자동 평가 |
| 클립 순서 변경 / 삽입 / 삭제 | AI 음악 *생성*/자동 배치 |
| **오디오 트랙** (업로드·배치·트림·볼륨·waveform·멀티트랙 mute) | |
| Draft 렌더링 (전체 병합 → 다운로드) | |

---

## 2. 데이터 흐름

현재 파이프라인 다이어그램 (3-Level Pipeline + L0): 루트 `CLAUDE.md` §도메인 특수성 참조.

> ℹ️ writer UI 부활은 **Decision #53**(2026-06-12, forward)로 기록 + 루트 `CLAUDE.md` forward 표기로 동기화 완료. 단 **현 코드의 writer는 여전히 백엔드 엔진**(미구현) — UI/스토리보드는 forward 설계.

**스테이지 흐름 (V3.4)**

```
producer (스토리 게이트)
   │  게이트 통과 → P2·P3 개방
   ▼
writer (스토리보드: 목각인형 + 6축 연출)  ⇄  artist (캐릭터/월드 디테일; 첫 생성 producer 기반)
   ▼
director (artist 디테일 → storyboard 샷 이미지 → +영상 프롬프트 → 영상 storyboard)
   ▼
editor (프리뷰 + 타임라인 + 오디오 트랙 + Draft 렌더)
```

**스토리보드 3단 점진** (UI는 아직 명세화 전 — forward):
1. **writer 스토리보드** — 목각인형 + 연출, artist 디테일 없음
2. **director storyboard 샷 이미지** — artist 디테일 이미지 기반
3. **영상 storyboard** — 2에 영상 프롬프트 추가

> UX 페이지별 상세 (레이아웃, 요소, API): `specs/ux_pages.md`

---

## 3. 기술 스택

현재 기술 스택 (프로바이더·모델·환경변수): 루트 `CLAUDE.md` §기술 스택 참조.

---

## 4. 디자인 시스템

컨벤션·토큰 규칙: `specs/design.md`. 토큰 값: `src/app/globals.css`.

---

## 5. 결정 사항 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| MVP 범위 | P1~P5 (P5 Lite) | Decision #28 |
| **P2 writer UI 부활** | 백엔드 엔진 → **UI 스테이지 복원** + 스토리보드. #38(writer UI 제거) **부분 번복** | Decision #53 (forward) |
| **스토리보드 3단** | writer(목각+연출) → director 샷 이미지(artist 기반) → 영상 storyboard. UI 미명세 | Decision #53 |
| writer ↔ artist | producer 게이트 통과 후 함께 열려 상호 편집. producer 선행 개선 = `specs/changes/producer-story-gate/`(미구현) | Decision #53 |
| 구현 순서 | P3+P4 → P5 → P1 → **(forward) P2 writer UI/스토리보드** (명세 미작성) | 핵심 가치 우선 + 점진적 파이프라인 연결 |
| P3 재설계 | L0 Concept Canvas (카드형 Tabs) | Decision #29, 2026-06-04 노드 그래프 폐기 |
| 디자인 헌법 | `specs/design.md` 단일 진실 | Decision #30 |
| P4 범위 | Director Canvas (노드 그래프) — storyboard 샷/영상 take | Decision #26, #45 (단방향 seed) |
| P5 Lite | 프리뷰 + 타임라인 + 오디오 트랙 + Draft 렌더링. AI 편집/음악 생성 제외 | Decision #27 |
| FE 스택 | Next.js + Vercel | Decision #22 |

> 전체 결정 이력: `specs/decisions.md`

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-12 | V3.4: P2 writer UI 스테이지 부활(#38 부분 번복) + 스토리보드 3단(목각→샷이미지→영상) 도입. writer↔artist 상호 편집(producer 게이트 후 개방). editor 오디오 트랙 = MVP 포함으로 정정(코드 실재). 데이터 흐름·결정 요약·구현 순서 갱신 |
| 2026-05-28 | V3.2: 디자인 헌법 위치 정정 — `docs/design.md` → `specs/design.md` (docs/는 리서치·계획·WIP 전용) |
| 2026-05-17 | V3.1: P3 → L0 Concept Canvas (React Flow 노드 그래프) 재설계. design.md 도입 |
| 2026-03-03 | V3: MVP P1~P5 전체 포함. Mock 전략 → 구현 순서 기반 점진적 교체로 변경 |
| 2026-03-03 | V2: P3+P4+P5 Lite. V2 디자인 반영 |
| 2026-02-25 | V1: P3+P4 Only |
| 2026-06-11 | spec diet — 구현 중복·구식(미구현 프로바이더/폐기 파이프라인) 서술 삭제, 코드 포인터로 대체. 의도/계약만 유지. |
