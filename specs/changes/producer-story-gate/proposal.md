---
change: producer-story-gate
status: active
created: 2026-06-11
decisions: [37, 38, 57]
---

# Producer Story Gate — S0/S2 스토리 기반 요소의 producer 승격

## Why

producer는 현재 5필드(`playtime/genre/aspectRatio/toneStyle/dialogueLanguage`) + `storyText`만 확정하고 핸드오프하면, writer 엔진이 S0(`genre` 스테이지: subGenre·tone·targetEmotion·depth_level·format)과 S2(`characters` 스테이지: 캐릭터 정의·관계·서브텍스트)를 LLM으로 백그라운드에서 자동 확정한다(#38 구조). 작품의 가장 큰 스토리적 결정(장르 축, 캐스트의 외모/아크/보이스)이 사용자 개입 없이 정해지고, 결과가 마음에 안 들면 파이프라인 재실행 외 수단이 없다. 본 change는 **S0 전체와 S2의 캐릭터 최초 정의를 producer로 내리고 게이트로 확정**시킨 뒤, writer는 확정값을 입력(seed)으로 받아 s1(구조)부터 수행하게 한다. 캐릭터의 "최초 등장"은 producer가 되며, writer는 스토리 전개상 필요한 인물을 **추가**할 수만 있다(오픈 캐스트).

## What Changes

### 1. 데이터 모델 (상태 우선 — architecture rule §0: 새 진실이 어디 사는가)

**캐스트의 단일 진실 = `characters` 테이블.** producer 폼/카드, writer 파이프라인, artist 카드가 전부 같은 테이블을 읽고 쓴다(pull) — 별도 sync 메커니즘 금지. 단계별로 *서로 다른 칸*을 소유하는 것을 의도한다(producer=정체성 텍스트, writer=새 인물 추가+보강, artist=이미지, director=읽기 전용) — 같은 칸을 두고 다투지 않으므로 잠금/보호 플래그 없이도 *저장 차원의* 충돌이 없다(§4 additive 원칙).

> ✅ **(2026-06-12 해소 — decisions #57)** "칸을 나눠 가지면 안전하다"는 저장 차원에서만 참이고 칸들은 *의미로 결합*돼 있다(이미지는 외모 텍스트에서 파생…). 이 정합성 문제는 잠금/플래그가 아니라 **원천/파생(provenance) 모델**로 푼다: 파생물은 입력 지문을 기록하고, 상류가 바뀌면 *낡음(stale) 표시만* 하며(자동 무효화·자동 재생성 금지), 수렴은 항상 명시적 재생성. 목표는 "항상 일관"이 아니라 **"항상 수습 가능"**. 상세는 아래 Open questions(해소됨)와 §Decisions 5~7.

- `ProjectSettings` 확장 (`src/types/project.ts`):
  - 추가: `subGenre?: string`, `tone: string[]`, `targetEmotion: string[]`, `format` (writer `Genre.format` enum과 통일 — 아래 결정 1)
  - `toneStyle: string` → `tone: string[]` 로 모양 변경: 톤은 본질적으로 다중값(어두움+긴장+쓸쓸함). 태그처럼 개별 추가/삭제 + writer에 또렷한 신호 N개 전달. `targetEmotion`도 같은 이유로 배열.
  - `depth_level`은 **저장하지 않는다** — runtime에서 파생 가능한 값 (s0 프롬프트의 D1~D7 매핑표를 순수 함수 `depthLevelFromRuntime(seconds)`로 코드화, LLM 제거). 소비처(Compact Mode, 게이트 요구치, l3 생략 판단)는 이 함수를 호출.
- `characters` 테이블 확장 (마이그레이션):
  - `entity_type: 'person' | 'object'` (default `'person'`) — 사물 캐릭터(key prop, 예: 반지). object는 인물 전용 필드(arc/voice/motivation)와 턴어라운드 시트(#37, 인물 1×4 전용)를 적용하지 않고 **단일 레퍼런스 이미지**만 가진다.
  - `origin: 'producer' | 'writer'` — 오픈 캐스트 추적. producer 게이트에서 확정된 행 vs writer가 전개상 추가한 행. (= writer 재실행 시 "입력으로 받은 인물"과 "전개상 추가된 인물"을 구분하는 근거 — §4)
  - `voice text`, `arc jsonb`, `motivation jsonb` — 현재 테이블에 없는 S2 필드 수용.
  - **`locked` 컬럼 제거 / `user_edited` 도입 안 함** — 이미지 잠금·텍스트 보호 플래그를 전부 폐기한다(아래 결정 4). artist의 Lock/Unlock 토글 UI도 제거.
- `relationships[]` + `subtext_notes[]`: characters 행이 아닌 프로젝트 차원 데이터 → **별도 정규화 테이블**(`character_relationships`, `subtext_notes`)에 저장(결정 3). 오픈 캐스트로 인물이 동적으로 늘어나도 외래키 무결성으로 일관 유지(인물 삭제 시 관계 자동 정리). **단 편집 UI는 보류(결정 9)** — 관계는 스토리 텍스트에서 파생되는 값이라 producer 전용 편집 화면을 두지 않고 스토리 텍스트에 맡긴다(테이블은 미래용 보존, 현재 빈 배열로 핸드오프).
- **파생 이미지 provenance + 후보 히스토리** (#57 — 정확한 스키마는 구현 시 확정):
  - 이미지 슬롯별 provenance `{ source_hash, job_id, generated_at }` — "어느 시점의 외모 텍스트로 생성됐는지"의 지문. stale 판정 = 순수 함수(현재 입력 hash와 비교), UI는 배지만(강제 없음).
  - **후보 히스토리** — 재생성은 후보를 *추가*할 뿐 선택본을 자동 교체하지 않음. 보관 정책: **선택본 자동 삭제 금지 + 미선택 후보는 슬롯당 최근 N장**(N은 스토리지 비용 보고 확정). 각 후보가 자기 지문을 들고 있어 목록에서 "옛 묘사 기준" 표시 가능. (#55에서 defer했던 버전 히스토리의 범위 승급. Lock 토글이 하던 "아끼는 이미지 보호" 역할을 선택+히스토리가 대체.)
  - `generation_jobs.input_snapshot`에 `source_hash` 동봉(jsonb — 마이그레이션 불필요) → webhook 착지 시 현재 행과 비교, 불일치면 **착지 + 즉시 stale 배지**(폐기하지 않음 — 이미 과금된 산출물의 처분은 사람 몫).

**Open questions (데이터 모델) — 2026-06-12 전부 해소 (decisions #57, 아래 §Decisions 5~7):**

> 해소의 틀: 데이터를 **원천**(사람이 직접 정함)과 **파생**(원천을 읽어 생성됨)으로 나누면, "여러 곳에서 쓰고 업데이트하는" 문제는 sync 설계가 아니라 **provenance(입력 지문) 설계**가 된다. 각 스테이지 = "공유 원천 편집" + "자기 전용 파생물 빌드" 두 활동의 묶음 — **빌드는 독립, 원천은 공동 편집, 합류는 하류**(writer·artist는 형제, 산출물은 director에서 합류). 전역 일관성은 순간이 아니라 **수습 가능성**으로 보장한다.

1. **파생 필드 staleness** → **후보 ③+② 채택**: provenance 기록 + stale 배지. ④(자동 무효화)는 금지 — 사람 선별 파괴 + 과금. "텍스트는 고쳤지만 옛 이미지가 마음에 들어 유지"는 정당한 상태(stale은 *정보*, 행동은 항상 명시적). 지문은 **생성 입력을 조립하는 그 함수가 함께 계산**(분리하면 지문과 실제 입력이 어긋나 판정이 거짓말함) — 그 함수의 입력 목록이 곧 파생 엣지의 선언(엣지 문서 별도 관리 불필요).
2. **필드 소유권 겹침** → 소유권은 단계가 아니라 **쓰기 모드**로 가른다: **자율 실행**(파이프라인) = 빈칸 채우기만(non-null 덮어쓰기 구조적 불가), **사용자 주도**(producer 폼·artist 채팅·writer 명시 요청) = last-write-wins 허용(같은 사람의 의도적 행동 간 경쟁이라 안전) + 하류 stale 전파. 저장 플래그 없이 쓰기 경로의 시멘틱으로 해결 — 결정 4(플래그 폐기)와 정합.
3. **정체성 lifecycle** → ① slug는 생성 후 **불변**, rename은 표시명(`name`)만 변경(storage 경로·씬 참조 전부 slug 기준이라 안 깨짐). ② 삭제: 관계는 FK cascade, storage 이미지는 앱에서 즉시 정리, 씬/샷의 slug 참조는 **방치해도 됨**(출력 티어 — 다음 재실행이 자가 치유. 삭제 시 "N개 씬 등장, 재실행 전까지 참조 남음" 경고만). ③ semantic 중복 merge는 **MVP 제외** — 1차 방어는 오픈 캐스트 프롬프트의 기존 cast 주입(LLM이 재사용), 잔여 중복은 writer-origin 행 수동 삭제. 진짜 merge가 필요해지면 `merged_into` alias 한 컬럼으로 재검토(지금 설계하면 과설계).
4. **비동기 순서(temporal skew)** → **OQ1의 착지-시점 평가일 뿐, 별도 메커니즘 없음**: submit 시 `input_snapshot`에 source_hash 동봉 → webhook 착지 시 현재 행과 비교 → 불일치면 **착지 + stale 배지**(폐기 안 함 — 과금된 산출물의 처분은 사람 몫). 오래 걸리는 writer 실행도 동일 규칙(시작 시점 스냅샷 기준의 빌드로 취급, 착지 시 동일 검증).

> 결정 4(additive)의 짝 문제(staleness)가 OQ1 해소로 닫힘 → **결정 4 완결**. 단 **forward 경고**: "장면 = 매 실행 통째 재생성(보존 불필요)"은 *장면에 사람 손이 안 탄* 현 구조에서만 참 — #53 writer UI 부활로 사용자가 장면/스토리보드를 직접 편집하게 되면 **장면 단위 보존 표식이 다시 필요**(사람과 기계가 *같은 산출물*을 공동 편집하게 되므로 입력/출력 경계 전략이 안 통함). 그때 재논의 — 본 change 범위 아님.

### 2. Producer 게이트 로직 (핸드오프 차단 조건)

게이트 충족 판정은 **제품 레이어 코드가 검증**한다 — 채팅 LLM 추출은 폼을 채우는 *제안*일 뿐(architecture §3), 게이트 자체는 store/route의 결정적 검증.

**게이트 A — Story Foundation (S0 대체):**

| 필드 | 강도 | 비고 |
|---|---|---|
| genre | **필수** | |
| runtime (playtime) | **필수** | 5s~1800s+ 범위 검증, depth_level 파생 |
| format | **필수** | 합집합 enum (결정 1) |
| dialogueLanguage | **필수** | 기존 |
| storyText (storyReady) | **필수** | 기존 게이트 유지 |
| subGenre | 권장(소프트) | 비면 경고 배지만, 핸드오프 허용 |
| tone[] / targetEmotion[] | 권장(소프트) | 비면 경고. **비운 채 핸드오프 시 writer에 비운 그대로 전달** (writer가 대신 정하지 않음 — drop 원칙) |

**soft 게이트 처리 — 채팅 넛지 (모달 없음, 결정 2):** 하드 게이트는 다 찼고 soft 항목만 비었을 때, producer 채팅(`/api/produce/chat`)이 *"톤·목표감정을 채우면 각본 퀄이 올라가요. 채우고 갈까요, 그냥 갈까요?"*를 권유한다. 사용자가 "그냥 진행"하면 빈 채로 핸드오프. 빈칸이 *침묵하며 흘러가는 게 아니라 의식적 선택*이 되어 깜빡 누락만 막는다. **핸드오프 가부의 최종 판정은 채팅(LLM)이 아니라 코드** — soft는 어차피 차단 안 하고, 하드 게이트만 결정적 검증.

**게이트 B — Cast (S2 대체), depth 연동** (`depthLevelFromRuntime` 결과 기준, 현 s2 코드 가이드와 일치):

| depth | 최소 캐스트 | person 필수 필드 |
|---|---|---|
| D1~D2 (5~60s) | **0명 허용** (사물/풍경 중심 OK) | 정의 시 name + appearance만 (arc/voice 생략 가능, D2는 want 권장) |
| D3 (1~5분) | person 1명 (protagonist) | name, appearance, voice, arc(start/end/type), motivation.want |
| D4+ (5분+) | person 1명 필수 + 2명 이상 권장(소프트) | D3와 동일 + relationships 권장(소프트) |

- **object(사물)는 모든 depth에서 optional** — 필수 필드 name + appearance만. role은 의미 약함(`supporting` 고정).
- UI: 미충족 항목 목록 + 핸드오프 버튼 비활성화 + 사유 표시 (features/producer/).
- 채팅 추출 확장: `extractedSettings`에 신규 필드 + `characters[]` 추출 스키마 추가 (스토리 텍스트에서 캐릭터/사물 후보 자동 제안 → 사용자가 카드에서 확정/수정).

### 3. 핸드오프 계약 (producer → writer)

핸드오프(`/api/writer/start`) 시점에 순서대로:

1. **characters 테이블 upsert** — producer 확정 캐스트를 `origin='producer'`, uuid PK + `character_id` slug(name 기반 snake_case, 중복 시 suffix — **slug 생성은 producer가 소유**)로 즉시 기록. artist는 writer 완료를 기다리지 않고 카드 작업 가능.
2. **writer run 시작** — `PipelineInput` 확장:
   - 기존: `story`, `runtimeSeconds`, `presetId?`, `models?`, `skip?`
   - 추가: `genre: Genre` (producer 확정값 + 코드 계산 depth_level로 조립한 완성형), `cast: CastContract = { characters[], relationships[], subtext_notes[] }` (slug 포함)
   - 서버리스 체이닝 initial `WriterRunState`에 `state.genre = input.genre`, `state.characters = input.cast` **seed** — 기존 `has` 체크(`s.genre !== undefined`)가 idempotent하므로 s0/s2 step은 자연 생략된다.

### 4. Writer 변경 — drop + 오픈 캐스트 + additive 재실행

- **`s0_genre.ts` / `s2_characters.ts` 스테이지 삭제.** steps.ts step 정의 제거 + initial state seed로 대체. `s1_structure`/`s3_scenes`/`c_validation_1`은 seed된 `state.genre`/`state.characters`를 그대로 소비(시그니처 불변). writer CLAUDE.md 규칙대로 로컬 경로(`pipeline/index.ts`)·validators 동시 갱신.
- **오픈 캐스트 계약** (s3_scenes):
  - 프롬프트에 기존 cast(slug + name + 한 줄 요약) 목록을 주입하고 "기존 인물은 반드시 해당 slug 사용, 스토리 전개상 새 인물이 필요할 때만 새 slug 생성" 지시.
  - 새 인물은 산출물에 `new_characters[]`로 **분리 반환** → 파이프라인이 `origin='writer'`로 characters 테이블 insert (최소 필드 LLM 생성). 기존 cast slug와 충돌 시 insert 거부 + 기존 행 사용.
  - **역류 노출**: writer-origin 캐릭터는 동일 테이블 read로 producer/artist UI에 자동 노출 — 별도 통지/sync 없음 (§0: 둘 다 진실을 읽는다). 역방향도 동일: artist/producer가 나중에 추가한 인물은 *다음* writer 실행이 캐스트 재료로 자동 포함(pull).
  - **카드 = 존재 정의, 등장 = 스토리가 결정** (#57): 인물 카드 생성은 캐스팅 풀 등록일 뿐, 서사 등장은 스토리 텍스트가 결정한다. 스토리에 자리가 없는 캐스트를 writer가 억지로 등장시키지 않는다(프롬프트에 명시) — 등장시키려면 스토리(원천)를 고친다.

- **다시 돌리기 = additive (입력/출력 경계) — 잠금/보호 플래그 대체:**
  보호 플래그(`locked`/`user_edited`)를 두지 않고, *무엇이 writer의 입력이고 무엇이 출력인가*의 경계로 보존을 달성한다.
  - **인물(characters) = 입력.** writer는 seed된 cast를 *재료로 읽기만* 한다. 기존 행(producer-origin·writer-origin 무관)은 **재실행해도 갈아엎지 않고**, 빠진 새 인물만 `new_characters[]`로 *추가*한다. 기존 인물의 정의를 바꾸는 것은 **사용자가 명시적으로 요청할 때만**(그때는 LLM이 의도대로 수정) — 줄거리만 고친 재실행은 인물 정의를 건드리지 않는다.
  - **장면·구조(scenes/shots) = 출력.** 매 실행 현재 스토리에 맞춰 새로 생성된다(writer 본업). 줄거리가 바뀌면 장면은 갱신된다.
  - **이미지 = artist 영역, writer 손 밖.** writer는 캐릭터/사물 이미지를 **생성·갱신하지 않는다.** 따라서 재실행이 이미지를 덮어쓸 경로 자체가 없다.
- `persistAssetsToDb`: characters **insert가 핸드오프로 이동** + 재실행 시 기존 행 보존(additive)이므로 신규 행 insert + 비어있는 보강 필드 채우기만. 기존 정의 칸·이미지 칸은 미변경. locations/scenes 기록은 기존대로.
- **이미지 생성 스텝 이전**: 기존 파이프라인의 레퍼런스 이미지(view_main/wide_shot) 생성은 writer에서 빠지고, **artist 단계의 초기 생성**으로 이전. **빈칸 첫 생성은 artist 진입 시 자동 1회(멱등, 상류 확정 입력), 재생성만 명시적**(결정 8). entity_type 분기(person 턴어라운드 #37 / object 단일 이미지)도 artist에서 수행.
- `renderPrompts`(l5): object도 person과 동일하게 asset ref 주입 — 씬에 등장하는 사물의 샷 간 consistency 보장 (full cast 참여 결정).

### 5. Artist 영향

- **이미지 생성 전담 + Lock UI 제거**: 캐릭터/사물 이미지가 artist 단계로 일원화(호출마다 과금). **초기 생성(빈칸)은 진입 시 자동 1회**(멱등, producer 확정 appearance 입력) — **재생성(차 있는 것 교체)만 명시적 클릭**(결정 8). 자동 가드: 멱등 skip + 진입/세션당 1회 + 실패 배지. 기존 Lock/Unlock 토글(이미지 재생성 차단)은 가치가 없어 제거 — 재생성은 항상 명시적 클릭이고, writer 재실행이 이미지를 안 건드리므로 보호할 대상이 없다.
- **stale 배지 + 후보 히스토리** (#57): 외모 텍스트 등 상류 변경 시 파생 이미지에 "낡음" 배지(정보만, 강제 없음 — 자동 재생성·자동 무효화 금지). 재생성 결과는 후보 목록에 쌓이고 사용자가 선택본을 교체 — 선택본 자동 삭제 금지, 미선택 후보는 슬롯당 최근 N장 보관. Lock 토글이 하던 "아끼는 이미지 보호"는 선택+히스토리가 대체.
- `entity_type='object'` 카드: 턴어라운드/crop UI 미노출, 단일 이미지 생성/교체만. Characters 탭 내 구분 표시(디자인은 specs/design.md 컨벤션 따름).
- producer 핸드오프 즉시 DB 기록 → artist 진입 게이트(`enteredProjects`)·완료 알림과의 상호작용 점검 (writer 완료 전 카드 노출이 의도된 동작임을 명시).

## Impact

- Affected specs: `specs/layers/` — producer·writer 계약 서술이 있으면 정합 갱신
- Affected code: `src/features/producer/`, `src/app/api/produce/chat/`, `src/app/api/writer/start/`, `src/lib/writer/pipeline/` (stages/steps/index/validators/persist_manifest — 이미지 생성 스텝 제거), `src/features/artist/` (이미지 초기 생성 + Lock UI 제거: character-panel/character-view-dialog)
- Affected stores: `src/stores/producer-store.ts`, `src/stores/artist-store.ts`, `src/stores/asset-storage-store.ts` (locked 필드 제거)
- Affected types: `src/types/project.ts` (ProjectSettings: tone[]/targetEmotion[]/format/subGenre), `src/lib/writer/types/pipeline.ts` (PipelineInput·CastContract)
- Affected DB: `characters` (entity_type/origin/voice/arc/motivation 추가, `locked` 제거, 이미지 provenance+후보 히스토리 저장 구조) + `character_relationships`/`subtext_notes` 신규 테이블 — 마이그레이션 여러 건 (라이브 DB 적용 후 `.claude/cache/db` refresh). `generation_jobs.input_snapshot`에 source_hash 동봉(마이그레이션 불필요)
- Affected harness/specs(원칙): `.claude/rules/architecture.md` §5 신설(판별 규칙) + `specs/_constitution.md` §데이터 정합(5원칙 격상) + `specs/_DECISION_TEMPLATE.md` §Data/State Ownership(원천/파생 게이트 질문) — 2026-06-12 반영 완료
- Affected decisions: #37 (턴어라운드 — object 미적용 분기), #38 (writer 일원화 — 스테이지 경계 조정, 번복 아님), #55 (defer했던 버전 히스토리 → 본 change로 승급), #57 (원천/파생 원칙 — 본 change 논의에서 신설, cross-cutting)

## Decisions (이번 세션 확정, 2026-06-12)

1. **format enum = 합집합**: `horizontal_16:9` / `vertical_9:16` / `cinema_2.39:1` / `square_1:1` — writer 네이밍(framing 의미 보존)을 표준으로 채택하고 producer가 빠뜨린 정사각형(`square_1:1`)을 추가, producer UI에 cinema도 노출. 기존 프로젝트 settings는 일괄 마이그레이션. *(향후 정제 가능: 진실을 이름표 대신 비율 숫자로 두고 가로/세로/시네마는 파생 라벨화 — MVP에선 합집합 목록으로 충분, 비차단.)*
2. **toneStyle → tone[]**: 모양은 다중값(태그)으로 변경 + 기존 settings JSONB는 **일괄 마이그레이션**(MVP 실험 데이터라 lazy 폴백 불필요).
3. **relationships/subtext 저장처 = 별도 정규화 테이블**: 동적으로 늘어나는 오픈 캐스트의 관계 무결성(인물 삭제 시 관계 자동 정리)을 위해 projects JSONB가 아닌 전용 테이블.
4. **잠금/보호 플래그 전면 폐기**: 이미지 잠금(`locked`)·텍스트 보호(`user_edited`) 둘 다 도입 안 함(`locked`는 기존 컬럼/UI까지 제거). 보호는 플래그가 아니라 **"다시 돌리기 = additive"** 원칙으로 달성(§4): 인물=입력(보존, 추가만), 장면=출력(갱신), 이미지=artist 전담(writer 손 밖). 명시적 변경 요청은 사용자 책임 + LLM이 의도대로 처리. → 기존 open question 4(`locked` vs `user_edited` 시멘틱)는 **소멸**. **완결(2026-06-12)**: 짝 문제였던 *파생 필드 staleness*는 OQ1 해소(provenance + stale 배지, 결정 5)로 닫힘.
5. **원천/파생 정합 원칙 채택 (decisions #57, 2026-06-12)**: 데이터 = 원천(사람이 정함) vs 파생(원천을 읽어 생성). 5원칙 — ① **빌드는 독립** ② **원천은 공동 편집**(자율=빈칸만 / 사람=자유+stale 전파) ③ **합류는 하류**(writer·artist는 형제, 합류는 director — 옆으로의 통지/sync 없음) ④ **일관성 = 수습 가능성**(전역 불일치는 정상: 지문 + 낡음 표시 + 명시적 재생성으로 수렴) ⑤ **통합 경험은 에이전트**(글로벌 채팅이 낡음을 읽고 재생성 *제안* — 데이터 자동 연쇄 금지. 자동화하지 않은 빈자리가 에이전트의 일자리). "초기생성 vs 재생성"은 별도 설계 대상 아님 → "빈칸 채우기(자율 가능) vs 차 있는 것 교체(사람만)". §1 OQ 1~4 전부 이 원칙으로 해소. 전역 판별 규칙은 `.claude/rules/architecture.md` §5. *(2026-06-12 amend — 결정 8: 옛 "과금 파생물은 빈칸이라도 사람 방아쇠" 예외는 폐기. 과금 파생물도 빈칸이면 자율 채움 가능.)*
6. **이미지 후보 히스토리 도입**: 슬롯당 후보 목록 + 선택본. 재생성 = 후보 *추가*(선택 자동 교체 없음), 선택본 자동 삭제 금지, 미선택은 최근 N장 보관(기간 기준 금지 — "오래됐지만 아끼는 후보" 삭제 사고 방지). #55에서 defer했던 버전 히스토리의 범위 승급. 근거: 재생성은 "복원"이 아니라 "교체"(비결정적 생성) — 보존 가치는 생성 비용이 아니라 *그 특정 결과물에 투자된 선별*.
7. **카드 = 존재 정의, 등장 = 스토리 결정**: 인물 카드는 캐스팅 풀 등록, 등장은 스토리 텍스트 소관. artist발 신규 인물도 다음 writer 실행의 캐스트로 자동 포함(같은 테이블 pull)되나 억지 등장 금지.
9. **관계 편집 UI 보류 — 스토리 텍스트로 대체 (2026-06-13)**: 결정 3은 관계 *저장처*(별도 정규화 테이블 `character_relationships`, 018 적용)를 정했고 그건 유지한다. 다만 producer의 **관계 편집 UI(Section 2.5)는 보류**한다. 사유: 관계는 스토리 텍스트에서 *파생 가능*한 값 → 제1원칙(파생값은 따로 저장·관리하지 않음, architecture §0)에 따라 별도 사용자 큐레이션 상태로 둘 이유가 약하다. producer 스토리 칸이 이미 관계를 담고, writer는 줄거리+캐스트 카드(역할/외모/동기)로 관계를 추론한다(현 동작과 동일 — s2 삭제 후 관계는 비어 있고 기능 공백 없음). 핸드오프는 `relationships: []`로 나가며 `castContractToCharacters`가 안전 처리. 테이블은 **미래용 보존** — 구조적 관계 메타(state_change/visible_in_video 같은 "관계 변화/화면 가시성")가 정말 필요해지면 그때 UI만 얹는다(지금 만들면 과설계). `subtext_notes`도 동일(테이블 보존, UI 미구현). → producer-story-gate 구현 범위는 **Section 5까지로 마무리**, 남은 것은 Section 6 브라우저 검증.
8. **이미지 초기 생성 = 자동(빈칸 채우기), 재생성 = 수동 (2026-06-12, 결정 5 예외 폐기)**: 결정 5의 "과금 파생물은 빈칸이라도 사람 방아쇠" 예외를 **폐기**한다. 이미지(과금 파생물)도 **빈칸이면 자율 채움 대상** — artist 진입 시 누락 이미지를 **자동 1회 생성**(producer 게이트가 확정한 appearance가 입력). *차 있는* 이미지의 교체(재생성)만 사람 전속(명시적 클릭). 근거: ① producer 게이트가 appearance를 필수 확정하므로 자동 첫 생성의 입력이 이미 성숙(초안 아님) ② 동일 패턴이 이미 코드에 존재(writer 탭 러프 스토리보드 = 진입 시 누락분 자동 1회 + 서버 멱등 skip). **자동 가드(필수)**: 멱등(이미 있으면 skip) + 진입/세션당 1회 + 실패는 배지(과금·재시도 루프 방지). person 4뷰 턴어라운드는 1회에 비싼 이미지 4장이므로 가드 준수가 특히 중요(원하면 4뷰만 옵트인으로 좁혀도 됨 — 비용 튜닝, 비차단). **불변**: 상류(외모) 변경 시 *차 있는* 이미지의 자동 무효화·자동 재생성은 여전히 금지(stale 배지만) — 본 결정은 *빈칸 첫 채움*에만 적용.

구현 시 확정(비차단): `character_relationships`/`subtext_notes` 정확한 스키마, 합집합 enum의 기존 프로젝트 매핑표, provenance/후보 히스토리 저장 스키마 + 보관 N값, **stale 판정의 입력 경계**(권고: 최종 프롬프트가 아니라 appearance(+costume이 이미지 입력이면 포함) 스냅샷 기준 — 채팅의 스타일 지시("더 어둡게")는 의도적 이탈이므로 staleness 무관. costume을 입력에 넣으면 writer의 fill-only 보강조차 배지를 유발하는데, 논리적으로 맞는 동작이므로 수용 권고).

## Verification gate (archive 조건)

> **검증 범위 완화 결정 (2026-06-13, 사용자 (A) 선택)**: 아래 게이트 중 **코드/빌드/유닛 레벨**(tsc·
> `pnpm build`·provenance 유닛·Lock grep·진입게이트 회귀 수정)까지 충족하고 archive. fal 실생성이
> 필요한 **생성 의존 브라우저 항목**(자동생성 실이미지·stale 실편집·후보 교체·object ref·additive 재실행)은
> **수동 확인 권장**으로 남긴다(코드는 [c] 준비 완료, 비용/시간 사유로 자동 검증 생략). 상세 tasks.md §Section 6.

- tasks.md의 모든 [c] → [x]
- 브라우저: D3 프로젝트 — 게이트 미충족 시 핸드오프 차단+사유 표시 → 충족 후 핸드오프 → writer 로그에 genre/characters LLM 호출 **없음**(s1부터 시작) 확인
- 브라우저: D1(5~15초) 프로젝트 — 캐릭터 0명으로 핸드오프 통과
- 브라우저: soft 게이트만 빈 상태 — 채팅이 권유 → "그냥 진행" 시 빈 값 그대로 핸드오프 (writer가 안 채움)
- 브라우저: **초기 자동 생성**(결정 8) — 빈 이미지 상태로 artist 진입 → 누락 이미지 자동 1회 생성(person 4뷰/object 단일). **재진입 시 멱등 skip**(중복 과금 없음). 재생성은 명시적 클릭일 때만.
- 브라우저: object 캐릭터(반지) 등록 → artist 진입 시 단일 이미지 자동 생성 → 해당 사물 등장 샷의 renderPrompts에 ref 주입 확인
- 브라우저: **additive 재실행 검증** — 인물·이미지를 확정/생성한 뒤 줄거리만 수정 후 writer 재실행 → 기존 인물 정의·이미지 보존 + 바뀐 장면만 갱신 + writer가 추가한 new_characters 노출 확인
- 브라우저: **stale 배지 + 히스토리** — 이미지 생성 후 외모 텍스트 수정 → 해당 이미지에 낡음 배지(자동 재생성 없음) / 이미지 생성 *진행 중* 외모 수정 → 늦게 도착한 이미지가 착지하되 즉시 배지 / 재생성 → 후보 목록에 추가되고 선택본 유지
- `src/lib/writer/CLAUDE.md` 스테이지 맵 갱신 (s0/s2 제거 + 이미지 생성 스텝 artist 이전 반영 — 하네스 정합)
</content>
</invoke>
