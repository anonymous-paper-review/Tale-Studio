# n7-project-inheritance-map — 프로젝트 간 캐릭터·월드·이전 이야기 상속 장치가 존재하는가

- status: `done`  # 사실 지도 완성 — 상속 장치 부재 확정. 만들지 말지는 오너 몫
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (fingerprint `12dec5aac06db440`, byte range 0-9531)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- 실행 주체: night-investigator 백지 조사 작업자 (읽기 전용 Read/Grep/Glob, 모델 sonnet — fable 금지 준수)
- 자율성 레벨: 1 (사실 기계 — 조사만, 코드 수정·유료 발주 없음)
- operation_key: `n7-project-inheritance-v1`

## 원문 인용 (오너 메모)

> 연속 프로젝트 만들때 다른 프로젝트에서 이전 프로젝트 상속받기(캐릭터, 월드, 이어질 전 이야기(compacted))

## interpretation

시리즈물처럼 이어지는 프로젝트를 만들 때, 앞 프로젝트의 등장인물·세계관·줄거리 요약을
새 프로젝트가 물려받는 장치를 원한다. 그런 장치가 지금 있는지 없는지는 코드와 스키마 안에
있으므로 사실로 닫힌다.

## observation — 이 조사가 답해야 할 질문

한 프로젝트의 자산을 다른 프로젝트로 옮기거나 참조하는 코드 경로가 실재하는가.

## 선기입 수용 기준

1. 프로젝트를 새로 만드는 자리를 `파일:줄` 로 특정하고, 생성 시 다른 프로젝트를 입력으로
   받는 인자가 있는지 참/거짓으로 답한다.
2. 등장인물(캐릭터)·세계관(월드)·줄거리에 해당하는 저장 단위의 이름을 코드에서 찾아 쓴다.
   각각이 프로젝트에 묶이는 방식(외래키·소유 필드 등)을 `파일:줄` 로 제시한다.
3. 프로젝트 간 복제·가져오기·참조 기능이 코드에 있는지 세 자산 **각각** 참/거짓으로 판정한다.
   있으면 자리를, 없으면 "없음"을 근거(찾은 범위 명시)와 함께 쓴다.
4. 줄거리를 요약·압축해 저장하는 자리가 있는지 참/거짓으로 답한다.
5. 구현 방법·설계 제안은 쓰지 않는다. 현재 사실만 쓴다.

## 시작점 힌트 (전수는 직접 확인할 것)

- `src/app/api/projects/`, `src/app/projects/`
- `src/lib/inventory.ts`, `src/lib/cast-slug.ts`, `src/types/` 또는 `src/lib/**/types`
- 검색어 후보: `createProject`, `project_id`, `character`, `world`, `synopsis`, `clone`, `copy`, `import`

## 결과 카드

- 판정: **pass** — 수용 기준 5항목 전부 충족. 결론: **상속 장치는 없다**
- created_at: 2026-08-18T02:50Z · estimated_review_min: 2 · reviewed_min: — · carryover_min: —
- 지출: $0 · 코드 수정 0건

### 확인한 것

오너가 원한 "이전 프로젝트의 캐릭터·월드·압축된 줄거리를 새 프로젝트가 물려받기"는
**코드에 존재하지 않는다.**

| 물음 | 답 | 근거 |
|---|---|---|
| 프로젝트 생성이 다른 프로젝트를 입력으로 받나 | **아니오** — `title` 하나만 받는다 | `src/app/api/project/new/route.ts:16-20,41` · `src/stores/project-store.ts:270-279` |
| 캐릭터 상속 | 없음 | `characters` 는 `project_id` FK 로 고정 (`src/types/database.ts:56-117`) |
| 월드 상속 | 없음. "월드"의 실체는 `locations` 테이블 | `src/app/api/artist/generate-world/route.ts:22,82-93` · `src/types/database.ts:312-392` |
| 줄거리 상속 | 없음. `synopsis` 라는 낱말이 `src/` 전체에 0건 | 전수 검색 |
| 줄거리 압축 저장 자리 | 칸은 **있고** 쓰는 코드는 **0건** | `projects.expanded_story` — 읽기만 (`src/stores/writer-store.ts:912,939,1005`) |

**근접했다가 멈춘 인프라 하나**: `inventory_items`(workspace 범위, `kind: character|world|image`)가
있고 출처를 기록하는 `source_project_id`/`source_character_id` 칸까지 있다
(`src/lib/inventory.ts:59-71`, `src/app/api/inventory/save-from-asset/route.ts:14-21,65-77`).
그런데 저장을 부르는 코드가 `src/` 전체에 **0건**이고, 진입 화면인 artist 인벤토리 탭은
`disabled` + "준비 중" 배지 상태다(`src/app/studio/artist/page.tsx:430-436`).
살아 있는 소비 경로는 director 에서 인벤토리 **이미지 한 장**을 샷 참조로 붙이는 것뿐이라
(`src/features/director/canvas-panels/ShotDetailPanel.tsx:105-112,405-409`), 캐릭터 레코드
자체를 옮기는 것과는 다르다.

### 확인 못 한 것

`src/app/api/project/[id]/route.ts:94-109` 의 삭제 대상 테이블 목록에 `database.ts` 에 없는
이름이 여럿 있다(`character_relationships`, `subtext_notes` 등) — 타입 파일이 라이브 스키마보다
낡았을 수 있다. 이 조사는 읽기 전용 코드 조사라 **DB 실물 스키마는 대조하지 않았다**.

### 다음 조치 — 오너 판단 필요

상속을 만든다면 갈림길이 셋이고 전부 오너 선택이다: (1) 자산을 **복제**할지 **참조**할지,
(2) `inventory_items` 를 되살려 쓸지 새 경로를 팔지, (3) "압축된 이전 이야기"를 무엇으로 만들지
(`expanded_story` 칸은 비어 있고, 씬 단위 요약 `scenes.narrative_summary` 는 이미 채워진다 —
`src/lib/writer/pipeline/util/persist_manifest.ts:280-291`).
