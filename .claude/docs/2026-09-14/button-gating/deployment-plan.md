# 버튼과 영상 차감 보완 배포 계획

같이 정한 것:

- 배포할 커밋을 지정하지 않으면 운영 설정과 DB를 바꾸지 않는다.
- 이번 SQL 세 파일이 지정한 커밋과 같으면 그 파일만 적용한다.
- SQL을 적용하면 같은 트랜잭션에 적용 이력을 기록한다.
- 같은 버전의 이력이 이미 있으면 내용까지 비교하고, 다르면 중단한다.
- 운영 적용은 main의 커밋과 준비된 Production 배포가 일치하면 진행한다.
- 개발 DB에서 같은 SQL의 적용과 검증이 끝나면 운영 DB에 적용한다.
- 실패하면 자동 승격·자동 복구를 하지 않고 현재 상태를 기록한다.
- 인증 정보가 오류에 포함되면 값은 기록하지 않는다.

추가 정책을 정하지 않는다. 운영자(root)가 각 단계를 따로 실행한다. 이 도구를 준비하는 동안에는
외부 변경을 하지 않고, 인자·SQL 감싸기·이력 비교·배포 식별자 검증을 로컬에서 먼저 확인한다.

## 범위

`node .smoke/button-gating-20260914/release.mjs <phase> [options]`

허용 SQL:

- `20260914160000_storyboard_singleflight.sql`
- `20260914170000_take_hold_idempotency.sql`
- `20260914171000_director_video_singleflight.sql`

파일 내용은 `git show <sha>:supabase/migrations/<file>`로 읽고 현재 파일의 SHA-256과 비교한다.
이번 파일 이외의 기존 마이그레이션 이력 부채를 정리하거나 재적용하지 않는다.
실행 결과는 같은 폴더의 `deployment-verification.json`에 기록하며 다른 세션의 배포 기록은 수정하지 않는다.

## 실행 순서

1. 이번 코드와 세 SQL을 임시 배포 커밋으로 만들고 테스트를 마친다.
2. `dev-migrate --sha <임시 SHA>`로 개발 DB에 세 SQL과 이력을 적용하고 검증한다.
3. 개발 DB를 기준으로 `pnpm db:types`를 실행한다. 타입·문서 보완을 후속 커밋으로 만들고 최종 검사를 마친다.
4. `hold --sha <최종 40자리 SHA>`로 현재 운영 배포와 자동 도메인 연결 설정을 보존하고 자동 연결을 중지한다.
5. 최종 커밋을 main에 반영한다. Git 연동으로 Production 빌드가 생성되지만 아직 운영 도메인은 옮기지 않는다.
6. CI와 Production 빌드가 최종 SHA에서 성공했는지 확인한다.
7. `live-migrate --sha <최종 SHA> --deployment-id <READY Production ID>`로 운영 DB에 같은 SQL을 적용한다.
8. `promote --sha <최종 SHA> --deployment-id <동일 ID>`로 승격하고 운영 대상·도메인 연결을 확인한다.
9. `restore --sha <최종 SHA>`로 자동 연결 설정을 원래 값으로 돌린다.

개발 적용 뒤 타입 갱신 때문에 SHA가 달라지면, 첫 `hold`에서만 기록을 최종 SHA로 승계한다.
새 SHA가 개발 검증 커밋의 후속이고, 세 SQL의 SHA-256이 모두 같으며, 아직 운영 hold를 시작하지 않았어야 한다.
개발 적용 기록의 `verifiedCommitSha`는 임시 SHA로 보존하고 `release-sha-updated` 이벤트에 이전·최종 SHA를 남긴다.
SQL이 바뀌거나 hold 이후 SHA가 바뀌면 중단한다. 이때 원장 파일을 수동으로 바꿔 검증을 우회하지 않는다.

`status`는 원격 설정·최근 배포·이번 세 이력을 읽기만 하며 파일을 쓰지 않는다.
모든 변경 단계는 `--sha`가 필수다. `--dry-run`을 추가하면 검증과 조회만 수행하며 API 변경·SQL 적용·결과 파일 쓰기를 하지 않는다.
운영 적용과 승격은 `--deployment-id`도 필수다.

```sh
node .smoke/button-gating-20260914/release.mjs status
node .smoke/button-gating-20260914/release.mjs dev-migrate --sha <임시SHA>
node .smoke/button-gating-20260914/release.mjs hold --sha <SHA> --dry-run
node .smoke/button-gating-20260914/release.mjs hold --sha <SHA>
node .smoke/button-gating-20260914/release.mjs status --sha <SHA>
node .smoke/button-gating-20260914/release.mjs live-migrate --sha <SHA> --deployment-id <ID> --dry-run
node .smoke/button-gating-20260914/release.mjs live-migrate --sha <SHA> --deployment-id <ID>
node .smoke/button-gating-20260914/release.mjs promote --sha <SHA> --deployment-id <ID>
node .smoke/button-gating-20260914/release.mjs restore --sha <SHA>
```

## 실패와 재실행

자동 복구는 하지 않는다. 실패 후 `status`로 현재 운영 배포·자동 연결·이력을 확인한 뒤 다음 단계를 결정한다.
동일 SQL이 이미 기록되어 있으면 다시 적용하지 않는다. 이력이 다른 경우 SQL이나 이력을 덮어쓰지 않는다.
적용 여부가 불명확한 네트워크 실패도 같은 조회로 재확인한다.
`restore`는 운영자가 명시적으로 실행할 때만 자동 연결 설정을 복구한다. 실패한 빌드가 남은 상황에서
복구할지는 운영자가 판단한다. SQL 롤백이나 이전 배포로의 승격 기능은 제공하지 않는다.

원격 DB는 개발 `pbiumddivadgbzxuymak`, 운영 `qnjnrihfpqkdhjuzvepy`로 고정하고 `.env.local` URL도 대조한다.
Vercel은 프로젝트 `prj_x0fGmBO62EJVmEZAhlUiOGZVHwnF`, 팀 `team_KkyWBlDMq7MTBNyQ3Lymti49`로 고정한다.
토큰은 `.env.local`에서 읽고 로그·명령 인자로 출력하지 않는다.

## 준비 검증 결과

- 인자 필수값·이력 내용 비교·SQL 감싸기·READY/SHA·승계 제한·마스킹의 로컬 검사 26개 통과.
- 실제 세 SQL을 조합해 실행 부분의 바깥 트랜잭션이 하나이고 원장 기록이 세 개인지 확인했다.
- `node --check`와 배포 도구 ESLint 통과.
- `status` 읽기 전용 실행으로 Vercel 인증·프로젝트와 두 DB 이력을 확인했다.
- 기존 main SHA를 넣은 `hold --dry-run`은 새 SQL이 그 커밋에 없어서 사전 단계에서 차단됐다.
- 도구 준비 중 원격 변경은 실행하지 않았고 `deployment-verification.json`도 만들지 않았다.

도구는 자신의 위치에서 저장소 루트를 계산한다. 별도 checkout의 같은 `.smoke/button-gating-20260914/` 경로로
복사하면 그 checkout의 커밋·SQL·`.env.local`·`.vercel/project.json`·배포 기록을 사용한다.
