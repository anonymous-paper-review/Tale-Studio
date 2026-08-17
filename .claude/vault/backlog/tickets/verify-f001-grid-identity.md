# 실사 그리드 칸별 인물 배선 검증 — 수리가 실제로 탔는가

```yaml
id: verify-f001-grid-identity
source: fixlog:F-001 (원문: .claude/vault/_archive/_FIXLOG.md)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 20 }
blockers: []   # 2026-08-16 밤 — 해제 조건 충족 확인: 11:13Z 이후 storyboard_real_grid 21건(완료 20·대기 1), 최신 2026-08-14T03:30Z
status: done   # 2026-08-16 밤 — 통과: 수리 이후 일괄 그림 20건 전부에 칸별 인물 배정문 + 참고 그림 지정문 둘 다 실림(20/20). 결과: research/experiments/verify-f001-grid-identity/result.md
priority: normal
```

- **맥락 (사람 말로)**: 여러 샷을 한 장에 그리는 경로에서 칸과 인물의 대응이 아예 없던 결함을
  고쳤다(`cb2d56c`). 고친 코드가 실제 생성에 실렸는지는 다음 생성물이 나와야만 확인할 수 있다.
- **알고 싶은 것**: 수리 이후 생성된 일괄 그림의 송신 프롬프트에 칸별 인물 배정문이 실렸는가.
- **어떻게 재나**: `generation_jobs` 에서 kind=`storyboard_real_grid`, completed,
  created_at ≥ 2026-08-12T11:13Z 인 잡의 `input_snapshot.prompt` 를 읽는다(#B9로 이제 기록된다).
- **판정선**: `Column i: <이름>` 배정문과 `reference image N = <이름>` 규약이 **둘 다** 있으면 통과.
  하나라도 없으면 수리 미배송 — blocked 처리하고 아침 리포트에 올린다.
- **잴 대상 실재 확인**: 조건이 차기 전에는 0건이 정상. 조건 충족 여부 확인 쿼리가 곧 대상 확인이다.
- **추가 관측(같은 잡에서)**: 인물 세트가 혼재된 시트의 소수 인물 칸이 제 인물로 그려졌는지는
  그림 판정이라 결론 내지 않는다 — 아침 리포트에 비교 재료(그림 URL + writer 인물 데이터)만 정리한다.
- **남기면 끝**: 기계 리포트 한 줄 + 아침 리포트 카드. 통과면 이 티켓 done — F-001 계열의 잔여는
  확산 표본 육안(오너 몫, q-f001-regen-three-sheets 뒤에 판단).
