# gen-endframe-excluded-video — END 프레임을 참조에서 빼고 영상을 만들면 어떻게 나오나 실측

```yaml
id: gen-endframe-excluded-video
source: _INBOX.md 형석 메모 "END 프레임을 재생성해주되 실제 영상 생성에서 빼기 (대신 확인해야함 END 프레임처럼 영상이 안 나올 수 있어서)" + 오너 피드백 2026-08-18 답 7번 (실행 지시) + 조사 티켓 n4 (END 제외 분기 부재 확정)
kind: generation
budget: { usd: 15, runs: 1, wall_min: 90 }   # 오너 실행 지시 인용, 금액은 세션 에이전트가 일일 한도 $50 내 배분해 2026-08-18 보고 — 초과 시 즉시 중단
blockers: [until:product-auth-session-for-project-3187bb25]
status: done
priority: high
```

## 오너 실행 지시 (원문, 2026-08-18)

> 3개 다 projectId=3187bb25-a117-4c62-b259-c20f4d856f5d 이 프로젝트로 테스트 진행해서
> 아티팩트로 결과 작성해줘.

## 알고 싶은 것

영상 발주 참조 그림에서 END 를 빼면(START 만 넣으면) 산출 영상의 끝 구도가 어떻게 되는가 —
형석의 걱정("END 프레임처럼 영상이 안 나올 수 있어서")이 실제로 일어나는가.

## 이미 확정된 사실 (n4)

- 현재 영상 발주 참조는 `[frames.start, frames.end]` 두 장 고정
  (`src/stores/director-store.ts:2352-2357` → `generate-video/route.ts:486-490,513`).
  주석 의도: "시작·끝 구도 고정". END 제외 분기는 코드에 없다.

## 어떻게 재나

1. 대상 프로젝트 `3187bb25-a117-4c62-b259-c20f4d856f5d` 에서 START·END 둘 다 있는 샷을 고른다.
2. 같은 샷으로 A/B 발주: (A) 현행 그대로 START+END, (B) END 만 뺀 START 단독. B 는 코드
   수정 없이 발주 payload 를 실험 스크립트로 직접 구성한다 (제품 코드 수정은 이 티켓 범위 밖 —
   결과가 좋으면 별도 r-티켓으로 승격).
3. A/B 영상·프롬프트·참조 목록·비용을 아티팩트에 나란히 기록. **좋고 나쁨 판정은 오너 몫** —
   사실만 적는다.

## 판정선

A/B 두 영상이 나란히 볼 수 있게 남으면 done. 발주 실패도 오류 원문과 함께면 done.

## 무엇을 남기면 끝난 건가

- `research/experiments/gen-endframe-excluded-video/` 에 아티팩트.
- 이 파일 status 갱신 + 기계 리포트 한 줄 + 아침 리포트 결과 카드.

## 실행 확인

2026-08-18에 target project의 product director 화면 인증을 확인했지만, 사용할 오너 세션이
인증 세션 확보 뒤에만 START+END와 START 단독을 발주한다.

## 2026-08-19 결과

- START+END 갈래: Higgsfield `5dea58ee-d89b-482e-9c02-b6639477efbc`
- START 단독 갈래: Higgsfield `02f2e549-aeb0-4676-90c2-f73f69be98b9`
- 두 산출물 모두 1280×720, 약 5.04초 H.264 영상으로 내려받았다.
- 산출물과 원문 파라미터: `research/experiments/gen-endframe-excluded-video/`
- 대상 프로젝트 Supabase 조회는 HTTP 402로 막혀, 기존 Higgsfield 작업 기록에서 확보한 같은 장면의
  START·END 입력을 사용했다. 이 대체 사실은 결과 아티팩트에 명시했다.
