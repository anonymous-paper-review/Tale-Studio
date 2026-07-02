# src/lib/writer — writer 엔진 (백엔드 전용 스테이지)

> 파이프라인은 백엔드 실행 (decision #38) — 단, `/studio/writer` 탭이 러프 스토리보드 검토 UI로
> 부활 (2026-06-12, `rough-storyboard.ts` + `/api/writer/rough-storyboard`).
> producer 핸드오프(`/api/writer/start`)에서 백그라운드 실행되어
> DB(characters/scenes/locations/shots)를 채운다. 비동기/재시도/체이닝 규칙은 `.claude/rules/async-generation.md`.
>
> **역할 분담 (producer-story-gate, 2026-06-12)**: 옛 `s0`(장르축)·`s2`(캐릭터 정의) 스테이지는
> **삭제됨** (Section 4 완료). producer가 게이트로 확정한 값을 `createRun`이 `state.genre`/
> `state.characters`로 **seed**하므로 writer는 s1(structure)부터 수행한다. genre seed가 없으면
> `narrativeStructure`의 `s.genre!`에서 실패 — 핸드오프는 항상 seed.
> 분담 = **producer(스토리 정체성: 장르축+캐스트) → writer(전개: s1 구조·s3 씬 + 연출: v0~v5) → 러프 보드**.

## 실행 모드 2개 (혼동 주의)

| 모드 | 파일 | 용도 | 상태 운반 |
|---|---|---|---|
| **서버리스 체이닝** | `pipeline/steps.ts` | 프로덕션 경로. step당 1 stage, `after()`로 자가 체이닝 | `WriterRunState` JSONB (인스턴스 간 메모리 공유 없음 — state가 유일한 캐리어) |
| 로컬 전체 실행 | `pipeline/index.ts` | 개발/디버그. `resume=true`면 기존 stage 파일 캐시 재사용 (`loadOrRun`) | 로컬 파일 (`logger/` 프로젝트별 디렉토리) |

## 스테이지 (pipeline/stages/)

step 키는 film-craft 명, **파일명 prefix는 v0~v7** (2026-06-13 l→v 리네임; `v0_visual`=v0(VisualIdentity)·`v1_act_arc`=v1(ActVisualArc), `c_*`/`s_*`는 C/S축):

- **Story축 (S, Gemini)**: ~~`s0_genre`·`s2_characters`~~ **삭제됨** (producer seed로 대체, §3) → `s1_structure`(narrativeStructure) → `s3_scenes`(scenes — **오픈 캐스트 계약**: 기존 cast slug 주입 + `new_characters[]` 분리 반환 → `mergeOpenCast`가 state.characters에 머지 → persistAssetsToDb가 origin='writer' insert)
- **검증 (C, Claude)**: `c_validation_1`(storyCheck) / `c_application_2` — skip 플래그로 생략 가능 (비용 절감)
- **Visual축 (V, Gemini)**: `mid_preview` → `v0_visual`(visualIdentity) → `v1_act_arc`(actVisualArc) → `v2_design`(characterVisual+worldVisual, native) → `v3_scene_plan`(sceneCinematography — rule-base 자기검증 `validators/scene_cinematography.ts`+1회 교정 / Compact Mode 시 생략)
- **샷/렌더**: `decoupage` → `v4_shots`(shotDesign/shotSequence) → `v5_prompts`(renderPrompts) → `v6_images` → `v7_videos`
- **에셋 이미지**: ~~`assetImages` step~~ **제거됨** (producer-story-gate 결정 8) — 캐릭터/로케이션 이미지 초기 생성은 **artist 전담**(artist 진입 시 `autoGenerateBaseImages` 자동 1회·멱등). writer 파이프라인은 행(characters/locations/scenes)만 채운다. (옛 `assets_generate.ts` + 수동 라우트 `/api/writer/generate/assets`는 superseded → **제거됨**, 2026-06 V축 재설계 정리.)

## 하위 모듈

| 폴더 | 내용 |
|---|---|
| `llm/` | `dispatch.ts` (S/V/C 축별 프로바이더 라우팅), `fal.ts` (이미지/비디오 submit/fetch), `retry.ts` (`withLlmRetry`), `json_repair.ts`, `raw_collector.ts`, 프로바이더별 어댑터 (claude/gemini/openai/local) |
| `pipeline/util/` | `persist_manifest.ts` (DB 행 기록 — 이미지 컬럼은 안 건드림), `persist_design_tokens.ts`, `asset_refs.ts`, `infer_v3.ts` |
| `pipeline/validators/` | stage 산출물 검증 |
| `types/` | `pipeline.ts` — stage 입출력 타입 |
| `logger/` | 프로젝트별 실행 로그 (raw LLM 호출 포함, 순번 prefix JSON) |
| `adapters.ts` / `run-store.ts` / `use-writer-status.ts` | 외부 연결: DB run 상태(`running/completed/failed`), 클라 상태 훅 |
| `shot-config-from-design.ts` | shotDesign(V4) → 6축 `camera_config`/`lighting_config` 근사 매핑. Director 진입 시 `writer_runs.state->shotDesign`에서 복원해 "DB가 DEFAULT일 때만" 자동 채움(`/api/writer/shot-configs` + `use-writer-director-sync`) |

## 규칙

- step 산출물은 **state 또는 DB에만** — 서버리스 인스턴스 로컬에 남기지 않는다.
- 새 stage 추가 시: steps.ts step 정의(`key`/`has`/runner) + index.ts 로컬 경로 + validators 동시 갱신.
- **characters = 입력**(producer-story-gate §4): 재실행해도 기존 행 보존(additive) — 새 slug만 `origin='writer'` insert + 빈 보강 필드만 채움. scenes = 출력(매 실행 재생성). **locations 는 혼합**(2026-06-30): `origin='producer'` 행은 입력 보존(name/purpose/visual_description 불변, writer 파생 필드만 갱신), writer-origin 행만 재생성. 이미지는 writer 손 밖(artist 전담, forward).
- Compact Mode (genre.depth_level 기반)가 후행 stage를 생략할 수 있음 — `has` 체크가 빈 산출물(`[]`)도 통과시키는지 확인.
- 모델 ID는 dispatch.ts/fal.ts에서만 — stage 코드에 하드코딩 금지.
