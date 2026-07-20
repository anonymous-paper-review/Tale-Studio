# June 2026 UI Revisions — Requirements Spec

> **출처**: Notion "6월 수정사항" (`38ea7c3b-8d05-8054-924f-fd97ac64b60e`), 2026-06-29 캡처.
> **목적**: 랜딩 / The Meeting Room(대시보드·팝업·채팅) UI·UX 수정 작업지시서를 코드 기준으로 박제.
> **참조 이미지** (repo 영구 보관):
> - 랜딩: `specs/assets/june-2026/landing.png`
> - Meeting Room 대시보드: `specs/assets/june-2026/meeting-room.png`
>
> 항목 ID 규칙: `L`=랜딩, `D`=대시보드, `P`=팝업, `C`=채팅. 각 항목은 ralplan/실행에서 그대로 추적 ID로 사용.

---

## 코드 앵커 (확인된 위치)

| 영역 | 파일 | 비고 |
|---|---|---|
| 랜딩 footer (Platform/Studio 컬럼, Tale Studio 소개) | `src/app/page.tsx` (~L505–595) | footer `Platform` 리스트 L532–550, `Studio` 리스트 L578–589 |
| Meeting Room 대시보드 (제목, Story foundation, Cast/Background readiness) | `src/features/producer/readiness-board.tsx` | 제목 L377, Story foundation L429, Cast readiness L501, Background readiness L548 |
| 채팅 패널 ("모든 단계 통합", "P1·Producer", 안내문구) | `src/components/layout/global-chat.tsx` | "모든 단계 통합" L232 |
| 게이트 경고문구 ("스토리가 아직 준비되지 않음" 등) | `src/lib/producer-gate.ts` | hardMissing label L137 |

> 위는 1차 grep 앵커. 정확한 항목↔라인 매핑·잔여 문자열 추적은 ralplan 단계에서 확정.

---

## 1. 랜딩 페이지 (`landing.png`)

화면: 상단 `YOUR WORKSPACE` 배지 + `Projects` 제목 + `+ New Project` 버튼, 프로젝트 카드 그리드, 하단 footer(좌: Tale Studio 로고+소개 / 중: **Platform** 컬럼[AI Production, Cinematography, Video Generation, Security] / 우: **Studio** 컬럼[Projects, About Us, Careers, Contact]).

- **L1** — footer 우측 영역의 **Platform 컬럼 전체 삭제** (AI Production / Cinematography / Video Generation / Security 모두 제거).
- **L2** — footer **Studio 컬럼은 `Contact`만 남기고 나머지 삭제** (Projects / About Us / Careers 제거).
- **L3** — `Contact` 클릭 시 **팝업으로 이메일 주소 노출**: `talestudio24@gmail.com` (2026-07-12 개인 주소 → 팀 주소로 교체).

---

## 2. The Meeting Room — Dashboard (`meeting-room.png`)

화면: 좌측 아이콘 레일 + 중앙 보드(상단 제목 "Handoff readiness board"+"남은 5개" 배지+안내문구 / "스토리 준비" 카드 / "Story foundation" 6필드 그리드 / "Cast readiness" / "Background readiness") + 하단 빨간 "남은 5개를 채워 주세요" 버튼 + 우측 채팅 패널.

### 2-1. 제목·문구
- **D1** — `"Handoff readiness board"` → **`Meeting Room`**.
- **D2** — `"남은 5개"` 배지 텍스트 삭제 (하단 버튼과 기능 중복).
- **D3** — 안내문구 `"오른쪽 GlobalChat이 채우고, 이 보드가 writer로 넘길 예약 준비 상태를 확인합니다."` → **`오른쪽 AI Producer가 당신의 시작을 도와줍니다.`**

### 2-2. 스토리 준비 카드
- **D4** — `"스토리가 아직 준비되지 않음"` 텍스트 **왼편에 `ⓘ필요` 아이콘 이동/배치**.
- **D5** — `"스토리 준비"` 라벨 → **`Brief Story`** (Story Foundation과 동일 폰트·볼드 적용).
- **D6** — `"Story brief"` 텍스트 삭제.
- **D7** — `"더 구체화 필요"` 배지 삭제.
- **D8** — `"스토리 보강 질문 채우기"` → **`기본적인 스토리를 AI Producer에게 알려주세요`**.

### 2-3. Story foundation 섹션
- **D9** — `"Story foundation"` → **`Story Foundation`** (모든 제목은 각 단어 첫 글자 대문자 = Title Case).
- **D10** — `"settings"` 배지 삭제.
- **D11** — 각 필드 경고문구(`러닝타임 필요`, `장르 필요`, `세부 장르 권장`, `톤 권장`, `대사 언어 필요` 등) **왼편에 상태 아이콘 이동**: `ⓘ필요` / `ⓘ권장` / `ⓘ준비`.

### 2-4. Cast / Background
- **D12** — `"Cast readiness"` → **`Casting`**.
- **D13** — Cast 옆 `"D1"` 배지(depth) 삭제.
- **D14** — Cast 빈 상태 안내 `"채팅이 만든 인물·사물을 이 보드에서 확인하고, 부족한 필드는 quick edit나 채팅 보강으로 채웁니다."` → **`추가하고 싶은 인물과 사물에 대한 묘사를 AI Producer에게 알려주세요`**.
- **D15** — `"Background readiness"` → **`Background`**.
- **D16** — Background 옆 `"locations"` 배지 삭제.
- **D17** — Background 빈 상태 `"아직 배경 카드가 없어요"` → **`아직 배경 설정이 없어요`**.
- **D18** — Background 빈 상태 안내 → **`추가하고 싶은 배경이나 세계관에 대한 묘사를 AI Producer에게 알려주세요`**.

### 2-5. 인터랙션/상태
- **D19** — 하단 "남은 N개를 채워 주세요" 버튼 비활성 시: 채도만 낮추는 게 아니라 **클릭 자체가 막혀야 함**(`disabled`, pointer 차단).
- **D20** — 러닝타임/장르/세부장르/포맷/톤/대사언어 입력창: **마우스 롤오버 시 빨간 테두리**(클릭과 동일 스타일), 클릭하면 커서 생성 또는 창 열림.
- **D21** — `+인물` / `+사물` / `+배경` 버튼: **롤오버 시 빨간 테두리**, 클릭 시 팝업.

---

## 3. Pop-up (인물/사물 상세)

- **P1** — `+인물` 팝업 불필요 → **배경 추가 방식과 동일하게** 처리(인라인).
- **P2** — 입력창 **롤오버 시 빨간 테두리**, 클릭 시 커서 활성.
- **P3** — `상세 편집` 버튼 삭제하고, **주인공/조연 선택을 토글로** 전환(롤오버 피드백 필수).
- **P4** — `프로듀서에게 채워달라` 가 버튼이면 동일한 롤오버/클릭 규칙 적용.
- **P5** — 모든 메뉴 항목: **롤오버 시 빨간 테두리 + 클릭 시 액션**.
- **P6** — 팝업에 **닫기 버튼·삭제 버튼** 추가.

---

## 4. Chat (`meeting-room.png` 우측 패널)

화면: 상단 "채팅 P1·Producer / 모든 단계 통합", 안내문 "대화를 시작해보세요. 모든 단계(P1–P5)의 메시지가 시간순으로 표시됩니다.", 하단 입력창 "스토리에 대해 말해주세요...".

- **C1** — `"P1"` 라벨 → **`AI`** (헤더 배지).
- **C2** — 대화 메시지 발신자 표기도 `P1` → **`AI Producer`**.
- **C3** — `"모든 단계 통합"` 텍스트 삭제.
- **C4** — `"대화를 시작해보세요. 모든 단계(P1–P5)의 메시지가 시간순으로 표시됩니다."` 안내문 삭제.
- **C5** — 프롬프트 `"Producer, 이 이야기가 writer로 넘어갈 수 있게 캐릭터·장소·시작-갈등-결말 중 부족한 한 가지를 질문해 주세요."` 를 **입력창(placeholder)이 아니라 대화창(메시지)으로** 표시.
- **C6** — 채팅 메시지에 마크다운 `**` 등이 **원문 그대로 노출되는 버그** 수정(렌더링 적용).
- **C7** — (요청) 대화로 대시보드가 채워질 때, **채워지는 항목이 대시보드로 "뾰로롱" 날아가는 애니메이션** — *난이도 확인 요청 항목 (Open Q)*.
- **C8** — 대화 중 **JSON 원문이 그대로 출력되는 케이스** 수정.
- **C9** — 인물의 아크/동기가 안 채워져 핸드오프 불가인데, 채팅이 "넘어갈 수 있다"고 잘못 안내하는 문제 수정 (게이트 상태와 채팅 안내 정합).
- **C10** — 핸드오프 버튼 초록 활성 시 라벨 **"핸드오프" → 한국어 표기**로.

---

## Open Questions (실행 전 확정 필요)

1. **C7 (뾰로롱 애니메이션)**: 구현 난이도/범위. 채팅→대시보드 필드 매핑 + 모션 경로 필요. MVP는 "필드 하이라이트 펄스" 수준으로 축소 가능?
2. **D11 / C10 아이콘·라벨 정확 명칭**: `ⓘ필요/권장/준비`의 실제 아이콘 컴포넌트, "핸드오프" 한국어 확정어("넘기기"? "작가에게 보내기"?).
3. **C2 발신자 표기**: 저장된 메시지 author 필드 데이터까지 바꿀지, 표시 레이어만 바꿀지.
4. **D5 "Brief Story" vs D8 "기본적인 스토리…"**: 카드 제목/CTA 텍스트 위계 확인.
5. **P3 토글 전환**: 기존 주인공/조연 데이터 모델(역할 enum) 그대로 쓰는지.

---

## 다음 단계
1. (완료) Notion 본문·이미지 → 본 spec 박제.
2. `/skill:ralplan` 진입 — 본 spec 입력, surface별 배치 그룹핑 + 항목↔라인 확정 + Open Q 해소, pending-approval 정지.
3. 승인 후 `ultragoal` 또는 `executor`로 실행.
