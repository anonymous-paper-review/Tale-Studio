---
name: 프로젝트 참조 import POC
version: 1.0.0
last_updated: 2026-08-25
status: 구현 완료 — 오너가 이미지 품질을 눈으로 판정할 부분은 별도
---

# 프로젝트 참조 import POC

새 프로젝트를 만들 때 같은 workspace의 기존 프로젝트 하나를 밑바탕으로 선택한다. 이번 POC는 두 경로만 자동화한다.

- 이야기: 참조 프로젝트의 제목·설정·캐스트·배경·줄거리를 producer 채팅에 읽기 전용으로 넣는다.
- 화풍·시작 이미지: 스타일 앵커와 선택한 마지막 샷 시작 프레임을 새 프로젝트 소유의 media 객체로 복사한다.

캐릭터 자산 링크, 시리즈 체인, 결제 연동, 아카이브는 범위 밖이다. 그림체가 실제로 같은지는 자동 판정하지 않는다.

## 저장 구조와 요금제

`projects.reference_project_id`는 한 개의 참조만 가리키는 self-FK다. 원본 프로젝트가 삭제되면 `on delete set null`로 연결만 끊고 새 프로젝트는 남긴다. 자기 자신을 가리키는 값은 데이터베이스 check 제약으로 거부한다. `projects.optional_reference_frame_url`은 선택한 마지막 샷 시작 프레임의 새 사본 주소다.

`workspaces.plan`은 결제 연동 전 POC용 임시 값이며 기본값은 `free`다. 현재 슬롯 표는 다음과 같다.

| plan | 최대 프로젝트 슬롯 | 참조 import |
|---|---:|---|
| `free` | 1 | 잠김 |
| `s1` | 1 | 잠김 |
| `s2` | 1 | 잠김 |
| `s5` | 1 | 잠김 |
| `s10` | 1 | 잠김 |
| `p10` | 2 | 열림 |
| `p15` | 3 | 열림 |
| `p20` | 3 | 열림 |
| `p25` | 4 | 열림 |
| `p30` | 4 | 열림 |

표는 `src/lib/plan-limits.ts` 내부에 숨겨져 있다. 호출부는 `getPlanLimit()`과 `canUseReference()`만 사용한다. 알 수 없는 plan은 `free` 한도로 닫힌다. 프로젝트 개수 조회가 실패해도 새 프로젝트를 열지 않는다.

## 신뢰 경계

브라우저가 보낸 참조 ID와 데이터베이스 행의 custom URL은 그대로 믿지 않는다.

1. 생성 전에 서버가 참조 프로젝트의 `projects.workspace_id → workspaces.owner_id`를 다시 확인하고, 요청자의 최신 workspace와 같은지와 plan을 다시 확인한다.
2. custom anchor와 마지막 프레임은 `isOwnMediaUrl()`과 `mediaPathFromUrl()`을 통과한 자사 media 주소만 storage `copy`한다. 서버가 외부 URL을 `fetch`하지 않는다.
3. 원본 앵커·프레임이 없으면 텍스트 참조만 만든다. 복사가 실패하면 프로젝트 생성은 성공시키고 `warnings`와 화면 경고를 남긴다.
4. producer digest는 매 요청 다시 읽는다. 저장·캐시하지 않고, 참조의 참조 ID를 따라가지 않는다. 소유권이나 plan 재확인에 실패하면 조용히 넣지 않는다. 데이터베이스 장애 같은 시스템 예외만 `[produce/chat] reference digest skipped:` 경고를 남긴다.

## 실행 기본값

- 마지막 샷의 `storyboard_image.frames.start`를 먼저 보고, 없으면 `rough_storyboard.frames.start`를 선택한다.
- 커스텀 앵커는 스냅샷으로 복사하고, 프리셋은 `style_anchor_key`만 복사한다.
- 앵커가 없거나 비활성이라도 텍스트 digest는 이어간다.
- digest는 producer 컨텍스트까지만 자동화한다. 정식 `settings`·캐스트·배경 반영은 기존 producer 핸드오프 확정 경계를 따른다.
- 이미지·영상 생성 버튼은 검증에서 누르지 않는다. 화면 렌더·HTTP 상태·콘솔 사실만 smoke로 확인하고, 시각적 품질은 오너가 판정한다.

## 구현 좌표

- DB: `supabase/migrations/20260825155000_reference_import_poc.sql`
- 서버 검증·복사·digest: `src/lib/reference-import.ts`
- 생성 API: `src/app/api/project/new/route.ts`
- 목록 API: `src/app/api/project/list/route.ts`
- plan: `src/lib/plan-limits.ts`
- producer 주입: `src/app/api/produce/chat/route.ts`
- 생성 UI·payload: `src/app/page.tsx`, `src/app/projects/page.tsx`, `src/stores/project-store.ts`

검증은 `tests/reference-import.test.ts`, `tests/reference-digest.test.ts`, `tests/produce-reference-digest.test.ts`, `tests/project-reference-gate.test.ts`, `tests/reference-import-plan-limits.test.ts`에 있다. 전체 테스트와 타입 검사는 완료 전에 다시 실행한다.
