# Writer 파이프라인 전체 data lineage (오버홀 점검용)

> 모든 entity의 전 구간 연결: 산출(from) → writer 내부 소비(to) → DB persist → 하류 소비 → 최종.
> 시각: `dev/writer-pipeline-lineage-full.excalidraw`. 근거: `steps.ts` 라인 + `persist_manifest.ts` + 하류 store.

## 1. entity별 완전 연결표

| entity | 산출 | writer 내부 소비 (to) | DB persist | 하류 최종 소비 | 점검 |
|---|---|---|---|---|---|
| **Genre** | seed | s1·s3·storyCheck·midPreview·visualFormat·sceneCine·decoupage·shotDesign·shotCheck (9) | ✗ (state만) | — | 전역 재료, 거의 전 stage |
| **Characters** | seed (+s3 머지) | s3·storyCheck·midPreview·l2·sceneCine·decoupage·shotDesign·shotCheck·l5 (9) | DB.characters (additive) | Artist·Director·Writer탭 | producer 확정 정체성 보존 |
| **NarrativeStructure** | s1 | s3·storyCheck·midPreview·shotCheck (4) | ✗ | — | |
| **Scenes** | s3 | storyCheck·l2·sceneCine·decoupage·shotDesign (5) | DB.scenes | Writer탭·Director | ⚠ act_ref·key_dialogue·info_asymmetry·emotion_beat구조 **탈락** |
| **StoryCheckReport** | storyCheck | midPreview (1) | ✗ | — | ⚠ **기본 skip** → 빈 리포트 |
| **MidPreview** | midPreview | visualFormat·l2·sceneCine (3) | ✗ | — | ⚠ **기본 skip** → 빈 추천 |
| **RenderFormat** | visualFormat | shotCheck·l5 (2) | design_tokens | — | (visualFormat 1step 2산출) |
| **ArtDirection** | visualFormat | l2·sceneCine·decoupage·shotDesign·shotCheck (5) | design_tokens | — | **허브 1** |
| **ProductionDesign** | l2 | sceneCine·decoupage·shotDesign·shotCheck·l5 (5) | DB.locations(.locations만) | Artist | **허브 2** / costumes·palette는 state만 |
| **SceneCinematography** | l3 (compact시 l4 역추론) | decoupage·shotDesign·shotCheck (3) | ✗ (state만) | — | ⚠ **DB 미보존 증발** (lighting_arc·rhythm·sound_motif) |
| **DecoupagePlan** | decoupage | shotDesign (1) | ✗ (state만) | — | ⚠ rhythm_role·shot_function·source_beats **증발** |
| **ShotDesign[]** | l4 | shotCheck (1) | ✗ (state만) | (Writer탭 우회) | ⚠ static/dynamic spec 증발 — **러프보드만 state 우회로 회수** |
| **ShotSequence** | shotCheck | l5 + **DB.shots** | DB.shots | Writer탭·Director | ⚠ V/C/action_budget/continuity **탈락**, camera_config=기본값0 |
| **RenderPromptsOutput** | l5 | **없음** | ✗ | **DEAD-END** | ⚠ LLM 비용 쓰고 프로덕션 미소비 (l6/l7 미배선) |

## 2. 오버홀 결정 포인트 (도식의 빨강/점선이 가리키는 것)

### A. 증발 — "산출했지만 DB까지 못 가는 연출 정보"
- **ShotSequence의 V/C/action_budget/continuity** → `shots`에 안 실리고 `camera_config`가 0으로 덮임. director/editor가 연출값을 기본값에서 시작.
- **SceneCinematography·DecoupagePlan·ShotDesign 전체** → DB 미보존, `writer_runs.state`(JSONB)에만. 어느 클라이언트도 직접 못 읽음.
- **결정 필요**: 어느 facet을 DB 스키마(shots 확장 또는 신규 테이블)까지 살릴지. ← 러프보드/콘티 품질의 뿌리.

### B. Dead-end / 미배선
- **RenderPromptsOutput(l5)**: 매 run LLM 비용으로 T2I/TI2V 생성하지만 프로덕션 소비 0. l6(images)/l7(videos)가 WRITER_STEPS에 미배선.
- **결정 필요**: l5를 ① 제거 ② l6/l7 배선해 실제 생성 입력으로 연결 ③ DB 영속.

### C. 우회 의존 (취약)
- **러프 스토리보드**가 `writer_runs.state→shotDesign`을 직접 SELECT(persist 증발 우회). state 보존기간·구조에 의존하는 임시 경로.
- **결정 필요**: shotDesign spec을 정식 DB 영속으로 승격하면 우회 제거 가능.

### D. 死스테이지 (항상 skip)
- **storyCheck·midPreview**: `input.skip` 기본 true이고 producer가 끄는 값을 안 보냄 → 항상 빈 산출물. midPreview 빈값이면 visualFormat/l2/l3가 자체 결정. storyCheck의 causality/CDQ 점수는 생산조차 안 됨.
- **결정 필요**: 켤 가치가 있나(품질↑) vs 비용. 켤 경로(start 라우트가 skip 전달) 신설 여부.

### E. 단일 소비처 직렬 (전파 위험)
- **decoupage→shotDesign→shotCheck**: 각각 유일 소비처. 한 단계 산출 오류가 전 하류로 직결 (대안 경로 없음).

### F. 중복 기록 (스키마 정리 대상)
- `locations.style_description` + `visual_description`(이중), `characters.appearance` + `description`(이중) — 레거시 컬럼 잔존.

### G. shotDesign rich → l5 미전달 死코드
- l4의 풍부한 spec이 shotCheck를 *경유*해야만 l5 도달. l5의 `static_spec.first_frame_prompt` fallback은 타입상 도달 불가(死코드).

## 3. 오버홀 우선순위 제안
1. **(A) 증발 차단** — 어느 연출 facet을 DB까지 살릴지 스키마 결정 (shots 확장 vs shot_specs 신규 테이블). 우회(C)·러프보드/콘티 품질이 여기 달림.
2. **(B) l5 dead-end 처리** — 제거 또는 l6/l7 배선.
3. **(D) skip 스테이지** — 켤지/제거할지 결정 (死코드 정리).
4. **(F/G) 스키마·死코드 정리** — 중복 컬럼, l5 fallback.
