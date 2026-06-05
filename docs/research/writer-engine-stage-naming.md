# Writer 엔진 스테이지 네이밍 리팩토링 (제안 — 미적용)

> 성격: **미래 리팩토링 계획 (research/WIP)** — 아직 코드 미적용. 2026-06-05 작성.
> 대상: `src/lib/writer/` (옛 svc 파이프라인). 외부 경계는 `persist_manifest`/`adapters`라 리플은 대체로 writer 내부에 갇힘.
> 적용 시 tsc로 검증. specs 정리 완료 후 진행 예정.

## 왜 (문제)
엔진이 `S / L / C` + 숫자 prefix를 씀. **`L`이 한 뜻이 아님**: L0~L2=비주얼, L3=씬플랜, L4=샷, L5=프롬프트, L6=이미지, L7=영상.
→ 번호를 외워야 뭔지 앎. 이름이 "축 letter + 순번"이라 산출물을 안 알려줌.

## 원칙
- **스테이지 이름 = film-craft compound** (도메인 의미 또렷, 길어도 OK). 일반 제품 용어(`style`/`design`/`prompt`)는 **선점하지 않음** — 제품 전반에서 써야 하므로.
- **로그 파일 = 순번 prefix 유지** (`01_genre.json … 15_renderPrompts.json`) — 정렬/재개용. 번호는 *파일에만*, 타입엔 없음.
- 축(Story/Visual/Check/Render)은 letter prefix 말고 메타(`axis` 필드/주석)로.

## 매핑 테이블 (제안)

| 순 | 현재 코드 | 현재 로그파일 | **제안 이름** | 대안 | 무엇 | 축 |
|--:|---|---|---|---|---|---|
| 00 | input | `00_input` | `input` | — | 입력 | — |
| 01 | `S0Genre` | `02_S0` | `genre` | — | 장르 | Story |
| 02 | `S1Structure` | `03_S1` | `narrativeStructure` | `storyStructure` | 기승전결 구조 | Story |
| 03 | `S2Block` | `04_S2` | `characters` | `characterBible` | 캐릭터(외형/성격/arc) | Story |
| 04 | `S3Block` | `05_S3` | `scenes` | `sceneBreakdown` | 씬 | Story |
| 05 | `CValidation1Report` | `06_C_validation_1` | `storyCheck` | `narrativeCheck` | 인과/클리셰 검증 | Check |
| 06 | `MidPreview` | `07_mid_preview` | `midPreview` | — | 중간 미리보기 | — |
| 07 | `L0Visual` | `08_L0_L1` | `renderFormat` | `outputFormat` | 매체/해상도/fps | Visual |
| 08 | `L1Style` | `08_L0_L1` | `artDirection` | `styleGuide` | 아트스타일/형태언어/텍스처 | Visual |
| 09 | `L2Design` | `09_L2` | `productionDesign` | `designBible` | 팔레트/의상/로케이션/vfx | Visual |
| 10 | `L3SceneVisualPlan` | `10_L3_scene_plans` | `sceneCinematography` | `sceneShootPlan` | 씬을 어떻게 찍을지 영상문법 | Visual |
| 11 | `DecoupagePlan` | `10b_decoupage` | `decoupage` | `shotBreakdown` | beat→shot 분해 | — |
| 12 | `L4Shot` | `11_L4_shots` | `shotDesign` | `shotSpec` | 샷 3분할(intent/static/dynamic) | — |
| 13 | `CValidation2Report` | `12_C_application_2` | `shotCheck` | — | 액션버짓 검증 | Check |
| 14 | `ShotSequence` | `13_shot_sequence` | `shotSequence` | — | 최종 샷 시퀀스 | — |
| 15 | `FinalPromptsOutput`(L5) | `14_final_prompts` | `renderPrompts` | `shotPrompts` | T2I/TI2V 프롬프트 | Render |
| 16 | `L6ImagesOutput` | — | `shotImages` | — | 이미지 생성 | Render |
| 17 | `L7VideosOutput` | — | `shotVideos` | — | 영상 생성 | Render |

## 미확정 선택지 (적용 전 확정 필요)
1. `artDirection` vs `styleGuide`
2. `productionDesign` vs `designBible`
3. `sceneCinematography` vs `sceneShootPlan`

## 적용 시 변경 예시
- 타입: `L2Design` → `ProductionDesign`, `interface ShotSequence` 유지
- 변수/필드: `result.L2` → `result.productionDesign`, `const { L0, L1 }` → `{ renderFormat, artDirection }`
- 스테이지 함수: `runL2` → `runProductionDesign`, `runS2` → `runCharacters`
- 로그 파일: `09_L2.json` → `09_productionDesign.json` (logger/resume 경로 동기화 필요)
- 동시에 잔존 `svc` 단어(파일명 `use-svc-status`/`svc-progress`, 식별자 `useSvcStatus`/`SvcProgress`/`svcSceneIdToMain`, 로그 `[svc/start]`)도 `writer`로 스윕.

## 주의
- `S2`/`S3` 약칭이 코드 곳곳(adapters, persist_manifest, status route)에 박혀 있어 일괄 변경 필요 — tsc가 안전망.
- `08_L0_L1.json`은 L0+L1 합본 파일 → `renderFormat`/`artDirection` 분리 또는 합본 유지 결정 필요.
