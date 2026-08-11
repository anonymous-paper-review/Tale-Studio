# 티켓 폼 — 밤 실행 단위 (미결 1개 = 티켓 1개)

> 알바생 원칙: 밤 러너는 맥락 제로다. 이 파일만 읽고 실행 가능해야 한다.
> 가설 5줄은 `research/experiments/_HYPOTHESIS.md` 정본을 그대로 따른다.
> 자격 심사 규칙: `.claude/rules/experiments.md` (반증 조건 없으면 반려).

```yaml
id: <slug — 파일명과 동일>
source: <vault 파일 §섹션 — 원문 역링크, 무손실 보존은 vault가 담당>
tier: T0 | T1 | T2 | T-fix
# T0 관측: $0, read-only (DB 쿼리·grep·git·코드 추적)
# T1 텍스트: ~$2 (LLM 콜 있음, 생성 없음)
# T2 생성: fal $ — 티켓에 오너 승인 금액 명시 없으면 blocked
# T-fix 수리: 브랜치+테스트 준비까지만, 머지·커밋 금지
budget: { usd: 0, runs: 1, wall_min: 30 }  # 고분산 지표(벽시계 등)는 runs ≥3
blockers: []  # owner-decision:<질문id> | owner-approval:<금액> | human:<노동> | depends:<티켓id> | trigger:<대기 조건>
status: ready | blocked | running | done | draft  # draft = 밤 러너가 제안만 한 티켓(실행 금지, 아침 심사행)
priority: high | normal
```

- **맥락 (사람 언어)**: (2~3문장, 개발용어·코드명 없이 — 이 티켓이 왜 존재하는지. 아침 HTML 리포트가 이 문장을 그대로 인용한다. 비워두면 리포트 작성자가 맥락을 재구성해야 해서 인지비용이 두 배가 된다)
- **가설**: (한 문장)
- **전제**: (vault·DB 실측과 대조되는 지점)
- **예측**: (참이면 / 거짓이면)
- **측정**: (오라클 명시 — 판정 3원칙: LLM은 지각만·채점은 코드·불확실은 NA. 혼합 지표 금지, 쌍대(2AFC)가 절대 판정보다 변별력 좋음)
- **기각 조건**: (사전 등록 — 밤 러너 수정 금지. vault에 없어 티켓 작성 시 정한 임계값은 `(제안)` 표기)

## 좌표 (동결)

픽스처·DB·로그 경로·선례 코드. 밤에 입력을 찾아 헤매게 하지 마라 — 스테일 좌표로
헤맨 사고가 기실측(8/10 삭제된 디스패처 수색). 미확정 배선은 `Phase 0: <확정 절차>`로
명시하되 측정·기각 조건은 불변 (previz-channel-ablation HYPOTHESIS가 선례).

## 산출 계약

- `research/experiments/<id>/{result.md, results.json}` — result.md는 사람 언어 + 실제 입출력 원문 인용 (E0a 표준)
- 이 티켓 status 갱신 + `research/backlog/reports/YYYY-MM-DD.md`에 1줄 (발동한 기각 조건 포함)
- 기각도 산출이다 — "기각됨"이 남으면 티켓은 done
