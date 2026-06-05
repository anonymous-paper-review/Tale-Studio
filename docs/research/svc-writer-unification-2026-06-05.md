# SVC↔Writer 일원화 + DB 정합 작업 기록 (2026-06-05)

> 성격: **세션 작업 기록 (research/WIP)** — 캐넌 아님. 의사결정 요약은 `specs/decisions.md #38`,
> 진행 변경은 `specs/changes/unify-svc-writer-pipeline/`. 본 문서는 "무엇을 왜 어떻게 했는지" 통합 서사.

## TL;DR

1. Supabase **MCP 미연결** 확인 → MCP 없이 라이브 DB를 introspect하는 **오프라인 스키마 캐시**(`.claude/cache/db/`) 구축.
2. **마이그레이션 ↔ 라이브 DB ↔ 코드** 3-way 대조 → `databases/migrations/`가 라이브와 **분리(orphan)**, 코드가 **존재하지 않는 컬럼에 write**(Director/Editor 기능이 조용히 실패)임을 실증.
3. 정합 마이그레이션 **007/008/009** 작성·적용(라이브 pg 직접). `database.ts` 라이브 기준 재생성.
4. **SVC 파이프라인 = 진짜 writer 엔진**으로 일원화: SVC가 DB(characters/scenes/locations/shots)를 채우고, 옛 `generate-scenes` writer와 `fixed_prompt`를 제거. `appearance` 단일 캐릭터 프롬프트.
5. `svc` → `writer` 리네임, writer **UI 제거(백엔드 전용)**, 죽은 옛 writer 백엔드 정리.

전 과정 `tsc --noEmit` clean. DB 변경은 라이브에서 검증.

---

## 1. DB 스키마 캐시 (`.claude/cache/db/`)

- Supabase MCP 미연결(`claude mcp list` 빈 값). `.env.local`의 service role key로 **PostgREST OpenAPI**(`/rest/v1/`) introspect.
- 산출물(테이블별 `*.md`: 스키마/타입/PK·FK/enum 관측값/JSONB 형태/예시 행 + `_migration-sync.md` drift 리포트).
- 스크립트(추적): `_refresh.py`(캐시 재생성), `_gen_types.mjs`(database.ts 생성), `_apply_migration.mjs`(pg DDL 적용).
- 실데이터·프로젝트 URL 보호 위해 `db/*.md`는 gitignore, 스크립트만 추적.
- **갱신**: `python3 .claude/cache/db/_refresh.py`.

## 2. 3-way 갭 분석 (코드 / 라이브 DB / 마이그레이션)

핵심 발견(실증):
- `databases/migrations/001~003`이 만드는 테이블(videos/camera_* 등)은 **라이브에 없고 앱도 미사용**. 앱이 쓰는 핵심 테이블(projects/shots/...)은 **마이그레이션 CREATE가 아예 없음** → 마이그레이션 폴더는 옛 비전, 실제 스키마는 Supabase에 직접 존재.
- 코드가 `shots`에 update하던 `camera_brand/focal_length/aperture/white_balance/movement_preset/movement_intensity/storyboard_image/speed`가 **라이브에 부재** → PostgREST가 행 전체 거부:
  - Director 카메라/무브먼트 영속화 **조용히 실패**(try/catch+warn), Editor 속도 **500**.
- `src/types/database.ts`(생성 타입)도 라이브와 양방향 불일치(messages 누락, owner_id/view_three_quarter_* 누락 등).

## 3. 정합 마이그레이션 (라이브 적용 완료, pg 직접)

| 파일 | 내용 |
|---|---|
| `007_align_live_schema.sql` | shots에 camera_brand/focal_length/aperture/white_balance/movement_preset/movement_intensity/speed/storyboard_image(JSONB) 추가 |
| `008_svc_design_tokens.sql` | projects.design_tokens(JSONB) + characters.appearance/costume + locations.style_description/lighting_sources/props |
| `009_drop_fixed_prompt.sql` | characters.fixed_prompt DROP (appearance로 단일화) |

> 적용 경로: supabase CLI는 리모트 마이그 히스토리(다른 계보 8개)와 불일치해 `db push` 불가 → **pg(pooler)로 DDL만 외과 적용**. 리모트 히스토리 미변경.
> `storyboard_image`는 소비측(ShotNode)이 객체로 읽으므로 JSONB, upload-image 라우트가 `{url,status,generatedAt}` 객체를 쓰도록 수정.

## 4. SVC = Writer 일원화 (specs/changes/unify-svc-writer-pipeline §3)

### 배경 (기능 구분)
- **옛 writer**(`/api/write/generate-scenes`, 3-step): Pumpup→Scene Architect→Shot Composer → DB. 앱이 실제 소비. `description`+`fixed_prompt` 생성.
- **SVC**(`/api/svc/start`, 16단계): S0~L5 시네마토그래피(검증/비주얼스타일/3분할샷/최종프롬프트). 출력은 **로그파일**, `adapters.ts`(SVC→앱타입)는 **호출 0=dead**. 앱 소비 = progress + design_tokens뿐.
- 둘 다 producer 핸드오프에서 병렬 발사 → **중복 LLM + 캐릭터 프롬프트 2개**(fixed_prompt vs appearance). SVC가 상위집합이라 SVC를 남기고 옛 writer 제거.

### P1 — SVC→DB persist (`src/lib/writer/pipeline/util/persist_manifest.ts`)
- 기존 `adapters.ts`는 **대사 손실**(L4 연결)임을 발견 → 샷별 대사를 가진 `shot_sequence` 기반으로 persist 새로 작성.
- 매핑: characters(appearance=appearance_description, costume) / locations(L2) / scenes(S3) / shots(shot_sequence, 대사 포함). scene·shot id는 sc_01/sh_01_01 정규화, character id는 SVC snake_case 유지(샷↔캐릭터 정합).
- 파이프라인 끝에서 non-blocking 훅. **라이브 합성 테스트로 매핑 검증**(임시 프로젝트 insert→확인→cascade 삭제).

### P2 — 핸드오프 + 소비측
- `producer-store`: generate-scenes 발사 제거, `/api/writer/start`만.
- 소비측 4곳 `c.fixed_prompt` → `c.appearance` (buildCharacterPrompt 입력). description/visual_description 등 레거시 필드는 persist가 함께 채워 무변경 유지.

### P3 — fixed_prompt drop
- `009`로 컬럼 제거, database.ts 재생성.

## 5. 리네임 + UI 제거 + 죽은 백엔드 정리 (§4 용어 정리)

- **리네임**: `src/lib/svc`→`src/lib/writer`, `src/app/api/svc`→`src/app/api/writer` (git mv + import/fetch 일괄, src+tests).
- **writer UI 제거**(백엔드 전용): `src/app/studio/writer/page.tsx`, `src/features/writer/` 삭제. `constants.ts` nav에서 writer 스테이지 제거(producer→artist 직행), 사이드바 정리.
- **죽은 옛 writer 백엔드 제거**: `api/write/generate-scenes`·`api/write/chat` route, `writer-store`의 `generateScenes`/`regenerateAllShots`/`applyUpdates`+`WriterUpdate` 타입, `global-chat-store`의 writer 분기. `writer-store`는 **공유 데이터 허브로 유지**(artist/director가 sceneManifest/shots 소비).

## 6. 남은 것 / 후속
- `characters.description` vs `appearance`, `locations.visual_description` vs `style_description` **중복 컬럼 정리**(현재 persist가 양쪽 채워 가동 우선) — 후속 마이그레이션.
- SVC 파이프라인 **풀 런(LLM) 런타임 검증** 미수행(합성 테스트만). 실제 핸드오프 1회로 design_tokens/manifest 채워지는지 확인 권장.
- `use-svc-status.ts`/`svc-progress.tsx` 등 **파일명에 svc 잔존**(경로/타입은 writer로 이전, 파일명만 cosmetic).

## 7. 변경 파일 인벤토리 (주요)
- 신규: `databases/migrations/007~009`, `src/lib/writer/pipeline/util/persist_manifest.ts`·`persist_design_tokens.ts`, `.claude/cache/db/*`(스크립트)
- 수정: `src/types/database.ts`(재생성), `src/stores/{producer,writer,artist,director,global-chat}-store.ts`, `src/lib/constants.ts`, `src/components/layout/sidebar.tsx`, `src/app/api/assets/upload-image/route.ts`, `CLAUDE.md`·`src/app/studio/CLAUDE.md`
- 삭제: `src/app/studio/writer/`, `src/features/writer/`, `src/app/api/write/`
- 리네임: `src/lib/svc`→`src/lib/writer`, `src/app/api/svc`→`src/app/api/writer`
