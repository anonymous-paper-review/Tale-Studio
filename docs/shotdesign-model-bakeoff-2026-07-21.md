# shotDesign 모델 벤치오프 — Gemini flash vs Claude Sonnet

> 생성 2026-07-21 02:53 · 실 run `2beb605c-3892-4fc2-b493-b76b5b071286`의 shotDesign 프롬프트 재실행 (022).
> 계기: 실 Gemini 동시 4콜 = 콜당 latency 2.25x 팽창 → 병렬화 speedup 1.06x 소멸. 대안 = 콜당 빠르거나 좋은 모델.
> temperature 0.6(thinking 변형은 기본 1), Claude max_tokens 20000. 속도는 프롬프트 1개 표본(지표용).

## 1. 속도 & 산출 신뢰성

| 모델 | 평균 latency | 022 | 출력자수 | thinking자수 | ~tok/s | JSON | 샷수 |
|---|---:|---:|---:|---:|---:|:--:|---:|
| **Gemini 3 Flash** `gemini-3-flash-preview` | 21.6s | 21.6s | 12421 | — | 144 | ✅ | 4 |
| **Sonnet 4.6** `claude-sonnet-4-6` | 91.8s | 91.8s | 14293 | — | 39 | ✅ | 4 |
| **Sonnet 4.6 +thinking** `claude-sonnet-4-6` | 113.7s | 113.7s | 15368 | 441 | 34 | ✅ | 4 |
| **Sonnet 5** `claude-sonnet-5` | 0.5s | 0.5s❌ | 0 | — | 0 | ⚠️ | 0 |
| **Sonnet 5 +adaptive** `claude-sonnet-5` | 105.5s | 105.5s | 10417 | — | 25 | ✅ | 4 |

**에러:**
- Sonnet 5 · 022: `400 {"type":"error","error":{"type":"invalid_request_error","message":"`temperature` is deprecated for this model."},"request_id":"req_011CdESmREeB8eapWVpfsRKB"}`

**속도 순위**: 1) Gemini 3 Flash 21.6s · 2) Sonnet 4.6 91.8s · 3) Sonnet 5 +adaptive 105.5s · 4) Sonnet 4.6 +thinking 113.7s

→ **Gemini flash가 여전히 최속.** Sonnet 교체는 속도가 아니라 품질 근거로만 정당화됨.

## 2. 품질 — 동일 프롬프트 샷 산문 원문 (육안 판정용)

### 프롬프트 `022`

#### shot 1

**dramatic_purpose**

- **Gemini 3 Flash**: The 'medicine' is presented as a physical manifestation of the doctor's refusal to believe.
- **Sonnet 4.6**: 처방전 봉투가 의사의 불신을 물리적으로 구현하는 오브제로 제시됨. 관객은 이 봉투가 해결책이 아닌 묵살의 증거임을 안다.
- **Sonnet 4.6 +thinking**: 하얀 처방전 봉투가 책상 위에서 건네지는 순간, 의사의 불신이 물리적 사물로 구체화된다. 관객은 이 봉투가 해결책이 아닌 거부의 상징임을 안다.
- **Sonnet 5**: _(없음/파싱실패)_
- **Sonnet 5 +adaptive**: 처방전 봉투를 의사의 불신이 물리적으로 형상화된 사물로 제시한다

**first_frame_prompt**

- **Gemini 3 Flash**: A close-up shot on a seamless, floating white minimalist desk. A hand in an ultra-white medical lab coat sleeve slides a plain white prescription envelope across the surface. The lighting is hard and clinical at 7000K, casting sharp shadows. In the background, the charcoal grey sleeve of the protagonist's suit is visible. The palette is dominated by sterile whites and deep blacks.
- **Sonnet 4.6**: Extreme close-up of a pristine white prescription envelope resting on a seamless, cold white minimalist desk. A doctor's hand in an ultra-white lab coat sleeve enters frame from the upper right, fingertips just releasing the envelope. The envelope sits center-frame under harsh, shadowless overhead illumination at 6500K, creating a near-overexposed white surface with sharp angular shadows at its edges. The desk surface reflects a faint steel-blue sheen. Background is shallow-focus blurred wall angles suggesting impossible geometry. Cyberpunk-noir aesthetic: clean lines, angular shadows, photorealistic texture. Palette: cold white, #4682B4 shadow tones, #0B0D0F deep void at frame edges.
- **Sonnet 4.6 +thinking**: Extreme close-up, 85mm, slightly high angle. A pristine white prescription envelope rests on the flawlessly glossy surface of a floating white minimalist desk. The envelope is centered in frame, its sharp angular corners catching cold 6500K overhead light. Only the doctor's left hand is visible at the right third — fingertips in ultra-white lab coat cuff gently releasing the envelope's edge, a gesture of clinical finality. The background dissolves into soft bokeh of white lab coat fabric. Hard top lighting at 8:1 ratio creates a razor-thin shadow beneath the envelope, making it appear to hover. Color palette: cold steel-white, #4682B4 blue tint on the envelope's surface highlight, #0B0D0F absolute black in shadow recesses. Photorealistic, cyberpunk-noir, angular composition, no warmth, no human empathy encoded in the frame.
- **Sonnet 5**: _(없음/파싱실패)_
- **Sonnet 5 +adaptive**: 차갑고 미니멀한 진료실, 매끄러운 백색 데스크 위로 이 의사의 손이 하얀 처방전 봉투를 내밀고 있다. 봉투 표면에는 붉은 처방 도장이 선명하다. 주인공의 떨리는 손이 화면 왼쪽에서 조심스럽게 다가와 봉투 끝을 잡으려 한다. 배경은 얕은 심도로 흐릿하게 처리된 곡선형 환자 의자와 데스크 모서리이며, 천장에서 쏟아지는 그림자 없는 조명과 바닥의 숨겨진 LED 스트립이 차가운 스틸블루 톤을 만들어낸다. 전체적으로 스릴러적 긴장감과 임상적 냉기가 감도는 장면.

**motion_prompt**

- **Gemini 3 Flash**: A hand in a white lab coat slowly slides a white envelope across a smooth desk.
- **Sonnet 4.6**: 의사의 손이 흰 봉투를 차가운 데스크 위에 내려놓는다. 카메라 고정.
- **Sonnet 4.6 +thinking**: 의사의 손가락이 처방전 봉투를 데스크 위에 천천히 밀어 놓고 손을 거둔다. 카메라 고정.
- **Sonnet 5**: _(없음/파싱실패)_
- **Sonnet 5 +adaptive**: 떨리는 손끝이 다가와 하얀 처방전 봉투 끝을 조심스럽게 붙잡으며 미세한 떨림을 드러낸다

#### shot 2

**dramatic_purpose**

- **Gemini 3 Flash**: Shows repressed anger and the weight of the unwanted 'solution'.
- **Sonnet 4.6**: 주인공의 억눌린 분노와 무력감이 손의 미세한 긴장으로 폭발 직전 상태를 암시. 원치 않는 해결책의 무게를 신체가 흡수하는 순간.
- **Sonnet 4.6 +thinking**: 주인공의 손이 봉투를 쥐는 순간, 억눌린 분노와 절망의 무게가 물리적 압력으로 표출된다. 극단적 클로즈업이 감정을 언어 없이 폭발시킨다.
- **Sonnet 5**: _(없음/파싱실패)_
- **Sonnet 5 +adaptive**: 억눌린 분노와 원치 않는 해결책의 무게를 손의 미세한 움직임으로 드러낸다

**first_frame_prompt**

- **Gemini 3 Flash**: An extreme close-up of a trembling hand in a charcoal grey suit sleeve. The fingers are tightly gripping a white paper envelope, causing the paper to crinkle and deform. The knuckles are white from the pressure. The lighting is harsh, 8:1 ratio, emphasizing the texture of the paper and the tension in the hand. The background is a blurred, cold steel blue.
- **Sonnet 4.6**: Extreme close-up of a man's hand in a slim charcoal grey suit sleeve gripping a white prescription envelope. The fingers press into the envelope's edge, causing a slight crumple at the corner — knuckles taut, skin pale under cold 6500K overhead lighting. The envelope's white surface catches harsh top-left key light, casting sharp micro-shadows in the paper's new creases. Background is completely blurred into a cold blue-white wash. The hand occupies the full frame, conveying suppressed rage through physical tension alone. Photorealistic texture: fabric weave of the suit sleeve, skin grain on knuckles, paper fiber stress lines. Palette: #4682B4 shadow fill, #0B0D0F at frame periphery, overexposed white at envelope center.
- **Sonnet 4.6 +thinking**: Extreme close-up, 85mm, eye level. The protagonist's right hand grips a white prescription envelope, knuckles white from pressure, tendons visible beneath skin desaturated to blue-grey under hard 6500K top-left light. The first faint crease is beginning to form in the envelope's matte surface where fingers press in. Hand occupies the full frame center. Background: soft bokeh of charcoal grey suit sleeve cuff. Hard 8:1 key-to-fill ratio carves deep shadows between fingers and in the palm crease. A faint tremor is implied by the rigid tension in every finger joint. Color palette: #4682B4 cold highlight on envelope surface, #0B0D0F shadow in knuckle creases, desaturated blue-grey skin. Photorealistic texture, angular composition, cyberpunk-noir. No warmth. The hand tells everything the character cannot say.
- **Sonnet 5**: _(없음/파싱실패)_
- **Sonnet 5 +adaptive**: 익스트림 클로즈업으로 포착된 주인공의 손. 하얀 처방전 봉투가 손가락 사이에서 살짝 구겨지고 있으며, 손등의 힘줄과 관절이 팽팽하게 긴장되어 있다. 배경은 완전히 흐려진 회색 정장 소매만 어렴풋이 보인다. 측면에서 들어오는 하드 라이트가 손의 윤곽과 봉투의 종이 질감을 예리하게 드러내며, 차가운 스틸블루와 짙은 블랙 팔레트가 억눌린 분노와 절망을 시각적으로 강조한다.

**motion_prompt**

- **Gemini 3 Flash**: A hand tightens its grip, slowly crushing a paper envelope with visible tension.
- **Sonnet 4.6**: 주인공의 손가락이 흰 봉투를 서서히 쥐어 모서리를 구긴다. 카메라 고정.
- **Sonnet 4.6 +thinking**: 주인공의 손가락이 봉투를 서서히 더 세게 쥐어짜며 표면에 구김이 깊어진다. 카메라 고정.
- **Sonnet 5**: _(없음/파싱실패)_
- **Sonnet 5 +adaptive**: 손끝이 하얗게 질리도록 처방전 봉투를 힘껏 움켜쥐며 억눌린 분노를 드러낸다

## 3. 판정 (핵심)

### 속도 — Gemini 압승
- Gemini flash **21.6s** vs Sonnet 4.6 **91.8s = 4.2x 느림**. thinking은 +24%(113.7s), Sonnet 5 adaptive 105.5s(4.9x).
- shotDesign은 run당 **14콜**이라 이 배수가 스테이지 전체에 곱해진다 → Sonnet 교체 시 스테이지 ~350s → **~1,500s+**. 심지어 병렬화도 Gemini의 동시성 throttle(2.25x 팽창)로 막힌 마당에, 콜당 4-5x 느린 모델은 **속도 관점에서 완전 부적합**.

### 품질 — Sonnet 4.6가 더 조밀, 그러나 언어 함정
- **`first_frame_prompt`는 이미지 생성기(T2I) 입력 → 영어여야 정상.** 여기서 갈린다:
  - **Gemini flash**: 영어 ✅. 충분히 좋지만 상대적으로 덜 조밀.
  - **Sonnet 4.6 / +thinking**: 영어 ✅ + **더 조밀** — hex 팔레트(`#4682B4`/`#0B0D0F`), 조명비(8:1), 렌즈(85mm), 질감(섬유·피부·종이 결)까지 명시. 이미지 프롬프트로서 상위.
  - **Sonnet 5 +adaptive**: **first_frame_prompt까지 전부 한글** ❌ → 이미지 생성 품질 저하 위험(치명적 회귀).
- `dramatic_purpose`·`motion_prompt`는 세 모델 다 한글(내부 메타/영상 프롬프트라 무해). Sonnet 계열이 서사적으로 약간 더 풍부.
- **thinking**: 4.6+thinking이 프롬프트를 더 정교하게(85mm 명시, "hover" 같은 연출 디테일) 만들지만 think은 441자뿐이고 latency만 +24%. 대량 반복 스테이지엔 값하지 않음.

### 결론
- **shotDesign(속도·대량 반복) → Gemini flash 유지가 맞다.** Sonnet은 4-5x 느려 교체 부적합. 병렬화(Gemini throttle)도, 프로바이더 교체도 각각 벽이 있음.
- **Sonnet 4.6은 "저빈도·고품질" 용도엔 가치** — 영어 프롬프트 조밀도 우위. 단 Sonnet 5는 한글 드리프트 때문에 shotDesign엔 오히려 위험.
- 병목의 실질 해법은 **모델 교체가 아니라 출력 슬림화**(문서 레버 #2: `first_frame_prompt` 이연/상한, `static_spec` 다이어트) — 콜당 출력 토큰이 latency를 지배하므로 어떤 모델을 쓰든 그게 진짜 레버.

> 주: `Sonnet 5`(no-thinking) 행은 하네스가 `temperature`를 넘겨 400(`temperature deprecated`)로 실패했다. 원인은 수정됨(Sonnet 5는 temperature 미지원). Sonnet 5 품질은 `+adaptive` 행으로 대표됨.