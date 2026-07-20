# Knowledge DB (cinematography RAG) — 현황·문제 노트

> 작성 2026-07-11. **성격: WIP 상태 기록 (캐넌 아님).** 정식 결정·descope는 아직 없음 —
> 이 문서는 "문제가 있다"를 명시해 두는 용도. 향후 방향은 `specs/changes/<name>/`의 active change로 명세.

## 한 줄 요약

**제품이 핵심 차별점으로 내건 "Knowledge DB 기반 cinematography RAG"는 현재 코드상 사실상 죽어 있다.**
데이터를 쌓는 경로가 없고, 있는 데이터도 결과물에 반영되지 않는다.

## 무엇이 문제인가

### 1. 채우는(write) 경로가 존재하지 않는다
- `knowledge_techniques` 테이블에 INSERT/UPSERT 하는 코드: 리포 전체 **0줄**
  (`src/types/database.ts`의 타입 정의 + `src/lib/knowledge.ts` 주석뿐).
- 어드민 UI 없음, 시드/인제스트 스크립트 없음, 쓰기 API 라우트 없음
  (`src/app/api/knowledge/` = `cameras`·`movements` 둘 다 GET 전용).
- 현재 30행은 2026-01-28에 한 번 시드된 씨앗이며 그 뒤로 증가 경로가 없다.

### 2. 원래 설계된 적재 파이프라인은 라이브 DB에 미배포
- 설계상 성장 수단 = **Video Reference DB** (historical decision #12, `docs/legacy/decisions/decisions.md`):
  `videos → analysis_jobs → shot_analysis`, 워크플로우 `pending → analyzed(LLM) → reviewed(Human)`.
- 그러나 이 3테이블은 `databases/migrations/001_video_reference.sql`에만 있고
  **라이브 DB엔 없음** — `.claude/cache/db/_migration-sync.md`의
  "migrations에 선언됐으나 live DB ABSENT" 목록에 `videos`/`shot_analysis`/`analysis_jobs` 존재.
- decision #13이 약속한 `SupabaseKnowledgeDB` 어댑터도 코드에 없음 (미구현).

### 3. 있는 30행조차 결과물에 반영되지 않는다
- `queryTechniques()`(`src/lib/knowledge.ts`)는 아직도 존재하지 않는
  `databases/knowledge/*.yaml`을 읽으려다 실패 → 조용히 `[]` 반환(graceful degrade).
  즉 **DB의 30행을 아무 코드도 읽지 않는다.**
- 유일한 소비처 `/api/director/generate-shots`는 `writer-store.regenerateScene`에서만
  호출되는데, `regenerateScene`을 부르는 **UI가 없음** → 3중 사문화.
- 소비처가 옛 자리에 남은 원인: **샷 생성이 writer 엔진으로 이관(decision #38)**됐는데
  knowledge 조회는 옛 director 라우트에 남겨짐. specs가 이 이사를 아직 미반영.

### 4. "있는 척 / 없는 척" 역전
- **director/chat** 시스템 프롬프트는 "your knowledge base를 참고해 추천"이라고 말하지만
  파일이 `@/lib/knowledge`를 **import하지 않음** → retrieval 없는 hallucination.
- **producer/chat**은 영화 지식 질문을 "제 일이 아니다"라며 회피했음
  (2026-07-11 프롬프트 수정으로 이 증상은 제거 — 아래 "이미 조치").

### 5. 문서·하네스 부패
- `queryTechniques` 필터 버그: `src/lib/knowledge.ts`의 `moodMatch || shotMatch`는
  `moods`가 비면 전체 30행 매칭. 지금은 항상 `[]`라 잠들어 있는 버그 — DB 연결 시 반드시 동시 수정.
- 2026-07-20 문서 정리에서 stale `CLAUDE.md` 라우터와 현재 결정 장부는 제거됐다.
- 과거 결정 이력은 `docs/legacy/decisions/`에 격리됐으며 현재 구현의 권위가 아니다.

## 살아 있는 부분 (참고 — 전부 죽은 건 아님)
- 카메라 기어/무브먼트는 `src/lib/knowledge.ts`에 **코드 상수로 인라인**되어 정상 작동.
  `findCameraMovement()`의 `prompt_fragment`가 `/api/director/generate-video`에서
  실제 비디오 프롬프트에 주입됨. techniques 30행도 같은 방식이면 오늘 당장 유효해질 수 있음.

## 기대 동작 (원래 의도)
- 역할: 사람이 쓴 스토리 문장 ↔ 이미지/비디오 모델이 알아듣는 촬영 용어 사이의 **번역 사전**.
  검색 키 = `emotional_tags`(분위기) + `shot_type_affinity`(샷 타입), 출력 = `prompt_fragment`.
  (벡터 임베딩이 아니라 태그 매칭 룩업 — "RAG"는 다소 과한 명명.)
- 커버 경계: **"어떻게 찍을까"만** (카메라·조명·화면 질감). "무엇을 찍을까"(이야기·인물)엔 미개입.
  프로젝트 비종속 = 어느 작품에서든 재사용되는 것만 (decision #1: "L3는 연출 테크닉만").
- 소비 위치:
  - producer: **미사용**. 단 여기서 정하는 `tone` 태그가 나중에 창고를 뒤질 열쇠가 됨.
  - **writer 엔진: 진짜 자리.** artDirection(`rendering_style`) / sceneCinematography·shotDesign
    (`camera_language`/`shot_grammar` 후보 좁히기) / **renderPrompts(`prompt_fragment` 실제 주입)**.
    (주의 decision #17: 별도 필드 말고 프롬프트 본문에 녹여야 모델이 읽음.)
  - director: **제안**으로 등장 (사람이 6축 카메라 만질 때 추천). 다리 절반은 이미 존재(무브먼트 축값).
  - artist/editor: 미사용.

## 향후 선택지 (요약 — 미결정)
- **A. 솔직한 축소**: 30행을 카메라 무브먼트처럼 코드 상수로 인라인해 writer `v5_prompts`에 주입.
  `knowledge_techniques`·Video Reference DB는 decisions에 정식 descope 기록. constitution의
  "차별점" 문장을 현실에 맞게 하향. (가장 쌈, 오늘 가능)
- **B. 손으로 채우는 창고**: DB 어댑터 + 어드민 CRUD. 30→200행 되면 값어치 발생. 필터 버그 동시 수정.
- **C. 원안 완주**: Video Reference DB + LLM 영상 분석 잡 + 사람 리뷰 UI.
  손님이 레퍼런스(예: 아키라)를 던지는 행위 = 창고를 먹이는 행위. 진짜 차별점이자 가장 큰 공사.

## 이미 조치됨 (2026-07-11)
- producer/chat 시스템 프롬프트 수정: 영화 레퍼런스/오마주/기법 질문에 답한 뒤 프로젝트로
  착지시키도록 규칙 추가. "제 일이 아니다"식 회피 제거.
  (`src/app/api/produce/chat/system-prompt.ts`) — RAG 자체 복원과는 무관한 별개 수정.
