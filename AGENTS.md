# AGENTS.md — tale-studio

Claude Code 외의 에이전트(Codex, gjc 라인 등)를 위한 진입점이다.
`.claude/skills/`·`.claude/settings.json` 훅은 Claude Code 전용이라 당신에게는 로드되지 않는다.
프로젝트 규칙의 인덱스는 **`CLAUDE.md`** 이고 그 아래 `.claude/rules/`·`specs/design.md` 를 따른다.

## 변경을 닫는 검증 명령

| 명령 | 무엇을 잠그나 |
|---|---|
| `pnpm typecheck` | 타입 |
| `pnpm test` | 제품 핵심 자동 회귀 테스트 (수동·실험·Vault 운영 테스트 제외) |
| `pnpm test:all` | 수동·실험 테스트를 제외한 전체 자동 테스트 |
| `pnpm test:writer` | Writer 파이프라인·러프 previz·샷 관련 테스트 |
| `pnpm test:producer` | Producer 입력·게이트·핸드오프 테스트 |
| `pnpm test:artist` | Artist 이미지·자산 생성 테스트 |
| `pnpm test:director` | Director 캔버스·영상 생성 테스트 |
| `pnpm test:security` | 권한·입력 경계·red-team 테스트 |
| `pnpm test:manual` | 실제 API/Fal이 필요한 수동 테스트 (`RUN_LIVE_TESTS=1` 필요) |
| `pnpm smoke` | **브라우저에서만 드러나는 것** — 렌더 여부·콘솔 에러·HTTP 상태·인증 리다이렉트 |
| `pnpm smoke --auth` | 위와 같되 **로그인 뒤 화면** (제품의 실제 화면은 전부 여기 있다) |

`pnpm test` 는 브라우저를 못 연다. 그래서 `src/app/**` 또는 `src/components/**` 를 고쳤으면
`pnpm smoke` 를 함께 돌린다. 특정 화면만 볼 때는 `pnpm smoke /경로 --expect "그 화면에만 있는 문구"`.

테스트 묶음과 파일 수는 `pnpm test:list`로 확인한다. 기본 테스트에서 빠지는 수동·실험 테스트는
비용이 들거나 별도 환경이 필요한 경우에만 따로 실행한다.

`/studio/producer|writer|artist|director|editor` 가 제품의 실제 화면이고 전부 로그인이 필요하다.
공개 스위트만 돌리면 랜딩·요금·로그인폼만 확인되므로, UI 확인이 목적이면 `--auth` 를 쓴다.
**생성 버튼을 누르는 확인은 자동 목록에 넣지 않는다 — fal·higgsfield 가 실제로 돌아 과금된다.**

- 전제(Orca 런타임)가 없으면 **실패가 아니라 skip(exit 0)** 으로 빠진다. 그냥 돌려도 안전하다.
- dev 서버가 없으면 스스로 띄우고 끝나면 정리한다.

## 판정 경계 (헌법)

`pnpm smoke` 통과는 **"완료"가 아니라 "오너가 판정할 재료가 준비됨"** 이다.
CLAUDE.md 의 헌법대로 그림·영상·화면의 좋고 나쁨은 오너만 판정한다.
스모크가 주는 것은 사실뿐이다 — 렌더됐나, 콘솔 에러가 있나, 어디로 튕겼나, 스크린샷은 어디 있나.
보고할 때 "잘 나옵니다" 같은 판정을 쓰지 말고 결과와 스크린샷 경로를 그대로 넘긴다.

자세한 사용법·한계·로그인 필요한 화면 처리는 `.claude/skills/smoke/SKILL.md` 를 읽는다
(스킬로 못 부르더라도 그냥 문서로 읽으면 된다).
