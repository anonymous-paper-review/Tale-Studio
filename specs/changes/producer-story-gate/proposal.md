---
change: producer-story-gate
status: active
created: 2026-06-11
decisions: [37, 38]
---

# Producer Story Gate — S0/S2 스토리 기반 요소의 producer 승격

## Why

producer는 현재 5필드(`playtime/genre/aspectRatio/toneStyle/dialogueLanguage`) + `storyText`만 확정하고 핸드오프하면, writer 엔진이 S0(`genre` 스테이지: subGenre·tone·targetEmotion·depth_level·format)과 S2(`characters` 스테이지: 캐릭터 정의·관계·서브텍스트)를 LLM으로 백그라운드에서 자동 확정한다(#38 구조). 작품의 가장 큰 스토리적 결정(장르 축, 캐스트의 외모/아크/보이스)이 사용자 개입 없이 정해지고, 결과가 마음에 안 들면 파이프라인 재실행 외 수단이 없다. 본 change는 **S0 전체와 S2의 캐릭터 최초 정의를 producer로 내리고 게이트로 확정**시킨 뒤, writer는 확정값을 입력(seed)으로 받아 s1(구조)부터 수행하게 한다. 캐릭터의 "최초 등장"은 producer가 되며, writer는 스토리 전개상 필요한 인물을 **추가**할 수만 있다(오픈 캐스트).

## What Changes

### 1. 데이터 모델 (상태 우선 — architecture rule §0: 새 진실이 어디 사는가)

**캐스트의 단일 진실 = `characters` 테이블.** producer 폼/카드, writer 파이프라인, artist 카드가 전부 같은 테이블을 읽고 쓴다(pull) — 별도 sync 메커니즘 금지.

- `ProjectSettings` 확장 (`src/types/project.ts`):
  - 추가: `subGenre?: string`, `tone: string[]`, `targetEmotion: string[]`, `format` (writer `Genre.format` enum과 통일)
  - `depth_level`은 **저장하지 않는다** — runtime에서 파생 가능한 값 (s0 프롬프트의 D1~D7 매핑표를 순수 함수 `depthLevelFromRuntime(seconds)`로 코드화, LLM 제거). 소비처(Compact Mode, 게이트 요구치, l3 생략 판단)는 이 함수를 호출.
- `characters` 테이블 확장 (마이그레이션 1건):
  - `entity_type: 'person' | 'object'` (default `'person'`) — 사물 캐릭터(key prop, 예: 반지). object는 인물 전용 필드(arc/voice/motivation)와 턴어라운드 시트(#37, 인물 1×4 전용)를 적용하지 않고 **단일 레퍼런스 이미지**만 가진다.
  - `origin: 'producer' | 'writer'` — 오픈 캐스트 추적. producer 게이트에서 확정된 행 vs writer가 전개상 추가한 행.
  - `voice text`, `arc jsonb`, `motivation jsonb` — 현재 테이블에 없는 S2 필드 수용.
  - `user_edited boolean` — 사용자 확정/수정 보호 플래그. **기존 `locked`(artist 이미지 잠금)와 시멘틱 분리** (open question 4).
- `relationships[]` + `subtext_notes[]` 저장처: characters 행이 아닌 프로젝트 차원 — 별도 테이블 vs projects JSONB는 마이그레이션 작성 시 확정 (open question 3).

### 2. Producer 게이트 로직 (핸드오프 차단 조건)

게이트 충족 판정은 **제품 레이어 코드가 검증**한다 — 채팅 LLM 추출은 폼을 채우는 *제안*일 뿐(architecture §3), 게이트 자체는 store/route의 결정적 검증.

**게이트 A — Story Foundation (S0 대체):**

| 필드 | 강도 | 비고 |
|---|---|---|
| genre | **필수** | |
| runtime (playtime) | **필수** | 5s~1800s+ 범위 검증, depth_level 파생 |
| format | **필수** | enum 통일 (open question 1) |
| dialogueLanguage | **필수** | 기존 |
| storyText (storyReady) | **필수** | 기존 게이트 유지 |
| subGenre | 권장(소프트) | 비면 경고 배지만, 핸드오프 허용 |
| tone[] / targetEmotion[] | 권장(소프트) | 비면 경고. **비운 채 핸드오프 시 writer에 비운 그대로 전달** (writer가 대신 정하지 않음 — drop 원칙) |

**게이트 B — Cast (S2 대체), depth 연동** (`depthLevelFromRuntime` 결과 기준, 현 s2 코드 가이드와 일치):

| depth | 최소 캐스트 | person 필수 필드 |
|---|---|---|
| D1~D2 (5~60s) | **0명 허용** (사물/풍경 중심 OK) | 정의 시 name + appearance만 (arc/voice 생략 가능, D2는 want 권장) |
| D3 (1~5분) | person 1명 (protagonist) | name, appearance, voice, arc(start/end/type), motivation.want |
| D4+ (5분+) | person 1명 필수 + 2명 이상 권장(소프트) | D3와 동일 + relationships 권장(소프트) |

- **object(사물)는 모든 depth에서 optional** — 필수 필드 name + appearance만. role은 의미 약함(`supporting` 고정).
- UI: 미충족 항목 목록 + 핸드오프 버튼 비활성화 + 사유 표시 (features/producer/).
- 채팅 추출 확장: `extractedSettings`에 신규 필드 + `characters[]` 추출 스키마 추가 (스토리 텍스트에서 캐릭터/사물 후보 자동 제안 → 사용자가 카드에서 확정/수정 → `user_edited` 마킹).

### 3. 핸드오프 계약 (producer → writer)

핸드오프(`/api/writer/start`) 시점에 순서대로:

1. **characters 테이블 upsert** — producer 확정 캐스트를 `origin='producer'`, uuid PK + `character_id` slug(name 기반 snake_case, 중복 시 suffix — **slug 생성은 producer가 소유**)로 즉시 기록. artist는 writer 완료를 기다리지 않고 카드 작업 가능.
2. **writer run 시작** — `PipelineInput` 확장:
   - 기존: `story`, `runtimeSeconds`, `presetId?`, `models?`, `skip?`
   - 추가: `genre: Genre` (producer 확정값 + 코드 계산 depth_level로 조립한 완성형), `cast: CastContract = { characters[], relationships[], subtext_notes[] }` (slug 포함)
   - 서버리스 체이닝 initial `WriterRunState`에 `state.genre = input.genre`, `state.characters = input.cast` **seed** — 기존 `has` 체크(`s.genre !== undefined`)가 idempotent하므로 s0/s2 step은 자연 생략된다.

### 4. Writer 변경 — drop + 오픈 캐스트 수용

- **`s0_genre.ts` / `s2_characters.ts` 스테이지 삭제.** steps.ts step 정의 제거 + initial state seed로 대체. `s1_structure`/`s3_scenes`/`c_validation_1`은 seed된 `state.genre`/`state.characters`를 그대로 소비(시그니처 불변). writer CLAUDE.md 규칙대로 로컬 경로(`pipeline/index.ts`)·validators 동시 갱신.
- **오픈 캐스트 계약** (s3_scenes):
  - 프롬프트에 기존 cast(slug + name + 한 줄 요약) 목록을 주입하고 "기존 인물은 반드시 해당 slug 사용, 스토리 전개상 새 인물이 필요할 때만 새 slug 생성" 지시.
  - 새 인물은 산출물에 `new_characters[]`로 **분리 반환** → 파이프라인이 `origin='writer'`로 characters 테이블 insert (최소 필드 LLM 생성). 기존 cast slug와 충돌 시 insert 거부 + 기존 행 사용.
  - **역류 노출**: writer-origin 캐릭터는 동일 테이블 read로 producer/artist UI에 자동 노출 — 별도 통지/sync 없음 (§0: 둘 다 진실을 읽는다).
  - **충돌/덮어쓰기 규칙**: ① producer-origin 행의 사용자 확정 필드(name/appearance/voice/arc/motivation)는 writer가 **절대 덮어쓰기 금지** — writer는 보강 필드(costume, 비주얼 토큰)만 추가. ② writer 재실행 시 producer-origin 행은 불변, writer-origin 행은 재생성 대상이되 `user_edited` 또는 `locked`(이미지 생성됨) 행은 보존.
- `persistAssetsToDb`: characters **insert가 핸드오프로 이동**했으므로 update-only(보강)로 변경. locations/scenes 기록은 기존대로.
- `assets_generate`: entity_type 분기 — person은 턴어라운드 시트(#37) 그대로, **object는 단일 레퍼런스 이미지 1장 submit** (crop 파이프라인 미적용).
- `renderPrompts`(l5): object도 person과 동일하게 asset ref 주입 — 씬에 등장하는 사물의 샷 간 consistency 보장 (full cast 참여 결정).

### 5. Artist 영향

- `entity_type='object'` 카드: 턴어라운드/crop UI 미노출, 단일 이미지 생성/교체만. Characters 탭 내 구분 표시(디자인은 specs/design.md 컨벤션 따름).
- producer 핸드오프 즉시 DB 기록 → artist 진입 게이트(`enteredProjects`)·완료 알림과의 상호작용 점검 (writer 완료 전 카드 노출이 의도된 동작임을 명시).

## Impact

- Affected specs: `specs/layers/` — producer·writer 계약 서술이 있으면 정합 갱신
- Affected code: `src/features/producer/`, `src/app/api/produce/chat/`, `src/app/api/writer/start/`, `src/lib/writer/pipeline/` (stages/steps/index/validators/persist_manifest/submit_asset_images), `src/features/artist/`
- Affected stores: `src/stores/producer-store.ts`, `src/stores/artist-store.ts`
- Affected types: `src/types/project.ts` (ProjectSettings), `src/lib/writer/types/pipeline.ts` (PipelineInput·CastContract)
- Affected DB: `characters` (entity_type/origin/voice/arc/motivation/user_edited) + relationships 저장처 — 마이그레이션 1~2건
- Affected decisions: #37 (턴어라운드 — object 미적용 분기), #38 (writer 일원화 — 스테이지 경계 조정, 번복 아님)

## Open questions (구현 전 확정)

1. **format enum 통일**: `aspectRatio '1:1'`은 writer `Genre.format`에 없음 / `cinema_2.39:1`은 producer에 미노출 — 제품 표준 enum 확정 + 기존 프로젝트 마이그레이션.
2. **toneStyle(string) → tone(string[])**: 기존 프로젝트 settings JSONB 호환 (읽기 폴백 vs 일괄 마이그레이션).
3. **relationships/subtext_notes 저장처**: 별도 테이블 vs projects JSONB.
4. **`locked` vs `user_edited` 시멘틱**: locked=이미지 잠금(artist), user_edited=텍스트 필드 보호 — 분리 유지가 기본안.

## Verification gate (archive 조건)

- tasks.md의 모든 [c] → [x]
- 브라우저: D3 프로젝트 — 게이트 미충족 시 핸드오프 차단+사유 표시 → 충족 후 핸드오프 → writer 로그에 genre/characters LLM 호출 **없음**(s1부터 시작) 확인
- 브라우저: D1(5~15초) 프로젝트 — 캐릭터 0명으로 핸드오프 통과
- 브라우저: object 캐릭터(반지) 등록 → artist 카드 단일 이미지 생성 → 해당 사물 등장 샷의 renderPrompts에 ref 주입 확인
- 브라우저: writer가 추가한 new_characters가 producer/artist에 노출 + producer-origin 필드 미덮어쓰기 확인
- `src/lib/writer/CLAUDE.md` 스테이지 맵 갱신 (s0/s2 제거 반영 — 하네스 정합)
