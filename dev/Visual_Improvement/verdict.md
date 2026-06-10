# Verdict — Tale-Studio Visual 축 재설계 토론

- 일시: 2026-06-10 / 참여: Claude Fable 5(입장·종합) ↔ Codex gpt-5.5 reasoning=high(적대적 검토), 2라운드
- 전체 기록: `~/Downloads/comms/transcript.md` (r0 입장 → 반박 → r1 재반박 → 산출물)
- 검증: Codex가 인용한 모든 file:line·가격·외부 사실(Sora 단종)을 Claude가 직접 확인. 본문 ✓ 표기 = 검증 완료.

## 1. 핵심 발견 — "시작 프레임 조건화" 레버는 현 구현에 존재하지 않는다

I2I→I2V 설계의 암묵 전제("first_frame_prompt로 만든 이미지가 영상의 첫 프레임이 된다")가 **모델별로 성립하지 않음**:

- 레지스트리 5개 모델 전부 `reference-to-video` 엔드포인트 (`src/lib/video-models.ts`) ✓
- 문서상 `image_urls[0]`을 첫 프레임으로 보장하는 모델 **없음** — happy-horse/veo는 subject appearance reference, seedance는 multimodal reference.
- 유일하게 **kling-o3만 `start_image_url`(first frame)/`end_image_url`(last frame)을 명시 지원**하는데, 코드가 안 씀: writer 경로 `buildFalVideoInput`(`src/lib/writer/llm/fal.ts:262`)과 director 경로 `submitFalReferenceToVideo`(`src/app/api/director/generate-video/route.ts:62`) 둘 다 `[refParam]: [imageUrl]` 단일 매핑 ✓
- 부수 발견: writer 경로는 duration을 happy-horse 외 `'5'|'10'` 문자열로 절사 ✓ (Kling 3~15·Seedance 4~15 범위 사장; director 경로는 `clampDuration` 정상) / local(`/hunyuan/i2v`)은 `{prompt, image_url}`만 전송, duration 미전달, 계약 미명시 ✓

→ **어떤 프롬프트 개선보다 입력 매핑 수정이 선행**되어야 함. 모션 위상·시작 포즈 논의는 이 매핑이 고쳐진 뒤에야 실제 레버가 된다.

## 2. 합의점 (양측 수렴)

**진단**
- 원인은 정보 총량이 아니라 부하 구조. 단일 이론(인지부하) 환원 대신 측정 가능한 비용으로 분해: `orientation_cost` / `identity_cost` / `salience_cost` / `motion_complexity` / `unresolved_question_count`.
- 거짓 강조의 단위는 duration이 아니라 **salience-weighted duration** (duration 단독 지표는 오탐 다수 — 긴 breath 샷은 무해, 0.5초 고대비 인서트는 강한 셋업).
- 단 **개입 우선순위는 여전히 duration이 1위**: salience 채널은 샷 단위 제어 가능하지만 duration floor는 모델 제약으로 전 샷 무차별 강제 → trim-to-beat 우선. (지표 ≠ 개입 지점)
- "의도 없는 신호"는 "의도 없는 **고현저성** 신호"로 한정. significance 없는 요소는 저현저성 강등 규칙("background, low contrast, out of focus, no readable markings")으로 처리.
- breath/establishing/montage/transition이 부채를 안 만드는 건 **관습(convention) 면제** — salience만으로 설명 불가, 장부에 convention 태그 필요.
- 정체성/연속성 부하는 별개 축. 생성 후 VLM/embedding identity check를 `continuity_validation`으로 두고, 실패는 story QA가 아닌 asset/reference 재생성으로 라우팅.

**해법 장치**
- **Question ID 장부** (free-text 기각): `open_question_ids`/`close_question_ids`(기존 ID만 참조), `viewer_focus_id`, `salience_level`, `narrative_weight(0~3)`, `payoff_deadline(same_shot|same_scene|next_scene|act)` + **`resolution_policy(close_by_deadline|intentional_carry)`**, carry는 `intentional_carry_reason` 필수. — intentional_carry를 deadline 값이 아닌 별도 policy로 분리해 "act로 미루기"와 "의도적 미회수"를 validator가 구분. 기존 `hook_type` 10종(`c_application_2.ts` ✓: curiosity_gap, incomplete_action, interrupted_dialogue, unexplained_detail, micro_incongruence, visual_bait, time_pressure, promise, pattern_break, sensory_pull)을 질문 유형 분류로 재사용.
- **장부 lifecycle**: ① S1/S3가 `StoryQuestionRegistry` 선언(서사 질문 ID 발급) → ② decoupage가 샷별 참조 + 순수 시각 질문은 `proposed_visual_questions`로 제출(예: "문틈 아래 피") → ③ validation 스테이지가 승인/ID·deadline 부여 → ④ l4(실행 스펙)는 새 질문 생성 금지, 참조만 → ⑤ debt validator가 deadline 초과·정책 위반·high-salience 미회수·low-weight 장시간 샷 검사.
- **시간 산수의 주체 이전**: LLM 산수가 아니라 validator가 모델 capability 기반으로 허용 동작 수 계산. 현 `action_budget.ts`의 `SHOT_DURATION=5` 고정+동사 개수 휴리스틱 ✓ 은 레지스트리(3~15/4~15/8고정)와 불일치 — 폐기 대상.
- **LLM↔생성기 격차** = "미명세를 두 prior가 다르게 채우는" 문제로 재정의. 관리 3축: 모호성 소스 제거(위상 분해 + 프레임 조건화) / 해 공간 구속(duration, 카메라 분리, negative) / 위험 기반 검증.
- **VLM QA**: 전수 n-sample 비현실적(8초 1샷 생성비 $0.90~$2.42 ✓) → high-salience/action/reveal/identity-critical 샷만 n=2, **first-frame QA 선행**(I2V 전에 I2I 산출물을 VLM으로 거름 — 질문은 "가장 눈에 띄는 것이 viewer_focus_id인가"), 실패 시 재생성보다 trim/reorder/대체컷.
- **시간 제어 신뢰 순위 (2026-06 모델 기준)**: ① clip duration/num_frames/fps + 에디터 trim ② start+end frame 조건화 ③ native multi-prompt/storyboard 스케줄링 ④ 시작 포즈 고정+위상 분해 ⑤ 속도 부사+"complete then hold" ⑥ negative/camera control ⑦ 프롬프트 내 수치 타임스탬프(최하위). Veo black-screen 트릭(`route.ts:239` ✓)은 최후수단으로 강등, 기본 규약은 "action completes promptly, then holds still"+trim.
- **놓친 축 3개 채택**: 정보의 채널 라우팅(일부 정보는 영상이 아닌 음성/자막으로 — 기존 `sound_motif_hints`/`silence_intentional` ✓ 연결), 컷 문법 adjacency validator(아래 분리표), video capability registry(아래 스키마).
- **Sora 2 운영 후보 제외**: web/app 2026-04-26 종료, API 2026-09-24 종료 예정 (웹 검증 ✓ — OpenAI Help Center, The Decoder).

**컷 문법 validator 분리 (Codex 산출물, 채택)**
- Plan-time(텍스트 spec만으로): 180도 축(`spatial_axis_180`), shot size progression 과밀, 동일 size/angle 연속 과다, establishing 없는 새 공간 CU, reveal 직후 reaction 부재, transition 호환성, screen direction 계획, salience-weighted duration↔narrative_weight 불일치, convention 면제, motion budget(카메라 큰 무브+큰 액션+환경 변화 동시 금지).
- Post-gen(VLM 필요): 첫 프레임↔viewer_focus 일치, 최고 현저 요소 = 의도 focus 여부, identity continuity, eyeline/screen direction 실측, action phase 달성, end-frame/hold 상태, 중간 암전/fade, 미등록 고현저성 디테일(새 질문 개방), 컷 간 motion discontinuity.

**Capability registry 스키마 (Codex 산출물, 채택)**: `VideoCapabilitySpec` — `mode(reference_to_video|image_to_video|local_i2v)`, `duration{kind, values, min/max, inputType}`, `frameControl{firstFrameLock: confirmed_first_frame|reference_only|ambiguous|local_unknown, firstFrameField, endFrame(+field), referenceImagesField, referenceImageRole}`, `promptControl{supportsMultiPrompt, supportsNegativePrompt, supportsSeed, supportsAudioToggle}`, `outputControl`, `routingAdvice`. 모델별 판정: happy-horse/seedance/veo=`reference_only`, kling-o3=`confirmed_first_frame`(start_image_url 사용 시), local=`local_unknown`(계약 명시 선행).

## 3. 입장 변경

**Claude가 수정**: duration×narrative_weight → salience 가중 정합 검사 / 잔고=0 → deadline+policy 검사 / free-text 질문 → ID 장부 / "의도 없는 신호" → 고현저성 한정 / 신뢰 순위에 API-native 제어 상향 / Sora 제외.
**Codex가 수용**: duration = 개입 우선순위 1위(지표/개입 구분) / convention 면제 필요성 / Story축 선언 기반 장부 구조(시각 질문 제안 경로 보강 조건부).

## 4. 잔여 쟁점 + 판별 기준 (전부 결정가능, 가치판단 쟁점 없음)

1. **salience 사전 계획 가능성** — LLM이 first_frame_prompt에서 salience_level 예측 vs 생성 프레임 VLM 판정 일치율 (N=20, ≥80%면 계획 시 배정, 미만이면 사후 측정 전환).
2. **Kling O3 multi_prompt 위상 타이밍 제어력** — 2위상 프롬프트(wind-up→strike) 10회 생성, 위상 경계 시점 분산 측정 → 신뢰 순위 3위 유지/강등 결정.
3. **black-screen vs complete-then-hold** — 동일 샷 10개씩 A/B, 중간 암전·아티팩트 빈도 → `route.ts:239` 유지/폐기 결정.

## 5. 권고 (효과/노력 비 순)

1. **Capability registry + 입력 매핑 수정** — kling-o3 `start_image_url`/`end_image_url` 사용, writer fal.ts duration 절사 제거, multi_prompt/negative 노출, local 계약 명시. 이거 없이는 "첫 프레임 고정"·"duration"·"multi_prompt"가 전부 가짜 레버.
2. **First-frame QA 게이트** — I2V 전 I2I 산출물 VLM 판정("가장 눈에 띄는 것이 viewer_focus인가"). 영상비가 비싸므로 여기서 거르는 게 비용 대비 최대.
3. **Question ledger + salience/convention validator** — 위 lifecycle + plan-time 컷 문법 검사. "왜 이 샷을 오래 보는가/이 디테일을 기억해야 하는가"를 직접 줄이는 장치.
- 2차: black-screen A/B, multi_prompt 타이밍 실험, post-gen full VLM QA, identity continuity check.

## 6. 사용자 원질문 3개의 최종 판정

- **Q1 (LLM의 시간 이해)**: **부분 가능** — 전형 지속시간 상식은 있으나 암묵 시뮬레이션 없음. 관객 상태·시간 예산을 외부 장부로 강제하고, 산수는 LLM이 아닌 validator가 모델 capability로 계산해야 신뢰 가능.
- **Q2 (LLM↔생성기 해석 격차)**: **관리 가능, 제거 불가** — 미명세 축소(프레임 조건화·위상 분해) + 해 공간 구속 + 위험 기반 검증. 단 **현 구현은 1차 레버(첫 프레임 고정)가 미연결 상태** — kling-o3 매핑 수정 시 "상당 부분 해결"로 상향.
- **Q3 (시간 명시 프롬프팅)**: **표현 형식에 따라 갈림** — 수치 타임스탬프는 비현실적(최하위), 상대/서수 표현("immediately", "complete then hold")은 부분 가능, 확실한 제어는 프롬프트 밖 구조(duration 파라미터, start+end frame, trim).
