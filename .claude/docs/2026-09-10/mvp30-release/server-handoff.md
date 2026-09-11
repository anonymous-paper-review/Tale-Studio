# MVP-30 서버 이동 준비 확인

**Writer에서 바로 Director로 넘겨도 Artist 화면의 오래된 상태에 의존하지 않고, 저장된 씬·샷·인물 이미지를 서버에서 확인한다. 이동 준비 확인은 데이터를 쓰지 않으며, 실제 이동 요청은 단계 저장을 확인한 뒤에만 Director 경로를 반환한다.**

새 파일:

- `src/lib/project-handoff.ts`.
- `src/app/api/project/[id]/handoff/route.ts`.
- `tests/project/director-handoff.test.ts`.

기존 `stage-nav.ts`, 채팅 store, 화면 컴포넌트는 이 슬라이스에서 수정하지 않았다. 응답을 받아 화면에 도착한 뒤 완료로 표시하는 처리는 루트의 클라이언트 변경이다.

## 계약

`POST /api/project/{id}/handoff`, 본문 `{targetStage:'director',action:'check'|'move',locale:'ko'|'en'}`.

준비 확인 결과:

```json
{
  "ready": false,
  "blockers": [{ "code": "writer:confirmation", "label": "씬 초안 검토·확정 대기", "action": "초안을 확인한 뒤 확정해 주세요.", "stage": "writer" }],
  "warnings": [],
  "counts": { "scenes": 6, "shots": 47 }
}
```

- 준비 완료: HTTP 200. `check`는 경로·쓰기 없이 결과만 반환한다.
- 준비 부족: HTTP 409. 대상·사유·다음 행동 및 실제 저장된 씬·샷 수를 반환한다.
- `move` 준비 완료: 프로젝트 도달 단계를 저장한 후 `path:'/studio/director'`를 추가한다.
- DB 조회/저장 실패: HTTP 503 `{error:{code,message}}`. 실패를 빈 장면·샷이나 준비 완료로 표시하지 않는다.
- 인증 없음 401, 다른 소유자/없는 프로젝트 403, 잘못된 대상/동작/언어/본문 400.
- 단계 저장이 0행이면 재조회한다. 다른 요청이 이미 Director/Editor로 전진한 것이 확인된 경우만 성공하고, 그대로면 `handoff_conflict` 409다.

## 기존 정책 재사용

`evaluateArtistGate`, `evaluateDirectorGate`, `mainImageFromAppearances`를 사용한다. 실제 준비 기준은 최신 Writer 실행의 완료와 저장된 씬·샷 존재다. 기본 모습의 시트를 우선 사용하고, 시트가 있는 모습 및 예전 대표 이미지의 기존 대체 순서를 지킨다. 필수 인물 이미지 부족은 막으며 배경·사물 보조 이미지 부족은 기존 경고로 유지한다. 대사 언어는 여기서 바꾸거나 한국어로 강제하지 않는다.

Writer 상태별로 진행 중 `writer:active`, 실패 `writer:failed`, 초안 확인 필요 `writer:confirmation`, 실행 없음 `writer:missing`, 산출물 없음 `writer:output`을 구분한다. 확인을 기다리는 초안은 가만히 기다리라고 하지 않고 확정할 일을 알려준다.

소유권은 서버에서 프로젝트의 workspace와 현재 사용자 ID로 확인한다. 공유 링크만으로는 check/move 모두 허용하지 않는다. 조회 오류를 권한 없음이나 준비된 상태로 조용히 대체하지 않는다.

도달 단계 저장은 읽은 `current_stage`를 조건으로 한다. 이미 Director·Editor까지 도달한 프로젝트는 쓰지 않으므로 Editor를 Director로 후퇴시키지 않는다. 저장 결과가 없거나 거절되었는데 성공했다고 응답하던 기존 client helper를 호출하지 않는다.

## 검증

처음 신규 15개 실패를 확인한 뒤 구현했다. 최신 실행·예전 이미지·대사 언어 보존·소유권 조회 실패를 추가 확인했고, 초안 확인 대기의 잘못된 행동 안내도 1개 실패를 먼저 재현한 뒤 수정했다.

최종 신규 20개 및 기존 lifecycle·대표 이미지 검사 합계 **32개 통과**. TypeScript, 변경 파일 ESLint, diff 검사 통과. 증거: `server-red.txt`, `server-confirmation-red.txt`, `server-green.txt`, `server-typecheck.txt`, `server-lint.txt`.

실제 POST와 도메인 함수 및 기존 gate 함수를 실행한다. DB 응답은 메모리 어댑터로 통제했고 실제 운영 데이터를 쓰거나 유료 생성을 하지 않았다. 아직 실제 화면 도착과 운영 반영의 검증을 이 서버 검사로 주장하지 않는다.

## 배포 의존

새 DB 스키마는 필요 없다. 기존 `projects.current_stage`, `workspaces.owner_id`, `writer_runs`, `scenes`, `shots`, `characters`, `character_appearances`, `locations`를 사용한다. `characters.view_main`은 현재 DB 타입에 존재하는 레거시 호환 컬럼이며 주 이미지 권위는 `character_appearances.sheet_url`이다. 새 서버 파일 2개, 회귀 1개와 루트가 추가한 한국어 사전 키를 30번 클라이언트 변경에 함께 포함해야 한다.

선별 배포 보고 `release-scope.md`는 fetch 이전 `origin/main=7f201cb9` 시점의 조사다. 이후 루트가 확인한 main `a5d8dc18` 및 배포용 별도 체크아웃의 변경을 보존해 최종 통합해야 한다.
