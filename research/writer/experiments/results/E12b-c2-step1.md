# E12b — C2 shotCheck Step1(LLM 조립) 완전 결정론화 결과

> 실행일: 2026-07-21 · 실행: 서브에이전트(Sonnet) / 셋업·판정: Claude(Fable) · 상태: **✅ 채택 — 구현·확인 완료**
> 원시 로그: `logs/writer-stage-exp/{ad,ledger}__shotCheck__e12b{A,B}{1,2}.json` (A/B) · `__e12bF{1,2}.json` (최종판)
> 채점: `../tools/e12b_score.mjs` — 렌더 필드 충실도는 주입한 L4 원본과의 결정론 대조.

## 요약 (쉬운 말)

파이프라인 끝부분에는 "설계도(L4)를 최종 납품 서식(ShotSequence)으로 옮겨 적는" 단계가 있는데,
이 옮겨 적기를 지금까지 AI에게 시키고 있었다. 실측해 보니 **AI는 설계도의 핵심 내용(렌더 프롬프트·
길이·에셋)을 한 글자도 다르게 옮기지 않았고**(잘 옮겼다는 뜻이지만, 곧 기계적 복사로 충분하다는 뜻),
AI만 추가로 적어 넣던 부가 메모(hook_type 등)는 **코드 어디에서도 읽지 않는다**(전수 grep 0건).
반면 이 단계 때문에 호출 1번과 60~160초가 매번 소모되고 있었다. 그래서 옮겨 적기를 코드(결정론)로
바꿨다 — 결과물은 동일하고, 더 빠르고, 옮기다 샷을 잃어버릴 위험(과거 실측된 49→16 병합 버그)은
원천적으로 사라진다.

## 1. 가설·판정 기준 (사전 확정)

- 가설: LLM 조립은 reconcile(결정론 정합)이 진실인 현행에서 무가치 — 제거해도 최종 필드 충실도 동일, 콜 1개↓.
- 방법: 입력 고정 격리 — 동일한 L4 산출물(ad 12샷·ledger 16샷)을 파일 주입, A(현행 Step1 실행) vs
  B(결정론 직행 게이트) × 각 2 run. Step2(Claude 검증)는 양팔 공통.
- 판정: 렌더 소비 필드 손실 0 + Step2 산출 악화 없음 = 채택.

## 2. A/B 결과 (8/8 성공, 에러 0)

| 지표 | A (LLM 조립) | B (결정론) |
|---|---|---|
| 렌더 필드 변조 (L4 대비 first_frame/motion/duration) | **0 / 0 / 0** (split 없는 2셀 기준) | **0 / 0 / 0** |
| 소요 시간 | 103~219s | **43~60s (2~4배 빠름)** |
| hook_type·motif 채움 | 전 샷 채움 | 0 (미생성) |
| Step2 split | 0~4 (run 간 변동) | 0 |
| Step2 이슈 수 | 9~15 | 12~18 (continuity 카테고리 증가) |

- 렌더 소비 필드(v5→생성기로 가는 것): **양팔 완전 동일.** A의 LLM도 "그대로 사용" 지시를 지켰다 —
  즉 Step1의 산출 가치는 복사 정확도가 전부였고, 그건 코드가 무료로 한다.
- B에서 늘어난 Step2 이슈의 정체는 §3.

## 3. 스팟 체크 — B의 이슈 증가는 "메타 부재 트집" 아티팩트

- ad/B1의 CRITICAL 7건 전수 확인: **전부 continuity 카테고리이고, 전부 "carry_forward_from이 null이다 /
  consistent_elements가 비어 있다 / changes 배열이 비어 있다"는 지적** — 영상 산출물의 실질 결함이
  아니라, 결정론 조립이 채우지 않는 메타 필드의 부재 자체를 문제 삼은 것.
- Step1-only 메타(hook_type·motif_active·carry_forward_from·consistent_elements)의 소비처:
  **파이프라인 스테이지·타입 밖 전체 소스에서 0건** (grep 실측 — D1 감사의 hook/motif 0-소비처 판정을
  continuity 메타까지 확장 확인). 즉 A가 채우던 그 메타도 아무도 읽지 않는다.

## 4. 판정: **채택** — 동반 조치 포함 구현

사전 기준 충족: 렌더 소비 필드 손실 0 ✓ · "Step2 악화"는 실질 악화가 아니라 빈 메타 트집으로 규명 ✓.
단, 트집을 방치하면 passed=false가 남발돼 리포트 신뢰성이 죽으므로 Step2 보정을 동반한다.

구현 (`c_application_2.ts`):
1. Step1(LLM 조립) 프롬프트·호출·extractShots·실험 게이트 전부 제거 → `assembleShotsFromDesigns()`
   결정론 조립으로 대체 (기존 >24샷 skip 경로의 승격 — 새 로직 아님).
2. Step2 프롬프트 보정: "메타 부재는 이슈가 아니다" 명시 + 연속성 판단은 샷의 실제 프롬프트 내용
   대조로만 (검증 항목 3·4 재정의).
3. 죽은 배선 정리: 시그니처에서 narrativeStructure·visualIdentity·sceneCinematographyPlans·
   vAxisConfig 제거 (전부 Step1 전용이었음) — 호출부 2곳(steps.ts·index.ts) 갱신.
4. `reconcileAssembledShots` 삭제 (LLM 누락 복원이라는 존재 이유 소멸) — 단위 테스트를
   `assembleShotsFromDesigns`의 1:1 계약 가드로 재작성 (3/3 통과).
- hook_type·motif는 타입에서 optional 유지 (소비처가 생기면 그때 채움 주체를 다시 정한다 — 카드 그대로).

## 5. 최종판 확인 배터리 (Step1 제거 + Step2 보정 코드로 ad·ledger × 2 run) — 전 기준 통과 ✓

| 판정 포인트 | 기준 | 실측 |
|---|---|---|
| ① 메타 부재 트집 이슈 | 0건 | **0건 / 4 run** (carry_forward·consistent_elements·changes·"비어 있" 패턴 전수 검색) |
| ② 렌더 필드 보존 | 변조 0 | **ff/motion/dur = 0/0/0** (ad 12샷·ledger 16샷, L4 원본 결정론 대조) |
| ③ 소요 시간 | B 수준(~43~60s) | **30~43s** — 이슈 리포트가 짧아져 오히려 개선 |

- 이슈 수도 A/B의 9~18건 → **6~10건**으로 감소 (Step2 보정이 아티팩트 노이즈까지 제거).
- 남은 CRITICAL 1건(ad r2): "shot_9 char v2 → shot_10 v1 역행" — **아티팩트가 아니라 실질 지적**
  (L4 데이터의 실제 asset_version 역행). Step2가 보정 후에도 진짜 결함은 계속 잡는다는 검출력 증거.
  단 같은 입력의 r1에선 미검출 — Step2 run 간 편차는 §6 관찰 그대로.

## 6. 관찰·후속

- Step2(Claude 검증) 자체의 run 간 분산이 크다 (같은 입력에 이슈 9→15, CRITICAL 1→7 변동 관측).
  이슈 리포트는 현재 소비처가 passed 플래그뿐이라 실해는 없지만, 리포트를 UI에 노출하거나 재생성
  게이트로 쓸 계획이 생기면 Step2의 일관성(온도·기준 고정)부터 손봐야 한다 — 후속 항목.
- A팔에서 Step2가 split을 0~4회 발동해 샷 수·총 길이가 바뀌는 것을 관측 (ledger 16→20샷, 45→46.5s).
  split은 E3b 샷 상한 정책과 상호작용할 수 있다 — 대표 모드에서 split 상한 필요 여부는 관찰 대상.
