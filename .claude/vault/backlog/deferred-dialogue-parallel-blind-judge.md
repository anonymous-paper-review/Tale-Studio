```yaml
id: 대사-병렬-전환의-블라인드-심판-라운드
source: .claude/vault/_DEFERRED.md D-018 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: waiting   # 원래 상태: 대기
priority: normal
```

# 대사 병렬 전환의 블라인드 심판 라운드


- **무엇을**: 이미 생성된 6런 산출물로 A(순차) vs B(병렬+원장)를 **라벨 제거·순서 섞어** 심판에게 읽혀
  ① 정보 누설(인물이 아직 모르는 걸 말하는가 — 규율 B) ② 톤 표류(보이스 프로파일 이탈)
  ③ 명대사 인플레(규율 C 위반 선언문) 세 축으로 판정한다. **새 대사 생성 불필요 — 심판 콜만.**
- **왜 미뤘나**: 오너가 속도 이득(−69.2%)과 결정론 지표 무손상을 근거로 심판 전 전환을 결정(2026-08-11).
  결함이 아니라 순서 문제 — 검증은 여전히 필요하고 감수 범위가 명시돼 있다. 결정론 패널은
  정보 누설·톤·명대사를 **원리적으로 못 재므로**, 그 축은 지금 무검증 상태로 프로덕션에 실려 있다.
- **언제 꺼내나**: 대사 품질 이상이 눈에 띄거나, 다음 writer 품질 라운드를 열 때. 둘 중 먼저.
  D-008(대사 품질 업그레이드)을 착수한다면 그 안에 흡수해도 된다.
- **되살릴 좌표**: 산출물 `logs/probe-dlg-{a-seq,b-ledger,c-blind}-r{1,2}/14b_dialogue.json`,
  채점기 `research/experiments/dialogue-parallel-ledger/score.mts`,
  판정 기록 `research/experiments/dialogue-parallel-ledger/HYPOTHESIS.md`.
  **회수 스위치: `WRITER_DIALOGUE_PARALLEL=0`** (재배포 없이 순차 복귀 — 코드 경로는 살아 있다).
- 기록: 2026-08-11

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `ready` 로 올린다. 조건이 사람만 알 수 있는 것이면 `needs-owner` 로 바꾼다.
