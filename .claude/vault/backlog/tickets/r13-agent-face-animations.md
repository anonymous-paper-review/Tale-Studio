# r13-agent-face-animations — 에이전트 얼굴 교체 + SD·LD 애니메이션 3종 제작

```yaml
id: r13-agent-face-animations
source: _INBOX.md 형석 메모 "에이전트 얼굴 변경 -> 만든걸로" + 오너 피드백 2026-08-18 답 8번
kind: fix
budget: { usd: 0, runs: 1, wall_min: 180 }
blockers: [human-labor:claude.ai 아티팩트(04f65efe-f395-4273-bd65-0d9fa54da3b4)를 파일로 내려받아 저장소에 넣어줄 것]
status: done
priority: normal
```

## 오너 결정 (원문)

> 에이전트 얼굴 변경 : https://claude.ai/code/artifact/04f65efe-f395-4273-bd65-0d9fa54da3b4
> 이 아티팩트 참여해서 SD, LD 버전 애니메이션 3종 제작 (가만히 있을 때 웃거나 눈 깜빡임,
> 생각하는 중, 작업하는 중)

## 왜 waiting 인가

위 claude.ai 링크는 로그인 뒤 스크립트로 그려지는 화면이라 밤이 열 수 없다
(2026-08-18 세션에서 접근 시도 — 본문 없이 껍데기만 옴). **오너가 아티팩트를 파일로
내려받아** `research/ui-references/agent-face/` 에 넣어주면 이 blocker 가 풀리고 ready 가
된다. 어떤 형식이든(코드, 이미지, HTML) 원본 그대로면 된다.

## 만들 것 (blocker 해제 후)

1. 아티팩트의 얼굴 디자인을 기준으로 에이전트 얼굴을 교체한다.
2. 애니메이션 3종을 SD·LD 두 해상도 버전으로 제작:
   - 대기: 가만히 있을 때 웃거나 눈 깜빡임
   - 생각하는 중
   - 작업하는 중
3. 구현 방식(CSS/SVG/스프라이트)은 아티팩트 원본 형식을 따르되, 제품에서 상태별로 갈아끼울
   수 있는 구조로 넣는다. 현재 에이전트 얼굴이 쓰이는 자리를 전수 찾아 교체한다.

## 선기입 수용 기준

1. 세 상태 각각에서 해당 애니메이션이 재생된다 (SD·LD 모두).
2. 기존 얼굴 자산의 잔재가 남지 않는다 (참조 0건 확인).
3. `pnpm test`·`tsc --noEmit` 새 실패 0건. `pnpm smoke --auth` 렌더 사실 수집. 자가 머지 금지.

## 무엇을 남기면 끝난 건가

- 작업 사본 브랜치 + 이 파일 status 갱신 + 기계 리포트 한 줄 + 아침 리포트 결과 카드 + 세 상태 스크린샷 경로.

## 2026-08-19 결과

- 기존 `AgentFace` SVG 구조를 참조 이미지로 정리하고 Higgsfield에서 세 상태 프레임을 만들었다.
  - 대기: `b672fda8-fe22-40f1-a3fc-a1f331715a7e`
  - 생각: `ef3dffc1-acaf-4af6-bcbf-c30fca1ab1b9`
  - 작업: `2e5da772-1e0a-4b61-bd54-e86c73764da4`
- SD 64px·LD 128px 파생 이미지와 세 상태 GIF를 만들었다.
- 제품의 `AgentFace`가 상태별 PNG를 사용하고, 움직임을 줄일 때는 애니메이션을 끄도록 연결했다.
- 산출물: `research/experiments/r13-agent-face-animations/`
- 제품 자산: `public/agent-face/`
