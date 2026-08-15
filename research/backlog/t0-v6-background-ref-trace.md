```yaml
id: t0-v6-background-ref-trace
source: .claude/vault/2026-08-10-background-view-3d.md §3 (최종 생성 V6의 배경 ref 흐름 — 미검증)
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: 완료  # 2026-08-11 밤 러너 — 가설 참(최종 경로도 배경 무방어: wide_shot 1장 고정·뷰 분기 없음). 결과: research/experiments/t0-v6-background-ref-trace/
priority: normal
```

- **가설**: 최종 생성(V6/generate-sheet) 경로도 previz와 같은 배경 무방어다 — location 에셋(wide_shot 1장)이 전 각도 샷에 같은 ref로 들어간다.
- **전제**: previz 무방어는 시각 증거로 확정(같은 명목 뷰가 씬마다 딴 건물 — sc6/7/9/10). V6은 "타입 주석상 그렇게 보이나 미검증"(이번 세션은 previz만 열었음). 인물은 이중 방어(마네킹 규칙+view_main ref), 배경은 무방어라는 비대칭이 previz 실측.
- **예측**: 참이면 generate-sheet ref 조립에 샷별 뷰 분기·배경 방어 배선이 없음. 거짓이면 방어 실존.
- **측정**: 코드 추적(read-only) — 최종 생성 라우트→ref 조립 경로 전수 추적, previz 배선(batch ref = [러프 그리드, 캐릭터, 스타일 앵커])과 나란히 대조표 작성.
- **기각 조건**: 샷별 배경 ref 분기가 실존하면 가설 기각. 어느 쪽이든 결과는 뷰 시트 실험(Q5) 설계의 전제 입력 — 관측 자체가 닫히는 조건("generate-sheet 경로 실측").

## 좌표 (동결)

- Phase 0: 최종 생성 라우트 확정 — `src/app/api/director/` 하위 sheet/최종 생성 계열 라우트 grep. 대조 기준: previz = `generate-storyboard-batch/route.ts` ref 목록.
- 참고 배선(vault 기록): 로케이션 이미지는 wide_shot 1장 존재·establishing_shot 전부 null.

## 산출 계약

- `research/experiments/t0-v6-background-ref-trace/result.md` — previz vs V6 ref 조립 대조표(파일:라인 좌표 포함).
- status 갱신 + reports 1줄 + `_MORNING.md` Q5에 증거 링크.
