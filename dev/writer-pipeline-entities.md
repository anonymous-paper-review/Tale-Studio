# Writer 파이프라인 — entity 단위 데이터 흐름 (2026-06-13)

> 각 stage의 **산출 엔티티**와 그것이 **어느 하류 stage로 전달되는지**를 코드(`steps.ts` run 인자 + `types/pipeline.ts`)에서 추출.
> Excalidraw(체인+소비처): `dev/writer-pipeline-entities.excalidraw`

## 1. entity 전달 그래프 (비순차 포함)

```mermaid
flowchart LR
  SEED["Producer seed"]:::p -->|Genre| S1["s1 narrativeStructure"]:::s
  SEED -->|Characters| S3["s3 scenes"]:::s
  S1 -->|NarrativeStructure| S3
  S1 -->|NarrativeStructure| MP["midPreview"]:::vk
  S3 -->|Scenes| SCK["storyCheck"]:::ck
  S1 -->|NarrativeStructure| SCK
  SCK -->|StoryCheckReport| MP
  S3 -->|Scenes| MP

  MP -->|MidPreview.v_rec| VF["visualFormat l0_l1"]:::v
  VF -->|RenderFormat| SHC["shotCheck c2"]:::c
  VF -->|RenderFormat| RP["renderPrompts l5"]:::v
  VF -->|ArtDirection| PD["productionDesign l2"]:::v
  MP -->|MidPreview.color_script| PD
  S3 -->|Scenes.location| PD

  VF -->|ArtDirection| SC["sceneCinematography l3"]:::v
  PD -->|ProductionDesign| SC
  MP -->|MidPreview.L3| SC
  VF -->|ArtDirection| DC["decoupage"]:::v
  PD -->|ProductionDesign.locations| DC
  SC -->|SceneCinematography 힌트| DC
  S3 -->|Scenes.scene_actions| DC

  DC -->|DecoupagePlan.shots| SD["shotDesign l4"]:::v
  SC -->|SceneCinematography| SD
  PD -->|ProductionDesign| SD
  VF -->|ArtDirection| SD

  SD -->|ShotDesign[] 3분할| SHC
  SC -->|SceneCinematography| SHC
  PD -->|ProductionDesign| SHC
  VF -->|ArtDirection| SHC
  S3 -->|Scenes| SHC

  SHC -->|ShotSequence| RP
  PD -->|ProductionDesign| RP

  PD -.persistAssetsToDb.-> DB[("DB: characters·locations·scenes")]:::db
  SHC -.persistShotsToDb.-> DBS[("DB: shots (V축 facet 탈락)")]:::db
  RP -->|RenderPromptsOutput| X(["⚠ dead-end · 프로덕션 미소비"]):::dead

  DB --> ART["Artist · 이미지 전담"]:::sink
  DB --> WT["Writer 탭 · 러프보드<br/>+ state→shotDesign 우회"]:::sink
  DBS --> WT
  DBS --> DIR["Director · 콘티·영상"]:::sink

  classDef p fill:#d0bfff,stroke:#6741d9
  classDef s fill:#a5d8ff,stroke:#1971c2
  classDef v fill:#b2f2bb,stroke:#2f9e44
  classDef vk fill:#ebfbee,stroke:#2f9e44,stroke-dasharray:4 4
  classDef c fill:#ffd8a8,stroke:#e8590c
  classDef ck fill:#fff4e6,stroke:#e8590c,stroke-dasharray:4 4
  classDef db fill:#dee2e6,stroke:#495057
  classDef sink fill:#c5f6fa,stroke:#0c8599
  classDef dead fill:#ffe3e3,stroke:#e03131
```

## 2. stage별 산출 엔티티 ↔ 소비처 (표)

| stage | 산출 엔티티 (핵심 필드) | → 소비 stage |
|---|---|---|
| **seed** | `Genre`, `Characters` | 거의 전 stage (전역 재료) |
| **narrativeStructure** (s1) | `NarrativeStructure` { acts[], theme, CDQ, pov } | scenes · storyCheck · midPreview · shotCheck |
| **scenes** (s3) | `Scenes` { StoryScene[]: scene_actions[]·emotion_beat·key_dialogue / **new_characters[]** } | 전 visual·shot축 + **Characters 머지**(mergeOpenCast) |
| **storyCheck** (c_val_1, skip) | `StoryCheckReport` { passed, issues[], causality_chain } | midPreview (유일) |
| **midPreview** (skip) | `MidPreview` { v_recommendations L0~L4, color_script } | visualFormat · productionDesign · sceneCine |
| **visualFormat** (l0_l1) | `RenderFormat` **+** `ArtDirection` (1 step·2 산출) | RF→ shotCheck·renderPrompts / AD→ l2·l3·decoupage·l4·c2 |
| **productionDesign** (l2) | `ProductionDesign` { global_palette, locations[], costumes } | l3·decoupage·l4·c2·l5 + **persistAssetsToDb** |
| **sceneCinematography** (l3, compact생략) | `SceneCinematography[]` { coverage_pattern, lens_vocab, lighting_arc, rhythm_profile } | decoupage · shotDesign · shotCheck |
| **decoupage** | `DecoupagePlan` { shots[]: shot_function, source_beats, shot_size, rhythm_role, intended_duration } | shotDesign (유일) |
| **shotDesign** (l4) | `ShotDesign[]` { intent / static_spec(**first_frame_prompt**) / dynamic_spec(**motion_prompt**) } | shotCheck (유일) |
| **shotCheck** (c_app_2) | `ShotSequence` { S·C·V, assets, action_budget, continuity } **+** Report | renderPrompts + **persistShotsToDb** |
| **renderPrompts** (l5) | `RenderPromptsOutput` { T2IPrompt, TI2VPrompt } | ⚠ **dead-end** (프로덕션 미소비) |

## 3. 코드가 드러낸 핵심 사실

- **visualFormat은 1 step·1 LLM 호출로 `RenderFormat`+`ArtDirection` 두 엔티티를 동시 산출.**
- **`ProductionDesign`·`ArtDirection`이 가장 광역 허브** — Visual/Shot축 거의 전 하류가 소비.
- **decoupage→shotDesign→shotCheck는 1:1 직렬** (각각 유일 소비처). decoupage가 샷 경계·shot_id를 확정하고 l4가 3분할 spec을 입힌다.
- **shotDesign(L4 rich spec)은 renderPrompts로 직접 안 감** — shotCheck를 경유해 `ShotSequence`로 흡수된 뒤에만 l5 도달. l5의 static_spec fallback은 死코드.
- **renderPrompts(l5) 산출물은 dead-end** — l6/l7이 WRITER_STEPS에 미배선이라 프로덕션 콘티/영상은 `shots.action_description` 기반.
- **DB 평탄화에서 V축 facet 증발**: `ShotSequenceItem`의 V/C/action_budget/continuity/first_frame_generation이 `shots` 테이블에 안 실리고 camera_config는 기본값 0으로 덮임. 러프 스토리보드만 `writer_runs.state→shotDesign`을 직접 읽어 우회.
- **storyCheck·midPreview는 프로덕션 기본 skip** — 켜는 경로(`input.skip`)를 producer가 안 보내 항상 빈 산출물.
