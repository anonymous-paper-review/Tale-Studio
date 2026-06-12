# src/lib/writer — writer 엔진 (백엔드 전용 스테이지)

> 파이프라인은 백엔드 실행 (decision #38) — 단, `/studio/writer` 탭이 러프 스토리보드 검토 UI로
> 부활 (2026-06-12, `rough-storyboard.ts` + `/api/writer/rough-storyboard`).
> producer 핸드오프(`/api/writer/start`)에서 백그라운드 실행되어
> DB(characters/scenes/locations/shots)를 채운다. 비동기/재시도/체이닝 규칙은 `.claude/rules/async-generation.md`.

## 실행 모드 2개 (혼동 주의)

| 모드 | 파일 | 용도 | 상태 운반 |
|---|---|---|---|
| **서버리스 체이닝** | `pipeline/steps.ts` | 프로덕션 경로. step당 1 stage, `after()`로 자가 체이닝 | `WriterRunState` JSONB (인스턴스 간 메모리 공유 없음 — state가 유일한 캐리어) |
| 로컬 전체 실행 | `pipeline/index.ts` | 개발/디버그. `resume=true`면 기존 stage 파일 캐시 재사용 (`loadOrRun`) | 로컬 파일 (`logger/` 프로젝트별 디렉토리) |

## 스테이지 (pipeline/stages/)

step 키는 film-craft 명, **파일명은 옛 순번 prefix 유지** (리네임 미적용 — 키↔파일 매핑 주의):

- **Story축 (S, Gemini)**: `s0_genre`(genre) → `s1_structure`(narrativeStructure) → `s2_characters`(characters) → `s3_scenes`(scenes)
- **검증 (C, Claude)**: `c_validation_1`(storyCheck) / `c_application_2` — skip 플래그로 생략 가능 (비용 절감)
- **Visual축 (V, Gemini)**: `mid_preview` → `l0_l1_visual`(renderFormat/artDirection) → `l2_design`(productionDesign) → `l3_scene_plan`(sceneCinematography — Compact Mode 시 생략)
- **샷/렌더**: `decoupage` → `l4_shots`(shotDesign/shotSequence) → `l5_prompts`(renderPrompts) → `l6_images` → `l7_videos`
- **에셋**: `assets_generate` — 캐릭터/로케이션 이미지 fal submit (완료는 webhook이 DB 기록, state엔 submitted 플래그만)

## 하위 모듈

| 폴더 | 내용 |
|---|---|
| `llm/` | `dispatch.ts` (S/V/C 축별 프로바이더 라우팅), `fal.ts` (이미지/비디오 submit/fetch), `retry.ts` (`withLlmRetry`), `json_repair.ts`, `raw_collector.ts`, 프로바이더별 어댑터 (claude/gemini/openai/local) |
| `pipeline/util/` | `persist_manifest.ts` (DB 기록), `persist_design_tokens.ts`, `submit_asset_images.ts`, `asset_refs.ts`, `infer_l3.ts` |
| `pipeline/validators/` | stage 산출물 검증 |
| `types/` | `pipeline.ts` — stage 입출력 타입 |
| `logger/` | 프로젝트별 실행 로그 (raw LLM 호출 포함, 순번 prefix JSON) |
| `adapters.ts` / `run-store.ts` / `use-writer-status.ts` | 외부 연결: DB run 상태(`running/completed/failed`), 클라 상태 훅 |

## 규칙

- step 산출물은 **state 또는 DB에만** — 서버리스 인스턴스 로컬에 남기지 않는다.
- 새 stage 추가 시: steps.ts step 정의(`key`/`has`/runner) + index.ts 로컬 경로 + validators 동시 갱신.
- Compact Mode (genre.depth_level 기반)가 후행 stage를 생략할 수 있음 — `has` 체크가 빈 산출물(`[]`)도 통과시키는지 확인.
- 모델 ID는 dispatch.ts/fal.ts에서만 — stage 코드에 하드코딩 금지.
