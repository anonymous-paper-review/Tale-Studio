# t0-serverless-path-parity — 실서버가 개발자 컴퓨터와 같은 길을 타는가

```yaml
id: t0-serverless-path-parity
source: sweep:claude:62428d65
tier: T0
budget: { usd: 0, runs: 1, wall_min: 50 }
blockers: []
status: done   # 2026-08-12 밤 러너 — 가설 기각(기각선 1절 발동: 진입점이 runPipeline vs runWriterSteps 로 갈라짐). 단 2절(튜닝 누락)은 미발동 — 동시성 3노브·전송 튜닝(instrumentation.ts:22, connections 64, NEXT_RUNTIME nodejs)이 서버리스에도 적용. 스테이지 모듈 13개 일치, 서버리스 전용 s1s3_merged는 기본 off. 결과: research/experiments/t0-serverless-path-parity/
priority: high
```

- **맥락 (사람 언어)**: 어제 성능 작업의 성과가 크다 — 어떤 구간은 262초에서 77초로 줄었다. 그런데 **그 숫자들이 전부 개발자 컴퓨터에서 잰 것**이다. 실제 사용자가 쓰는 건 클라우드에 올라간 서버고, 거기선 한 번에 오래 못 돌아서(수명 제한) 일을 나눠 이어 달리는 구조다. 개선의 핵심이었던 "동시에 몇 개를 돌릴지"와 "네트워크 전송 설정"이 **그 클라우드 경로에도 똑같이 적용되는지는 아무도 확인 안 했다.** 만약 안 걸린다면, 어제 잰 77초는 실사용에선 안 나오는 숫자다. 그러면 축하할 일이 아니라 다시 볼 일이 된다.
- **가설**: 로컬 러너와 서버리스 라우트(`api/writer/step`)는 같은 스테이지 함수와 같은 튜닝 설정을 탄다 — 즉 로컬 실측이 프로덕션에도 유효하다.
- **전제**: 실험 규칙 2번("이 실험이 통과하는 코드가 유저 요청이 통과하는 코드와 같은가")이 정확히 이 질문이다. 어제 세션의 모든 실측이 로컬 러너·클론 프로젝트 기준이라는 것은 다이제스트로 확인됨.
- **예측**: 참이면 두 진입점이 같은 함수를 호출하고, 동시성·전송 튜닝이 코드 상수이거나 양쪽 다 읽는 환경변수다. 거짓이면 튜닝이 로컬 전용 경로(스크립트 내부 설정·로컬 전용 env)에만 걸려 있다 — 그 경우 프로덕션은 개선 전 속도로 돌고 있다.
- **측정**: ① 로컬 러너 진입점과 `api/writer/step` 라우트에서 스테이지 호출까지의 경로를 코드로 추적해 **같은 함수에 수렴하는지** 확인 ② 동시성 설정과 전송 계층 튜닝(fetch/undici 관련)의 선언 위치를 찾아 **어느 진입점이 그 값을 실제로 읽는지** 대조 ③ Vercel 환경변수 스코프에 해당 키가 있는지는 코드에서 참조하는 이름만 열거한다(값 조회·출력 금지). 코드 추적만.
- **기각 조건** (사전 등록): 두 진입점이 **다른 함수로 갈라지거나**, 튜닝 값 중 하나라도 서버리스 경로가 못 읽는 곳에 선언돼 있으면 가설 기각 — 갈라지는 지점의 파일·라인을 원문으로 남긴다.
- **금지**: 프로덕션 런을 새로 돌려서 재보지 마라(유료·상태 변경). 이 티켓은 코드 추적만으로 죽는다. 실측 대조가 필요하다는 결론이 나오면 그건 다음 티켓 거리다.

## 좌표 (동결)

- 서버리스 진입점: `src/app/api/writer/step/route.ts`
- 파이프라인 오케스트레이션: `src/lib/writer/pipeline/steps.ts`, `src/lib/writer/pipeline/index.ts`
- 스테이지 디렉토리: `src/lib/writer/pipeline/stages/`
- 2레인 구조 주석(시드): `src/lib/writer/pipeline/steps.ts:150` — "Lane V: shotDesign → shotCheck → renderPrompts / Lane D: voiceProfiles → dialogue"
- 로컬 러너 선례: `research/experiments/writer-full-run/run.mts` (미커밋 변경 있음 — 읽기만)
- 관련 카드: Q13(서버리스 합성 스텝 카나리아) — 이 티켓은 그 결정에 필요한 **사실 한 조각**이다. 카나리아 실행 자체가 아니다.

## 산출 계약

- `research/experiments/t0-serverless-path-parity/{result.md, results.json}`
- 이 티켓 status 갱신 + `research/backlog/reports/2026-08-12.md`에 1줄
