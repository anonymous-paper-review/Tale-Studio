# D1 — DB 감사 묶음 결과

> 실행일: 2026-07-21 · 실행: 서브에이전트(Sonnet) / 판정: Claude(Fable) · 상태: **✅ 진단 완료** (판정 5건 아래)
> 대상: writer_runs 전수 38 run (completed 28 / failed 10), 2026-06-06 ~ 2026-07-21 · LLM 비용 0
> 스크립트: 스크래치패드 throwaway (`d1_audit.mjs` — 세션 종료 시 소멸, 패턴은 `scripts/verify-db.mjs`)

## 1. 측정 결과

**컨텍스트**: depth 분포 D2:10 / D3:16 / D4:9 (+미기록 3) — 단편 편중 여전(D1·D5~D7 없음).

1. **structure_type: 36/36 전부 3-act** (미기록 2). 7-21 이후 run 1건도 3-act — 단 S1 앵커 수정은 워킹트리에만 있고 프로덕션 미배포이므로 **수정 전 베이스라인**이다. 배포 후 재감사 필요(세션 열린질문 #3 유지).
2. **씬 purpose 히스토그램** (160씬/34 run): conflict 19.4% · exposition 13.1% · setup 11.9% · transformation 11.3% · resolution 11.3% · climax 10.6% · revelation 10.6% · transition 7.5% · **payoff 3.1%** · **decision 1.3%**.
3. **uncovered_beats: 0건** — decoupage 34 run·149씬에서 의도적 REMOVE 전무. "모든 비트를 커버하라" 지시가 완전 준수됨.
4. **hook_type: 743샷 중 434 채움(58.4%)** — 10종 전부 사용됨(visual_bait 21.9% 최다). 소비처는 여전히 코드 전체에 0.
5. **V5 extraction: LLM fallback 0.0%** (t2i 643/643 추출, ti2v 643/643 추출, 24 run) — V5의 LLM fallback 경로는 실전에서 한 번도 안 탔다.

스키마 특이: extraction_summary가 completed 28건 중 24건에만 존재(구버전 run 추정). "필드없음" 건들은 스키마 불일치가 아니라 해당 stage 미도달.

## 2. 판정 (계획서의 사전 분기 기준 적용)

| 항목 | 사전 기준 | 판정 |
|---|---|---|
| E4 (purpose 편중 → 관습 씬 흐름 힌트 실험) | conflict/exposition 편중이면 실험 추가 | **❌ 실험 불요** — 분포 건강, 편중 없음 |
| E10 (uncovered_beats validator) | REMOVE 남용 보이면 validator 추가 | **❌ validator 불요** — 사용 자체가 0 |
| E12a (hook_type 실태) | 희박하면 E12b 제거 근거 강화 | **58.4%로 희박하지 않음** — 단 소비처 0은 그대로. E12b(결정론화)는 "제거해도 소비 손실 0"으로 성립. 훅을 살릴지는 제품 결정(소비처 배선이 선행) — 감사 문서 1.11 결론 유지 |
| V5 관련 | — | **E11 범위 축소**: 언어 실험은 V4(정본 저작)만 대상. V5 fallback은 사실상 죽은 코드 — W5(자수·언어 문구 정렬)는 유지하되 우선순위 최하 |

## 3. 파생 발견 (계획에 없던 것)

- **setup 19 vs payoff 5 (3.8:1)** — 심어놓고 회수하지 않는 씬이 구조적으로 많다. 씬 단위 라벨이라 완벽한 셋업-회수 매칭은 아니지만, 서사 품질 신호로 유력. → **E5(C1 재정의) 실험 시 "셋업 회수율"을 검사 항목 후보로 편입** (클리셰 감점 대신 이런 걸 잡는 게 검수의 일).
- decision 1.3% — 캐릭터의 능동적 선택 씬이 거의 없음. 관찰만 기록(입력 story 성격일 수 있음).

## 4. 후속 조치

- 계획서 상태 표 갱신: D1 ✅, E4/E10은 목록에서 기각 처리.
- S1 수정 배포 후 structure_type 재감사 1회 (다음 감사 때 이 스크립트 패턴 재사용).
