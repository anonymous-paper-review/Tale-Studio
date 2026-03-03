# Questions Tracker

> 최종 수정: 2026-03-03
> 열린 질문 + 닫힌 질문 통합 관리

---

## 제품 방향 (상위 질문)

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-DIR-1 | 주 타겟이 A(인디/프리프로덕션)인가 B(프로덕션 previz)인가? | **둘 다, 같은 파이프라인.** P1 입력은 동일 (에피소드 단위 텍스트 입력/복붙). A/B 차이는 별도 경로가 아니라 P2에서의 재배치 자유도 차이로 나타남. | 2026-02-26 팀 논의. 넷플릭스급도 풀 시나리오가 아닌 에피소드 단위로 넣을 것. P2에서 프로 사용자는 씬/샷을 통으로 재배치, 인디는 자동 결과에 가벼운 수정. |

> **함의**: P1→P2→P3→P4 순차 파이프라인 유지. P3/P4 직행 경로(별도 진입점) 불필요. P2의 씬/샷 재배치 UX가 프로/인디 사용성을 가르는 핵심 차별점.

---

## P1 Ground (MVP 포함)

### UX.pdf에 있는 것
- 프롬프트 창 ("어떤 이야기를 만들고 싶나요?")
- 하단 버튼: +, 첨부(캐릭터 이미지), Genre, 143 Style, My Assets
- AI 대화로 수집: 제작 길이, 화면 비율, 장르, 대사 언어, 소요 코인

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-P1-5 | 코인/과금 시스템 구조는? | **MVP 제외**. PMF 이후 결정 | Decision #23. mvp_scope.md |
| Q-P1-6 | P1은 채팅형인가, 폼형인가? | **채팅 + 파일 업로드**. 감독은 시나리오 복붙/파일 업로드로 진입. 설정(장르, 비율, 길이)은 AI가 스토리에서 추론 → 확인만 받음. 별도 폼 불필요. | 2026-02-26 논의. previz 사용자는 이미 작품 컨셉이 있으므로 폼 입력은 비자연스러움 |
| Q-P1-1 | Submit 후 AI가 추가 질문을 하는가, 바로 P2로 넘어가는가? | **Producer Agent가 대화로 수집 → "Hand over to Writer" 버튼으로 P2 이동**. Dashboard에 설정 실시간 sync. | V2 (reference_v2). "The Meeting Room" 패턴 |
| Q-P1-2 | "143 Style" 리스트가 실제로 존재하는가? | **삭제**. V2에서 "Tone & Style" 칩으로 대체. 별도 스타일 리스트 없음. | V2 (reference_v2). Project Dashboard 내 Tone & Style 위젯 |
| Q-P1-3 | "My Assets"이 뭔가? | **V2에서 삭제됨**. 해당 기능 없음. | V2 (reference_v2) |
| Q-P1-4 | Genre 선택 UI는? | **채팅으로 수집 → Dashboard에 표시**. 별도 Genre 선택 UI 없음. Producer Agent가 대화 중 파악. | V2 (reference_v2). Project Dashboard |

### 열린 질문

(없음 — V2 기준 P1 결정 완료)

> P1 결정 완료. 구현 순서상 마지막 Phase.

---

## P2 Story Writer (MVP 포함)

### UX.pdf에 있는 것
- 좌: 채팅창 (AI 작가 초대, 씬 구성 논의/수정)
- 중: 스토리 요약 + 출연진 목록
- 우: 씬 목록 (씬1~씬10)
- 하단: 프로젝트 설정 표시

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-P2-4 | 씬 개수 제한/기본값은? | **기본 4개 (기승전결)**. MVP 목표 ~8분 = 4 Scene = 24~48 Shot | overview.md §2 |
| Q-P2-2 | 씬 수정 방식은? | **채팅 + 인라인 편집 병행**. AI 작가 채팅 패널 별도 존재 (수정 가능) + 씬 카드 클릭 → Scene Detail Editor (Location, Time, Key Conflict, Description). | V2 (reference_v2) + 2026-03-03 팀 확인. 스크린샷에 채팅 안 보인 건 MVP 명령어 기준 빌드 때문. |
| Q-P2-5 | 스토리 요약 패널은 자동생성인가? 편집 가능한가? | **씬 카드가 요약 역할**. 4개 씬 카드 (기승전결) 자동생성 + "Auto-Generate Scenes" 버튼. 편집 가능. 별도 요약 패널 없음. | V2 (reference_v2). "The Script Room" |
| Q-P2-6 | P2 완료 시점 판단은? | **"Ask Concept Artist →" Handoff 버튼**. 사용자가 씬 구성에 만족하면 직접 클릭. | V2 (reference_v2). Stage 전환 패턴 |

### 열린 질문

| ID | 질문 | 맥락 |
|----|------|------|
| Q-P2-1 | AI 작가의 시스템 프롬프트/역할 정의는? | 어떤 톤으로 가이드하는가? 자유도는? 채팅 패널 존재 확인됨, 역할 상세 미정 |
| Q-P2-3 | 출연진 추출은 자동인가 수동인가? | L1이 씬 분할 시 캐릭터 추출하지만, 수동 추가 허용 여부 미정 |

> P2 열린 질문 2개 남음. 구현 시 결정 필요.

---

## P3 Concept Artist / Visual Studio (MVP 포함)

> **V2 구조 변경**: P3 범위가 **에셋 전용** (캐릭터 + 배경)으로 축소. 기존 Storyboard 탭(샷별 이미지 그리드)은 P4로 이동. 2026-03-03 팀 확인.

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-P3-1 | P3→P4 전환 모델은? | **순차 진행 + "Approve & Direct" Handoff 버튼**. P3에서 에셋 확정 후 P4로 이동. | Decision #21 + V2 (reference_v2) |
| Q-P3-2 | P3 배경 UI는? | **"World Model" 2컬럼 우측**. Wide Shot + Establishing Shot. Cinematic Boost 필터 프리셋 제공. | V2 (reference_v2). 기존 Stage 탭 → 2컬럼 통합 |
| Q-P3-3 | 캐릭터 멀티앵글 생성 방식은? | **Consistency Sheet** (Front/Side/Back) + "Generate Sheet" 버튼. Asset Locking으로 일관성 고정 표시. | V2 (reference_v2). 기존 3뷰 유지, Lock 기능 추가 |
| Q-P3-4 | P3에서 Storyboard(샷별 이미지 그리드)는? | **P4로 이동**. P3은 캐릭터/배경 에셋 전용. Shot Node Grid는 P4 Director에서 담당. | 2026-03-03 팀 확인 |

### 열린 질문

(없음 — P3 결정 완료)

---

## P4 Director / The Set (MVP 포함)

> **V2 구조 변경**: P4가 기존 Storyboard(샷별 이미지 그리드) + 촬영 설정을 통합. Shot Node Mindmap이 핵심 UI. 2026-03-03 팀 확인.

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-P4-1 | P4에서 Start Frame 재생성 가능한가? | **P4에서는 불가**. 캐릭터/배경 에셋은 P3에서 관리하고 Lock. P4에서는 샷별 이미지 자동 생성 + 카메라/조명 설정만 편집. 에셋 재생성은 P3 복귀 필요. | Decision #25 (P3 에셋 전용) |
| Q-P4-2 | 씬연결 동작은? | **Start Frame + End Frame → I2V 영상 생성**. Frame Mode 선택 (Start only / Start-to-End / Next Start). 결과는 P5 Editor로. | Decision #21 + V2 (reference_v2) |
| Q-P4-3 | 조명 설정 UI는? | **Lighting Sphere UI**. Key Light 위치(L/T/R/F) + 밝기 + 색온도 다이얼. 프리셋에서 상호작용형으로 변경. | V2 (reference_v2). 기존 프리셋만 → Sphere UI로 업그레이드 |
| Q-P4-4 | Storyboard 그리드가 P4에 있는가? | **맞음**. Shot Node Grid-Mindmap 형태. 씬별 샷 노드 + 캐릭터/배경 서브노드 연결. | 2026-03-03 팀 확인 |

### 열린 질문

(없음 — P4 결정 완료)

---

## P5 Editor / Post-Production Suite (MVP 포함 — Lite)

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-SYS-5 | P5 Editor 상세 스펙 | **V2에서 디자인 확정**. 중앙 비디오 프리뷰 + 하단 타임라인 (씬별 탭 + 샷 썸네일 + 음악 Waveform) + AI 도구 (In-Pointing 시간 가이드, In-Painting 영역 교체). Draft 렌더링 버튼. | V2 (reference_v2/image5.png) |

### 열린 질문

(없음 — V2 기준 P5 디자인 확정)

> P5 Lite로 MVP 포함 (Decision #27). AI 편집 도구는 Post-MVP.

---

## 시스템 전반

### 닫힌 질문

| ID | 질문 | 결정 | 근거 |
|----|------|------|------|
| Q-SYS-3 | 실시간 vs 배치 생성 | **배치 자동생성 + 개별 재생성**. Storyboard에서 전체 샷 이미지 배치 생성 후, 개별 샷 선택하여 재생성 | mvp_scope.md §3.4 |
| Q-SYS-4 | 인증/인가 방식은? | **MVP 단계 불필요**. 제외 | Decision #23. mvp_scope.md §1 |
| Q-UX-1 | 사이드바 네비게이션: 자유이동 범위는? | **영상생성 직전까지 이전 Stage 자유 복귀 가능**. 영상생성 시작 후에는 불가. | 2026-03-03 논의 |

### 열린 질문

| ID | 질문 | 맥락 |
|----|------|------|
| Q-SYS-1 | 프로젝트 저장/불러오기 방식은? | 자동저장? 수동? Supabase에 저장? 로컬? |
| Q-SYS-2 | 에러 핸들링 (API 실패, 타임아웃) | 재시도? 사용자 알림? fallback? |
| Q-SYS-6 | 백엔드 API 엔드포인트 목록 | 기술 스택은 확정 (Next.js API Routes). 엔드포인트 상세는 P3/P4 구현 시 정의 |
| Q-L2-1 | 대사(Dialogue) 용도: 프롬프트/TTS/자막/하이브리드? | 영상 API 립싱크 품질 테스트 후 결정. `specs/layers/L2_shot_composer.md` 참조 |

---

## 요약

| 구분 | 열린 | 닫힌 | 비고 |
|------|------|------|------|
| **제품 방향** | 0 | **1** | Q-DIR-1 닫힘 |
| P1 Ground | 0 | **6** | V2 기준 전부 닫힘. MVP 포함 |
| P2 Story Writer | **2** | **4** | Q-P2-1(AI역할), Q-P2-3(출연진) 미정. MVP 포함 |
| P3 Concept Artist | 0 | **4** | V2 구조 변경 반영. 에셋 전용 |
| P4 Director | 0 | **4** | V2 구조 변경 반영. Storyboard 통합 |
| P5 Editor | 0 | **1** | V2 디자인 확정. MVP Lite 포함 |
| 시스템 전반 | **4** | 3 | Q-L2-1(대사용도) 추가. SYS-1,2,6 미정 |
| **합계** | **6** | **23** | MVP = P1~P5 (Decision #28) |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-03 | V3: P1~P5 전체 MVP 포함 반영. Q-L2-1(대사용도) 추가. Q-P4-1 근거 수정. 열린 5→6 |
| 2026-03-03 | V2 (reference_v2) 반영. P1 전부 닫힘, P2 3개 닫힘, P3/P4 구조 변경 (Storyboard→P4 이동), P5 디자인 확정. 열린 질문 13→5 |
| 2026-02-26 | Q-DIR-1 닫힘 (둘 다, 같은 파이프라인). Q-P1-6 닫힘 (채팅+파일). 팀 논의 반영 |
| 2026-02-25 13:09 | 닫힌 질문 통합 정리 (decisions.md, mvp_scope.md 근거) |
| 2026-02-25 | 초안 작성 (스펙 인터뷰 기반) |
