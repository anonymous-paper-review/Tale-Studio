# 행동소-카메라 정합 (Action-Unit × Camera Alignment) 딥다이브

- 작성: 2026-06-11 / 출처: 사용자 가설 + Claude 검증 (Fable 5)
- 선행 문서: [verdict.md](./verdict.md) — 본 문서는 verdict §2에서 미정의로 남은 **`motion_complexity` 비용 항의 측정 가능한 정의**를 제공한다
- 표기: 본문에서 facet의 상태를 ✅(현재 코드 존재) / 🔶(verdict 제안) / 🆕(본 문서 제안)으로 구분

---

## 0. 요약

> **가설(원문)**: 인지 부하가 생기는 부분을 측정할 수 있을 것 같은데, 의도와 카메라의 움직임 or 방향이 align되는지인 것 같다. 빠른 액션씬이라도 카메라가 너무 빠르게 바뀌면 안 되고, 의도와 인물의 행동을 행동소(행동의 최소 unit)로 나누었을 때 같은 그룹이면 카메라가 천천히 움직여야 할 때도 있다.

**판정: 타당. 단 2가지 교정 후 측정 가능한 규칙이 된다.**

| 가설 성분 | 판정 | 교정 |
|---|---|---|
| (a) 부하의 측정 지점 = 의도↔카메라 정합 | 타당 | "의도"가 facet으로 외부화된 이 파이프라인에서만 직접 측정 가능 — 일반 영상에선 의도가 관측 불가 |
| (b) 빠른 액션 ≠ 빠른 카메라 | 타당 | 절대 속도 제한이 아니라 **벡터 결합** 문제 (추종하는 빠른 카메라는 무해) |
| (c) 같은 행동소 그룹 → 카메라 천천히 | 교정 필요 | "천천히"가 아니라 "**단위 경계에서만 상태 변화 + 단위 내 벡터 결합**". 천천히는 행동 그룹 자체가 느릴 때의 특수 사례 |

산출물: 정합 규칙 R1~R4 (§3), 스키마 매핑 + facet 제안 (§4), validator 설계 (§5), motion_complexity 운영 정의 (§6), 판별 실험 3개 (§7).

---

## 1. 이론적 기반 — 왜 타당한가

### 1.1 행동소는 실존하는 지각 단위다 (behavior unit)

Newtson(1973)의 breakpoint 실험: 연속 행동 영상을 보여주고 "의미 단위가 끝나는 지점"을 누르게 하면 **관찰자들끼리 유의미하게 일치된 지점**을 찍는다. 행동은 지각적으로 최소 단위로 분절되며 경계는 임의가 아니다. 사용자가 만든 용어 "행동소"는 이 behavior unit과 정확히 같은 개념이고, 음소/형태소 유추도 적절하다 (위계적 분절 — §3.1).

### 1.2 사건 분절 이론(EST): 경계 변화는 싸고, 중간 변화는 비싸다

Zacks의 Event Segmentation Theory: 뇌는 진행 중인 사건의 예측 모델(event model)을 유지하다가 **예측 오차가 튀는 지점 = 단위 경계에서만 모델을 갱신**한다. 갱신은 작업기억 flush를 동반하는 비용 이벤트다. 따라서:

- 카메라 상태 변화(컷, 무브 개시/종료, 방향 전환)가 **행동소 경계에 떨어지면** → 관객이 어차피 모델 갱신 중이라 변화가 묻어감 (저비용)
- **단위 한가운데 떨어지면** → 진행 중인 모델을 강제로 깨는 이중 갱신 (고비용)

이것이 가설 (c)의 지각적 근거다.

### 1.3 실증: edit blindness와 attentional synchrony

Smith & Henderson(2008): 연속 편집 규칙을 지킨 컷은 관객이 문자 그대로 **알아채지 못하는** 비율이 높다(edit blindness). Smith & Mital(2013): 잘 연출된 영상은 관객들의 시선이 한 점에 모인다(attentional synchrony) — 이해 가능성의 학계 표준 대리 지표. 할리우드 연속 편집은 100년에 걸쳐 행동소 경계를 경험적으로 찾아낸 체계다.

### 1.4 빠른 카메라 + 빠른 액션 = 모션 신호 경쟁

카메라 이동은 화면 전체에 optic flow를 만들고, 시각계는 이를 ego-motion(카메라)과 object motion(피사체)으로 분해해야 한다. 두 신호가 동시에 크면 분해 비용이 커지고, 컷까지 겹치면 flow field 연속성마저 끊긴다. Stork(2011)의 "chaos cinema" 비판이 정확히 이 현상 — 액션 속도 위에 장치 속도를 *겹쳐서* 판독 불능을 만드는 연출. 가설 (b)의 근거.

→ verdict의 plan-time 규칙 "motion budget: 카메라 큰 무브 + 큰 액션 + 환경 변화 동시 금지"는 이 원리의 특수 사례다. **본 가설이 그 규칙의 상위 원리.**

### 1.5 모티베이티드 카메라: 무동기 무브는 거짓 신호

카메라 무브는 발화(communicative act)다 — 관련성 원리에 따라 관객은 무브를 "여길 봐라 / 뭔가 변한다"로 읽는다. 의도와 정합하지 않는 무브는 **미등록 질문을 여는 거짓 신호**가 되어 verdict §2의 부채 장부와 직결된다. 중요: 이 독트린은 이미 코드에 절반 들어와 있다 — `DecoupageShot.camera_intent: 'static' | 'motivated_move'` + `camera_move_motivation`(motivated_move일 때 필수) ✅. 본 문서는 이를 "동기가 *있는가*"에서 "동기가 *행동소·의도와 정합하는가*"로 확장한다.

### 1.6 반례 처리 — 반례가 아니라 확증

- **whip-pan**: 카메라가 매우 빠르지만 부하가 낮다 — 던진 물체의 행동 벡터를 **추종**하기 때문. 변수는 속도가 아니라 결합이라는 증거.
- **본 시리즈류 셰이키캠**: 의도 자체가 "혼란"이면 빠른 카메라가 정합이다. 부하를 만드는 건 카메라 속도가 아니라 **의도-카메라 불일치**라는 상위 명제의 확증. (단 validator 면제를 위해 intent 태그가 명시돼야 함 — §3.4)
- **match-on-action**: 모션 한가운데서 자르는데 가장 안 들키는 컷인 이유 — 컷이 **같은 행동소를 새 앵글에서 계속**하기 때문. 단위가 컷을 관통해 지속되니 모델 flush가 없고 모션이 transient를 가린다. 금지되는 것은 "모션 중의 변화"가 아니라 **"단위를 버리는 변화"**다 (§3.3 R4).
- **임팩트 직후 리액션 컷어웨이**: 임팩트는 contact→outcome의 미세 경계 — 더 fine한 granularity에서 보면 역시 경계 컷. EST의 위계적 분절(coarse ⊃ fine)이 흡수.

---

## 2. 핵심 통찰: 이 파이프라인에서만 "측정"이 성립하는 이유

일반 영상에서 "의도"는 관측 불가능한 잠재 변수다. Tale-Studio는 의도가 **facet으로 선언**되어 있다:

- 의도: `ShotIntent.audience_focus` ✅, `ShotIntent.dramatic_purpose` ✅, `ShotStaticSpec.framing.focal_point` ✅, `DecoupageShot.camera_move_motivation` ✅
- 행동: `scene_actions`(비트) + `DecoupageShot.source_beats`(샷↔비트 매핑) ✅, `ShotDynamicSpec.character_motion[] {verb, magnitude}` ✅
- 카메라: `ShotDynamicSpec.camera_motion {type, direction?, speed, magnitude}` ✅

**정합 검사에 필요한 양변(의도·행동 ↔ 카메라)이 이미 같은 명세 안에 분리 기재되어 있다.** 빠진 것은 둘을 잇는 관계 필드(그룹핑, 결합)뿐이다 — §4.

---

## 3. 형식화 — 정합 규칙 R1~R4

### 3.1 정의

- **행동소(action unit)**: 행동의 최소 의미 단위. 위계적:
  - 굵은 단위 = 스토리 비트 (`scene_actions[i]` ✅)
  - 샷 내 단위 = 모션 동사 (`character_motion[].verb` ✅)
  - 미세 단위 = 위상 (wind-up / contact / follow-through 🔶 — verdict Q3 시간 제어와 같은 구조 공유)
- **행동소 그룹(unit group)**: 같은 의도/사건에 속하는 연속 행동소들 (예: "칼을 뽑는다→겨눈다→내리친다" = 공격 그룹 1개, 그 안에 단위 3개)
- **카메라 상태(camera state)**: `camera_motion`의 (type, direction, speed) 튜플. **상태 변화** = 컷, 무브 개시/종료, 방향 전환, type 변경. (컷 없는 롱테이크 내 재조준도 상태 변화 — 컷 기준이 아니라 상태 기준이므로 plan-séquence도 같은 규칙으로 다룸)

### 3.2 규칙

- **R1 (경계 규칙)**: 행동소 그룹당 카메라 상태 1개. 상태 변화는 그룹 경계에서만 허용.
- **R2 (벡터 규칙)**: 단위 내 카메라 벡터 ∈ { 행동 벡터 **추종**(track/follow), **정지**(hold), intent 태그 있는 **reveal** }. 행동 벡터와 직교/역행(counter)하는 무브는 intent 태그 필수.
- **R3 (크기 규칙)**: `camera_motion.magnitude` ≤ f(`character_motion.magnitude`) — 피사체를 프레임에 유지하는 데 필요한 만큼만. 초과분은 unmotivated 플래그 (camera_move_motivation으로 정당화 필요).
- **R4 (인접 샷 규칙)**: 진행 중인 행동소 그룹을 컷이 가로지를 때, 다음 샷이 같은 그룹을 계속하면(match-on-action) 적법. 그룹을 중간에 버리고 다른 피사체/행동으로 점프하면 "단위 버림" 위반. (`transition_in/out: 'match_cut'` ✅ + `continuity.carry_forward_from` ✅ 와 연결)

### 3.3 magnitude 매핑 기준점 (R3의 f)

| character_motion.magnitude | 허용 camera_motion.magnitude (무태그 시) |
|---|---|
| micro / small | minimal |
| medium | minimal ~ moderate |
| large | moderate ~ large — 단 **추종(R2) 조건 하에서만** large 허용 |

(역방향 주의: 행동이 micro인데 카메라가 large면 카메라가 *주인공*이 되는 것 — reveal/dread 같은 intent 태그가 정확히 이 경우를 위한 면제)

### 3.4 면제 체계 (verdict convention 면제와 동일 구조)

- **intent 태그** 🆕: `disorientation`(혼란 의도), `dread`(불안 조성 드리프트), `reveal`(정보 공개 무브), `pov_unstable`(주관적 시점) — 태그가 있으면 R2/R3 면제, 단 부채 장부에 해당 의도가 질문으로 등록되어야 함 (거짓 신호 방지의 일관성)
- **convention 태그** 🔶: montage, breath, establishing, transition — R1 완화 (몽타주는 단위 밀도 자체가 높은 관습)

---

## 4. 현 스키마 매핑과 제안 facet

### 4.1 있는 것 / 빠진 것

| 개념 | 현재 facet | 상태 |
|---|---|---|
| 의도(관객 시선) | `ShotIntent.audience_focus`, `framing.focal_point` | ✅ (단 free-text — verdict의 `viewer_focus_id` 🔶로 ID화 예정) |
| 카메라 동기 | `DecoupageShot.camera_intent` + `camera_move_motivation` | ✅ 모티베이티드 독트린 절반 구현 |
| 굵은 행동소 | `scene_actions` + `source_beats` | ✅ |
| 샷 내 행동소 | `character_motion[].verb + magnitude` | ✅ 단위 목록은 있으나 **그룹핑 없음** |
| 카메라 상태 | `camera_motion {type, direction?, speed, magnitude}` | ✅ 상태는 있으나 **행동과의 결합 관계 없음** |
| 위상 분해 | — | 🔶 verdict Q3 (wind-up/contact/follow-through) |
| 단위 관통 컷 표시 | `transition_in/out: 'match_cut'` | ✅ 존재하나 어떤 단위를 관통하는지 미명세 |

### 4.2 제안 — A안 (보수: 필드 추가만, 권장 선행)

```ts
// ShotDynamicSpec.camera_motion에 추가
coupling: 'track_subject' | 'hold' | 'reveal' | 'counter';  // 🆕 R2의 1급 표현
coupled_to?: string;          // character_id — track_subject일 때 필수
intent_tag?: 'disorientation' | 'dread' | 'reveal' | 'pov_unstable';  // 🆕 면제 태그

// ShotDynamicSpec.character_motion[] 각 항목에 추가
unit_group: string;           // 🆕 행동소 그룹 id (예: "g1_attack"). 같은 그룹 = R1 적용 범위
```

A안만으로 R1~R3의 plan-time 검사가 전부 가능해진다 (validator가 그룹 수 vs 카메라 상태 수, coupling vs 무태그 counter, magnitude 매핑을 기호적으로 대조).

### 4.3 제안 — B안 (적극: 구조 개편, E1/E2 실험 통과 후)

```ts
// character_motion + camera_motion을 단위 중심으로 재구조화
motion_units: Array<{
  group_id: string;
  actors: Array<{ character_id: string; verb: string; magnitude: ... }>;
  phase?: 'wind_up' | 'contact' | 'follow_through';   // 🔶 verdict Q3와 공유
  camera_state: { type, direction?, speed, magnitude, coupling };  // 단위에 종속된 카메라
}>;
```

B안은 "카메라가 단위에 종속된다"를 타입 수준에서 강제 — LLM이 구조적으로 R1을 위반할 수 없게 됨. 단 모든 스테이지·프롬프트·DB 영향이 커서 실험 근거 확보 후 진행.

---

## 5. Validator 설계

### 5.1 Plan-time (LLM 출력 직후, 기호 검사 — 비용 0)

| ID | 검사 | 입력 | 실패 처리 |
|---|---|---|---|
| V1 | 샷 내 `unit_group` 수 vs 카메라 상태 수 — 그룹 1개인데 상태 변화 명세 발견 시 위반 | dynamic_spec | warn → 재작성 지시 |
| V2 | `coupling === 'counter'` && `!intent_tag` | dynamic_spec | **fail** (거짓 신호) |
| V3 | magnitude 매핑(§3.3) 초과 && `!camera_move_motivation` | dynamic_spec + decoupage | warn |
| V4 | 인접 샷: 그룹이 샷 경계를 가로지르는데 다음 샷의 첫 그룹이 동일 그룹이 아니고 `transition !== 'match_cut'` | shot_sequence | warn ("단위 버림") |

- 위치: verdict 권고 3번(question ledger + salience/convention validator)에 **동승** — 같은 plan-time 검사층, 추가 비용 없음. 기존 `pipeline/validators/` 패턴 준수.
- 운영 원칙: V2 외에는 **warn 운영** (hard-fail 금지) — 적법한 스타일(의도된 불안정성, 복합 롱테이크)을 막는 과잉 제약 방지. validator는 플래그만 남기고, 재생성 결정은 상위 정책/사용자 몫 (async-generation rule의 "자율 재생성 루프 금지"와 일관).

### 5.2 Post-gen (위험 기반 게이트 내, verdict의 first-frame QA와 같은 층)

1차 — **VLM 근사 (저비용)**: 생성 영상에 3개 질문
- "카메라가 피사체를 따라가는가, 독립적으로 움직이는가?" (R2 실측)
- "행동이 진행되는 도중 카메라가 갑자기 바뀌는 순간이 있는가?" (R1 실측)
- "가장 눈에 띄는 것이 {audience_focus}인가?" (의도 정합 — verdict first-frame QA의 영상판)

2차 — **optical flow 정밀 측정** (인프라 필요 시점에):
- global(카메라) vs local(피사체) 모션 에너지 비율
- 두 벡터의 방향 일치도 (coupling 실측)
- 카메라 상태 변화 시점 vs 검출된 행동 경계 시점의 정렬률
- ⚠️ Vercel 서버리스에서 CV 연산 불가 → 외부 잡(fal/replicate flow 모델) 또는 로컬 처리. **계획 준수율(E3) 측정 전에는 투자 보류** — 생성기가 계획된 camera_motion 자체를 무시한다면 정밀 측정이 무의미하고, 그 선행 조건이 verdict §1의 입력 매핑 수정이다.

---

## 6. motion_complexity의 운영적 정의 (verdict §2 미정의 항 해소)

```
alignment_score(shot) =
    w1 · R1_violations          // 그룹 내 카메라 상태 변화 수
  + w2 · R2_untagged_counter    // 무태그 직교/역행 무브 (이진)
  + w3 · R3_excess              // magnitude 초과 단계 수
  + w4 · (1 − boundary_alignment_rate)   // post-gen: 상태 변화↔행동 경계 정렬률
  + w5 · (1 − vector_coherence)          // post-gen: 카메라↔피사체 벡터 일치도

motion_complexity(shot) = alignment_score   // 초기 가중치 w1=w2=2, w3=w4=w5=1 (E1에서 보정)
```

plan-time 항(w1~w3)만으로도 즉시 운영 가능, post-gen 항(w4~w5)은 게이트 도입 시 합류.

---

## 7. 판별 실험 — 가설 자체와 전제의 검증

| ID | 실험 | 방법 | 결정하는 것 |
|---|---|---|---|
| E1 | **정합↔이해도 상관** | 정렬 위반 점수가 차등인 시퀀스 N개(같은 스토리, camera 명세만 조작) 생성 → 1회 시청 후 "방금 무슨 일이 일어났나" 서술 정확도(VLM 채점 또는 직접 평가) → 위반 상/하위 그룹 간 이해도 차이 | **가설 본체.** 유의미한 차이 없으면 alignment_score를 부하 대리 지표로 쓰는 것 기각 |
| E2 | **LLM 행동소 분절 신뢰성** | 같은 scene_actions 텍스트를 LLM에 5회 분절시켜 그룹 경계 자기일치도 + 인간(사용자) 분절과의 일치도 측정 — Newtson 패러다임의 LLM 버전 | unit_group을 LLM이 채울 수 있는가 (A안 전제). 불일치 크면 분절 규칙을 few-shot 예시로 고정하거나 비트 단위(굵은 granularity)로 후퇴 |
| E3 | **생성기 준수율** | 계획된 camera_motion(type/direction/speed)을 산출물이 지키는 비율 — VLM 판정, 모델별 | post-gen 측정 투자 여부 + 모델별 camera 지시 신뢰도. **verdict §1 입력 매핑 수정 후에 실행** (수정 전 측정은 매핑 손실과 모델 능력을 구분 못 함) |

실행 순서: E2 (LLM만, 비용 최소) → E1 (생성 포함, 소규모 N) → E3 (매핑 수정 후).

---

## 8. 우선순위 통합 (verdict §5에 끼워넣기)

| verdict 권고 | 본 문서의 합류 지점 |
|---|---|
| 1. capability registry + 입력 매핑 수정 | (선행 조건 그대로) E3와 post-gen 측정의 전제 |
| 2. first-frame QA 게이트 | post-gen VLM 3질문(§5.2)을 같은 게이트에 추가 — 비용 증가 미미 |
| 3. question ledger + salience/convention validator | **R1~R4 plan-time validator(§5.1) 동승 + A안 facet(§4.2) 추가** — 본 문서의 주 기여 |
| 2차 | optical flow 정밀 측정, B안 구조 개편 |

## 9. 한계

1. **LLM 분절 신뢰성 미검증** — Newtson은 인간 관찰자의 일치를 보였을 뿐. E2가 선행해야 A안이 선다.
2. **생성기가 계획을 무시할 수 있음** — 정합 검사는 *계획*을 통제한다. 산출물 통제는 post-gen 층 + 매핑 수정의 몫.
3. **과잉 제약 위험** — R 규칙의 hard-fail 운영은 적법한 스타일을 차단. V2(거짓 신호)만 fail, 나머지 warn.
4. **가중치 임의성** — §6의 w는 초기값일 뿐, E1 상관 데이터로 보정 전까지 서수적 비교(샷 간 상대 순위)에만 사용.

## 10. 참고 문헌 (포인터)

- Newtson, D. (1973). Attribution and the unit of perception of ongoing behavior. *JPSP*.
- Zacks, J. & Swallow, K. (2007). Event segmentation. *Current Directions in Psychological Science*.
- Smith, T. & Henderson, J. (2008). Edit blindness. *Journal of Eye Movement Research*.
- Smith, T. & Mital, P. (2013). Attentional synchrony in dynamic scenes. *Journal of Vision*.
- Stork, M. (2011). Chaos Cinema (video essay).
- Bordwell, D. (2002). Intensified continuity. *Film Quarterly*.
