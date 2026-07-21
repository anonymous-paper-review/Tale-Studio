# writer 단계 길이 양극화 실험 — 설계 & 입력

> 목적: **영상 길이(runtime·depth)가 writer 산출을 어떻게 바꾸는지** 실측한다. 극단적 짧음(숏폼/광고) vs 극단적 긺(장편)에서 구조·씬 분해가 어떻게 갈리는지, 짧은 건 과설계되고 긴 건 붕괴하는지 본다.
> 방법: 실 stage 함수(`runNarrativeStructure`/`runScenes`)를 gemini-3-flash로 **직접** 호출 → **시스템 프롬프트는 코드와 100% 동일**(함수 안에서 조립되므로 재구현 없음). 프롬프트·결과·latency를 `logs/writer-stage-exp/`에 저장.
> 하네스: `tests/pipeline/writer_stage_experiment.test.ts`

---

## 1. 길이 노브 — 무엇을 양극화하나

입력 `genre`의 세 필드가 길이를 지배하고, 각각 프롬프트에 실제로 박힌다:

| 노브 | 값 | 프롬프트 반영 지점 |
|---|---|---|
| `runtime_seconds` | 15 ~ 6000초 | scenes system: `총합 ≈ ${runtime_seconds}초` (씬 길이 합 타깃) |
| `depth_level` | D1 ~ D7 | narrativeStructure: `깊이 레벨 ${depth} 권장` + D1~D7 가이드 / scenes: `${sceneCountHint} 권장` |
| `format` | 9:16 / 16:9 / 2.39:1 | 하류(v0 비주얼)·화면비. 구조엔 간접 |

**depth → 권장 씬 수 매핑** (scenes 코드 `sceneCountHintMap`):

| depth | 권장 씬 수 | 성격(narrativeStructure 가이드) |
|---|---|---|
| D1 | 1개 씬 | 구조 없음 — 한 순간/한 비트 |
| D2 | 1~2개 씬 | 미니 구조(setup→action→result) |
| D3 | 3~5개 씬 | 단순 3-act, 서브플롯 0 |
| D4 | 5~10개 씬 | 표준 + 가벼운 서브플롯 1개 |
| D5 | 10~20개 씬 | 표준 + 서브플롯 1~2 |
| D6 | 20~30개 씬 | 다층 + 서브플롯 2~3 |
| D7 | 30개+ 씬 | 다층 + 서브플롯 다수 + 에피소드 연속성 |

---

## 2. 입력 프리셋 (실 DB 입력 포맷·톤 모방)

DB `writer_runs.state.input` 실 사례(사이버펑크 조선 액션·외계인 직장인 등)의 포맷 그대로: `story`(자유 텍스트 premise) + `genre` + `cast` + `background{locations}`. 세 개를 길이 스펙트럼 양끝+중간에 배치.

### 2a. `shorts` — 극단적 짧음 (숏폼 훅)
- **genre**: `runtime 15s · D1 · vertical_9:16`, genre=advertisement/product_hook, tone=[energetic, punchy]
- **story**: "지하철에서 꾸벅꾸벅 조는 직장인. 이어폰 광고 한 줄에 눈이 번쩍 뜨이고, 파랗게 빛나는 에너지드링크 캔이 화면을 채운다. 자리를 박차고 닫히는 문틈으로 뛰어나간다."
- **cast**: 1 (직장인) · **world**: 1 (지하철 객실)
- **의도**: "구조랄 게 없어야 하는" 최소 길이. narrativeStructure가 이걸 **여전히 3막으로 과설계하는지**, scenes가 1씬으로 떨어지는지 확인.

### 2b. `ad` — 짧은 광고 (브랜드 필름)
- **genre**: `runtime 30s · D2 · vertical_9:16`, genre=advertisement/brand_film, tone=[inspiring, cinematic]
- **story**: "새 러닝화를 신은 러너가 새벽 도시를 가른다. 숨이 차오르는 순간 밑창이 빛나며 한 발 더 밀어주고, 골목을 빠져나오자 강변에 해가 뜬다. 결승선 대신 그 빛을 향해 달린다."
- **cast**: 1 (러너) · **world**: 2 (새벽 골목 / 강변)
- **의도**: 최소보다 한 단계 위(미니 구조). D2에서 proportion이 표준 25/50/25를 벗어나는지(DB 감사에서 비표준이 전부 D2였음 — 재현되는지).

### 2c. `feature` — 극단적 긺 (장편 서사극)
- **genre**: `runtime 6000s(100분) · D7 · cinema_2.39:1`, genre=drama/epic_family_saga, tone=[melancholic, tense, elegiac]
- **story**: "몰락한 항구 도시, 삼대에 걸친 어부 가문이 바다·자본·서로를 상대로 싸운다. 노선장 할아버지는 사라진 큰아들의 배를 기다리고, 둘째는 개발업자와 손잡고, 손녀는 삼십 년 전 형제를 갈라놓은 살인의 흔적을 장부에서 발견한다. 폭풍의 밤 낡은 등대에서 셋이 마주치고 진실이 파도처럼 밀려든다…"
- **cast**: 6 (할아버지/둘째/손녀/개발업자/사라진 큰아들/항만관리인) · **world**: 5 (부두/등대/저택/사무실/어시장)
- **의도**: depth 최대치. narrativeStructure가 서브플롯·다층 구조를 실제로 뽑는지, scenes가 30개+ 씬을 6000초에 분배하는지, **아니면 여전히 3막·소수 씬으로 뭉개지는지**(붕괴) 확인.

---

## 3. 실행법

```bash
# 기본: shorts 입력으로 구조+씬을 gemini-3-flash로
RUN_WRITER_STAGE=1 WRITER_INPUT=shorts WRITER_STAGES=narrativeStructure,scenes \
  npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept

# 장편
RUN_WRITER_STAGE=1 WRITER_INPUT=feature WRITER_STAGES=narrativeStructure,scenes \
  npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept

# 모델 교차(예: Sonnet과 비교) — 시스템 프롬프트는 동일, 모델만 교체
RUN_WRITER_STAGE=1 WRITER_INPUT=feature WRITER_PROVIDER=claude WRITER_MODEL=claude-sonnet-4-6 \
  WRITER_STAGES=narrativeStructure,scenes npx vitest run tests/pipeline/writer_stage_experiment.test.ts --disable-console-intercept
```

- 결과: `logs/writer-stage-exp/<input>__<stage>.json` — `{ systemInstruction, prompt, response, result, duration_ms }` 저장(프롬프트·산출 원문 그대로).
- 콘솔: 단계별 요약(`structure=… acts=… props=[…]`, `scenes=… total=…s`).
- 게이트: `RUN_WRITER_STAGE=1` + `GEMINI_API_KEY`(claude 교차 시 `ANTHROPIC_API_KEY`) 없으면 skip.

---

## 4. 관찰 포인트 (가설)

- **narrativeStructure**: 짧은 입력(D1/D2)도 3-act·3막을 강제하나? act 수·proportion이 depth 따라 실제로 변하나? 장편(D7)에서 서브플롯/다층이 나오나?
- **scenes**: 씬 수가 `sceneCountHint`(1개 → 30개+)를 실제로 따르나? `total_estimated_seconds`가 `runtime_seconds`에 근접하나? 장편에서 30+ 씬을 뽑나 아니면 소수로 뭉개나?
- **모델 교차**: 같은 프롬프트로 gemini vs Sonnet 산출 차이(특히 장편에서 구조 다양성).

## 5. 첫 관찰 (2026-07-21, gemini-3-flash)

- `shorts`(15s · D1) → **structure=3-act, acts=3, props=`[0.2/0.3/0.5]`** (8.3s).
  → **15초짜리에도 3막 3개.** D1 가이드가 "구조 없음"인데도 모델은 3-act로 과설계. DB 감사(전 run 3-act 100%)와 일관 — 구조 유형 다양성이 길이 극단에서도 안 열린다는 방증.

## 6. 확장 (더 깊은 단계)

`STAGE_FNS` 레지스트리에 stage를 추가하면 된다. 단 `sceneCinematography`·`decoupage`·`shotDesign`은 `visualIdentity`(v0)·`worldVisual`·`characterVisual`(v2) 선행 산출이 필요하므로, 그 stage들을 먼저 레지스트리에 넣어 체인을 잇거나 최소 stub을 제공해야 한다. 길이 실험의 핵심(구조·씬 분해)은 위 두 단계에서 대부분 드러난다.
