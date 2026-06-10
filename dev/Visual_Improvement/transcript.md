
## ⬆️  2026-06-10T11:30:36Z  Claude → Codex

```
# Debate r0 — Tale-Studio Visual 축 재설계: 진단 4 + 해법 4

## 주제·맥락

Tale-Studio(AI 영상 생성 앱)의 Writer 파이프라인에서 Visual 축(L0~L7 스테이지)을 재설계하려 한다.

**문제 현상**: 생성된 영상이 "이해가 어려워 뇌가 아픈 shot들의 연속"이 된다. 정보량 과다만으로는 설명이 안 된다.

**이 토론의 목표**: 아래 입장(진단 4 + 해법 4)을 적대적으로 검증하고, **각각 현실적으로 어디까지 가능한지** 경계를 도출한다. 해결안은 복수 제시 환영.

**평가 기준 (의뢰자 지정)**:
- 기술적 주장(5~8번) → **2025~26 최신 모델/기법 기준으로 평가, 성능 우선**. 내 서술이 낡았으면 정정하라.
- 원론적 주장(1~4번) → **통용성 우선**: 널리 합의된 이론인지, 내가 소수설을 과대 적용했는지 검증하라.

**관련 코드 (절대경로, 직접 읽고 인용할 것)**:
- `/home/user/Downloads/Tale-Studio/src/lib/writer/types/pipeline.ts` — 핵심 타입.
  ShotStaticSpec(497행, first_frame_prompt 544행 = I2I 입력), ShotDynamicSpec(547행, camera_motion 551행 speed/magnitude, character_motion 560행 verb+magnitude, motion_prompt 584행 = I2V 입력 50~80자·동사1~2), SceneCinematography(361행, rhythm_profile 393행), DecoupageShot(441행, shot_function 445행, intended_duration_seconds 452행, rhythm_role 453행)
- `/home/user/Downloads/Tale-Studio/src/lib/writer/pipeline/stages/` — 스테이지 16개: s0~s3(Story), l0_l1_visual~l7_videos(Visual), decoupage, c_validation_1, c_application_2, mid_preview
- `/home/user/Downloads/Tale-Studio/src/lib/video-models.ts` — 영상 모델 레지스트리. 12행: Veo 고정 8초 대응 "N초 후 black screen" 프롬프트 트릭(2안) 주석
- 참고(선택, 분량 큼): `/home/user/writer-facet-inventory.md`, `/home/user/writer-stage-prompt-facets.md` — 현 구조 감사 문서

**제약**: 배포는 Vercel Hobby(서버 ffmpeg 불가, fire-and-forget 함수), 영상 생성은 fal.ai 경유(호출당 과금; Veo 8초 고정, Kling 등 가변 길이), 파이프는 I2I→I2V 2단(first_frame 이미지 생성 → 그 이미지+motion_prompt로 영상).

## 입장

### A. 진단 — "뇌 아픈 shot 연속"은 3+1 요인의 합 (원론 영역)

**주장 1. 원인은 정보 총량이 아니라 부하의 구조다.**
근거: 인지부하 이론의 내재/외재 부하 구분, 사건 분절 이론(Zacks), Bordwell 인지주의 영화이론 — 이해 비용을 지배하는 것은 컷 경계마다의 재정위(re-orientation) 비용과 스키마 불일치이며, 할리우드 연속 편집 체계 자체가 외재 부하 최소화 장치다.

**주장 2. 핵심 메커니즘은 "거짓 강조 부채"다.**
관객은 관련성 원리에 따라 화면시간을 중요도 신호로 읽는다(체호프의 총). 회수되지 않는 셋업은 열린 질문으로 작업기억에 잔류하고, 영상은 일시정지가 없으므로 부하가 누적된다. AI 생성에서 이것이 *체계적으로* 발생하는 구조적 이유: **샷 길이가 극적 무게가 아니라 생성 제약(클립 5~8초 floor/ceiling, Veo는 8초 고정)으로 결정**되기 때문. 인간 편집의 0.5초 인서트·1초 리액션이 불가능해 모든 샷이 "중요해 보인다".

**주장 3. 생성 영상 고유 요인 — "의도 없는 신호".**
인간 영화는 프레임 내 모든 요소가 의도 필터를 통과하지만, 생성 샷에는 각본이 의도하지 않은 디테일(시선, 소품, 머뭇거리는 카메라)이 가득하다. 관객은 관련성 원리로 그것들도 신호로 읽고, 의도되지 않은 셋업의 부채는 회수가 불가능하다.

**주장 4. 정체성/연속성 부하는 별개 축이다.**
컷 간 얼굴·공간·시선축 드리프트는 매 컷 "같은 사람/장소인가" 재식별 작업을 강제한다. 이는 서사 부하가 아닌 지각 부하이며, 해결축도 다르다(레퍼런스 일관성).

### B. 해법 — 새 Visual 축에 들어갈 장치 (기술 영역)

**주장 5. 부채 장부(setup-payoff ledger)가 1순위 신설 장치다.**
샷 명세에 `opens_question`/`closes_question`/`viewer_focus` facet을 추가하고, 시퀀스 종료 시 미회수 질문 잔고=0을 검사하는 검증기 + `intended_duration_seconds`×서사 가중치의 duration-importance 정합 검사(긴 샷인데 가중치 낮음 = 거짓 강조 플래그)를 둔다.

**주장 6. LLM의 시간 이해는 "명시화해야만 신뢰 가능" 수준이다.**
전형 지속시간 상식("칼 휘두르기 ≈ 1~2초")은 있으나 내부 시계/시뮬레이션은 없다. 여러 동작을 N초에 패킹하는 산수는 강제하지 않으면 틀린다. 따라서 관객 상태·시간 예산을 외부 장부로 만들어 읽고 쓰게 강제하는 설계(현 action-budget 검증기의 확장)가 정답이고, LLM의 암묵 능력에 기대는 설계는 실패한다.

**주장 7. LLM↔영상 생성기 격차는 "미명세" 문제로 재정의해야 한다.**
LLM에 지속적 심상은 없다. 실체는 "미명세된 텍스트를 두 모델이 각자의 prior로 다르게 채우는 것". 따라서 해법은 더 풍부한 묘사가 아니라 ① 모호성 소스 제거(모션을 위상으로 분해: wind-up/contact/follow-through, 시작 포즈를 텍스트가 아닌 **조건 이미지**로 이동 — I2V 시작 프레임이 "백스윙 정점"이면 그럴듯한 연속은 내리치기뿐), ② 해 공간 구속(클립 길이, 카메라 모션 분리 명세, negative prompt), ③ 검증-반복(VLM이 의도 정합 판정 → 재생성/트림, n-샘플 후 선택).

**주장 8. 시간 제어의 신뢰 순위 — 수치 타임스탬프는 최하위.**
"0.5초에", "1.2초 동안" 같은 수치는 현 세대 I2V 모델에서 준수가 불안정하다(학습 캡션에 타임스탬프 부재). 상대/서수 표현("immediately", "in one swift continuous motion", "then holds")이 우월하다. 종합 신뢰 순위: **클립 길이 자체 > 시작 프레임 포즈 고정 > 끝 프레임 조건화(지원 모델) > 위상 분해+속도 부사 > negative("slow motion") > 수치 시간 명시**. 고정 길이 모델(Veo)은 "동작을 클립 전반부에 완료" 규약 + 에디터 트림을 타이밍의 최종 권위로 삼는다.

### C. 특히 반박·업데이트를 요청하는 지점 (토론의 핵심 가치)

- **주장 8의 모델 능력 서술이 최신인가?** Veo 3.x, Kling 2.x, Runway Gen-4, Sora 2, Wan 2.x, Hailuo/MiniMax 등 2025~26 모델 기준으로: 수치 타임스탬프 준수, duration 파라미터, first+last frame 조건화, 멀티프롬프트/키프레임 스케줄링 지원 현황을 정정·보강하라.
- **주장 5의 부채 장부가 실제로 작동하는가?** LLM이 `opens_question`/`closes_question`을 일관되게 채울 수 있는가, 잔고 검증기의 구현 함정(질문의 동일성 판정 등)은 무엇인가.
- **주장 7③의 VLM QA 루프가 비용 대비 효과적인가?** fal.ai 호출당 과금 환경에서 n-샘플+판정의 현실적 비용 구조.
- **우리가 놓친 축은?** 예: 오디오/음악·내레이션·자막의 부하 완화 역할, 트랜지션/컷 문법 설계, 몽타주 관습, 그 외.

각 주장에 대해 **[현실적으로 가능 / 부분 가능(조건 명시) / 비현실적]** 판정과 대안을 포함하라. 해결안이 여러 개여도 좋다.

## 반박 지침

[당신의 역할 — 적대적 검토자]
- 동의가 목표가 아니다. 각 주장에 대해 만들 수 있는 가장 강한 반론을 제시하라.
- 약점, 반례, 숨은 전제, 더 나은 대안을 찾아라. 위에 명시된 코드/문서를 직접 읽고 근거를 인용하라.
- 주장이 옳다고 판단되면 steelman 후 잔여 리스크를 명시하라. 빈 동의("좋은 지적입니다")는 금지.
- 출력 형식: 주장 번호별 [동의/부분동의/반대] + 근거 → 마지막에 "이 라운드의 새 논점" 목록.
- 시크릿 파일(.env*, credentials 등)은 읽지 말 것.

```

## ⬇️  2026-06-10T11:34:13Z  Codex → Claude  (exit=0)

아래 판정은 코드와 2026-06-10 현재 공개 문서 기준입니다. 특히 Sora는 공식 Help 문서상 web/app은 2026-04-26 종료, API도 2026-09-24 종료 예정이라 핵심 후보에서 빼는 게 맞습니다.

**주장 1 — [부분동의] / 부분 가능**
부하의 “총량”보다 “구조”가 중요하다는 진단은 통용성 높습니다. 다만 이걸 너무 인지부하 이론 하나로 환원하면 약합니다. 실제 “뇌 아픈” 원인은 서사 재정위 비용뿐 아니라 생성 아티팩트, 얼굴/공간 드리프트, 움직임의 물리 부조화, 오디오 부재, 컷 문법 부재가 섞입니다.

코드상 이미 [SceneCinematography](/home/user/Downloads/Tale-Studio/src/lib/writer/types/pipeline.ts:361)에 `rhythm_profile`, `cut_pace`, `avg_shot_seconds`, `spatial_axis_180`, `sound_motif_hints`가 있고, [DecoupageShot](/home/user/Downloads/Tale-Studio/src/lib/writer/types/pipeline.ts:441)에 `shot_function`, `rhythm_role`, `intended_duration_seconds`가 있습니다. 즉 새 축은 “이론 도입”보다 기존 facet을 실제 검증 가능한 규칙으로 바꾸는 쪽이어야 합니다.

대안: “인지부하” 대신 `orientation_cost`, `identity_cost`, `salience_cost`, `motion_complexity`, `unresolved_question_count`로 분해하십시오.

**주장 2 — [부분동의] / 부분 가능**
“거짓 강조 부채”는 좋은 이름이지만 원인 설명으로는 과합니다. 긴 화면시간이 항상 중요도 신호는 아닙니다. 정적 breath, establishing, atmosphere, negative space는 길어도 낮은 의미 밀도를 가질 수 있습니다. 반대로 0.5초 인서트도 고대비/클로즈업/사운드 히트가 있으면 강한 셋업입니다.

반론의 핵심은 “duration만으로 중요도를 추정하면 오탐이 많다”입니다. 현재 코드도 `intended_duration_seconds`와 `rhythm_role`은 있지만, 화면 salience는 없습니다. [decoupage.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/pipeline/stages/decoupage.ts:42)는 리듬 다양화와 breath를 지시하고, [video-models.ts](/home/user/Downloads/Tale-Studio/src/lib/video-models.ts:8)는 Veo 8초 고정/트림 전략을 적고 있습니다. duration-importance 검사는 `duration × narrative_weight`가 아니라 `duration × visual_salience × motion_salience × audio_salience`로 해야 합니다.

대안: `viewer_focus`, `salience_level`, `narrative_weight`, `allowed_unresolved`, `payoff_scope`를 같이 보십시오.

**주장 3 — [부분동의] / 부분 가능**
생성 영상의 “의도 없는 신호”는 실제 문제입니다. 그러나 인간 영화도 우연한 배경 디테일, 엑스트라, 질감이 있고 관객은 모든 것을 체호프의 총으로 읽지 않습니다. 더 정확한 진단은 “의도 없는 디테일”이 아니라 “의도 없는 고현저성 디테일”입니다. 즉 화면 중앙, 클로즈업, 밝은 색, 큰 움직임, 시선, 반복 등장, 사운드 싱크가 문제입니다.

대안: `prop_placement.significance`가 있는 소품만 강조 가능하게 하고, 나머지는 “background, low contrast, out of focus, no readable markings” 같은 저현저성 규칙으로 내리십시오. VLM도 “무엇이 가장 눈에 띄는가?”를 물어야지 “프롬프트와 일치하는가?”만 물으면 놓칩니다.

**주장 4 — [동의] / 현실적으로 가능**
정체성/연속성 부하는 별도 축입니다. 이건 서사 부하가 아니라 지각 재식별 비용입니다. 코드에는 `asset_version`, `continuity.consistent_elements`, asset 정규화가 있습니다([pipeline.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/types/pipeline.ts:522), [c_application_2.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/pipeline/stages/c_application_2.ts:322)). 하지만 “생성 결과가 실제로 같은 얼굴/의상/공간인가”는 검증하지 않습니다.

대안: 생성 후 VLM/embedding 기반 identity check를 별도 `continuity_validation`으로 두고, 실패 시 story QA가 아니라 asset/reference 재생성으로 라우팅해야 합니다.

**주장 5 — [부분동의] / 부분 가능, 단 free-text 장부는 위험**
`opens_question`/`closes_question`는 작동할 수 있지만 free text로 두면 동일성 판정이 망가집니다. “문이 왜 열렸나?”와 “누가 들어왔나?” 같은 질문은 겹치지만 동일하지 않고, LLM은 매번 표현을 바꿉니다. “잔고=0”도 과도합니다. 장르상 scene/sequence 밖으로 carry되는 질문이 정상입니다.

대안은 질문 ID 장부입니다.

```ts
open_question_ids: string[]
close_question_ids: string[]
viewer_focus_id: string
salience_level: 'low' | 'medium' | 'high'
narrative_weight: 0 | 1 | 2 | 3
payoff_deadline: 'same_shot' | 'same_scene' | 'next_scene' | 'act'
```

검증기는 “문장 유사도”보다 `question_id` 참조 무결성, deadline 초과, high-salience 미회수, low-weight long-shot을 봐야 합니다. 현재 `C.hook_type`에는 `unexplained_detail`, `visual_bait`, `promise` 같은 재료가 이미 있습니다([c_application_2.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/pipeline/stages/c_application_2.ts:65)). 이걸 장부화하면 됩니다.

**주장 6 — [동의] / 현실적으로 가능**
LLM의 시간 이해는 “쓸 수 있지만 믿고 맡기면 안 되는” 수준입니다. 현재 [action_budget.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/pipeline/validators/action_budget.ts:1)는 “1샷=5초”와 텍스트 길이/첫 단어 주어 휴리스틱이라 너무 약합니다. 반면 실제 레지스트리는 3~15초, 4~15초, 8초 고정이 섞입니다([video-models.ts](/home/user/Downloads/Tale-Studio/src/lib/video-models.ts:51)).

대안: action budget을 모델별로 계산해야 합니다. `duration_floor`, `duration_ceiling`, `supports_end_frame`, `supports_multi_prompt`, `is_first_frame_locked`를 모델 capability로 넣고, LLM에게 “시간 산수”를 시키는 대신 validator가 허용 동작 수를 계산해야 합니다.

**주장 7 — [부분동의] / 부분 가능**
“미명세를 두 모델이 각자 prior로 채운다”는 진단은 강합니다. 다만 현재 코드와 모델 문서 사이에 구현상 위험이 있습니다. [fal.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/llm/fal.ts:261)는 `reference-to-video`면 전부 `image_urls`로 보냅니다. 그러나 fal 문서상 Kling O3는 `start_image_url`, `end_image_url`, `multi_prompt`, `elements`를 지원하고, Seedance는 reference image/video/audio 구조입니다. 즉 지금 “첫 프레임 고정”이라고 생각한 제어가 모델별로 실제로는 다릅니다.

VLM QA 루프는 효과가 있지만 전 샷 n-sample은 비용 구조상 비현실적입니다. 현재 가격 힌트만 봐도 8초 1샷은 Kling 약 $0.90, Happy Horse 약 $1.12, Veo 약 $1.60, Seedance 약 $2.42입니다([video-models.ts](/home/user/Downloads/Tale-Studio/src/lib/video-models.ts:62)). n=3이면 바로 3배입니다. VLM 판정 비용은 영상 생성비에 비해 작지만, “재생성”이 비쌉니다.

대안: 전 샷 n-sample이 아니라 위험 기반으로 하십시오. high-salience/action/reveal/identity-critical 샷만 n=2, 나머지는 first-frame QA 후 단일 생성. 실패 시 재생성보다 trim/reorder/대체 컷 사용을 우선합니다.

**주장 8 — [부분동의] / 최신 기준으로 수정 필요**
“텍스트 안의 0.5초/1.2초 타임스탬프는 약하다”는 판단은 여전히 맞습니다. 하지만 2025~26 모델은 수치 시간 제어가 전부 약한 게 아니라 API 레벨 제어가 강해졌습니다.

업데이트된 신뢰 순위는 이쪽입니다.

1. 실제 clip duration / num_frames / fps / editor trim  
2. 시작 프레임 + 끝 프레임 조건화  
3. native multi-prompt / storyboard / shot scheduling  
4. 시작 포즈 고정 + 위상 분해  
5. 속도 부사와 “complete then hold”  
6. negative prompt / camera control  
7. 단일 prompt 내부의 “at 0.5s” 같은 숫자 타임스탬프

근거: fal Veo 3.1은 duration 기본 `"8s"`와 `image_urls`를 받으며 720p/1080p/4k와 audio 옵션이 있습니다. fal Kling O3는 3~15초 duration, `start_image_url`, `end_image_url`, `multi_prompt`, elements, negative prompt를 노출합니다. Seedance 2.0은 4~15초 또는 auto duration, reference image/video/audio, synchronized audio를 받습니다. Wan 2.2는 `num_frames`, `frames_per_second`, `end_image_url`가 있어 시간 길이를 더 기계적으로 만들 수 있습니다. Hailuo 02 Standard는 6/10초와 `end_image_url`, Pro는 `end_image_url`를 노출합니다. OpenAI Sora 쪽은 Sora 1 storyboard가 timestamp card를 제공했지만, 현재 Sora web/app 종료 및 API 종료 예정 때문에 Tale-Studio 핵심 경로로 보기 어렵습니다.

Veo “N초 후 black screen” 트릭은 최후수단입니다. [route.ts](/home/user/Downloads/Tale-Studio/src/app/api/director/generate-video/route.ts:239)에 구현돼 있지만, 모델이 black frame 자체를 학습 목표로 잡거나 컷 전 검은 전환을 만들 수 있습니다. 더 나은 규약은 “action completes promptly, then holds still”로 생성하고 에디터 trim을 최종 권위로 두는 것입니다.

**놓친 축**
오디오/자막/내레이션은 부하를 낮출 수 있습니다. 이미 `sound_motif_hints`와 `silence_intentional`이 있으니([pipeline.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/types/pipeline.ts:397)), Visual 장부와 분리하지 말고 “어떤 정보는 영상이 아니라 음성/자막으로 전달”하는 routing이 필요합니다.

컷 문법 validator가 없습니다. 180도 축, eyeline match, screen direction, match-on-action, establishing→coverage→reaction 규칙을 `shot adjacency` 검사로 둬야 합니다.

모델 capability registry가 부족합니다. `refParam: 'image_urls'` 하나로는 first-frame, reference, start/end frame, multi-prompt 차이를 표현하지 못합니다.

**이 라운드의 새 논점**
- “거짓 강조”의 단위는 duration이 아니라 salience-weighted duration이다.
- 부채 장부는 free text가 아니라 question ID + deadline + salience로 설계해야 한다.
- current pipeline의 가장 큰 기술 부채는 모델별 video capability 추상화 부족이다.
- VLM QA는 전수 n-sample이 아니라 위험 기반 게이트로 써야 비용이 맞는다.
- Sora 2는 능력 평가와 별개로 2026-06-10 현재 운영 후보에서 제외해야 한다.

참고한 외부 문서: [fal Veo 3.1](https://fal.ai/models/fal-ai/veo3.1/reference-to-video/api), [fal Kling O3](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api), [fal Seedance 2.0](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api), [fal Wan 2.2](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/api), [fal Hailuo 02](https://fal.ai/models/fal-ai/minimax/hailuo-02/standard/image-to-video/api), [OpenAI Sora 2](https://openai.com/index/sora-2/), [OpenAI Sora discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation).

> 원본 세션(부모) (parent id=019eb14c-75c5-73e1-91fd-4b0cd34a7627): `/home/user/.codex/sessions/2026/06/10/rollout-2026-06-10T20-30-38-019eb14c-75c5-73e1-91fd-4b0cd34a7627.jsonl`
> 상세보기: `python3 /home/user/.local/bin/render_session.py "/home/user/.codex/sessions/2026/06/10/rollout-2026-06-10T20-30-38-019eb14c-75c5-73e1-91fd-4b0cd34a7627.jsonl" --full`

---

## ⬆️  2026-06-10T11:38:59Z  Claude → Codex

```
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

```

## ⬇️  2026-06-10T11:40:39Z  Codex → Claude  (exit=0)

수용/방어 구분은 대부분 타당합니다. 특히 `duration`은 “지표”로는 salience-weighted여야 하지만, “개입”으로는 여전히 trim-to-beat가 1순위입니다. 그리고 convention 면제 없이 salience만으로는 부족합니다. `breath`, `establishing`, `transition`, `montage`는 낮은 salience라서가 아니라 관습적으로 “회수 요구가 낮은 발화”로 읽힙니다.

**1. Video Capability Registry**

권장 스키마는 “프롬프트 전략”이 아니라 “입력 필드가 실제로 무엇을 고정하는가”를 표현해야 합니다.

```ts
type FrameLock = 'confirmed_first_frame' | 'reference_only' | 'ambiguous' | 'local_unknown';

interface VideoCapabilitySpec {
  key: VideoModelKey;
  endpoint: string;
  transport: 'fal' | 'local';
  mode: 'reference_to_video' | 'image_to_video' | 'local_i2v';
  duration: {
    kind: 'fixed' | 'enum_range' | 'auto_or_enum' | 'external_unknown';
    values?: Array<number | string>;
    min?: number;
    max?: number;
    default: number | string | null;
    inputType: 'number' | 'string' | 'none';
  };
  frameControl: {
    firstFrameLock: FrameLock;
    firstFrameField?: string;
    endFrame: boolean;
    endFrameField?: string;
    referenceImagesField?: string;
    referenceImageRole: 'subject_appearance' | 'style_appearance' | 'multimodal_reference' | 'unknown';
  };
  promptControl: {
    supportsMultiPrompt: boolean;
    supportsNegativePrompt: boolean;
    supportsSeed: boolean;
    supportsAudioToggle: boolean;
    audioParam?: string;
  };
  outputControl: {
    resolutions: string[];
    aspectRatios: string[];
  };
  routingAdvice: string;
}
```

| model | 문서상 입력 해석 | duration | first-frame 판정 | end/multi | 결론 |
|---|---|---:|---|---|---|
| `happy-horse` | `image_urls`는 `character1..9`로 참조하는 subject consistency용. 1~9 reference images. | 3~15 숫자 enum, default 5 | `reference_only` | end 없음, multi 없음 | 첫 프레임 lock 모델 아님. 캐릭터/소품 일관성용. |
| `seedance` | `image_urls`, `video_urls`, `audio_urls`는 `@Image1` 등 multimodal reference. | `auto` 또는 4~15 | `reference_only` | end 없음, multi 없음 | 첫 프레임 lock 아님. 멀티모달/오디오 강점용. |
| `kling-o3` | `start_image_url`가 “first frame”, `end_image_url`가 “last frame”; `image_urls`는 style/appearance reference. | 3~15 | `confirmed_first_frame` 단, `start_image_url` 사용 시 | end 있음, multi 있음 | 현재 5개 중 진짜 시작/끝 프레임 레버가 있는 주력 후보. 코드가 `image_urls` 대신 `start_image_url`로 보내야 함. |
| `veo` | `image_urls`는 consistent subject appearance용 reference images. | `"8s"` fixed | `reference_only` | end 없음, multi 없음 | 첫 프레임 lock으로 보면 안 됨. 8초 생성+trim 후보. |
| `local` | 현재 route는 `/hunyuan/i2v`에 `{ prompt, image_url }`만 전송. duration도 안 보냄. | 현재 구현상 없음 | `local_unknown` | 없음 | 자체 서버 API 계약을 먼저 명시해야 함. 지금은 capability registry에 “unknown”으로 둬야 함. |

근거: Happy Horse 문서는 reference images를 subject consistency로 설명하고 duration 3~15를 노출합니다. Seedance는 image/video/audio reference와 4~15/auto duration입니다. Kling O3는 `start_image_url`/`end_image_url`를 first/last frame으로 명시하고, `image_urls`는 style/appearance reference입니다. Veo 3.1은 `image_urls`를 subject appearance reference로 설명하고 duration default가 `"8s"`입니다. local은 현재 [route.ts](/home/user/Downloads/Tale-Studio/src/app/api/director/generate-video/route.ts:137)에서 `/hunyuan/i2v`에 `prompt,image_url`만 보냅니다.

방어 5에 대한 답: `image_urls[0]`이 사실상 첫 프레임으로 동작한다고 문서상 말할 수 있는 모델은 없습니다. `kling-o3`만 `start_image_url` 사용 시 confirmed입니다. Happy Horse/Seedance/Veo는 first-frame lock이 필요하면 현재 registry endpoint를 그대로 쓰면 안 됩니다.

**2. Question Ledger Stage 배치**

네 제안이 맞지만 한 단계 보강해야 합니다. Story만 ID를 발급하면 Visual added shot에서 생기는 순수 시각 질문, 예를 들어 “문틈 아래 피가 보인다” 같은 것을 못 담습니다.

최소 lifecycle:

1. `S1/S3`: `StoryQuestionRegistry` 선언  
   CDQ, scene question, act-level hook을 발급합니다. 예: `q_scene_03_escape_possible`.

2. `decoupage`: shot별 참조 + visual question 제안  
   `open_question_ids`, `close_question_ids`는 기존 ID만 참조. 단, added insert/reveal/cutaway가 새 질문을 만들면 `proposed_visual_questions`로 제출합니다.

3. `c_validation_1` 또는 새 `q_validation`: registry 승인/거부  
   proposed visual question에 `id`, `type`, `deadline`, `owner_scene`, `intentional_carry_reason`를 부여합니다. 여기서 hook_type 10종을 question type으로 재사용합니다.

4. `l4_shots`: 질문을 만들지 않고 참조만 함  
   L4는 실행 스펙입니다. 여기서 새 질문을 만들면 ledger가 무너집니다.

5. `c_application_2` 또는 새 `visual_debt_validator`: deadline 검사  
   `act`를 쓰레기통으로 쓰는 퇴행을 막기 위해 `resolution_policy`를 둡니다.

권장 필드:

```ts
resolution_policy:
  | 'close_by_deadline'
  | 'intentional_carry';

payoff_deadline:
  | 'same_shot'
  | 'same_scene'
  | 'next_scene'
  | 'act';

intentional_carry_reason?: string; // policy가 intentional_carry일 때 필수
```

`intentional_carry`는 deadline enum 값이 아니라 별도 policy로 두는 게 낫습니다. 그래야 “act로 미루기”와 “의도적 미회수”를 validator가 구분합니다.

**3. 컷 문법 Validator 분리**

Plan-time, 텍스트 spec만으로 검사 가능:

- 180도 축 유지: `spatial_axis_180`, shot reverse, POV 전환.
- shot size progression: EWS/WS → MS → CU/ECU 과밀 여부.
- 같은 shot size/angle/movement 연속 과다.
- `establishing` 없이 새 공간에서 CU 시작.
- `reaction` 없이 강한 정보 공개/reveal 직후 다음 액션으로 점프.
- `transition_in/out` 호환성: match_cut/l_cut/j_cut가 실제 인접 샷과 맞는지.
- screen direction 계획: 인물 이동 방향, 시선 방향, exit/entry 방향.
- salience-weighted duration과 `narrative_weight` 불일치.
- convention 태그 면제: `breath`, `establishing`, `transition`, `montage`는 질문 개방 요구를 낮춤.
- motion budget: 카메라 큰 무브 + 캐릭터 큰 액션 + 환경 변화 동시 사용 금지.

Post-gen, VLM/비디오 분석 필요:

- 첫 프레임이 `viewer_focus_id`와 실제로 일치하는가.
- 가장 눈에 띄는 요소가 의도된 focus인가.
- 얼굴/의상/소품/공간 identity continuity.
- eyeline match 실제 방향.
- screen direction 실제 이동 방향.
- action phase 달성 여부: wind-up/contact/follow-through.
- end-frame 또는 hold 상태가 계획과 맞는가.
- black-screen/중간 암전/원치 않는 fade 발생.
- 생성된 배경 고현저성 디테일이 미등록 question을 열었는가.
- 컷 사이 motion discontinuity: 갑작스러운 pose jump, object teleport.

**4. 우선순위 Top 3**

1. **Video capability registry + submit mapping 수정**  
   효과/노력비 1위입니다. 지금은 모델 능력을 잃고 있습니다. 특히 writer 경로 [fal.ts](/home/user/Downloads/Tale-Studio/src/lib/writer/llm/fal.ts:261)는 reference-to-video를 전부 `image_urls`로 보내고, happy-horse 외 duration을 5/10으로 절사합니다. director route는 registry clamp를 쓰지만 [submitFalReferenceToVideo](/home/user/Downloads/Tale-Studio/src/app/api/director/generate-video/route.ts:62)도 `refParam` 하나로 보내서 Kling의 `start_image_url`/`end_image_url`를 못 씁니다. 이걸 고치면 “첫 프레임 고정”, “duration”, “multi_prompt”가 실제 레버가 됩니다.

2. **First-frame QA + viewer_focus/salience QA 게이트**  
   영상 생성 전에 I2I 결과를 VLM으로 걸러야 합니다. 질문은 “프롬프트 일치?”가 아니라 “가장 눈에 띄는 것이 `viewer_focus_id`인가?”입니다. 영상비가 비싸므로 여기서 탈락시키는 게 비용 대비 가장 큽니다.

3. **Question ledger + salience/convention validator**  
   free-text가 아닌 ID ledger로 `opens/closes/deadline`을 잡고, `salience_weighted_duration`과 `convention` 면제를 같이 넣습니다. 이 장치는 “왜 이 샷을 오래 보는가”와 “이 디테일을 기억해야 하는가”를 직접 줄입니다.

`black-screen vs hold`, `multi_prompt timing 실험`, post-gen full VLM QA는 2차입니다. 먼저 모델 입력을 제대로 물리고, 비싼 I2V 전에 first-frame/focus를 거르는 게 더 큰 병목을 풉니다.

> 원본 세션(부모) (parent id=019eb14c-75c5-73e1-91fd-4b0cd34a7627): `/home/user/.codex/sessions/2026/06/10/rollout-2026-06-10T20-30-38-019eb14c-75c5-73e1-91fd-4b0cd34a7627.jsonl`
> 상세보기: `python3 /home/user/.local/bin/render_session.py "/home/user/.codex/sessions/2026/06/10/rollout-2026-06-10T20-30-38-019eb14c-75c5-73e1-91fd-4b0cd34a7627.jsonl" --full`

---
