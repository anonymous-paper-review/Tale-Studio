---
description: tale-studio 화면이 실제로 뜨는지 브라우저에서 확인한다 — UI/페이지/라우트를 고친 뒤, "앱 띄워서 확인", "화면 확인", "스모크", "실제로 되는지 봐줘", "/run" 멘션 시 사용. 렌더 여부·콘솔 에러·HTTP 상태·최종 URL·스크린샷을 수집한다.
when_to_use: src/app 또는 src/components 를 고친 뒤 완료를 보고하기 전. vitest 가 못 여는 층(브라우저 렌더·클라이언트 에러·인증 리다이렉트)을 확인할 때.
allowed-tools: Bash, Read
---

# smoke — 화면이 뜨긴 하는지 확인한다

인터페이스를 `pnpm test` 와 맞췄다. **전제가 없으면 알아서 skip 하므로 그냥 돌려도 안전하다.**

```bash
pnpm smoke                                   # targets.json 전부 (훅·밤 러너가 부르는 형태)
pnpm smoke /login --expect "로그인"           # 단건
pnpm smoke / --click e4 --expect "이메일"     # 진입 후 클릭까지 따라가기
pnpm smoke /studio --tree                     # 접근성 트리 전체 (--click 에 쓸 ref 찾기)
```

Skill 도구가 없는 서브에이전트(`frontend-designer` 등)와 다른 하네스(Codex·gjc)는 이렇게 부른다:
`node .claude/skills/smoke/smoke.mjs /login --expect "로그인"`

| 종료 코드 | 뜻 |
|---|---|
| 0 | 전부 ok, **또는 전제 미충족으로 skip** |
| 1 | 하나라도 실패 (HTTP 4xx·5xx / 렌더 안 됨 / 기대 문구 없음 / 콘솔 에러) |
| 2 | 사용법·내부 오류 |

전제(Orca 런타임) 미충족을 실패로 만들지 않는 이유: 밤 루프·다른 머신에서 조용히 깨지기 때문이다.
dev 서버는 없으면 스스로 띄우고 끝나면 정리한다(`--no-serve` 로 끌 수 있다).

## 이 도구가 하지 않는 것

**판정하지 않는다.** CLAUDE.md 헌법대로 그림·영상·화면이 좋은지는 오너만 정한다.
`ok` 는 "정상 응답 / 렌더됨 / 기대 텍스트 있음 / 콘솔 에러 0" 이라는 **사실 진술**이다.
**통과는 "완료"가 아니라 "오너가 판정할 재료가 준비됨"** 이다. 보고할 때 "잘 나옵니다"라고 쓰지 말고
결과와 스크린샷 경로를 그대로 넘긴다.

## 반드시 지킬 것 — URL 은 증거가 아니다

실측(2026-08-17): `history.pushState` 로 `location.pathname` 이 `/pricing` 이 되었는데
렌더된 DOM 은 로그인 폼 그대로였다. **URL·리다이렉트만 보고 "화면 확인했다"고 하면 가짜 보고다.**
그래서 `ok` 는 `--expect`(접근성 트리에 실제로 존재하는 텍스트)로 판단한다.
새 화면을 확인할 때는 **그 화면에만 있는 문구**를 반드시 걸어라.
`--expect` 를 안 걸면 404 페이지도 "렌더됨"으로 통과한다(HTTP 검사가 잡아주긴 하지만 믿지 말 것).

## 검사 목록 늘리기

`targets.json` 에 `{path, expect[], note}` 를 추가한다. `expect` 는 **지어내지 말고**
`pnpm smoke <path> --tree` 로 실제 스냅샷을 떠서 거기 있는 문구를 그대로 붙인다.

## 로그인이 필요한 화면

- `/`, `/pricing`, `/playground`, `/login`, `/share` 는 공개. 그 외는 `/login?next=...` 로 튕긴다.
  (`/docs` 는 미들웨어가 공개로 허용하지만 실제로는 404 라 targets 에서 제외했다.)
- 읽기 전용 확인은 `?share=<64-hex>` 티켓으로 로그인 없이 `/studio` 진입이 가능하다 (`src/middleware.ts`).
- 로그인 세션이 필요하면 **전용 프로파일에 사람이 1회 수동 로그인**한다:
  `orca tab profile create --label tale-auth --scope isolated` → 그 탭에서 로그인 →
  이후 `pnpm smoke /studio --profile tale-auth`.
  `scripts/seed-test-accounts.mjs` 는 비밀번호를 랜덤 생성해 stdout 에 한 번 찍고 해시로만 저장하므로
  사후 조회가 불가능하다. 자격증명을 파일에 적지 말고 세션을 프로파일에 남기는 방식만 쓴다.
- 기본 프로파일 `tale-smoke` 는 isolated 다. Orca 의 `default` 프로파일에는 오너의 Comet 세션이
  임포트돼 있으니 **에이전트 실행에 default 를 쓰지 말 것.**

## 알려진 한계 (실측 기준)

- **진입 페이지의 hydration 시점 에러는 못 잡는다.** 에러 수집기가 full load 이후에 설치되기 때문.
  반면 `--click` 으로 in-app 이동한 뒤의 에러는 전부 잡힌다(JS 월드가 보존됨).
  진입 화면의 에러가 의심되면 `--click` 으로 그 화면에 **들어가는** 경로를 쓰거나 dev 서버 로그를 봐라.
- 서버측 예외는 브라우저에 안 뜬다 — dev 서버 출력을 별도로 확인한다.
- Orca 앱이 떠 있어야 돈다. **GitHub CI 에서는 못 돈다** — 회귀 잠금장치가 아니라 개발 중 확인이다.
  (밤 루프는 Orca automation 으로 돌기 때문에 전제가 충족된다.)
  회귀로 잠글 가치가 생기면 그건 Playwright 로 따로 판단한다.
- 스크린샷은 `.smoke/`(git 미추적)에 쌓이고 같은 경로+클릭 조합이면 덮어쓴다.

## 관련

`.claude/hooks/smoke-gate.sh` (Stop 훅) 가 "UI 고쳤는데 확인 기록 없음"을 상기시킨다.
스모크를 대신 돌려주지는 않는다 — 무엇을 `--expect` 할지는 변경마다 다르기 때문이다.
