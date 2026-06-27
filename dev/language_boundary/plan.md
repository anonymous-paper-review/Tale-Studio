# Language Boundary + S0/S2 부활 — 구현 플랜

> 작성 2026-06-26. writer 언어 혼용(recap) 해결 + producer raw 입력의 LLM 가공("s0/s2 부활").
> 근거: `src/lib/writer/run-store.ts`(producer seed), 소비자 전수조사(24개), DB 캐시 스키마.

## 0. 목표 한 줄

producer는 **유저 언어로 입력·표시**(원천). handoff 시점에 **s0/s2/world LLM 파생**이 그 원천에서
**영어 base**를 만들고(sibling 컬럼), **이미지/영상/LLM 생성은 영어 base를 소비**한다. 영어 = 시스템 canonical
+ 미래 i18n 피벗, 유저 언어 = 표기.

## 1. 확정된 결정 (사용자 2026-06-26)

| # | 결정 | 값 |
|---|---|---|
| 1 | 파생 시점 | **Eager** — handoff(`createRun`)에서 즉시 |
| 2 | 저장 형태 | **Sibling 컬럼**. 영어=base(canonical/생성/피벗), 유저언어=표기. LLM이 한 번에 JSON으로 양쪽 산출 |
| 3 | 언어 감지 | **Hybrid** — 기본 `en` → (가능하면) Google SSO locale 힌트 → 대화 누적되면 감지(ASCII rule 또는 LLM)로 확정 |
| 4 | 부활 범위 | **전체** — s0(genre) + s2(characters) + world(background/location) |

## 2. 아키텍처 (4층)

```
[Producer]  유저 언어 입력·게이트 (원천, 편집 소스) ──┐  표시는 항상 이 층
   genre / cast(appearance…) / background / story    │
            │ handoff: /api/writer/start → createRun  │
            ▼ (eager)                                 │
[s0/s2/world 파생]  LLM 1콜/엔티티 → JSON {en, native} │  enum은 영어 단일(현행)
   → sibling 컬럼 채움 + provenance(source_hash)       │
            │                                          │
            ▼                                          ▼
[생성 seam]  artist·rough·v5·v6/v7·director           [Display]  locale 컬럼(유저언어)
   = 영어 base 소비 (충실도)                            = 유저언어, 없으면 en fallback
```

- **원천/파생(architecture §5)**: 유저 입력(native) = 원천. EN base = 파생(provenance=native 해시).
  native 편집 → EN stale → 재생성. **producer-gate를 되돌리는 게 아님** — producer는 여전히 인간 게이트(원천),
  s0/s2는 그 위의 LLM 파생 레이어.
- **"영어=base"의 의미**: 생성·피벗의 canonical. 단 *편집 가능한 원천*은 유저 언어(native). 영어권 유저면 native==en==base(단일).

## 3. 데이터 모델

### 3-1. Bilingual 필드 레지스트리 (소비자 조사 기반)
KO-only → `_en` sibling 추가 대상:

| 테이블 | 필드 | EN 소비자 수 | 비고 |
|---|---|---|---|
| characters | `appearance` | 11 LLM + 4 gen | **최고 레버** |
| characters | `description`, `costume[]` | 일부 | |
| projects(or writer_runs.state) | `genre.tone`, `subGenre`, `targetEmotion` | 5 LLM | enum(genre/format/depth)은 제외(이미 EN) |
| scenes | `narrative_summary`, `mood`, `location`, `purpose`, `time_of_day` | 3~8 | |
| shots | `action_description` (+ blocking pose, framing layer = state) | gen | 러프/영상 직결 |
| locations | `visual_description`, `name` | 5 | rough 배경(직전 작업) |

### 3-2. 컬럼 규약 (sibling)
- `appearance` = **표시(native, 유저언어)** — 기존 데이터 유지(마이그레이션 최소).
- `appearance_en` = **영어 base** — 생성 소비. NULL이면 `appearance` 폴백(점진 전환 안전).
- `appearance_src_hash` = native 원천 해시(stale 판정). (또는 공용 `*_src_hash` 1개로 묶기 — 구현시 결정)
- *대안(영어를 주컬럼으로)*: `appearance`=EN, `appearance_native`=표시. 기존 28행 마이그레이션 필요 → **권장은 위(최소 마이그레이션)**, 확정 필요.

### 3-3. locale
- `projects.locale text default 'en'` + resolution 상태(`locale_locked boolean`).
- writer_runs.state.genre 등 state JSONB 필드는 sibling 대신 `{ native, en }` 형태 가능(상태는 스키마 자유).

## 4. 소비자 재배선 맵 (조사 결과 24개)

### 4-A. 생성 프롬프트 소비자 8개 → **영어 base 읽기** (Stage 2, 충실도 즉효)
1. `artist/turnaround.ts:buildCharacterMainPrompt` — appearance → `_en`
2. `artist/turnaround.ts:buildCharacterViewPrompt` — appearance → `_en`
3. `api/artist/generate-sheet/route.ts` — appearance/costume → `_en`
4. `writer/pipeline/stages/v5_prompts.ts:extractT2IPrompt` — first_frame_prompt → EN
5. `writer/pipeline/stages/v5_prompts.ts:extractTI2VPrompt` — motion_prompt → EN
6. `writer/pipeline/stages/v6_images.ts` — t2i.prompt(상류 EN이면 자동)
7. `writer/pipeline/stages/v7_videos.ts` — ti2v.motion_prompt(상류 EN이면 자동)
8. `api/director/generate-shots/route.ts:buildFinalPrompt` — action/mood → `_en`
+ `rough-storyboard.ts`(직전 작업): 골격 영어 + 주입 내용(appearance/action/blocking/location)을 `_en`으로.

### 4-B. LLM 프롬프트 소비자 16개 → **출력 언어 정책 주입 + bilingual 산출** (Stage 3, 표류 제거)
- 자유서술 산출 스테이지(s3_scenes, v2_design, v3_scene_plan, decoupage, v4_shots, c_application_2, v5)는
  **출력 contract를 `{ native, en }`로** 바꾼다(dispatch에 공용 1줄 + 스키마에 en/native 쌍).
- 이미 EN(mid_preview, v0, v1, producer/writer/director chat)은 base만 두거나 native 추가는 후순위.
- enum은 영어 단일 유지.

## 5. Locale resolution (Stage 4, greenfield)
1. 초기값 `en`.
2. Google SSO locale 힌트 — `supabase auth user_metadata`/identity에 locale 있으면 사용(없으면 skip). *현재 auth.ts엔 단서 없음 → 조사/추가 필요.*
3. 대화/입력 누적 감지: **ASCII 비율 rule**(비-ASCII>임계 → ko 등) 1차, 모호하면 LLM 1콜. 신뢰도 도달 시 `locale_locked`.
4. 확정 locale → 표시 컬럼 선택(native), 생성은 항상 `_en`.

> UI **크롬**(버튼·라벨) i18n은 별개 대형 과제 — 현재 하드코딩 한국어. 본 플랜은 **콘텐츠** bilingual에 한정.

## 6. 단계별 실행 (각 단계 tsc+lint 검증, 독립 배포 가능하게)

- **S0 기반**: 마이그레이션(sibling `_en` + `*_src_hash` + `projects.locale`), bilingual 필드 레지스트리 상수,
  `localeOf(project)` 헬퍼. (인프라 → tsc로 검증)
- **S1 s0/s2/world 부활(eager)**: 3 LLM 파생 스테이지 신설(genre/characters/world). `createRun` 직후 호출 →
  native에서 EN base 산출 → sibling 채움 + src_hash. **빈칸만 채움/멱등**(§5). e2e 1회 검증.
- **S2 생성 소비자 → EN**(4-A 8개 + rough): `_en` 우선·native 폴백. **충실도 즉효** — 러프/캐릭터 A/B로 확인.
- **S3 LLM 스테이지 bilingual contract**(4-B): dispatch 공용 언어정책 + 스키마 `{native,en}`. 표류 제거 e2e.
- **S4 locale resolution**: 기본 en→SSO→감지(ASCII/LLM)→lock. 단위테스트(감지) + 수동.
- **S5 display**: 콘텐츠 표시 = locale 컬럼(native), en 폴백. writer/artist/producer 탭 UI 배선.
- **S6 stale/provenance**: native 편집 → `_en` stale 배지 + 명시 재생성(에이전트 제안, §5). 자동 무효화 금지.

권장 1차 출하 = **S0 → S1 → S2** (producer KO → EN base → 생성 충실도; 표시는 기존 KO 유지). S3~S6 후속.

## 7. 확인 필요 / 리스크

1. **컬럼 네이밍**(3-2): 기존 컬럼=표시 + `_en` 추가(최소 마이그레이션, 권장) vs 영어를 주컬럼으로(28행 마이그레이션). → **확인**.
2. **story_text**: 유저 언어 원천 유지(번역 안 함). 파생물(structure/scenes)만 bilingual. (전제)
3. **SSO locale 단서 부재**: auth에 locale 없음 → S4에서 provider metadata 조사/추가 필요. 없으면 감지로만.
4. **비용**: handoff당 LLM 콜 +N(엔티티 수). eager 수용(사용자 OK). state 큰 프로젝트 주의.
5. **UI 크롬 i18n 범위**: 본 플랜 제외(콘텐츠만). 별도 과제로 분리.
6. **마이그레이션 적용**: `supabase db query --linked`로 DDL(메모리: db push 차단).

## 8. 진행 로그

### 확정 (2026-06-26)
- 컬럼 규약 = **영어 주컬럼 승격**: `appearance`(EN base) + `appearance_native`(표시·원천). provenance = 테이블별 `i18n_provenance jsonb`(필드→native 해시). (계획서 3-2 "대안"이 채택됨.)
- 범위 = **S0→S2** 먼저, 작은 단계로 분할.

### S0 — DB 마이그레이션 ✅ 적용·검증 (2026-06-26)
- `databases/migrations/027_language_boundary.sql` 작성 + `supabase db query --linked` 적용.
- 추가: `characters/locations/shots/scenes` 에 `<field>_native` + `i18n_provenance jsonb`, `projects.locale/locale_locked`.
- 백필 검증: chars_native=27, loc_native=41, shots_native=214, scn(nsum/mood)=58, projects.locale='en'=34, prov_init=41. **무중단**(주 컬럼 KO 유지).
- 1차 범위 필드만(생성 직결): appearance / visual_description / action_description / narrative_summary / mood. (costume/description/purpose/time_of_day/genre(settings JSONB)는 S3 확장.)

### S1a — characters.appearance + locations.visual_description 파생 ✅ (2026-06-26)
- `src/lib/writer/i18n/derive-en.ts`: `deriveEnBatch`(claudeJSON 1콜 배치, 번역/정규화만, 영어 무변환) + `applyProducerI18n`(DB 주 컬럼=EN, `_native`=원천, `i18n_provenance`=해시). best-effort(실패→native 유지).
- `api/writer/start`: upsert 직후·drafts/step 트리거 **이전** 동기 호출(Hobby after() 죽음 회피).
- 검증: 실데이터 read-only 번역 OK (용사/마왕 KO→EN 충실, 영어 로케이션 무변환). tsc/lint clean.
- ⚠️ **실데이터 재파생 미실행** — S2(표시→`_native`) 전엔 handoff 재실행/실DB EN 쓰기 금지(UI가 영어 보임 방지).

### S1 잔여 + 다음
- **S1b**: genre(`projects.settings` JSONB: tone/subGenre/targetEmotion) 파생 — 이미지 직결 아님(LLM 컨텍스트), settings JSONB라 마이그레이션 불요. 영향 낮음.
- **S2**: 소비자 재배선 — 생성(turnaround/sheet/rough)=EN 주 컬럼, **표시·쓰기 경로=`_native`**(producer/artist UI). S1a EN base 가 실제 효력을 갖는 단계 + 표시 회귀 방지.
- (씬·샷 action/mood/narrative = 파이프라인 생성물 → S3 에서 스테이지 bilingual 출력.)

### S2a — 표시 분리(read-side) ✅ (2026-06-26)
- **생성·stale 은 EN 주 컬럼 유지, 표시는 `_native`.** 활성 회귀 없음(S1a 미실행)이라 예방적.
- `types/asset.ts`: `CharacterAsset.appearanceNative` 추가.
- `artist-store`: characterAssets 에 `appearanceNative = appearance_native ?? appearance`(fixedPrompt=EN 그대로 → 생성/stale 유지).
- `character-panel`: 카드 "외형 ·" 표시를 `appearanceNative || fixedPrompt` 로.
- `producer-store`/`writer-store`: 로케이션 로드 = `visual_description_native` 우선(입력/표시 측 — 생성 안 함). 클라 untyped 라 타입 변경 불요.
- 검증: tsc/lint clean. (생성 소비자 turnaround/generate-sheet/rough/world-prompt = 주 컬럼 EN 자동.)

### S2b — artist 로케이션 표시(read-side) ✅ (2026-06-26)
- 발견: `world-panel` 은 묘사 텍스트 **미표시** → 회귀 없음. 로케이션 묘사 표시 = producer 배경 카드(S2a 처리). char register 도 이미 정상(`description`=native 미러, `prompt`=appearance EN).
- 유일 잔여 = asset-storage **world 등록 description**(director 가 봄). `WorldAsset.visualDescriptionNative` 추가 + `worldAssetToRegisterInput` description→native, prompt=visualDescription(EN) 유지.
- 파일: `asset.ts`, `artist-store`(dbLocations/WorldAsset), `asset-storage-store`. tsc/lint clean.

### S2c — 편집 write-side ✅ (2026-06-27)
- 공유 헬퍼 `appearanceI18nFields(characterId, native)` (derive-en.ts): native→ {appearance=EN, appearance_native=native, provenance(성공 시만)}. 둘 다 서버 라우트라 claudeJSON 사용.
- `/api/artist/appearance`(승인 외형 패치): native→`appearance_native` + EN 파생→`appearance` + `description`=native 미러 + provenance. 응답에 EN/native 동봉.
- `/api/artist/character`(artist 캐릭터 생성): insert 시 외형 native→`appearance_native` + EN→`appearance` + provenance (description 은 유저 입력 별개).
- `artist-store.applyAppearancePatch`: `appearanceNative` 도 낙관적 갱신(카드 즉시 native 표시).
- producer 편집은 draft=native → handoff `applyProducerI18n` 가 파생 → 이미 처리됨.
- tsc/lint clean.

## 9. S0→S2 첫 출하 — 상태
**코드 준비 완료.** DB 마이그레이션(S0)은 라이브, 코드(S1a~S2c)는 **배포 필요(직접 push)**.
- 배포 후: **새 handoff 는 자동으로 EN base 파생** + 표시는 native + 생성은 EN(충실도) + 편집은 native 보존(EN 미오염).
- **기존 프로젝트**(예: 3c0979f4)는 주 컬럼 KO 유지 → EN 받으려면 **배포 후** handoff 재실행 or 1회 backfill-derive 스크립트(`applyProducerI18n` 또는 전체 캐릭터/로케이션 순회). ⚠️ 배포 전 실데이터 파생 금지(표시가 EN 보임).
- 검증: 마이그레이션 ✓, 번역(read-only) ✓, tsc/lint ✓. 브라우저 end-to-end = `[c]`(배포 후 확인).

### S1b — genre 파생: 불필요(no-op) ✅ 조사 (2026-06-27)
- genre/tone/subGenre/format 은 producer 챗 LLM 이 **처음부터 영어 통제어휘로 정규화**(시스템 프롬프트 line 84·106 + 라이브 데이터: ko 프로젝트도 genre=drama/action/fantasy, tone=["epic"] 등). 유저 언어는 story/appearance/background 뿐.
- 즉 genre 는 "LLM 미경유 raw" 가 아니라 이미 영어 base → 번역할 native 없음 → **파생 코드 미작성**(불필요 plumbing 회피). "전체 부활"은 needs-nothing 으로 충족.
- (옵션 안전망: 혹시 한국어 tone 이 새면 handoff 에서 deriveEnBatch — 영어 무변환이라 저비용. 현재 미권장, 필요 시 추가.)

### S3 — 파이프라인 생성물 bilingual (씬·샷)
- **S3a — persist 경계 EN 파생 ✅ (2026-06-27)**: `deriveEnBatch` 에 "이미 영어면 LLM skip"(CJK/Hangul 필터) 추가. `persist_manifest.ts` 의 scenes(narrative/mood)·shots(action) insert 를 재구성 → 주 컬럼=EN, `_native`=원천, provenance. best-effort(실패→native). 검증: 실데이터 read-only — action(KO→EN) 번역·mood(영어) skip 확인. tsc/lint clean. ⚠️ S3b 전엔 실데이터 재실행 시 writer 탭이 EN 표시.
- **S3b — writer 탭 표시·편집 split ✅ (2026-06-27)**: writer-store 로드가 action/narrative/mood 를 `_native` 우선(표시=유저 언어). updateShot/updateScene 편집은 primary·`_native` 둘 다 native 기록(클라 직접 update — 서버 파생 불요). **러프 라우트가 action·mood 를 주입 직전 `deriveEnBatch`(skip-if-English)로 정규화** → 파이프라인 EN 산출은 무비용, 수동/편집 native 만 번역 → klein 은 항상 EN. tsc/lint clean. (mood/narrative primary 가 편집 후 native 가 돼도 라우트가 skip-or-derive 로 흡수.)
- **S3c — rich path shotDesign state ✅ (2026-06-27)**: 러프 라우트에 `translateRoughSpecsEn` 추가 — rich spec 의 framing layers·focal·blocking 포즈·motion verb 를 `deriveEnBatch`(skip-if-English)로 정규화해 `buildFromSpec` 전 치환. shotDesign 은 표시 안 되는 내부 state 라 native 보존·provenance 불요(생성용 EN 만). 호출당 1배치(캐싱 없음 — 추후 최적화 여지). 검증: 실데이터 — shot_1/2 의 한국어 layers·포즈 → EN 충실(예: "검을 든 채 서 있는 실루엣"→"silhouette standing with sword in hand"). tsc/lint clean.

### S3 완료 — 러프보드 양 경로(db_fallback + rich) + writer DB 필드 전부 생성=EN / 표시=native.

### 후속 (첫 출하 밖)
- **S4** locale 감지(en→SSO→ASCII/LLM) · **S5** 표시 locale 배선 · **S6** stale/재생성 UX.
