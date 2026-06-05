# Layers — 파이프라인 레이어 계약 인덱스

> **이 폴더는 "계약(WHAT)"이지 "구현(HOW)"이 아니다.** 각 레이어가 *무엇을 산출하는가*(=다음 단계가 의존하는 계약)만
> 캐넌으로 둔다. *어떻게 만드는가*(메커니즘)는 **코드가 진실** — 개별 layer 문서의 메커니즘 서술이 코드와 다르면 코드를 따른다.
>
> 용어 주의: 여기 `L0~L3`은 **앱 파이프라인 라벨**(제품 단계)이고, writer 엔진 내부 스테이지(`S0~L7`, `src/lib/writer`)와는
> **다른 축**이다. (글로서리: 루트 `CLAUDE.md` 라우터)

## 레이어 → 산출물 계약 → 구현

| 레이어 | 산출물 (계약) | DB / 저장 | 구현 (코드) | 상세 스펙 |
|---|---|---|---|---|
| **L0** Concept Canvas | 캐릭터/월드 카드 (사용자 정의) | `characters`/`locations`, asset-storage-store | `src/app/studio/artist/`, `src/features/artist/` | [`L0_concept_canvas.md`](L0_concept_canvas.md) |
| **L1** Scene Architect | 씬·캐릭터·로케이션 분할 | `scenes`/`characters`/`locations` | **writer 엔진** `src/lib/writer/pipeline/stages/{s1_structure,s2_characters,s3_scenes}.ts` → `persist_manifest.ts` | [`L1_scene_architect.md`](L1_scene_architect.md) ⚠️*메커니즘 historical* |
| **L2** Shot Composer | 샷 시퀀스 (+대사) | `shots` (`dialogue_lines`) | **writer 엔진** `pipeline/stages/{decoupage,l4_shots,c_application_2}.ts` → `persist_manifest.ts` | [`L2_shot_composer.md`](L2_shot_composer.md) ⚠️*메커니즘 historical* |
| **L3** Prompt Builder | 샷 최종 프롬프트 (+ Knowledge RAG) | shots 프롬프트 | `src/lib/knowledge/`, `src/app/api/director/generate-shots/` | [`L3_prompt_builder.md`](L3_prompt_builder.md) |
| **Director Canvas** (P4) | 노드 그래프 연출 (샷↔영상 take) | `shots`/`video_clips` + `canvas_position` | `src/features/director/`, `src/stores/director-canvas-store.ts` | [`director_canvas.md`](director_canvas.md) |

## 디자인 토큰 (writer 엔진 전역 산출)
writer 엔진의 비주얼 스테이지(`L0Visual`/`L1Style`/`L2Design`)는 `projects.design_tokens`(JSONB)로 저장 →
artist 턴어라운드 등이 소비. 구현: `src/lib/writer/pipeline/util/persist_design_tokens.ts`.

## 읽는 법
- "이 레이어가 *무엇을* 만들어야 하나" → 위 표의 **계약** + 상세 스펙.
- "이 레이어가 *어떻게* 동작하나 / 스키마가 정확히 뭐냐" → **코드** + `.claude/cache/db/`.
- L1/L2 상세 문서 본문의 옛 메커니즘(`Pumpup`/`generate-scenes`)은 **폐기됨(decision #38)** — 배너 참조, 현행은 writer 엔진.
