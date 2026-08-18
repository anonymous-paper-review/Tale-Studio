# n2-chat-choices-lost-on-reload — 선택지·첨부 이미지가 새로고침에서 사라지는가

- status: `done  # 조사 완료 — 네 상태의 저장 실태 확정. 수리 범위는 오너/형석 선택`
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (fingerprint `12dec5aac06db440`, byte range 0-9531)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- 실행 주체: night-investigator 백지 조사 작업자 (읽기 전용 Read/Grep/Glob, 모델 sonnet — fable 금지 준수)
- 자율성 레벨: 1 (사실 기계 — 조사만, 코드 수정·유료 발주 없음)
- operation_key: `n2-chat-reload-loss-v1`

## 원문 인용 (형석 메모)

> 선택지가 뜬 상태에서 새로고침이나 다른 탭 갔다오면 선택지가 안 뜸
> 이미지 입력 후 새로고침하면 다 날아감 (버그)
> 채팅창 웰컴 멘트 날아가지 않게 수정
> 다음 에이전트에게 넘기기 멘트도 날아가지 않게 수정

## interpretation

채팅 화면의 네 가지 상태 — (a) 사용자가 아직 고르지 않은 선택지, (b) 입력창에 붙인 이미지,
(c) 웰컴 멘트, (d) 다음 에이전트 인계 멘트 — 가 새로고침·탭 전환 뒤 복원되지 않는다.
각 상태가 어디에 저장되는지(메모리만인지, DB인지)가 코드 안에 있으므로 사실로 닫힌다.

## observation — 이 조사가 답해야 할 질문

네 상태 각각의 저장 위치와 복원 경로가 코드에 존재하는가.

## 선기입 수용 기준

1. (a)(b)(c)(d) **각각**에 대해 저장 위치를 판정한다: `메모리 전용` / `DB 저장` /
   `localStorage 등 브라우저 저장` / `확인 불가`. 판정마다 `파일:줄` 근거를 붙인다.
2. 각각에 대해 새로고침 후 복원하는 코드가 있는지 참/거짓으로 답한다. 참이면 그 자리를,
   거짓이면 "복원 자리 없음"을 근거와 함께 쓴다.
3. 네 상태 중 서로 다른 저장 전략을 쓰는 것이 있으면 그 차이를 표로 대조한다.
4. 근거 없는 추측 금지. 확인 못 한 항목은 `미확인`으로 남긴다.

## 시작점 힌트 (전수는 직접 확인할 것)

- `src/lib/chat-choices.ts`, `src/lib/chat-persistence.ts`, `src/lib/chat-blocks.ts`,
  `src/lib/chat-sections.ts`
- `src/stores/global-chat-store.ts`, `src/components/layout/global-chat.tsx`
- 검색어 후보: `choice`, `welcome`, `handoff`, `attachment`, `persist`, `hydrate`

## 결과 카드

- 판정: **pass** — 수용 기준 4항목 충족. 결론: 네 상태 **전부 메모리 전용**, 단 재현 신뢰도는 갈린다
- created_at: 2026-08-18T02:53Z · estimated_review_min: 4 · reviewed_min: — · carryover_min: —
- 지출: $0 · 코드 수정 0건

### 확인한 것

형석이 묶어서 적은 네 가지는 **같은 그릇을 쓰지만 성질이 다르다**. 이게 이번 조사의 핵심이다.

| 상태 | 저장 그릇 | 새로고침 후 | 근거 |
|---|---|---|---|
| (a) 선택지 | zustand `suggestion` | **소실 확정** | `src/stores/global-chat-store.ts:73,261,861-876` |
| (b) 입력창 첨부 이미지 | React `useState` (컴포넌트 로컬) | **소실 확정** | `src/components/layout/global-chat.tsx:561` |
| (c) 웰컴 멘트 | zustand `suggestion` | 조건 맞으면 다시 뜸 | `src/app/studio/producer/page.tsx:109-122` |
| (d) 다음 에이전트 넘기기 멘트 | zustand `suggestion` | **설계상 항상 다시 뜸** | `src/lib/handoff-nudge.ts:1-6,21-26` |

`useGlobalChatStore` 에는 persist 미들웨어가 없고(`global-chat-store.ts:1`), 새로고침 시 DB를
다시 읽는 `loadMessages`(`:267-309`)는 `messages` 만 채우고 `suggestion` 은 건드리지 않는다.

**중요한 비대칭**: (c)(d)는 값을 복원하는 게 아니라 **DB에 있는 다른 진실값으로 조건을 다시
계산해 같은 문구를 새로 만든다**. (d)는 이 방식을 의도적으로 설계하고 주석에 적어놨다 —
"탭을 오가도, 새로고침해도, 기기가 바뀌어도 같은 답이 나온다"(`handoff-nudge.ts:1-6`).
즉 **형석이 원한 동작의 참조 구현이 이미 저장소 안에 있다.**

이미 전송된 메시지·첨부 마커·핸드오프 초대 마커는 `messages` 테이블에 저장되고 정상 복원된다
(`src/lib/chat-persistence.ts:1-14` → `src/app/api/project/[id]/messages/route.ts:6-39,41-66`).
(a)(b)를 고칠 때 쓸 기존 패턴이 여기 있다.

### 확인 못 한 것

- (c) 웰컴 멘트가 실제로 "사라지는" 재현은 **코드로 확인되지 않았다**. 정적으로는 오히려
  "조건이 맞으면 다시 뜬다"가 우세하다. 다만 `loadProject`(producer-store)와
  `loadMessages`(global-chat-store)가 서로 다른 비동기 호출이고 순서 보장이 없어, 메시지가
  로드되기 전에 조건이 평가되면 **이력이 있는데도 웰컴이 다시 뜨는** 반대 방향 오작동이
  가능하다(추정 — 런타임 미재현).
- (d)의 "넘기기 멘트"가 이 제안 카드인지, 핸드오프 성공 후 스레드에 남는 ⇄ 초대 문구인지
  메모만으로는 확정 불가. 후자라면 이미 DB 저장·복원된다.
- 이 조사는 읽기 전용 코드 대조다. 브라우저 재현은 하지 않았다.

### 다음 조치 — 오너/형석 판단 필요

(a)(b)는 고칠 자리가 분명하다(둘 다 저장 자체가 없음). 다만 **어디에 저장할지가 선택**이다 —
메시지처럼 DB에 넣을지, 브라우저 저장으로 충분한지. 형석 메모의 "승낙/취소 버튼은 지우기"는
(a)를 DB에 저장할 때 반드시 함께 정해야 하는 항목이다(되살린 버튼이 이미 지난 제안을 가리키면
그게 형석이 말한 "추후 에러"다).
