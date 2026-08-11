# 검수 노트 → 러프 화면 A/B — 가설 (사전 등록, 미실행)

> 작성 2026-08-11. 실행 전 사전 등록 — 결과를 본 뒤 이 문서를 소급 수정하지 않는다.
> 심사 규칙 `.claude/rules/experiments.md` / 폼 `research/experiments/_HYPOTHESIS.md`.
> 티켓: `research/backlog/t2-checknote-previz-ab.md` (T2 — 오너 승인 대기).

## 5줄

- **가설**: 검수가 붙이는 주의 노트(`check_notes`)를 그림 주문서에 주입하면 화면이 개선된다 —
  단 그 효과는 지적 갈래(기계 승격 후보 A / LLM 몫 B / 경계)에 따라 다르다.
- **전제**:
  ① 노트는 실제로 주입된다 — 경로는 `appendCheckConstraints`가 주문서 끝에
     `\nContinuity constraints: <;로 이은 목록>` 한 줄을 붙이는 것뿐 (부착부 2곳:
     `director/generate-storyboard/route.ts:104`, `writer/rough-storyboard/route.ts:407`).
     DB 실측 — Run A 85샷 / Run B 76샷이 노트를 달고 있다.
  ② 밀어내기 위험이 실측 근거를 갖는다 — 노트 평균 146자 vs 구도 주문서 평균 277자(최대 457자).
  ③ INFO 90건은 `constraint`가 없어 애초에 주입되지 않는다 → **실험 대상 밖**(이미 무영향 확정).
     대상은 주입되는 WARNING·CRITICAL 182건 계열뿐.
  ④ 러프 패널은 흑백·마네킹 캐논(계약 F2)이다 — 의상·색 계열 노트는 이 단계에서 원리적으로
     검출 불가일 수 있다(전제가 아니라 **검증 대상**: 부착 단계 정합성).
- **예측**:
  - 참(노트가 값어치 한다): 준수 축이 노트 팔에서 높고, 부작용 축 손상 없고, 선호 2AFC 노트 팔 우세.
  - 거짓A(밀어내기): 준수 축은 오르는데 부작용 축이 떨어지고 선호는 무차별 또는 역전.
  - 거짓B(무영향): 세 축 모두 무차별 → 주입은 토큰·프롬프트 비용만 쓰는 것.
  - 층 예측: A(기계 승격 후보)는 화면 효과가 작고 B(LLM 몫)는 크다 — 갈리면 그 선이 곧 분류 경계.
- **측정**: 같은 샷을 두 팔(노트 주입 / 미주입)로 생성한 **짝지음 설계**. 판정 3원칙 준수 —
  LLM은 지각만, 채점은 코드, 불확실은 NA. 혼합 지표 금지로 오라클 3개를 분리한다.
  - **O1 준수**: 노트가 요구한 것이 화면에 있는가 (노트당 이진, 질문은 노트에서 파생해 생성 전 동결)
  - **O2 부작용**: 원 주문서의 핵심 요소 3개(샷 사이즈 / 인물 수·배치 / 배경 앵커 1개)가 지켜졌는가
    (요소 추출도 생성 전 동결)
  - **O3 선호**: 두 장 중 previz 패널로 어느 쪽이 쓸만한가 (2AFC, 좌우 무작위·라틴 스퀘어)
  - 전 축 블라인드(판독기는 어느 쪽이 노트 팔인지 모른다). 판독 모델은 선행 실험 좌표 승계
    (`judge.mts`의 JUDGE_MODEL = gemini-3-flash-preview, temperature 0).
- **기각 조건** (사전 확정, 새 임계값은 `(제안)`):
  - **주 가설 기각**: O3 전체 쌍에서 노트 팔 승률이 부호검정 p ≥ 0.05 **이면서** O1 준수율 차이
    < 10%p → "노트 주입은 화면을 개선하지 않는다" 채택, WARNING 주입 중단 검토 `(제안)`
  - **밀어내기 확정**: O2 손상이 노트 팔에서 유의하게 많으면(p < 0.05) → 주입 방식 개정 `(제안)`
  - **계기 실패**: 어느 축이든 NA율 > 30% → 그 축 무효, 해당 축 결론 금지·재설계 `(제안)`
  - **층 가설 기각**: 갈래 간 차이가 없으면 → 경계선은 화면으로도 안 그어짐(다른 기준 필요)

## 설계 상세

### 조작점 — 함수 하나, 한 줄

두 팔의 유일한 차이는 `appendCheckConstraints(prompt, check_notes)` 적용 여부다. 제품 함수를
그대로 import해 호출/미호출만 가른다(복붙 금지 규칙 1 충족). 프롬프트 본문·모델·시드·템플릿은 동결.

### 표본 — 갈래 층화

주입 대상 노트를 세 갈래에서 층화 표집한다(분류 근거: 2026-08-11 triage 아티팩트).
기본안 **18샷 = 갈래당 6샷**, 팔 2 × 반복 3 → **108장**. 단가 실측 후 예산 상한에 맞춰
**샷 수를 먼저 줄이고 반복 3은 유지**한다(고분산 지표 runs ≥ 3 규칙).

- 전체 54쌍 → 주 판정용. 갈래별 18쌍 → **지시적**(판정 아님)으로만 읽는다.

### 블라인드·동결 순서 (어기면 실험 무효)

1. 표본 확정 → 2. O1 질문·O2 요소 루브릭 작성·**동결**(생성 전) → 3. 생성 → 4. 파일명 무작위화
→ 5. 판독 → 6. 코드 채점 → 7. 블라인드 해제.

### Phase 0 (확정 절차 — 측정·기각 조건은 불변)

1. **픽스처 확정**: Run A/B 클론이 `design_ref`로 실제 렌더 가능한지 확인. 불가 시 러프 보유
   프로젝트(예: 42샷 보유 `2beb605c`)에 검수를 돌려 노트를 얻는 경로로 전환하고 좌표만 갱신.
2. **장당 단가 1장 실측**(`openai/gpt-image-2/edit`) → 표본 크기 확정.
3. **판독기 이미지 확장 스모크 2쌍** — `previz-channel-ablation/judge2.mts`의 분리 오라클 패턴 승계.

## 범위 밖 (이번에 안 하는 것)

- INFO 90건 — 주입 경로가 없어 실험 불필요(이미 무영향).
- previz **영상** 단계 — 1차 판정은 러프 이미지로 한정(비용).
- 검수 프롬프트 개정 자체 — 이 실험은 판정만 하고 개정은 결과에 따른 별건.

## 좌표 (동결)

- 조작 함수: `src/lib/writer/check-notes.ts` (`parseCheckConstraints` / `appendCheckConstraints`)
- 부착부: `src/app/api/director/generate-storyboard/route.ts:104`,
  `src/app/api/writer/rough-storyboard/route.ts:407`
- 생성 모델: `DEFAULT_EDIT_IMAGE_MODEL = 'openai/gpt-image-2/edit'` (`src/lib/writer/llm/fal.ts:105`)
- 노트 원천 런: `logs/5260d92d-2e7b-4991-8bff-00213b37ef77`, `logs/e4da245a-8d89-44e5-8fde-131d016ef2e3`
  (DB shots.check_notes: 85 / 76샷)
- 분류 근거: 2026-08-11 triage 아티팩트 https://claude.ai/code/artifact/011c9b97-98ba-4cce-b6fd-483d03783a1f
- 판독 선례: `research/experiments/previz-channel-ablation/judge2.mts` (분리 오라클 2AFC, 8/11 스모크 검증)
- 관련 기록: `.claude/vault/2026-08-10-flash-ab-fanout-review.md` §1-2,
  `.claude/vault/2026-08-10-writer-integrity-performance.md` (검수 모놀리식 확정·D-a)
