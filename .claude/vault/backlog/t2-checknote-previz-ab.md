```yaml
id: t2-checknote-previz-ab
source: .claude/vault/2026-08-10-flash-ab-fanout-review.md §1-2 + 2026-08-11 세션(검수 이슈 272건 3분류 — 경계 40건이 텍스트로 안 닫힘)
kind: generation
budget: { usd: 25, runs: 3, wall_min: 90 }
blockers: []
status: done
priority: high
```

- **맥락 (사람 언어)**: 검수가 잡아낸 지적을 글로만 읽으면 "맞는 말이네"밖에 나오지 않아서,
  어느 지적을 살리고 어느 지적을 버릴지 선을 그을 수가 없다. 지적이 값어치를 하는 건
  그게 실제 그림을 바꿀 때뿐이므로, 같은 장면을 지적을 넣고 한 번·빼고 한 번 그려서
  화면을 나란히 놓고 본다. 이 실험이 닫는 건 "지적이 옳은가"가 아니라 "지적이 화면을 바꾸는가"다.
- **가설**: 주의 노트 주입은 화면을 개선한다 — 단 효과는 지적 갈래(기계 승격 후보/LLM 몫/경계)에 따라 다르다.
- **전제**: 노트 주입 경로는 함수 하나(주문서 끝 한 줄 추가)뿐이고 DB에 161샷이 노트를 달고 있다 /
  노트 평균 146자 vs 구도 주문서 평균 277자라 밀어내기 위험이 실측 근거를 가진다 /
  INFO 90건은 주입 경로가 없어 대상 밖 / 러프는 흑백·마네킹이라 일부 노트는 원리적으로 검출 불가일 수 있다.
- **예측**: 참이면 준수↑·부작용 없음·선호 우세. 밀어내기면 준수↑인데 부작용↑·선호 무차별.
  무영향이면 세 축 무차별. 갈래별로 갈리면 그 선이 곧 분류 경계.
- **측정**: 짝지음 설계(같은 샷 2팔) + 분리 오라클 3개(준수 / 부작용 / 선호 2AFC), 전 축 블라인드.
  LLM은 지각만·채점은 코드·불확실은 NA. 루브릭은 생성 전 동결. 판독 모델 좌표는 judge.mts 승계.
- **기각 조건** (사전 등록):
  - 주 가설 기각: 선호 2AFC 부호검정 p ≥ 0.05 이면서 준수율 차이 < 10%p `(제안)`
  - 밀어내기 확정: 부작용 손상이 노트 팔에서 p < 0.05 로 많으면 `(제안)`
  - 계기 실패: 어느 축이든 NA율 > 30% → 그 축 무효, 결론 금지 `(제안)`

## 좌표 (동결)

가설 정본과 전체 좌표: `research/experiments/checknote-previz-ab/HYPOTHESIS.md`
- 조작 함수 `src/lib/writer/check-notes.ts` / 부착부 2곳(HYPOTHESIS 좌표절)
- 생성 모델 `openai/gpt-image-2/edit` (`src/lib/writer/llm/fal.ts:105`)
- 판독 선례 `research/experiments/previz-channel-ablation/judge2.mts`
- 분류 근거 아티팩트 https://claude.ai/code/artifact/011c9b97-98ba-4cce-b6fd-483d03783a1f
- Phase 0: ①픽스처 렌더 가능 여부 확인(불가 시 러프 보유 프로젝트로 전환·좌표만 갱신)
  ②장당 단가 1장 실측 후 표본 확정(샷 수 먼저 축소, 반복 3 유지) ③판독기 스모크 2쌍

## 산출 계약

- `research/experiments/checknote-previz-ab/{result.md, results.json}` — 사람 언어 + 입출력 원문 인용
- 3열 HTML 아티팩트: 주문서 – 지적 – 화면 2장(블라인드 해제 후) + 축별 판정
- 이 티켓 status 갱신 + `.claude/vault/backlog/reports/YYYY-MM-DD.md` 1줄 (발동한 기각 조건 포함)
- 판정 카드: 갈래별 결론 → 경계 40건 처리 → 코드 린트 목록 / 검수 우선순위 문안
- **실행 결과 (2026-08-11)**: **부분 참** — 18샷 × 2팔 × 3회, 이미지 108장과 판독 276건 완료. O1 준수율은 노트 51.0% 대조 26.9%(+24.1%p, p=0.0042), O2 원 지시 보존은 66.7% 대 68.6%(-2.0%p, p=0.7539), O3 선호는 27승 대 27승(p=1.0000). 즉 노트는 요구사항 준수를 올렸지만 전체 화면 선호를 올리지는 않았다. 기각 조건·NA>30%·밀어내기 조건은 미발동.
- **방법 이탈**: 현재 `writer/rough-storyboard`는 제안서의 `appendCheckConstraints`가 아니라 `parseCheckConstraints`와 셀 START 직접 첨부를 사용한다. 이 구현을 그대로 실행하고 결과에 기록했다.
- **정본**: `research/experiments/checknote-previz-ab/{fixtures.json,manifest.json,judgments.json,results.json,result.md,review.html}`
