# Debate r1 — Claude 재반박

너의 인용을 전부 직접 검증했다: action_budget.ts의 `SHOT_DURATION=5` 하드코딩, fal.ts:262 `buildFalVideoInput`의 image_urls 일괄 처리, route.ts:239 black-screen 트릭, c_application_2.ts hook_type 10종, 가격($0.896~$2.42/8s), Sora 단종(web/app 2026-04-26, API 2026-09-24 — 웹 검색으로 확인). 모두 정확했다. 그 위에서 수용/방어를 가른다.

## 수용 (입장 수정)

1. **[주장 2] 거짓 강조의 단위를 salience-weighted duration으로 교체한다.** duration 단독 지표는 오탐이 많다는 반론 수용. duration-importance 검사를 `duration × salience(visual/motion/audio) ↔ narrative_weight` 정합 검사로 수정.
2. **[주장 3] "의도 없는 신호"를 "의도 없는 고현저성 신호"로 한정한다.** significance 없는 소품의 저현저성 강등 규칙("background, low contrast, out of focus, no readable markings")과 VLM 질문 교체("프롬프트와 일치하는가" → "무엇이 가장 눈에 띄는가, 그것이 의도된 viewer_focus와 같은가") 수용.
3. **[주장 5] free-text 장부 기각 수용.** question ID 장부(`open_question_ids`/`close_question_ids` + `salience_level` + `narrative_weight` + `payoff_deadline`)로 교체하고, "잔고=0"은 deadline 초과 검사로 대체한다. hook_type 10종(curiosity_gap~sensory_pull)을 장부의 질문 유형 분류로 재사용한다.
4. **[주장 6] 시간 산수의 주체를 LLM에서 validator로 이전.** 모델 capability(`duration_floor/ceiling`, `supports_end_frame`, `supports_multi_prompt`, `is_first_frame_locked`) 기반으로 허용 동작 수를 validator가 계산. 내 검증으로도 현 action_budget(5초 고정+동사 개수 휴리스틱)과 레지스트리(3~15/4~15/8고정)의 불일치 확인.
5. **[주장 7③] 전수 n-sample 기각 수용.** 위험 기반 게이트(high-salience/action/reveal/identity-critical만 n=2) + **first-frame QA 선행**(이미지 생성비는 영상비 대비 수십 배 저렴 — I2I 산출물을 VLM으로 먼저 거르고 통과분만 I2V) + 실패 시 재생성보다 trim/reorder/대체컷 우선.
6. **[주장 8] 신뢰 순위 업데이트 수용.** API-native 제어(end_image_url, multi_prompt, num_frames/fps)를 프롬프트 기법 위로 상향. Sora는 운영 후보에서 제외(검증 완료). black-screen 트릭은 최후수단으로 강등하고 기본 규약을 "action completes promptly, then holds still" + 에디터 트림으로.
7. **[놓친 축] 3개 모두 수용.** 정보의 채널 라우팅(영상 외 음성/자막), 컷 문법 adjacency validator, video capability registry.

## 방어 (기각 또는 조건부)

1. **[주장 2] salience 가중을 수용해도 duration은 여전히 생성 영상의 1차 체계적 왜곡이다.** 이유: salience 채널들(구도/대비/모션/사운드)은 샷 단위로 프롬프트·후처리 제어가 가능하지만, **duration floor는 모델 제약으로 전 샷에 무차별 강제**된다(8초 고정 Veo, clampDuration의 min). 즉 오탐을 줄이는 *지표*는 salience-weighted가 맞지만, *개입 우선순위*는 여전히 duration(trim-to-beat)이 먼저다. 지표와 개입 지점을 혼동하지 말 것.
2. **[주장 2 보강] 너의 salience 프레임만으로는 "길지만 부채 없는 breath/establishing 샷"을 설명 못 한다.** 그 샷들이 부채를 안 만드는 건 낮은 salience 때문만이 아니라 **관습(convention)이 관객 스키마에서 '쉼/전환'으로 분류**되기 때문이다. 장부에 salience와 별개로 `convention` 태그(montage, establishing, breath, transition 등)에 의한 면제 규칙이 필요하다. 반박하라: convention 면제 없이 salience만으로 충분한가?
3. **[주장 5 조건] payoff_deadline enum에 의도적 미회수 값이 없으면 원래 구멍이 재발한다.** `same_shot|same_scene|next_scene|act`만 있으면 LLM이 회수 못 한 질문을 조용히 `act`로 미루는 퇴행이 가능. **`intentional_carry`(시리즈 훅, 명시적 사유 필수)를 별도 값으로** 두고, validator는 `act` 초과+사유 없음을 실패 처리해야 한다.
4. **[주장 5 조건] question ID는 선언처(registry) 없이는 참조 무결성이 성립 안 한다.** 누가 ID를 발급하는가? 내 제안: Story 축(scenes 스테이지)이 씬별 서사 질문을 선언하고, decoupage가 샷별로 open/close를 참조, validator가 무결성·deadline 검사. 이러면 Story↔Visual 축의 자연스러운 다리가 된다. 더 나은 배치가 있으면 제시하라.
5. **[주장 7 보강 — 너의 발견을 더 밀고 간다]** fal.ts를 검증하니 너의 지적보다 격차가 크다: ① duration이 happy-horse 외엔 `'5'|'10'` 문자열로 강제 절사(fal.ts:274~277) — Kling 3~15, Seedance 4~15 범위가 사장됨, ② end_image_url/multi_prompt/negative prompt 어디에도 미노출, ③ **레지스트리 5개 모델 전부 reference-to-video 엔드포인트**(video-models.ts) — 진짜 first-frame lock(image-to-video) 엔드포인트가 하나도 없다. 그렇다면 **현 구현에서 "시작 프레임 조건화" 레버는 애초에 걸려 있지 않을 가능성**이 있다. 질문: fal 문서 기준으로, reference-to-video에서 `image_urls[0]`이 사실상 첫 프레임으로 동작하는 모델은 어느 것이고, 진짜 first-frame lock을 위해 image-to-video 엔드포인트로 갈아타야 하는 모델은 어느 것인가? 모델별로 답하라.

## 판별 기준 (평행선 쟁점 — 결정가능 실험)

- **salience 사전 계획 가능성**: LLM이 first_frame_prompt만 보고 salience_level을 예측 → 생성 프레임에 대한 VLM 판정과 일치율 측정(N=20). ≥80%면 계획 시 salience 배정 가능, 미만이면 사후 측정으로 전환. (주장 2의 지표 실효성 결정)
- **multi_prompt 위상 타이밍 제어력**: Kling O3에 2위상 프롬프트(예: wind-up→strike) 10회 생성, VLM으로 위상 경계 시점 분산 측정. 분산이 작으면 신뢰 순위 3위 유지, 크면 강등. (주장 8 순위 결정)
- **black-screen vs complete-then-hold**: 같은 샷 10개씩 A/B, 중간 암전·아티팩트 빈도 비교. (route.ts:239 유지/폐기 결정)

## 라운드 2 요청 (최종 라운드 — 구체 산출물로 답하라)

1. **video capability registry 스키마**: 필드 목록 + 5개 모델(happy-horse/seedance/kling-o3/veo/local)별 값을 fal 문서 기준으로 채운 표. 위 방어 5의 모델별 first-frame 질문 포함.
2. **question ledger의 스테이지 배치**: 선언/참조/검증의 주체 스테이지와 최소 lifecycle (방어 4에 대한 답 포함).
3. **컷 문법 validator 분리**: plan-time(텍스트 spec만으로 검사 가능) 항목 vs post-gen(VLM 필요) 항목 목록.
4. **우선순위**: 이 토론에서 나온 모든 장치 중, 효과/노력 비 기준 먼저 구현할 3개. "뇌 아픈 영상" 완화에 직접 기여하는 순서로.
