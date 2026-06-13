# Writer 파이프라인 도식 (2026-06-13, producer-story-gate 반영)

> s0/s2 스테이지 삭제 후 현재 구조. 진실: `src/lib/writer/pipeline/steps.ts` (WRITER_STEPS).
> 축: **Story**(Gemini) · **Visual**(Gemini) · **Cinematography**(Claude).
> Excalidraw 버전: `dev/writer-pipeline.excalidraw`

```mermaid
flowchart TD
  P["Producer 게이트<br/>genre + cast 확정"]:::producer
  P -->|"/api/writer/start<br/>seed → state.genre, state.characters"| S1

  subgraph WRITER["writer 파이프라인 · steps.ts (서버리스 체이닝, after() 자가호출)"]
    direction TB
    S1["narrativeStructure · s1<br/>Story · Gemini"]:::story
    S3["scenes + 오픈캐스트 · s3<br/>Story · Gemini · new_characters[] 머지"]:::story
    C1["storyCheck · c_validation_1 · skip 가능<br/>Cinematography · Claude"]:::cineskip
    MP["midPreview · skip 가능<br/>Visual · Gemini"]:::visskip
    VF["visualFormat · l0_l1<br/>→ renderFormat + artDirection · Gemini"]:::visual
    PD["productionDesign · l2<br/>Visual · Gemini"]:::visual
    SC["sceneCinematography · l3 · compact시 생략<br/>Visual"]:::visual
    DC["decoupage<br/>rhythm · shot_function · duration"]:::visual
    SD["shotDesign · l4<br/>ShotDesign[] (static/dynamic spec)"]:::visual
    SCH["shotCheck · c_application_2<br/>Cinematography · Claude → shotSequence"]:::cine
    RP["renderPrompts · l5<br/>T2I/TI2V · 로컬 전용(프로덕션 미소비)"]:::visual
    S1 --> S3 --> C1 --> MP --> VF --> PD --> SC --> DC --> SD --> SCH --> RP
  end

  RP --> DB[("DB persist · persist_manifest.ts<br/>scenes · characters · locations · shots")]:::db
  DB --> A["Artist<br/>캐릭터/월드 이미지 전담 생성"]:::sink
  DB --> W["Writer 탭<br/>러프 스토리보드 (목각 previz)"]:::sink
  DB --> D["Director<br/>콘티 이미지 · 영상"]:::sink
  D --> E["Editor<br/>타임라인 · 내보내기"]:::sink

  classDef producer fill:#d0bfff,stroke:#6741d9,color:#000
  classDef story fill:#a5d8ff,stroke:#1971c2,color:#000
  classDef visual fill:#b2f2bb,stroke:#2f9e44,color:#000
  classDef visskip fill:#ebfbee,stroke:#2f9e44,color:#000,stroke-dasharray:5 5
  classDef cine fill:#ffd8a8,stroke:#e8590c,color:#000
  classDef cineskip fill:#fff4e6,stroke:#e8590c,color:#000,stroke-dasharray:5 5
  classDef db fill:#dee2e6,stroke:#495057,color:#000
  classDef sink fill:#c5f6fa,stroke:#0c8599,color:#000
```

## 메모

- **producer-story-gate 변경(협업자)**: 옛 `s0_genre`·`s2_characters` 스테이지 **삭제**. producer가 genre/cast를 게이트로 확정해 `createRun`이 `state.genre`/`state.characters`로 seed → writer는 s1부터 시작.
- **오픈 캐스트**: s3(scenes)가 기존 cast 외 `new_characters[]`를 분리 반환 → `state.characters`에 머지(origin='writer').
- **이미지 생성 제거**: 옛 `assetImages` step 삭제 — 캐릭터/로케이션 이미지 초기 생성은 **Artist 전담**(writer는 행만 채움). 샷 콘티/영상은 Director.
- **점선 = skip 가능**: `storyCheck`/`midPreview`는 프로덕션 기본 skip(`resolveSkip`).
- **`renderPrompts(l5)`는 로컬 전용**: 산출물(T2I/TI2V)을 프로덕션에서 읽는 경로가 없음(파일 기반 loadStage가 Vercel에서 null). 실제 콘티/영상은 `shots.action_description` 기반. (OPEN_ISSUES T2 참조)
- **l6 images / l7 videos**: WRITER_STEPS 밖 — `/api/writer/generate/*` 별도 트리거(주로 Artist/Director 경유).
