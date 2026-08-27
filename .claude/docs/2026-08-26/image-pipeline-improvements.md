# 이미지 파이프라인 전반 개선 — 노드 연결 + Artist i2i

상태: 계획 · 성격: 신규 기능 (A는 진행 예정, B는 나중 작업)

오너 요청(2026-08-27): "이미지의 전반적인 기능 개선". 두 갈래다.
1. **Director 캔버스에서 노드끼리 이미지·영상을 연결** (Higgsfield 방식 그대로).
2. **Artist 탭에서 이미지→이미지 레퍼런스 생성.**

둘 다 **채팅과 UI 양쪽**으로 조작 가능해야 한다. 기존에 이 주제를 담는 문서가 없어 새로 연다 —
A는 group-h(H1~H3)의 설계 심화판이고, B는 어느 그룹에도 없던 신규 항목이다.

| 갈래 | 화면 | 상태 | 관련 |
|---|---|---|---|
| A. Director 노드 연결 | Director 캔버스 | 진행 예정 (워크트리 `feat/director-node-wiring`) | group-h H1·H2·H3, group-b B2·B4 |
| B. Artist i2i 레퍼런스 생성 | Artist 카드 패널 | 나중 작업 (오너 이번 요청) | group-g G3·G4 (스타일 앵커·플래시백) |

---

## A. Director — 노드 간 이미지·영상 연결

### 목표
캔버스에서 한 노드의 출력을 다음 노드의 입력으로 이어 흐르게 한다.
- **이미지 → 이미지** (참조 기반 재생성·변형)
- **이미지 → 영상** (START/END/REF 입력)
- **영상 → 영상** (이어 붙이기 = 샷 체이닝, H2)

### 현재 상태 — 배선 없음
- 노드 종류(`scene`·`shot`·`video`·`asset`·`prompt`·`shotImage`·`videoPlaceholder`)는 있으나,
  사용자가 노드 출력→입력을 **직접 잇는 경로가 없다.**
- 챗 `connect`는 `relates-to`(내러티브 메모)만 만든다. `chain` 엣지는 시스템 파생 전용(`rebuildShotChainNodes`).
- 챗 `generateVideo`는 승인 계약이 없어 skip 처리(`director-store.ts:3125`).
- 낱개 영상 생성 배관(`generateVideoForShot` → fal 실호출·폴링)은 **작동한다.** 없는 건 "노드를 이어 흐르게" 하는 배선.

### Higgsfield 카피 가능성 — 직접 관찰로 확인됨
aside 브라우저의 Higgsfield canvas("화개장터" 프로젝트)를 붙어서 DOM을 분석한 결과:

- **엔진이 동일하다.** Higgsfield도 우리와 같은 `react-flow`(@xyflow)를 쓴다 — `.react-flow__node`,
  `.react-flow__handle` 클래스 그대로. 우리도 이미 이 엔진이라 **포트 시스템·연결 UX를 거의 그대로 이식 가능.**
- 노드 = 생성 단위(`react-flow__node-generate`). 포트 명명 규칙 `{seq}-{nodeId}-{portName}-{target|source}`:
  - 입력(왼쪽, `handle-left`, `target`): **`prompt`**, **`input_images`**
  - 출력(오른쪽, `handle-right`, `source`): **`image`**
- **`input_images`(복수) 포트 하나에 참조 이미지 여러 장**을 연결한다 — 오너가 말한 "REF는 여러 장" 구조와 일치.
- CSS 규약: `canvas-port--input/output`, `canvas-port--connected`, `canvas-port-list--input/output`(포트 세로 나열),
  `canvas-port-hover-hitbox`(연결 히트박스).
- 확장 지점 선례: 우리엔 이미 **Prompt 노드 → 샷 T-입력 와이어링(`wirePromptToShot`)**이 있어, 같은 패턴을 프레임 포트로 넓히면 된다.

### 프레임 포트 설계 (H1)
- 영상 입력 포트 = **START(1장) · END(1장) · REF(여러 장)**.
- **함정(오너 합의): DIRECTION은 영상 입력 포트로 노출하지 않는다.**
  실제 영상엔 START/END **2장만** 들어가고(`generate-video/route.ts`), DIRECTION(화살표 그림)은
  `motion-contract`가 **글로 번역**해 프롬프트에 넣는다. DIRECTION 포트를 만들면 "그어도 효과 없는" 거짓 배선이 된다.
- **REF는 일단 열어만 둔다(오너 결정).** 안 쓰면 전송 배열에서 빠질 뿐이라 나중에 제거가 싸다.
  - START/END는 각 1장, **REF만 다중** 연결 — Higgsfield `input_images`와 같은 모양.

### start/end 지정 방식 (오너 질문 답)
지금은 **둘 다 "순서"에 의존한다.**
- **코드**: `generate-video/route.ts`가 `image_urls` 배열을 그대로 전달 — **첫 원소 = START, 끝 원소 = END.**
- **텍스트**: 프롬프트에 `The first reference image is START, the last is END` 명시(`video-prompt.ts`).

→ 그래서 REF를 배열에 끼우면 이 순서 계약이 깨진다. REF 추가 시 **배열 위치 규칙 + 프롬프트 텍스트를 함께**
바꿔야 한다(예: `[START, END, ...REF]` 배열 + "3번째 이후는 style/character reference" 텍스트).

---

## B. Artist — 이미지→이미지 레퍼런스 생성

### 목표
Artist 탭에서 **임의 이미지를 참조로 새 이미지**를 만든다. 채팅과 UI 둘 다.

### 현재 상태 — 범용 i2i 없음
- **있는 것**: 캐릭터/월드 시트 생성, 방향 뷰(`back`·`sideLeft`·`sideRight`)를 `main`에서 **i2i 파생**(`lib/artist/turnaround.ts`).
  → i2i 인프라 자체는 있다.
- **챗 자동 실행 화이트리스트는 `createCharacter`·`regenerate*`뿐**(`lib/artist/chat-updates.ts`).
  캐넌 외형 변경은 자동 금지 — 승인(pending-proposal) 후 서버 라우트로 커밋.
- **없는 것**: 임의 참조 이미지로 새 변형·장면을 만드는 **범용 i2i**, 그리고 그걸 **채팅·UI로 지시하는 경로.**

### 완료 조건 (초안)
- **UI**: 카드/이미지에서 "이걸 참조로 생성" → 참조 이미지 + 프롬프트로 새 이미지.
- **채팅**: "이 캐릭터를 참조로 ~한 장면 만들어줘" → 참조 결합 + i2i 생성.
  (과금·승인 경계는 group-b 정책을 따른다 — 비용 있는 생성은 원클릭 승인 카드.)
- **참조 여러 장 결합** 지원. 캐릭터+월드 앵커 결합은 Director의 `resolveShotAssetImages` 패턴이 이미 선례.

### 연결 (group-g)
G3(스타일 앵커 중간 삽입)·G4(플래시백 캐릭터 참조)가 "참조를 더 잘 먹이는" 같은 뿌리다.
Artist i2i가 정리되면 그 참조가 Director 프레임 REF 포트로 자연스럽게 흘러간다.

---

## 공통 설계 근거
- **두 축을 분리한다.** 데이터 축(영상/이미지에 뭘 몇 장 먹일까 = START/END/REF) vs
  UI 축(그걸 노드·포트로 어떻게 그릴까). 오너가 헷갈렸던 지점이라 문서에 못박는다.
- **react-flow 포트 시스템으로 통일** — Director 캔버스, 그리고 도입 시 Artist 양쪽.
- **REF·i2i는 옵션으로 열어두고 안 쓰면 전송 배열에서 빠지게** — 나중 제거 비용을 최소화(오너 방침).

## 참조
- `group-h-new-features.md` — H1(프레임 노드/포트)·H2(샷 체이닝)·H3(영상 전체 생성 + 진행바)
- `group-b-chat-execution.md` — 챗 실행 경계, `generateVideo` 승인 계약
- `group-g-generation-quality.md` — G3 스타일 앵커·G4 플래시백·G5 START/END 꼬임
- 워크트리: `feat/director-node-wiring` (`.claude/worktrees/director-node-wiring`)
- 코드: `stores/director-store.ts`(`applyUpdates`·`generateVideoForShot`)·`api/director/generate-video/route.ts`·
  `lib/director/video-prompt.ts`·`types/director.ts`·`lib/artist/turnaround.ts`·`lib/artist/chat-updates.ts`
