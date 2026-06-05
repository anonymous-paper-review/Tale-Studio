# Layers — 파이프라인 레이어 인덱스

> **source-of-truth = 코드 + `.claude/cache/db`** (WHAT IS). specs는 *왜/계약*(WHY)만 둔다.
> 구현된 레이어(L0~L3)의 메커니즘·스키마는 **코드가 진실** — 아래 "구현" 코드 위치를 직접 본다.
> (옛 L0~L3 상세 spec 문서는 코드와 중복되어 폐기됨. 미구현 forward 설계만 `director_canvas.md`에 남는다.)
>
> 용어: 여기 `L0~L3`은 **앱 파이프라인 라벨**(제품 단계). writer 엔진 내부 스테이지
> (`genre`/`artDirection`/… `src/lib/writer`)와는 **다른 축**. (글로서리: 루트 `CLAUDE.md`)

## 레이어 → 산출물 → 구현 (코드 = source-of-truth)

| 레이어 | 산출물 | DB / 저장 | 구현 |
|---|---|---|---|
| **L0** Concept Canvas | 캐릭터/월드 카드 (사용자 정의) | `characters`/`locations`, asset-storage-store | `src/app/studio/artist/`, `src/features/artist/`, `src/stores/asset-storage-store.ts` |
| **L1** Scene Architect | 씬·캐릭터·로케이션 분할 | `scenes`/`characters`/`locations` | writer 엔진 `src/lib/writer/pipeline/stages/{s1_structure,s2_characters,s3_scenes}.ts` → `persist_manifest.ts` |
| **L2** Shot Composer | 샷 시퀀스 | `shots` | writer 엔진 `pipeline/stages/{decoupage,l4_shots,c_application_2}.ts` → `persist_manifest.ts` |
| **L3** Prompt Builder | 샷 최종 프롬프트 (+ Knowledge RAG) | shots 프롬프트 | `src/lib/knowledge.ts`, `src/app/api/director/generate-shots/` |
| **Director Canvas** (P4) | 노드 그래프 연출 (샷↔영상 take) | `shots`/`video_clips` + `canvas_position` | `src/features/director/`, `src/stores/director-canvas-store.ts` — 설계: [`director_canvas.md`](director_canvas.md) |

## 디자인 토큰 (writer 엔진 전역 산출)
writer 엔진 비주얼 스테이지(`renderFormat`/`artDirection`/`productionDesign`)는
`projects.design_tokens`(JSONB)로 저장 → artist 턴어라운드 등이 소비.
구현: `src/lib/writer/pipeline/util/persist_design_tokens.ts`.

## 읽는 법
- "이 레이어가 *무엇을/어떻게* 만드나, 스키마가 정확히 뭐냐" → **코드** + `.claude/cache/db/`.
- "*왜* 그렇게 설계됐나 / 미결정" → `specs/decisions.md`, `specs/open_questions.md`.
- 아직 구현 안 된 forward 설계 → 해당 change(`specs/changes/`) 또는 `director_canvas.md`.
