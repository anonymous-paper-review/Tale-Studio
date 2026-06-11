# tale-studio constitution

> 변경 적은 원칙. 이걸 어기는 변경 제안은 `specs/changes/<name>/proposal.md`에서 명시적으로 정당화해야 함.
>
> 출처: `specs/decisions.md`의 *변경 적은* entry 격상. 본 문서가 새 source-of-truth는 아니며, decisions.md entry 번호를 참조한다.

---

## Mission

**텍스트 → 전문 촬영 기법 적용 고품질 AI 비디오 자동 생성 (B2B).** 차별화는 Knowledge DB 기반 cinematography RAG.

## Architecture: 3-Level Pipeline + L0

```
[L0 Artist 카드형 패널] → Asset Storage
                              ↓
Story → [writer 엔진] → DB(scenes/characters/locations/shots) → [L3 Prompt Builder] → [Video API]
        (옛 L1 Scene Architect + L2 Shot Composer를 통합 수행)
```

- **L0** (decisions #29): L1 이전에 캐릭터·월드를 사전 정의. ~~노드 그래프 패러다임~~ → **카드형 UI로 롤백** (2026-06-04, `specs/archive/2026-06-04-redesign-l0-canvas/`).
- **L1+L2** (decisions #1 → #38로 통합): 씬/캐릭터 분할 + 샷 분해는 **writer 엔진**(`src/lib/writer/`)이 백그라운드 수행. 옛 Pumpup/Scene Architect/Shot Composer 명칭 폐기.
- **L3** (decisions #1): Knowledge DB의 cinematography 테크닉으로 프롬프트 강화.

## 노드 = 개체 패러다임 (decisions #29) — 현재 Director Canvas 전용

> 2026-06-10 사실 업데이트: artist(L0)는 카드형 롤백으로 노드 패러다임에서 제외. 아래 원칙은 **P4 Director Canvas**에만 적용.

- Higgsfield 노드 = 모델. **우리 노드 = 엔티티** (Scene / Shot / Video — 옛 Character/World/Status 노드는 폐기).
- 노드 시각화는 *모델 흐름*이 아니라 *콘텐츠 자산 관계*를 표현.
- 동종 노드 연결은 `references` (자유 텍스트 메모) — `parent`는 Status Branch 자동 생성 전용 (decisions #32).

## Agentic Canvas (decisions #31)

> 2026-06-10 사실 업데이트: artist는 카드형 롤백으로 캔버스 조작 대상에서 제외 — 현재는 director 캔버스만 해당.

- director 캔버스는 **채팅 agent가 노드를 직접 조작**. `DirectorCanvasUpdate` action union (옛 artist `CanvasUpdate`는 폐기).
- 매 채팅 turn마다 캔버스 스냅샷 (노드 목록 + 엣지 + 선택 노드 풀 정보)을 prompt에 자동 주입.
- **파괴/등록 액션은 agent 직접 실행 금지** — `requestDelete`, `requestRegister`는 user-facing 모달 (DeleteConfirmModal, 등록 폼) 트리거만. undo 미구현 상태 안전장치.
- read-only 가이드 (Higgsfield 등 흔함) → tool-use agent는 tale-studio 차별화.

## 디자인 헌법 (decisions #30)

5개 원칙:
1. 캔버스 제일주의 (패널 보조)
2. `globals.css` 토큰 외 신규 색 금지
3. 모션은 정보 전달 (장식 아님)
4. 키보드 일등 시민
5. 한 화면 정보 위계 2단까지

색 시스템: **Netflix Dark** 그대로. Actor=`--chart-1` (red), World=`--chart-2` (blue), Status=마더 색 채도 50% 감소, Scene=`--chart-3`, Shot=`--chart-4`, Video=`--chart-5` (decisions #30 + Director Canvas 내부 결정 #10).

엣지: neutral gray 한 톤. 카테고리는 굵기·스타일로 구분 (색 분기 안 함).

모션 4-tier: 100 / 150 / 250 / 350ms.

상세는 [`specs/design.md`](./design.md) + [`specs/design-references.md`](./design-references.md).

## MVP 범위 (decisions #28)

P1 (Meeting Room) + P3 (Artist — 카드형) + P4 (Director Canvas) + P5 Lite (Editor) 전체 포함.
옛 P2 (Script Room) UI는 **writer 엔진(백그라운드)으로 흡수** (decisions #38) — 범위에는 포함되나 화면은 없음. DataProvider Mock 패턴 폐기.

## 기술 스택 (decisions #22, 변경 적음 — 2026-06-10 사실 업데이트)

- **Frontend**: Next.js 16 + Tailwind v4 + shadcn/ui + Zustand (pnpm)
- **Canvas**: React Flow (xyflow) — P4 Director Canvas만 (L0 Artist는 카드형, 미사용)
- **3D**: Three.js + React Three Fiber (P4 일부 — **아직 미설치**, 도입 시 추가)
- **Backend**: Next.js API Routes + Supabase (PostgreSQL)
- **AI**: 프로바이더·모델 ID는 **루트 `CLAUDE.md` §기술 스택 한 곳만** (본 문서 복제 금지 — 하네스 유지 규약).
  요지: LLM은 멀티 프로바이더 dispatch, 이미지·비디오 프로덕션 경로는 fal (self-hosted 계획 미구현, 개발용 토글 별도).

## 6축 카메라 (decisions #20 — 명명 기원은 Kling, 현재 모델 비종속 제품 개념)

| 축 | 범위 | 동작 |
|----|------|------|
| horizontal | -10~+10 | 좌(-)/우(+) 슬라이드 |
| vertical | -10~+10 | 하(-)/상(+) 슬라이드 |
| pan | -10~+10 | 피치 하(-)/상(+) 회전 |
| tilt | -10~+10 | 요 좌(-)/우(+) 회전 |
| roll | -10~+10 | 롤 반시계(-)/시계(+) |
| zoom | -10~+10 | 화각 좁(-)/넓(+) |

주의: Kling pan/tilt 명명이 일반 시네마토그래피와 반대 (pan=pitch, tilt=yaw). Camera-axis 값은 Geist Mono로 표시.
2026-06-10 참고: 현재 비디오 생성은 fal.ai 모델 사용 (Kling API 미연동). 6축은 `CameraConfig` 타입 + 프롬프트 빌더의 제품 개념으로 유지.

## 작업 진행 규약

상태 마커 (`PROGRESS.md` 또는 `specs/changes/*/tasks.md`):
- `[ ]` 미착수
- `[c]` 코드 작성 완료, 브라우저/사용자 검증 대기
- `[x]` 검증 완료 (코드 + 브라우저 둘 다 ✓)
- `[~]` 보류 (사유 명시)

DoD가 *동작*이면 (예: "더블클릭 → 모달 열림") 브라우저 검증 후에만 `[x]`. 인프라성 항목 (파일 생성, 타입 정의, TS clean)은 코드 자체로 검증되므로 `[x]` OK.

## Change-driven 진화

- 기존 source-of-truth spec (`specs/layers/*.md`, `specs/data/*.md`) *수정* 시 `specs/changes/<change-name>/`에 proposal + delta 작성.
- 작업 끝 → `specs/archive/YYYY-MM-DD-<name>/`로 이동 (archive = 검증 게이트).
- 단순 typo / 사실 업데이트는 changes/ 안 만들고 spec 직접 편집 OK.
- `decisions.md`는 append-only rolling 로그. mid-history 편집 금지.

## 금지

- `specs/design.md` 본문에 정량 명세 없이 추상 형용사로만 디자인 결정 진행 (data 없이 "글래스모피즘 추가" 같은 결정).
- 노드 좌표 자유 (8/16px snap 필수).
- decisions.md mid-history 편집 (append-only).
- 라우터 fall-through — 존재하지 않는 파일을 라우터에 두기 (작성 전이면 "(예정)" 표시).
