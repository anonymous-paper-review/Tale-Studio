# n5-writer-director-reload-parity — writer 의 새로고침 복원 로직이 director 에는 없는가

- status: `done  # 대조표 완성 — 전제 일부가 뒤집힘. 통일 여부는 오너/형석 선택`
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (fingerprint `12dec5aac06db440`, byte range 0-9531)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- 실행 주체: night-investigator 백지 조사 작업자 (읽기 전용 Read/Grep/Glob, 모델 sonnet — fable 금지 준수)
- 자율성 레벨: 1 (사실 기계 — 조사만, 코드 수정·유료 발주 없음)
- operation_key: `n5-reload-parity-v1`

## 원문 인용 (형석 메모)

> writer도 새로고침하면 안 보이는데 director로 동일한 로직 (DB에서 생성/대기 상태 및 시작 시간
> 확인 후 진행 시간 띄워주는 로직 + 기타 모든 로직) 적용하고 앞으로 writer, director의 경우
> 동일한 로직으로 적용되게 관리
> director의 뷰어 writer랑 동일하게 수정
> director도 마지막 보고 있던 탭 DB로 관래해서 새로고침 시 해당 탭이 바로 보이게 수정

## interpretation

writer 화면에는 새로고침 후 DB에서 진행 상태를 읽어 복원하는 장치가 있는데(혹은 있어야 하는데)
director 화면에는 대응물이 없다는 주장이다. 두 화면의 복원 장치 구성을 코드에서 대조하면
사실로 닫힌다. 무엇을 통일할지는 오너·친구의 선택이므로 이 조사는 **대조표까지만** 만든다.

## observation — 이 조사가 답해야 할 질문

writer 화면과 director 화면 각각이 새로고침 시 복원하는 항목이 무엇이고, 어느 쪽에만 있는가.

## 선기입 수용 기준

1. writer 화면의 새로고침 복원 요소를 항목별로 나열한다 — 최소한 (a) 진행/대기 상태 조회,
   (b) 시작 시각 기반 경과 시간 표시, (c) 마지막으로 보던 탭 복원, (d) 뷰어 구성.
   각 항목에 `있음/없음` 과 `파일:줄` 근거.
2. director 화면에 대해 같은 4항목을 같은 형식으로 판정한다.
3. 두 결과를 **한 표**로 대조하고, 한쪽에만 있는 항목을 명시한다.
4. 공통으로 쓰는 모듈이 이미 있으면 그 경로를 쓴다. 없으면 "공통 모듈 없음"으로 답한다.
5. 통일 방법·설계 제안은 쓰지 않는다. 사실 대조까지만 한다.

## 시작점 힌트 (전수는 직접 확인할 것)

- `src/app/studio/writer/`, `src/app/studio/director/`
- `src/features/writer/`, `src/features/director/`, `src/stores/director-store.ts`
- 검색어 후보: `activeTab`, `lastTab`, `elapsed`, `started_at`, `hydrate`, `restore`

## 결과 카드

- 판정: **pass** — 대조표 완성. **단 티켓 전제가 부분적으로 뒤집혔다**
- created_at: 2026-08-18T02:53Z · estimated_review_min: 4 · reviewed_min: — · carryover_min: —
- 지출: $0 · 코드 수정 0건

### 확인한 것 — 전제와 반대인 항목이 있다

형석 메모는 "writer 에 있는 로직을 director 에 옮기자"는 방향인데, 실제로는 **경과 시간
표시는 director 에만 있고 writer 에는 없다.** 방향이 반대다.

| 항목 | writer | director | 어느 쪽에만 |
|---|---|---|---|
| 진행/대기 DB 조회 | 있음 (파이프라인 단위) `src/lib/writer/use-writer-status.ts:92-120` | 있음 (샷·영상 단위) `src/lib/generation-queue.ts:112-125` | 둘 다 — **세는 단위가 다름** |
| 경과 시간 **표시** | **없음** — 계산만 하고 안 띄운다 (`rough-storyboard-view.tsx:613` 주석에 의도 명시) | **있음** — 초 단위로 실제 렌더 (`src/components/generating-frame.tsx:86,131-140`) | **director 에만** ← 전제와 반대 |
| 마지막 탭 복원 | 있음 (localStorage) `src/stores/writer-ui-store.ts:26-53` | **없음 — 의도적** | writer 에만 |
| 진행 중 화면 자동 선택 | 있음 `src/features/writer/writer-workspace.tsx:98-111` | 없음 | writer 에만 |

**director 탭 미복원은 버그가 아니라 이미 내려진 오너 결정이다.**
`src/stores/director-store.ts:3103-3105` 주석: "viewMode·storyboardMediaMode 는 영속하지
않는다(#node-first 2026-08-11) — director 는 항상 Node 뷰로 시작한다(오너 지정)".
형석 메모의 "director 도 마지막 보고 있던 탭 복원"은 **이 결정을 뒤집자는 요청**이 된다.
같은 메모 안에 "맨 처음 Node 애니메이션은 프로젝트당 최초 한 번만"이라는 단서가 붙어 있어
같은 자리를 가리키는 것으로 보이지만, 결정을 되돌릴지는 오너 몫이다.

**공통 모듈은 이미 절반 있다**: `src/lib/generation-queue.ts` 를 writer·director 양쪽이
import 한다. 다만 writer 는 경과 시간의 durable 기준점인 `activeStartedAt` 을 가져다 쓰지
않는다(`rough-storyboard-view.tsx:43-47`). 렌더 컴포넌트
`src/components/generating-frame.tsx` 도 공통인데 현재 director 만 쓴다.

### 확인 못 한 것

- 메모의 "director의 뷰어"가 무엇을 가리키는지 확정 불가. 코드에서 "뷰어"라는 말은 writer 의
  점진적 스토리 뷰어에만 붙어 있다(`src/features/writer/writer-story-stream.tsx:3`).
  화면 자동 선택을 뜻하면 director 에 없고, 노드 내용이 DB에서 채워지는 것을 뜻하면 있다
  (`use-writer-director-sync.ts:91-92`).
- "writer 도 새로고침하면 안 보인다"는 주장은 **코드상으로는 확인되지 않았다** — 탭·화면 선택·
  상태 조회가 이미 복원된다. 다만 브라우저 재현은 하지 않았으므로 런타임 결함을 부정하지는
  않는다.

### 다음 조치 — 오너/형석 판단 필요

세 가지가 각각 다른 종류의 결정이다: (1) 경과 시간은 **writer 에 붙이는** 쪽이 코드상 자연스럽다
(공통 모듈이 이미 있고 director 가 참조 구현), (2) director 탭 복원은 **기존 오너 결정을
뒤집는 것**이라 확인이 필요하다, (3) "뷰어 동일하게"는 무엇을 가리키는지부터 물어야 한다.
