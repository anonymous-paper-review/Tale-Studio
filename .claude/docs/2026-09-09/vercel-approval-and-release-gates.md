# Vercel 현재 배포 확인과 무료 배포 관문 인계

갱신일: 2026-09-09. 오너의 운영 반영 요청에 따라 최신 main의 변경을 보존하면서 결제 변경을 합쳤고, 정상 푸시·운영 배포·환불 수정의 운영 DB 적용을 완료했다. 계정 연결·유료 좌석·향후 배포 관문 설정은 변경하지 않았다.

## 1. 지금 오너가 알아야 하는 결론

**최신 main의 영상 변경을 보존한 결제 통합본이 운영 배포됐다. 과거 CLI 배포는 차단 상태지만, 같은 통합 커밋의 정상 Git 연동 배포는 성공했다. 실제 고객 결제는 아직 잠겨 있다.**

| 구분 | 확인 결과 | 오너가 열 위치 |
| --- | --- | --- |
| 현재 운영 main | 결제 통합 커밋 `31d6edc7`, READY. Vercel 프로젝트의 현재 Production 대상과 일치한다. | [현재 운영 배포](https://vercel.com/talestudio/tale/4KNVUuq1vEMSyF5n7LWVvmeiyVu7) |
| 과거 CLI 배포 시도 | 마지막 CLI 시도는 여전히 BLOCKED / `TEAM_ACCESS_REQUIRED`. 현재 운영 배포와 다른 건이다. | [차단된 CLI 배포](https://vercel.com/talestudio/tale/7CHGETNTL16jYJLdJjkfVE3u35mc) |
| 자동 검사 | 통합 커밋의 GitHub CI 성공. 로컬 전체 테스트 2,495건 통과, 기존 건너뜀 27건. | [완료된 CI](https://github.com/anonymous-paper-review/Tale-Studio/actions/runs/34343159554) |
| 실제 고객 결제 | 운영에서 `checkoutEnabled: false`, 상품·가격 연결 13개, 구매 가능 0개, 환경은 Production으로 확인했다. | [운영 결제 상태](https://talestudio.art/api/billing/catalog-status) |
| 운영 자동 공개 | `autoAssignCustomDomains: true`. 수동 공개 관문은 아직 설정되지 않았다. | [프로젝트 대시보드](https://vercel.com/talestudio/tale) |
| GitHub 저장소 | 앞선 19:42 KST 조회는 `public`, 개인 계정 `anonymous-paper-review` 소유였다. Private 전환은 다른 세션 담당이며 이 결제 배포 작업에서는 변경하지 않았다. | [저장소 설정](https://github.com/anonymous-paper-review/Tale-Studio/settings) |

원격 main은 `54455bc4`에서 통합 커밋 `31d6edc7`로 정상 fast-forward 푸시했다. 강제 푸시나 기존 이력 덮어쓰기는 하지 않았다. 최신 main에 있던 영상 파일·마이그레이션 파일·정기 실행 설정을 보존했으며, 이 세션이 운영 DB에 적용한 것은 환불·만료 수정 마이그레이션 한 건뿐이다.

이전의 “결제 분리본이 차단되어 운영에 반영되지 않았다”는 설명은 과거 상태다. 현재 운영 배포 성공과 결제 잠금을 확인했으며, 이것이 Paddle 판매자 승인이나 실제 카드 결제 시험까지 완료됐다는 뜻은 아니다. 새 영상 기능의 품질·전체 운영 동작을 이 세션에서 별도로 검증한 것도 아니다.

## 2. Vercel에서 어디로 가서 무엇을 확인하나

### 지금 운영에 반영된 결제 통합본 확인

1. talestudio 관리자 계정으로 Vercel에 로그인한다.
2. 팀 `talestudio` → 프로젝트 `tale` → **Deployments**를 연다.
3. `main`, 커밋 `31d6edc7`의 배포를 연다. 위 “현재 운영 배포” 링크로 바로 들어가도 된다.
4. 이 건은 이미 READY이고 현재 Production 대상으로 지정되어 있다. 이 배포를 반영하기 위한 추가 승인·Redeploy·Promote는 필요하지 않다.
5. 실제 고객 구매는 잠겨 있다. Paddle 승인과 제한된 실결제 시험 준비는 배포 성공과 별도로 진행한다.

### 이전 CLI 차단 기록을 보는 경우

1. 위 “차단된 CLI 배포” 링크는 `dpl_7CHGETNTL16jYJLdJjkfVE3u35mc`의 과거 시도다.
2. 이 건은 여전히 BLOCKED / `TEAM_ACCESS_REQUIRED`이며, 빌드 완료 후 공개 승인 대기가 아니다.
3. 이후 동일 통합 커밋은 정상 GitHub 연동 경로로 Production 배포에 성공했다. 과거 CLI 차단을 현재 운영 배포 실패로 읽지 않는다.
4. 오래된 `6ed72c3a` 분리본을 별도로 운영 승격하지 않는다. 최신 main 변경까지 보존한 현재 통합본 `31d6edc7`을 기준으로 후속 작업한다.

대시보드의 실제 버튼 노출 상태는 이번에 확인하지 않았다. 따라서 모든 BLOCKED 배포에 공통 “Approve” 버튼이 있다고 안내하지 않는다.

### 새 배포에서도 작성자 오류가 반복될 때만 확인할 곳

- 본인 Vercel 계정 **Settings → Authentication**에서 GitHub 로그인 연결을 확인한다. 일부 안내에서는 Login Connections라고 부른다. 커밋 이메일 `j@xcape.run`도 해당 GitHub 계정의 인증 이메일인지 확인한다. [계정 연결 안내](https://vercel.com/docs/accounts), [작성자 오류 안내](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)
- talestudio **팀 Settings → Members**에서 해당 Vercel 계정의 가입·권한 또는 승인 대기를 확인한다. 승인 대기가 실제로 있는 경우에만 내용을 확인하고 처리한다. 추가 초대에는 초대받은 계정의 수락도 필요하다. 요금이 표시되면 비용 결정을 먼저 한다. [멤버 관리 안내](https://vercel.com/docs/rbac/managing-team-members)
- 같은 `jxcape` 작성자의 최신 Git 연동 배포는 성공했다. 따라서 “이 사람은 지금도 모든 배포 권한이 없다”라고 단정하지 않는다. 과거 차단 기록과 새 요청의 오류를 구분한다.
- 현재 배포 도우미는 `.env.local`의 `VERCEL_TOKEN`을 직접 사용한다. `vercel login`만 바꿔도 도우미 인증은 바뀌지 않는다. 토큰 값은 문서·대화에 기록하지 않는다.

권한 승인, 빌드 성공, 운영 도메인 공개는 서로 다른 단계다. 이번 작업에서는 CLI 재시도 후 정상 Git 연동으로 운영 배포를 완료했다. 계정 연결·멤버 추가·유료 좌석 구매·수동 Promote는 하지 않았다.

## 3. 다른 세션에서 구현할 것으로 합의한 방향

개발자는 오너와 친구 두 명이다. 당장은 GitHub Pro를 구매하지 않고 다음 구성을 사용한다.

1. GitHub 저장소를 Private으로 바꾼다. 오너가 직접 처리할 수 있다.
2. 기존 GitHub Actions CI를 유지한다.
3. 각자 로컬에서 실수로 main에 직접 푸시하는 것을 막는 장치를 추가한다.
4. dev 또는 출시용 분리 브랜치에서 PR을 만들고, CI 통과와 상대방 확인 후 main에 병합한다. 이는 두 사람의 작업 규칙이며 GitHub 서버가 강제하는 필수 리뷰는 아니다.
5. Vercel은 main 변경을 빌드하되 운영 도메인을 자동으로 바꾸지 않게 설정한다. 최종 공개는 오너 확인 후 수동 Promote로 한다.
6. 고객은 새 버전의 공개 전까지 기존에 배포된 main을 계속 본다. 중간에 dev 서버로 연결하지 않는다.

```text
dev 또는 출시 분리 브랜치
  → PR과 자동 검사, 서로 확인
  → main 병합
  → 새 운영용 빌드 준비, 기존 운영 사이트 유지
  → 오너 확인 후 Promote
  → 새 버전을 운영 도메인에 공개
```

Private 저장소와 CI 자체는 GitHub Free에서도 가능하다. 개인 Free의 GitHub Actions 포함량은 월 2,000분이며 무제한 무료는 아니다. Private의 서버 측 브랜치 보호는 별도 유료 기능이다. 이 계획에서는 유료 브랜치 보호를 사용하지 않는다. [GitHub 플랜](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)

## 4. 구현 체크리스트와 한계

- [x] 기존 `.github/workflows/ci.yml` 확인: main·dev push와 PR에서 타입 검사, 디자인 검사, 테스트를 실행한다. 결제 통합 커밋 `31d6edc7`의 [원격 CI 실행 34343159554](https://github.com/anonymous-paper-review/Tale-Studio/actions/runs/34343159554) 성공까지 확인했다.
- [x] 기존 `.githooks/pre-commit` 확인: 같은 세 가지 검사를 커밋 전에 실행한다.
- [x] `package.json`의 prepare에 `.githooks` 설치 설정이 있다.
- [ ] 오너가 저장소를 Private으로 전환한다. 경로: 저장소 Settings → General 하단 Danger Zone → Change repository visibility → Private → 영향 확인 → 최종 확정. 이전 공개 포크·복사본까지 회수되는 것은 아니다. [전환 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [ ] Private 전환 후 친구 계정의 저장소 접근과 Vercel GitHub 연동 접근이 유지되는지 확인한다.
- [ ] 로컬 main 직접 푸시 방지를 추가하고 두 사람의 환경에서 설치·작동을 확인한다. 구현 전 실제 차단할 경로를 한국어 약속과 회귀 테스트로 고정한다.
- [ ] PR에서 CI 결과를 확인하고 서로 검수한 뒤 병합한다는 작업 규칙을 저장소 문서에 반영한다.
- [ ] Vercel 프로젝트 Settings → Environments → Production → Branch Tracking → **Auto-assign Custom Production Domains 끄기**. 이 설정은 앞으로의 자동 도메인 연결을 멈추며 지금 운영 버전을 이전 버전으로 되돌리는 조치가 아니다. [수동 공개 안내](https://vercel.com/docs/deployments/promoting-a-deployment)
- [ ] 검수용 주소 접근 보호를 확인한다. Vercel Settings → Deployment Protection에서 Vercel Authentication과 Standard Protection을 검토한다. 운영 도메인까지 막는 All Deployments로 잘못 설정하지 않는다. 적용할 때 dev의 Paddle Sandbox 웹훅·자동 검사 접근도 확인하고, 필요하면 해당 자동 요청만 안전하게 허용한다. [접근 보호 안내](https://vercel.com/docs/deployment-protection)
- [ ] 검증용 변경으로 “main 빌드 완료 후에도 운영 도메인은 기존 버전 유지”를 확인한다.
- [ ] 공개 직전 CI와 검수 결과가 **공개할 바로 그 커밋**에 해당하는지 확인한다. 오래된 초록불이나 다른 배포를 승인 근거로 사용하지 않는다.

한계와 주의:

- 로컬 훅은 설치되지 않은 환경, 우회 옵션, GitHub 웹에서의 병합에는 강제력이 없다. 실수 방지 장치이지 서버의 접근 통제는 아니다.
- Free Private에서 CI가 빨간데도 웹으로 병합하는 것을 이 구성 자체가 막지는 못한다. 팀 작업 규칙으로 관리한다.
- Vercel 수동 공개는 main 진입을 막지 않는다. 고객에게 새 버전을 보여주는 시점만 분리한다.
- 운영용 대기 빌드는 운영 키·운영 DB를 사용한다. dev/Sandbox 테스트 공간과 혼동하지 않는다.
- 운영 도메인 공개를 멈춰도 별도 DB 변경 작업은 자동으로 멈추지 않는다. DB 변경과 기존 운영 코드의 호환성도 따로 검증한다.
- 관리자·토큰으로 하는 직접 배포·Promote도 같은 공개 절차를 따르도록 한다. 이 설정을 절대 우회 불가능한 보안 장치라고 설명하지 않는다.

## 5. 결제 배포 완료 기록과 후속 세션을 위한 기술 메모

오너의 운영 반영 요청 후 재통합·정상 푸시·운영 배포·환불 수정의 운영 DB 적용을 완료했다. 아래는 완료 근거이며, 3·4번의 향후 배포 관문 계획을 구현했다는 뜻은 아니다.

- 결제 분리 작업 디렉터리: `/Users/xcape/orca/workspaces/tale-studio/paddle-checkout-rollout`
- 로컬 브랜치: `jxcape/paddle-checkout-rollout`
- 이전 결제 분리 커밋: `6ed72c3a3447f8ea56dd5aca95ad36e2715f804d`.
- 최종 통합 커밋: `31d6edc7bd11f42cd4c7c704c57612ce3793cdb7`, 작성자 `jxcape <j@xcape.run>`.
- 원격 main은 `54455bc4dad73e49ce5505a4c21abf5963c36bce`에서 위 통합 커밋으로 정상 fast-forward 푸시했다. 강제 푸시·작성자 변경·이력 덮어쓰기는 하지 않았다.
- 로컬 전체 테스트 2,495건 통과·기존 건너뜀 27건. 타입 검사·디자인 검사·커밋 전 훅도 통과했다.
- GitHub CI: 실행 `34343159554`, 성공. [검사 결과](https://github.com/anonymous-paper-review/Tale-Studio/actions/runs/34343159554)
- 현재 운영 배포: `dpl_4KNVUuq1vEMSyF5n7LWVvmeiyVu7`, `tale-lwrts7y6w-talestudio.vercel.app`, Production READY. 프로젝트의 현재 Production 대상도 같은 통합 커밋이다.
- 같은 통합 커밋의 Preview 배포: `dpl_2iNGYUHeK3fyUsmzPx5iYJ3BV5jz`, READY. 운영 배포와 혼동하지 않는다.
- 마지막 CLI 시도: `dpl_7CHGETNTL16jYJLdJjkfVE3u35mc`, BLOCKED / `TEAM_ACCESS_REQUIRED`. 정상 Git 연동 배포의 성공으로 운영 반영은 완료했지만 CLI 권한 문제가 해결됐다고 기록하지 않는다.
- 과거 분리본 CLI 배포: `dpl_3BBBx5eAx6WCFw5GU8Sf9TNUSRCR`. 현재 운영 대상이 아니다.
- 배포 도우미의 기준 커밋·운영 대상 검사는 재사용 전에 최신 상태와 비교한다. 조건만 지우거나 예전 분리본을 현재 운영 위에 덮어쓰지 않는다.
- 기존 `prepare-paddle-rollout.mjs`도 오래된 기준 커밋을 전제로 한다. 현재 커밋 위에서 무심코 다시 실행하지 않는다.
- 재통합 과정에서 최신 main의 영상 파일·마이그레이션 파일·정기 실행 설정을 보존했다. 이 세션은 영상 DB 마이그레이션을 실행하지 않았다.
- 환불·만료 수정 `20260909130000_fix_refund_expiry.sql`은 개발 DB 적용 후, 정확히 해당 파일만 운영 DB에 적용하고 재조회로 확인했다.
- `https://talestudio.art/api/billing/catalog-status` 실측: `checkoutEnabled: false`, 연결 13개, 구매 가능 0개, 환경 Production. 운영 코드 반영과 실제 고객 결제 개방은 별개다.
- `autoAssignCustomDomains: true`가 유지된다. 이번 운영 배포는 정상 Git 연동 자동 공개이며, 향후 수동 공개 관문이나 저장소 Private 전환은 다른 세션의 작업으로 남겨 두었다.
- Paddle 실결제 개방은 이번 배포 관문 인계와 별개다. 승인·제한된 실결제 시험 준비가 완료되기 전 `PADDLE_LIVE_CHECKOUT_ENABLED`를 켜지 않는다.
- 개발·운영 진행 기록: [결제 개발 진행 HTML](paddle-development-progress.html). 기록 사이에 차이가 있다면 커밋·배포 ID·확인 시각을 함께 대조한다.
- `paddle-deployment-result.json`의 previousProduction과 과거 CLI observed 기록은 해당 시도의 이력이다. 그 항목만으로 현재 운영 대상이나 Git 연동 배포의 성공 여부를 판단하지 않는다.

이 문서와 관련 기록에는 비밀 토큰 값을 저장하지 않았다. 다음 세션은 조회 시각 이후 외부 상태가 바뀌었을 수 있음을 전제로 다시 확인한다.
